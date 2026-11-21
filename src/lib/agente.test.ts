/**
 * T2 (rojo) — contrato del agente automático (src/lib/agente.ts), lanzado en Orca.
 */
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as agenteMod from "./agente";
import {
  agenteAutomaticoActivo,
  construirPrompt,
  debeLanzarAgente,
  detenerAgenteDeTarea,
  lanzarAgente,
  reconciliarAgentes,
} from "./agente";
import type { BoardState, Task, TaskAgent } from "./types";

const ID = "abcdef12-3456-7890-abcd-ef1234567890";
const ID8 = "abcdef12";
const REPO = "/r/kanban";
const WORKTREE = path.resolve("/r/kanban-agentes", `ticket-${ID8}`);
const ORCA_WT_ID = `repo::/p/ticket-${ID8}`;
const ORCA_WT_PATH = `/p/ticket-${ID8}`;

// Contrato nuevo (Orca). Se accede con cast laxo porque aún puede no existir en la implementación.
type Env = Record<string, string | undefined>;
type Plan = { name: string; logFile: string; command: string; args: string[] };
type AgenteDeps = {
  run: (cmd: string, args: string[], cwd: string) => Promise<string>;
  mkdir: (path: string) => Promise<void>;
  appendLog: (path: string, text: string) => Promise<void>;
  mutate: (fn: (board: BoardState) => BoardState) => Promise<BoardState>;
  now: () => number;
  env: Env;
  repoDir: string;
};
const mod = agenteMod as unknown as {
  orcaCmd?: (env: Env) => string;
  planLanzamiento: (task: Task, prompt: string, opts: { repoDir: string; baseBranch: string; env?: Env }) => Plan;
  abrirAgenteEnOrca?: (taskId: string, deps?: Partial<AgenteDeps>) => Promise<boolean>;
};
const lanzar = lanzarAgente as unknown as (t: Task, s: string, d: AgenteDeps) => Promise<TaskAgent>;
const detener = detenerAgenteDeTarea as unknown as (id: string, d: AgenteDeps) => Promise<BoardState>;
const ON = { KANBAN_AGENTE_AUTO: "1" };

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: ID,
    title: "Agregar filtro por fase",
    description: "Quiero filtrar las tarjetas por fase",
    statusId: "todo",
    createdAt: 1,
    ...over,
  };
}

function makeAgent(over: Partial<TaskAgent> = {}): TaskAgent {
  return {
    status: "trabajando",
    sessionId: "s-0",
    worktree: WORKTREE,
    branch: `flujo/ticket-${ID8}`,
    logFile: "/r/kanban/data/agentes/x.log",
    pid: 4242,
    startedAt: 10,
    ...over,
  };
}

function makeBoard(tasks: Task[]): BoardState {
  return {
    statuses: [
      { id: "todo", name: "Por hacer", color: "#64748b" },
      { id: "done", name: "Hecho", color: "#10b981" },
    ],
    tasks,
  };
}

describe("agenteAutomaticoActivo", () => {
  it("está encendido por defecto (sin variable) y con KANBAN_AGENTE_AUTO=1", () => {
    expect(agenteAutomaticoActivo({})).toBe(true);
    expect(agenteAutomaticoActivo({ KANBAN_AGENTE_AUTO: "1" })).toBe(true);
  });
  it("se apaga solo con KANBAN_AGENTE_AUTO=0", () => {
    expect(agenteAutomaticoActivo({ KANBAN_AGENTE_AUTO: "0" })).toBe(false);
  });
});

describe("debeLanzarAgente", () => {
  it("true con modo activo y tarea normal", () => {
    expect(debeLanzarAgente(makeTask(), ON)).toBe(true);
  });
  it("true sin variable (encendido por defecto)", () => {
    expect(debeLanzarAgente(makeTask(), {})).toBe(true);
  });
  it("false con modo apagado (KANBAN_AGENTE_AUTO=0)", () => {
    expect(debeLanzarAgente(makeTask(), { KANBAN_AGENTE_AUTO: "0" })).toBe(false);
  });
  it("false si el título empieza con [evidencia]", () => {
    expect(debeLanzarAgente(makeTask({ title: "[evidencia] prueba" }), ON)).toBe(false);
  });
  it("false si la tarea ya tiene agente", () => {
    expect(debeLanzarAgente(makeTask({ agent: makeAgent() }), ON)).toBe(false);
  });
});

describe("construirPrompt", () => {
  it("incluye el contexto del ticket y las reglas", () => {
    const p = construirPrompt(makeTask(), "Por hacer", { KANBAN_AGENTE_RESPONSABLE: "Brandon" });
    expect(p).toContain(ID);
    expect(p).toContain("Agregar filtro por fase");
    expect(p).toContain("Quiero filtrar las tarjetas por fase");
    expect(p).toContain("Por hacer");
    expect(p).toContain("actualizar_fase");
    expect(p).toContain("aprobacion_final");
    expect(p).toContain("CLAUDE.md");
    expect(p).toContain("Brandon");
  });
  it("usa 'Equipo' como responsable por defecto", () => {
    expect(construirPrompt(makeTask(), "Por hacer", {})).toContain("Equipo");
  });
  it("indica cuando no hay descripción", () => {
    expect(construirPrompt(makeTask({ description: "" }), "Por hacer", {})).toMatch(/sin descripci/i);
  });
  it("la aprobación final se pregunta con AskUserQuestion en la misma sesión de Orca", () => {
    const p = construirPrompt(makeTask(), "Por hacer", {});
    expect(p).toContain("AskUserQuestion");
    expect(p).toContain("Orca");
    expect(p).not.toContain("SIN usar AskUserQuestion");
    expect(p).not.toContain("claude --resume");
  });
});

describe("orcaCmd", () => {
  it("es una función exportada", () => {
    expect(typeof mod.orcaCmd).toBe("function");
  });
  it("usa 'orca' por defecto", () => {
    expect(mod.orcaCmd?.({})).toBe("orca");
  });
  it("usa ORCA_CLI_COMMAND si viene", () => {
    expect(mod.orcaCmd?.({ ORCA_CLI_COMMAND: "/opt/orca" })).toBe("/opt/orca");
  });
  it("KANBAN_AGENTE_ORCA tiene prioridad sobre ORCA_CLI_COMMAND", () => {
    expect(mod.orcaCmd?.({ KANBAN_AGENTE_ORCA: "/k/orca", ORCA_CLI_COMMAND: "/opt/orca" })).toBe("/k/orca");
  });
});

describe("planLanzamiento", () => {
  it("calcula nombre, log, comando y argumentos de `orca worktree create`", () => {
    const task = makeTask();
    const plan = mod.planLanzamiento(task, "PROMPT", { repoDir: REPO, baseBranch: "flujo/base", env: {} });
    expect(plan.name).toBe(`ticket-${ID8}`);
    expect(path.resolve(plan.logFile)).toBe(path.join(REPO, "data", "agentes", `${ID}.log`));
    expect(plan.command).toBe("orca");
    const a = plan.args;
    expect(a.slice(0, 2)).toEqual(["worktree", "create"]);
    expect(a[a.indexOf("--repo") + 1]).toBe(`path:${REPO}`);
    expect(a[a.indexOf("--name") + 1]).toBe(`ticket-${ID8}`);
    expect(a[a.indexOf("--base-branch") + 1]).toBe("flujo/base");
    expect(a[a.indexOf("--agent") + 1]).toBe("claude");
    expect(a[a.indexOf("--surface") + 1]).toBe("terminal");
    expect(a[a.indexOf("--comment") + 1]).toBe(task.title);
    expect(a[a.indexOf("--prompt") + 1]).toBe("PROMPT");
    expect(a).toContain("--no-parent");
    expect(a).toContain("--json");
    expect(a).not.toContain("-p");
  });
  it("usa KANBAN_AGENTE_ORCA como comando si viene", () => {
    const plan = mod.planLanzamiento(makeTask(), "P", {
      repoDir: REPO,
      baseBranch: "main",
      env: { KANBAN_AGENTE_ORCA: "/usr/local/bin/orca" },
    });
    expect(plan.command).toBe("/usr/local/bin/orca");
  });
});

describe("reconciliarAgentes", () => {
  const board = () =>
    makeBoard([
      makeTask({ id: "muerto", agent: makeAgent({ pid: 1 }) }),
      makeTask({ id: "vivo", agent: makeAgent({ pid: 2 }) }),
      makeTask({ id: "fin", agent: makeAgent({ pid: 1, status: "terminado", endedAt: 50 }) }),
      makeTask({ id: "sin" }),
      makeTask({
        id: "orca",
        agent: makeAgent({ pid: undefined, sessionId: undefined, orca: { worktreeId: ORCA_WT_ID, handle: "term-1" } }),
      }),
    ]);
  const estaVivo = (pid: number) => pid === 2;
  const find = (b: BoardState, id: string) => b.tasks.find((t) => t.id === id)!;

  it("marca como detenido el agente trabajando cuyo proceso murió", () => {
    const r = reconciliarAgentes(board(), estaVivo, 999);
    expect(find(r, "muerto").agent).toMatchObject({ status: "detenido", endedAt: 999 });
  });
  it("no toca agentes vivos, terminados ni tareas sin agente", () => {
    const b = board();
    const r = reconciliarAgentes(b, estaVivo, 999);
    expect(find(r, "vivo").agent).toEqual(find(b, "vivo").agent);
    expect(find(r, "fin").agent).toEqual(find(b, "fin").agent);
    expect(find(r, "sin").agent).toBeUndefined();
  });
  it("no toca un agente trabajando en Orca (sin pid)", () => {
    const b = board();
    const r = reconciliarAgentes(b, estaVivo, 999);
    expect(find(r, "orca").agent).toEqual(find(b, "orca").agent);
    expect(find(r, "orca").agent!.status).toBe("trabajando");
  });
  it("no muta la entrada", () => {
    const b = board();
    const copia = structuredClone(b);
    reconciliarAgentes(b, estaVivo, 999);
    expect(b).toEqual(copia);
  });
});

const ORCA_OK = JSON.stringify({
  ok: true,
  result: {
    worktree: { id: ORCA_WT_ID, path: ORCA_WT_PATH, branch: `refs/heads/brandonhsz/ticket-${ID8}` },
    launch: { outcome: { kind: "terminal", handle: "term-1" } },
  },
});

function fakeDeps(
  opts: {
    claudeMd?: boolean;
    orcaOut?: string;
    orcaFails?: boolean;
    board?: BoardState;
    env?: Record<string, string>;
  } = {},
) {
  const mem = { board: opts.board ?? makeBoard([makeTask()]) };
  const calls = {
    run: [] as Array<[string, string[], string]>,
    appendLog: [] as Array<[string, string]>,
  };
  const env = opts.env ?? { KANBAN_AGENTE_AUTO: "1" };
  const orca = env.KANBAN_AGENTE_ORCA ?? env.ORCA_CLI_COMMAND ?? "orca";
  const deps: AgenteDeps = {
    run: vi.fn(async (cmd: string, args: string[], cwd: string) => {
      calls.run.push([cmd, args, cwd]);
      if (cmd === "git" && args[0] === "rev-parse") return "flujo/base\n";
      if (cmd === "git" && args[0] === "cat-file") {
        if (opts.claudeMd === false) throw new Error("fatal: path 'CLAUDE.md' does not exist");
        return "";
      }
      if (cmd === orca) {
        if (opts.orcaFails) throw new Error("orca: no se pudo crear el worktree");
        if (args[0] === "worktree" && args[1] === "create") return opts.orcaOut ?? ORCA_OK;
        return JSON.stringify({ ok: true, result: {} });
      }
      return "";
    }),
    mkdir: vi.fn(async () => {}),
    appendLog: vi.fn(async (p: string, text: string) => {
      calls.appendLog.push([p, text]);
    }),
    mutate: vi.fn(async (fn: (b: BoardState) => BoardState) => {
      mem.board = fn(mem.board);
      return mem.board;
    }),
    now: () => 1000,
    env,
    repoDir: REPO,
  };
  const orcaCalls = () => calls.run.filter(([cmd]) => cmd === orca);
  return { deps, mem, calls, orcaCalls };
}

const taskIn = (b: BoardState) => b.tasks.find((t) => t.id === ID)!;

describe("lanzarAgente (Orca)", () => {
  it("camino feliz: lee la rama, verifica CLAUDE.md, crea el worktree en Orca y guarda el agente", async () => {
    const f = fakeDeps();
    const agent = await lanzar(makeTask(), "Por hacer", f.deps);

    const rev = f.calls.run.find(([cmd, args]) => cmd === "git" && args[0] === "rev-parse");
    expect(rev).toBeDefined();
    expect(rev![1]).toEqual(["rev-parse", "--abbrev-ref", "HEAD"]);
    expect(rev![2]).toBe(REPO);

    const cat = f.calls.run.find(([cmd, args]) => cmd === "git" && args[0] === "cat-file");
    expect(cat).toBeDefined();
    expect(cat![1]).toEqual(["cat-file", "-e", "flujo/base:CLAUDE.md"]);

    const orca = f.orcaCalls();
    expect(orca).toHaveLength(1);
    const [, args, cwd] = orca[0];
    expect(cwd).toBe(REPO);
    expect(args.slice(0, 2)).toEqual(["worktree", "create"]);
    expect(args[args.indexOf("--base-branch") + 1]).toBe("flujo/base");
    expect(args[args.indexOf("--name") + 1]).toBe(`ticket-${ID8}`);
    expect(args[args.indexOf("--prompt") + 1]).toContain(ID);

    expect(agent).toMatchObject({
      status: "trabajando",
      worktree: ORCA_WT_PATH,
      branch: `brandonhsz/ticket-${ID8}`,
      startedAt: 1000,
      orca: { worktreeId: ORCA_WT_ID, handle: "term-1" },
    });
    expect(path.resolve(agent.logFile)).toBe(path.join(REPO, "data", "agentes", `${ID}.log`));
    expect(agent.pid).toBeUndefined();
    expect(taskIn(f.mem.board).agent).toMatchObject({
      status: "trabajando",
      orca: { worktreeId: ORCA_WT_ID, handle: "term-1" },
    });
  });

  it("escribe la salida de orca en el log del agente", async () => {
    const f = fakeDeps();
    await lanzar(makeTask(), "Por hacer", f.deps);
    const log = path.join(REPO, "data", "agentes", `${ID}.log`);
    const escrito = f.calls.appendLog.filter(([p]) => path.resolve(p) === log);
    expect(escrito.length).toBeGreaterThan(0);
    expect(escrito.map(([, t]) => t).join("")).toContain(ORCA_WT_ID);
  });

  it("usa KANBAN_AGENTE_ORCA como comando de Orca", async () => {
    const f = fakeDeps({ env: { KANBAN_AGENTE_AUTO: "1", KANBAN_AGENTE_ORCA: "/k/orca" } });
    const agent = await lanzar(makeTask(), "Por hacer", f.deps);
    expect(f.orcaCalls()).toHaveLength(1);
    expect(agent.status).toBe("trabajando");
  });

  it("si la rama base no tiene CLAUDE.md no llama a orca y marca fallo", async () => {
    const f = fakeDeps({ claudeMd: false });
    const agent = await lanzar(makeTask(), "Por hacer", f.deps);
    expect(f.orcaCalls()).toHaveLength(0);
    expect(agent.status).toBe("fallo");
    expect(agent.error).toMatch(/CLAUDE\.md/);
    expect(taskIn(f.mem.board).agent).toMatchObject({ status: "fallo" });
  });

  it("si orca falla no lanza excepción y marca fallo con error", async () => {
    const f = fakeDeps({ orcaFails: true });
    const agent = await lanzar(makeTask(), "Por hacer", f.deps);
    expect(agent.status).toBe("fallo");
    expect(agent.error).toBeTruthy();
    expect(taskIn(f.mem.board).agent).toMatchObject({ status: "fallo" });
  });

  it("si la salida de orca no es JSON válido marca fallo", async () => {
    const f = fakeDeps({ orcaOut: "esto no es json" });
    const agent = await lanzar(makeTask(), "Por hacer", f.deps);
    expect(agent.status).toBe("fallo");
    expect(agent.error).toBeTruthy();
    expect(taskIn(f.mem.board).agent).toMatchObject({ status: "fallo" });
  });

  it("si orca responde ok:false marca fallo", async () => {
    const f = fakeDeps({ orcaOut: JSON.stringify({ ok: false, error: { message: "repo desconocido" } }) });
    const agent = await lanzar(makeTask(), "Por hacer", f.deps);
    expect(agent.status).toBe("fallo");
    expect(agent.error).toBeTruthy();
    expect(taskIn(f.mem.board).agent).toMatchObject({ status: "fallo" });
  });

  it("si orca responde sin result.worktree.id marca fallo", async () => {
    const f = fakeDeps({ orcaOut: JSON.stringify({ ok: true, result: { worktree: { path: "/p/x" } } }) });
    const agent = await lanzar(makeTask(), "Por hacer", f.deps);
    expect(agent.status).toBe("fallo");
    expect(agent.error).toBeTruthy();
  });
});

describe("detenerAgenteDeTarea", () => {
  afterEach(() => vi.restoreAllMocks());

  const orcaAgent = () =>
    makeAgent({ pid: undefined, sessionId: undefined, orca: { worktreeId: ORCA_WT_ID, handle: "term-1" } });

  it("agente en Orca: cierra sus terminales con orca y marca la tarea como detenida", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const f = fakeDeps({ board: makeBoard([makeTask({ agent: orcaAgent() })]) });
    const result = await detener(ID, f.deps);
    const orca = f.orcaCalls();
    expect(orca).toHaveLength(1);
    expect(orca[0][1]).toEqual(["terminal", "close", "--worktree", `id:${ORCA_WT_ID}`, "--all", "--json"]);
    expect(orca[0][2]).toBe(REPO);
    expect(kill).not.toHaveBeenCalled();
    expect(taskIn(result).agent).toMatchObject({ status: "detenido", endedAt: 1000 });
    expect(taskIn(f.mem.board).agent!.status).toBe("detenido");
  });

  it("agente en Orca: si orca falla igual queda detenido y no lanza", async () => {
    const f = fakeDeps({ orcaFails: true, board: makeBoard([makeTask({ agent: orcaAgent() })]) });
    const result = await detener(ID, f.deps);
    expect(taskIn(result).agent!.status).toBe("detenido");
    expect(taskIn(f.mem.board).agent!.status).toBe("detenido");
  });

  it("agente viejo con pid: termina el proceso y marca la tarea como detenida", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const f = fakeDeps({ board: makeBoard([makeTask({ agent: makeAgent({ pid: 4242 }) })]) });
    const result = await detener(ID, f.deps);
    const pids = kill.mock.calls.map((c) => c[0]);
    expect(pids.some((p) => p === 4242 || p === -4242)).toBe(true);
    expect(taskIn(result).agent!.status).toBe("detenido");
    expect(taskIn(f.mem.board).agent!.status).toBe("detenido");
  });

  it("sin agente devuelve el tablero sin cambios", async () => {
    vi.spyOn(process, "kill").mockImplementation(() => true);
    const original = makeBoard([makeTask()]);
    const f = fakeDeps({ board: structuredClone(original) });
    const result = await detener(ID, f.deps);
    expect(result).toEqual(original);
    expect(f.orcaCalls()).toHaveLength(0);
  });
});

describe("abrirAgenteEnOrca", () => {
  const orcaAgent = () =>
    makeAgent({ pid: undefined, sessionId: undefined, orca: { worktreeId: ORCA_WT_ID, handle: "term-1" } });

  it("es una función exportada", () => {
    expect(typeof mod.abrirAgenteEnOrca).toBe("function");
  });

  it("con agente en Orca activa su worktree y devuelve true", async () => {
    const f = fakeDeps({ board: makeBoard([makeTask({ agent: orcaAgent() })]) });
    const ok = await mod.abrirAgenteEnOrca!(ID, f.deps);
    expect(ok).toBe(true);
    const orca = f.orcaCalls();
    expect(orca).toHaveLength(1);
    expect(orca[0][1]).toEqual(["worktree", "activate", "--worktree", `id:${ORCA_WT_ID}`, "--json"]);
    expect(orca[0][2]).toBe(REPO);
  });

  it("sin agent.orca devuelve false sin llamar a orca", async () => {
    const f = fakeDeps({ board: makeBoard([makeTask({ agent: makeAgent() })]) });
    const ok = await mod.abrirAgenteEnOrca!(ID, f.deps);
    expect(ok).toBe(false);
    expect(f.deps.run).not.toHaveBeenCalled();
  });

  it("si orca falla devuelve false", async () => {
    const f = fakeDeps({ orcaFails: true, board: makeBoard([makeTask({ agent: orcaAgent() })]) });
    await expect(mod.abrirAgenteEnOrca!(ID, f.deps)).resolves.toBe(false);
  });
});
