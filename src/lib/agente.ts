/**
 * Agente automático: al crear un ticket, levanta en Orca un worktree con una sesión
 * interactiva de Claude Code que lo trabaja con el flujo de CLAUDE.md y mueve la
 * tarjeta por las fases vía MCP. La persona ve la sesión en Orca y responde ahí la
 * aprobación final.
 *
 * Variables de entorno:
 * - KANBAN_AGENTE_AUTO=0          Apaga el lanzamiento automático al crear un ticket (encendido por defecto).
 * - KANBAN_AGENTE_ORCA            Ruta del CLI de Orca (si no viene, `ORCA_CLI_COMMAND` o `orca`).
 * - KANBAN_AGENTE_REPO            Repositorio base desde el que Orca crea los worktrees (def. `process.cwd()`).
 * - KANBAN_AGENTE_RESPONSABLE     Responsable que el agente registra en la fase `intent` (def. `Equipo`).
 * - KANBAN_AGENTE_URL             URL del tablero real, para el servidor MCP `kanban` (def. `http://localhost:3000`).
 */
import "server-only";
import { execFile } from "node:child_process";
import { appendFile, mkdir as fsMkdir } from "node:fs/promises";
import path from "node:path";
import { ops } from "./board";
import type { BoardState, Task, TaskAgent } from "./types";

export type Env = Record<string, string | undefined>;

export const EVIDENCIA_PREFIX = "[evidencia]";

const DEFAULT_URL = "http://localhost:3000";

/** Encendido por defecto; solo `KANBAN_AGENTE_AUTO=0` lo apaga. */
export function agenteAutomaticoActivo(env: Env = process.env): boolean {
  return env.KANBAN_AGENTE_AUTO !== "0";
}

/** Modo activo, título sin prefijo `[evidencia]` y la tarea todavía sin agente. */
export function debeLanzarAgente(task: Task, env: Env = process.env): boolean {
  return agenteAutomaticoActivo(env) && !task.title.trim().startsWith(EVIDENCIA_PREFIX) && !task.agent;
}

/** Comando del CLI de Orca: `KANBAN_AGENTE_ORCA`, luego `ORCA_CLI_COMMAND`, luego `orca`. */
export function orcaCmd(env: Env = process.env): string {
  return env.KANBAN_AGENTE_ORCA || env.ORCA_CLI_COMMAND || "orca";
}

/** Prompt con todo el contexto del ticket y las reglas para trabajarlo en una sesión de Orca. */
export function construirPrompt(task: Task, statusName: string, env: Env = process.env): string {
  const responsable = env.KANBAN_AGENTE_RESPONSABLE ?? "Equipo";
  const url = env.KANBAN_AGENTE_URL ?? DEFAULT_URL;
  const descripcion = task.description.trim() || "(sin descripción)";
  return [
    "## Ticket",
    `- id: ${task.id}`,
    `- título: ${task.title}`,
    `- descripción: ${descripcion}`,
    `- columna: ${statusName}`,
    "",
    "## Instrucciones",
    "1. Trabaja este ticket siguiendo el flujo completo de CLAUDE.md, en modo autónomo, de principio a fin.",
    `2. Esta tarjeta YA es el ticket: usa su id (${task.id}) en \`actualizar_fase\` del servidor MCP \`kanban\`. La primera vez (fase \`intent\`) usa \`responsable\` = "${responsable}". Usa siempre el id, nunca el título.`,
    "3. Al entrar a cada fase, relee la tarjeta con `listar_tareas` por si alguien la editó. Si la tarjeta ya no existe, o su campo `agente` dice \"detenido\" (alguien te detuvo desde el tablero), pasa a la fase `inactivo` del hook (`node .claude/hooks/flujo.mjs fase inactivo`) y termina sin hacer nada más.",
    "4. Estás en un git worktree propio creado por Orca: corre `npm install` si falta `node_modules`.",
    `5. Para las evidencias levanta tu propia app en otro puerto (p. ej. \`PORT=3100 npm run dev\`) y usa \`EVIDENCIA_URL=http://localhost:3100\`. El tablero real está en ${url}: no lo reinicies ni lo detengas.`,
    "6. Esta sesión corre en Orca y la persona la ve: al llegar a la aprobación final mueve la tarjeta a `aprobacion_final` y pregunta con `AskUserQuestion` como dice CLAUDE.md; la persona responde aquí mismo.",
    "7. Nada sale de la máquina antes de la aprobación final: sin `git push` y sin PRs hasta entonces. Si la persona responde \"Apruebo\", haz commit, sube la rama y crea el PR del ticket contra `main` con `gh pr create` (o reutiliza el que ya tenga la rama), como dice CLAUDE.md, y da el enlace del PR.",
  ].join("\n");
}

export type PlanLanzamiento = {
  /** Nombre del worktree en Orca: `ticket-<id8>`. */
  name: string;
  logFile: string;
  command: string;
  args: string[];
};

/**
 * Calcula, sin efectos, cómo se lanza el agente en Orca:
 * - name: `ticket-<id8>`
 * - logFile: `<repoDir>/data/agentes/<taskId>.log`
 * - command: `orcaCmd(env)`
 * - args: `worktree create --repo path:<repoDir> --name <name> --base-branch <rama> --agent claude
 *   --surface terminal --comment <título> --prompt <prompt> --no-parent --json`
 */
export function planLanzamiento(
  task: Task,
  prompt: string,
  opts: { repoDir: string; baseBranch: string; env?: Env },
): PlanLanzamiento {
  const env = opts.env ?? process.env;
  const repoDir = path.resolve(opts.repoDir);
  const id8 = task.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "ticket";
  const name = `ticket-${id8}`;
  return {
    name,
    logFile: path.join(repoDir, "data", "agentes", `${task.id}.log`),
    command: orcaCmd(env),
    args: [
      "worktree",
      "create",
      "--repo",
      `path:${repoDir}`,
      "--name",
      name,
      "--base-branch",
      opts.baseBranch,
      "--agent",
      "claude",
      "--surface",
      "chat",
      "--comment",
      task.title,
      "--prompt",
      prompt,
      "--no-parent",
      "--json",
    ],
  };
}

/**
 * Tareas con agente "trabajando" lanzado como proceso (con pid) que ya no existe pasan a "detenido".
 * Los agentes en Orca (sin pid) no se tocan: su sesión vive en Orca. Pura.
 */
export function reconciliarAgentes(board: BoardState, estaVivo: (pid: number) => boolean, now = Date.now()): BoardState {
  let cambio = false;
  const tasks = board.tasks.map((t) => {
    const a = t.agent;
    if (!a || a.status !== "trabajando") return t;
    if (a.pid === undefined) return t;
    if (estaVivo(a.pid)) return t;
    cambio = true;
    return { ...t, agent: { ...a, status: "detenido" as const, endedAt: now } };
  });
  return cambio ? { ...board, tasks } : board;
}

/** Dependencias inyectables (para pruebas). */
export type AgenteDeps = {
  /** Ejecuta un comando y resuelve con stdout; rechaza con el mensaje y el stderr si falla. */
  run: (cmd: string, args: string[], cwd: string) => Promise<string>;
  mkdir: (path: string) => Promise<void>;
  appendLog: (path: string, text: string) => Promise<void>;
  mutate: (fn: (board: BoardState) => BoardState) => Promise<BoardState>;
  now: () => number;
  env: Env;
  repoDir: string;
};

function defaultDeps(): AgenteDeps {
  return {
    run: (cmd, args, cwd) =>
      new Promise((resolve, reject) => {
        // Sin las variables de una sesión de Claude Code que haya levantado el tablero:
        // el agente es una sesión nueva e independiente.
        const env = { ...process.env };
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE_ENTRYPOINT;
        execFile(cmd, args, { cwd, env, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          if (error) reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ""}`));
          else resolve(stdout);
        });
      }),
    mkdir: async (p) => {
      await fsMkdir(p, { recursive: true });
    },
    appendLog: (p, text) => appendFile(p, text),
    mutate: async (fn) => {
      const { mutateBoard } = await import("./db");
      return mutateBoard(fn);
    },
    now: () => Date.now(),
    env: process.env,
    repoDir: process.env.KANBAN_AGENTE_REPO ?? process.cwd(),
  };
}

function resolverDeps(deps?: Partial<AgenteDeps>): AgenteDeps {
  const base = defaultDeps();
  const merged = { ...base, ...deps };
  if (!deps?.repoDir) merged.repoDir = merged.env.KANBAN_AGENTE_REPO ?? base.repoDir;
  return merged;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

type OrcaWorktree = { id: string; path: string; branch: string; handle?: string; sessionId?: string };

/** Interpreta la salida JSON de `orca worktree create --json`; lanza si no trae el worktree. */
function leerSalidaOrca(stdout: string): OrcaWorktree {
  let data: unknown;
  try {
    data = JSON.parse(stdout.trim());
  } catch {
    throw new Error(`Orca devolvió una salida que no es JSON: ${stdout.trim().slice(0, 200)}`);
  }
  const r = data as {
    ok?: boolean;
    error?: { message?: string };
    result?: {
      worktree?: { id?: unknown; path?: unknown; branch?: unknown };
      launch?: { outcome?: { handle?: unknown; sessionId?: unknown } };
    };
  };
  if (!r || r.ok !== true) {
    throw new Error(`Orca no pudo crear el worktree: ${r?.error?.message ?? "respuesta sin ok"}`);
  }
  const wt = r.result?.worktree;
  if (!wt || typeof wt.id !== "string" || !wt.id) {
    throw new Error("Orca respondió sin el id del worktree");
  }
  const handle = r.result?.launch?.outcome?.handle;
  const sessionId = r.result?.launch?.outcome?.sessionId;
  return {
    id: wt.id,
    path: typeof wt.path === "string" ? wt.path : "",
    branch: typeof wt.branch === "string" ? wt.branch.replace(/^refs\/heads\//, "") : "",
    handle: typeof handle === "string" ? handle : undefined,
    sessionId: typeof sessionId === "string" ? sessionId : undefined,
  };
}

/**
 * Verifica que la rama actual tenga CLAUDE.md, crea en Orca un worktree con una sesión de
 * Claude que trabaja el ticket y guarda `agent` en la tarea.
 * Nunca lanza excepción: si algo falla, la tarea queda con `agent.status = "fallo"` y `agent.error`.
 */
export async function lanzarAgente(task: Task, statusName: string, deps?: Partial<AgenteDeps>): Promise<TaskAgent> {
  const d = resolverDeps(deps);
  const logFile = planLanzamiento(task, "", { repoDir: d.repoDir, baseBranch: "", env: d.env }).logFile;
  const base: TaskAgent = { status: "trabajando", worktree: "", branch: "", logFile, startedAt: d.now() };
  const guardar = (agent: TaskAgent) => d.mutate((b) => ops.updateTask(b, task.id, { agent }));
  const log = (text: string) => d.appendLog(logFile, text).catch(() => {});

  try {
    await d.mkdir(path.dirname(logFile));
    const baseBranch = (await d.run("git", ["rev-parse", "--abbrev-ref", "HEAD"], d.repoDir)).trim();
    try {
      await d.run("git", ["cat-file", "-e", `${baseBranch}:CLAUDE.md`], d.repoDir);
    } catch {
      throw new Error(`La rama base (${baseBranch}) no tiene CLAUDE.md: haz commit del flujo antes de lanzar agentes`);
    }
    const plan = planLanzamiento(task, construirPrompt(task, statusName, d.env), {
      repoDir: d.repoDir,
      baseBranch,
      env: d.env,
    });
    await log(`[tablero] ${plan.command} worktree create --name ${plan.name} --base-branch ${baseBranch}\n`);
    const stdout = await d.run(plan.command, plan.args, d.repoDir);
    await log(`${stdout.trimEnd()}\n`);
    const wt = leerSalidaOrca(stdout);
    const agent: TaskAgent = {
      ...base,
      worktree: wt.path,
      branch: wt.branch,
      ...(wt.sessionId ? { sessionId: wt.sessionId } : {}),
      orca: wt.handle ? { worktreeId: wt.id, handle: wt.handle } : { worktreeId: wt.id },
    };
    await guardar(agent);
    return agent;
  } catch (e) {
    const agent: TaskAgent = { ...base, status: "fallo", endedAt: d.now(), error: mensaje(e) };
    await log(`[tablero] fallo: ${agent.error}\n`);
    try {
      await guardar(agent);
    } catch {
      // si no se pudo guardar, al menos devolvemos el fallo
    }
    return agent;
  }
}

/**
 * Marca la tarea como "detenido" y detiene su agente. En Orca la sesión es un chat que el CLI no
 * puede cerrar: la detención es cooperativa (el agente ve `agente: "detenido"` en `listar_tareas`
 * al cambiar de fase y termina); igual se intenta cerrar terminales por si Orca abrió una.
 * En agentes viejos lanzados como proceso, termina el proceso. Nunca lanza por eso.
 */
export async function detenerAgenteDeTarea(taskId: string, deps?: Partial<AgenteDeps>): Promise<BoardState> {
  const d = resolverDeps(deps);
  let detenido: TaskAgent | undefined;
  const endedAt = d.now();
  const board = await d.mutate((b) => {
    const agent = b.tasks.find((t) => t.id === taskId)?.agent;
    if (!agent || agent.status !== "trabajando") return b;
    detenido = agent;
    return ops.updateTask(b, taskId, { agent: { ...agent, status: "detenido", endedAt } });
  });
  const agent = detenido as TaskAgent | undefined;
  if (agent?.orca) {
    try {
      await d.run(
        orcaCmd(d.env),
        ["terminal", "close", "--worktree", `id:${agent.orca.worktreeId}`, "--all", "--json"],
        d.repoDir,
      );
    } catch {
      // Orca no respondió: la tarjeta igual queda detenida
    }
  } else if (agent?.pid !== undefined) {
    const pid = agent.pid;
    try {
      process.kill(-pid, "SIGTERM"); // grupo completo: el agente se lanzó con detached
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // el proceso ya no existe
      }
    }
  }
  return board;
}

/** Activa en Orca el worktree del agente de la tarea. `false` si no hay agente en Orca o falla. */
export async function abrirAgenteEnOrca(taskId: string, deps?: Partial<AgenteDeps>): Promise<boolean> {
  const d = resolverDeps(deps);
  try {
    const board = await d.mutate((b) => b);
    const orca = board.tasks.find((t) => t.id === taskId)?.agent?.orca;
    if (!orca) return false;
    await d.run(orcaCmd(d.env), ["worktree", "activate", "--worktree", `id:${orca.worktreeId}`, "--json"], d.repoDir);
    return true;
  } catch {
    return false;
  }
}
