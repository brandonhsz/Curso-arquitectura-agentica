/**
 * T2 (rojo) — contrato del agente automático (src/lib/agente.ts).
 */
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agenteAutomaticoActivo,
  construirPrompt,
  debeLanzarAgente,
  detenerAgenteDeTarea,
  lanzarAgente,
  planLanzamiento,
  reconciliarAgentes,
  type AgenteDeps,
} from "./agente";
import type { BoardState, Task, TaskAgent } from "./types";

const ID = "abcdef12-3456-7890-abcd-ef1234567890";
const ID8 = "abcdef12";
const REPO = "/r/kanban";
const WORKTREE = path.resolve("/r/kanban-agentes", `ticket-${ID8}`);
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
  it("es true solo con KANBAN_AGENTE_AUTO=1", () => {
    expect(agenteAutomaticoActivo({ KANBAN_AGENTE_AUTO: "1" })).toBe(true);
  });
  it("es false si falta o es 0", () => {
    expect(agenteAutomaticoActivo({})).toBe(false);
    expect(agenteAutomaticoActivo({ KANBAN_AGENTE_AUTO: "0" })).toBe(false);
  });
});

describe("debeLanzarAgente", () => {
  it("true con modo activo y tarea normal", () => {
    expect(debeLanzarAgente(makeTask(), ON)).toBe(true);
  });
  it("false con modo apagado", () => {
    expect(debeLanzarAgente(makeTask(), {})).toBe(false);
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
});

describe("planLanzamiento", () => {
  it("calcula rama, worktree, archivos y argumentos", () => {
    const plan = planLanzamiento(makeTask(), "PROMPT", { repoDir: REPO, sessionId: "s-1", env: {} });
    expect(plan.branch).toBe(`flujo/ticket-${ID8}`);
    expect(path.resolve(plan.worktree)).toBe(WORKTREE);
    expect(path.resolve(plan.logFile)).toBe(path.join(REPO, "data", "agentes", `${ID}.log`));
    expect(path.resolve(plan.mcpConfigFile)).toBe(path.join(REPO, "data", "agentes", `${ID}.mcp.json`));
    expect(plan.command).toBe("claude");
    const a = plan.args;
    expect(a[a.indexOf("-p") + 1]).toBe("PROMPT");
    expect(a[a.indexOf("--session-id") + 1]).toBe("s-1");
    expect(a[a.indexOf("--permission-mode") + 1]).toBe("bypassPermissions");
    expect(a[a.indexOf("--mcp-config") + 1]).toBe(plan.mcpConfigFile);
  });
  it("usa KANBAN_AGENTE_CMD si viene", () => {
    const plan = planLanzamiento(makeTask(), "P", {
      repoDir: REPO,
      sessionId: "s-1",
      env: { KANBAN_AGENTE_CMD: "/usr/local/bin/mi-claude" },
    });
    expect(plan.command).toBe("/usr/local/bin/mi-claude");
  });
});

describe("reconciliarAgentes", () => {
  const board = () =>
    makeBoard([
      makeTask({ id: "muerto", agent: makeAgent({ pid: 1 }) }),
      makeTask({ id: "vivo", agent: makeAgent({ pid: 2 }) }),
      makeTask({ id: "fin", agent: makeAgent({ pid: 1, status: "terminado", endedAt: 50 }) }),
      makeTask({ id: "sin" }),
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
  it("no muta la entrada", () => {
    const b = board();
    const copia = structuredClone(b);
    reconciliarAgentes(b, estaVivo, 999);
    expect(b).toEqual(copia);
  });
});

function fakeDeps(opts: { claudeMd?: boolean; gitFails?: boolean; board?: BoardState; env?: Record<string, string> } = {}) {
  const mem = { board: opts.board ?? makeBoard([makeTask()]) };
  const calls = {
    run: [] as Array<[string, string[], string]>,
    writeFile: [] as Array<[string, string]>,
    spawn: [] as Array<{ command: string; args: string[]; opts: { cwd: string; logFile: string } }>,
    exists: [] as string[],
  };
  let onExit: ((code: number | null) => void) | undefined;
  const deps: AgenteDeps = {
    run: vi.fn(async (cmd: string, args: string[], cwd: string) => {
      calls.run.push([cmd, args, cwd]);
      if (opts.gitFails && cmd === "git") throw new Error("fatal: git worktree falló");
      return "";
    }),
    exists: vi.fn((p: string) => {
      calls.exists.push(p);
      if (path.basename(p) === "CLAUDE.md") return opts.claudeMd ?? true;
      return false;
    }),
    writeFile: vi.fn(async (p: string, data: string) => {
      calls.writeFile.push([p, data]);
    }),
    mkdir: vi.fn(async () => {}),
    spawn: vi.fn((command, args, o, exit) => {
      calls.spawn.push({ command, args, opts: o });
      onExit = exit;
      return { pid: 4242 };
    }),
    mutate: vi.fn(async (fn: (b: BoardState) => BoardState) => {
      mem.board = fn(mem.board);
      return mem.board;
    }),
    newSessionId: () => "s-1",
    now: () => 1000,
    env: opts.env ?? { KANBAN_AGENTE_AUTO: "1" },
    repoDir: REPO,
  };
  return { deps, mem, calls, exit: (code: number | null) => onExit?.(code) };
}

const taskIn = (b: BoardState) => b.tasks.find((t) => t.id === ID)!;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("lanzarAgente", () => {
  it("camino feliz: crea worktree, escribe config MCP, lanza y guarda el agente", async () => {
    const f = fakeDeps();
    const agent = await lanzarAgente(makeTask(), "Por hacer", f.deps);

    const git = f.calls.run.find(([cmd, args]) => cmd === "git" && args[0] === "worktree" && args[1] === "add");
    expect(git).toBeDefined();
    expect(git![1]).toContain("-b");
    expect(git![1]).toContain(`flujo/ticket-${ID8}`);
    expect(git![1].map((a) => (a.startsWith("/") ? path.resolve(a) : a))).toContain(WORKTREE);
    expect(git![2]).toBe(REPO);

    const mcp = f.calls.writeFile.find(([p]) => p.endsWith(`${ID}.mcp.json`));
    expect(mcp).toBeDefined();
    expect(JSON.parse(mcp![1]).mcpServers.kanban.url).toBe("http://localhost:3000/api/mcp");

    expect(f.calls.spawn).toHaveLength(1);
    expect(path.resolve(f.calls.spawn[0].opts.cwd)).toBe(WORKTREE);

    expect(agent).toMatchObject({
      status: "trabajando",
      sessionId: "s-1",
      pid: 4242,
      branch: `flujo/ticket-${ID8}`,
      startedAt: 1000,
    });
    expect(path.resolve(agent.worktree)).toBe(WORKTREE);
    expect(taskIn(f.mem.board).agent).toMatchObject({ status: "trabajando", pid: 4242, sessionId: "s-1" });
  });

  it("usa KANBAN_AGENTE_URL para la config MCP", async () => {
    const f = fakeDeps({ env: { KANBAN_AGENTE_AUTO: "1", KANBAN_AGENTE_URL: "http://localhost:4000" } });
    await lanzarAgente(makeTask(), "Por hacer", f.deps);
    const mcp = f.calls.writeFile.find(([p]) => p.endsWith(`${ID}.mcp.json`));
    expect(JSON.parse(mcp![1]).mcpServers.kanban.url).toBe("http://localhost:4000/api/mcp");
  });

  it("al salir con código 0 la tarea queda terminada", async () => {
    const f = fakeDeps();
    await lanzarAgente(makeTask(), "Por hacer", f.deps);
    f.exit(0);
    await flush();
    const a = taskIn(f.mem.board).agent!;
    expect(a.status).toBe("terminado");
    expect(typeof a.endedAt).toBe("number");
  });

  it("al salir con código distinto de 0 la tarea queda en fallo", async () => {
    const f = fakeDeps();
    await lanzarAgente(makeTask(), "Por hacer", f.deps);
    f.exit(1);
    await flush();
    expect(taskIn(f.mem.board).agent!.status).toBe("fallo");
  });

  it("si el worktree no tiene CLAUDE.md no lanza y marca fallo", async () => {
    const f = fakeDeps({ claudeMd: false });
    const agent = await lanzarAgente(makeTask(), "Por hacer", f.deps);
    expect(f.calls.spawn).toHaveLength(0);
    expect(agent.status).toBe("fallo");
    expect(agent.error).toMatch(/CLAUDE\.md/);
    expect(taskIn(f.mem.board).agent).toMatchObject({ status: "fallo" });
  });

  it("si git falla no lanza excepción y marca fallo con error", async () => {
    const f = fakeDeps({ gitFails: true });
    const agent = await lanzarAgente(makeTask(), "Por hacer", f.deps);
    expect(agent.status).toBe("fallo");
    expect(agent.error).toBeTruthy();
    expect(f.calls.spawn).toHaveLength(0);
    expect(taskIn(f.mem.board).agent).toMatchObject({ status: "fallo" });
  });
});

describe("detenerAgenteDeTarea", () => {
  afterEach(() => vi.restoreAllMocks());

  it("termina el proceso y marca la tarea como detenida", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const f = fakeDeps({ board: makeBoard([makeTask({ agent: makeAgent({ pid: 4242 }) })]) });
    const result = await detenerAgenteDeTarea(ID, f.deps);
    const pids = kill.mock.calls.map((c) => c[0]);
    expect(pids.some((p) => p === 4242 || p === -4242)).toBe(true);
    expect(taskIn(result).agent!.status).toBe("detenido");
    expect(taskIn(f.mem.board).agent!.status).toBe("detenido");
  });

  it("sin agente devuelve el tablero sin cambios", async () => {
    vi.spyOn(process, "kill").mockImplementation(() => true);
    const original = makeBoard([makeTask()]);
    const f = fakeDeps({ board: structuredClone(original) });
    const result = await detenerAgenteDeTarea(ID, f.deps);
    expect(result).toEqual(original);
  });
});
