/**
 * Agente automático: al crear un ticket, lanza una sesión de Claude Code que lo
 * trabaja con el flujo de CLAUDE.md y mueve la tarjeta por las fases vía MCP.
 *
 * Variables de entorno:
 * - KANBAN_AGENTE_AUTO=1          Activa el lanzamiento automático al crear un ticket (apagado por defecto).
 * - KANBAN_AGENTE_CMD             Comando de Claude Code a ejecutar (def. `claude`).
 * - KANBAN_AGENTE_REPO            Repositorio base desde el que se crean los worktrees (def. `process.cwd()`).
 * - KANBAN_AGENTE_RESPONSABLE     Responsable que el agente registra en la fase `intent` (def. `Equipo`).
 * - KANBAN_AGENTE_URL             URL del tablero real, para el servidor MCP `kanban` (def. `http://localhost:3000`).
 */
import "server-only";
import { spawn as nodeSpawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir as fsMkdir, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { ops } from "./board";
import type { BoardState, Task, TaskAgent } from "./types";

export type Env = Record<string, string | undefined>;

export const EVIDENCIA_PREFIX = "[evidencia]";

const DEFAULT_URL = "http://localhost:3000";

/** `KANBAN_AGENTE_AUTO === "1"`. */
export function agenteAutomaticoActivo(env: Env = process.env): boolean {
  return env.KANBAN_AGENTE_AUTO === "1";
}

/** Modo activo, título sin prefijo `[evidencia]` y la tarea todavía sin agente. */
export function debeLanzarAgente(task: Task, env: Env = process.env): boolean {
  return agenteAutomaticoActivo(env) && !task.title.trim().startsWith(EVIDENCIA_PREFIX) && !task.agent;
}

/** Prompt con todo el contexto del ticket y las reglas para trabajarlo sin interfaz. */
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
    "3. Al entrar a cada fase, relee la tarjeta con `listar_tareas` por si alguien la editó. Si la tarjeta ya no existe, pasa a la fase `inactivo` del hook (`node .claude/hooks/flujo.mjs fase inactivo`) y termina.",
    "4. Estás en un git worktree propio: corre `npm install` si falta `node_modules`.",
    `5. Para las evidencias levanta tu propia app en otro puerto (p. ej. \`PORT=3100 npm run dev\`) y usa \`EVIDENCIA_URL=http://localhost:3100\`. El tablero real está en ${url}: no lo reinicies ni lo detengas.`,
    "6. Esta sesión no tiene a quién preguntarle. Al llegar a la aprobación final, mueve la tarjeta a `aprobacion_final`, deja el resumen de aprobación como último mensaje y termina SIN usar AskUserQuestion: la persona retomará esta sesión con `claude --resume`.",
    "7. Nada sale de la máquina: sin `git push` y sin PRs.",
  ].join("\n");
}

export type PlanLanzamiento = {
  worktree: string;
  branch: string;
  logFile: string;
  mcpConfigFile: string;
  command: string;
  args: string[];
};

/**
 * Calcula, sin efectos, dónde y cómo se lanza el agente:
 * - worktree: `<repoDir>/../<nombre-del-repo>-agentes/ticket-<id8>`
 * - branch: `flujo/ticket-<id8>`
 * - logFile y mcpConfigFile en `<repoDir>/data/agentes/<taskId>.log|.mcp.json`
 * - command: `KANBAN_AGENTE_CMD` (def. `claude`)
 * - args: `-p <prompt> --session-id <id> --permission-mode bypassPermissions --mcp-config <file> --output-format stream-json --verbose`
 */
export function planLanzamiento(
  task: Task,
  prompt: string,
  opts: { repoDir: string; sessionId: string; env?: Env },
): PlanLanzamiento {
  const env = opts.env ?? process.env;
  const repoDir = path.resolve(opts.repoDir);
  const id8 = task.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "ticket";
  const worktree = path.join(path.dirname(repoDir), `${path.basename(repoDir)}-agentes`, `ticket-${id8}`);
  const dataDir = path.join(repoDir, "data", "agentes");
  const mcpConfigFile = path.join(dataDir, `${task.id}.mcp.json`);
  return {
    worktree,
    branch: `flujo/ticket-${id8}`,
    logFile: path.join(dataDir, `${task.id}.log`),
    mcpConfigFile,
    command: env.KANBAN_AGENTE_CMD || "claude",
    args: [
      "-p",
      prompt,
      "--session-id",
      opts.sessionId,
      "--permission-mode",
      "bypassPermissions",
      "--mcp-config",
      mcpConfigFile,
      "--output-format",
      "stream-json",
      "--verbose",
    ],
  };
}

/** Tareas con agente "trabajando" cuyo proceso ya no existe pasan a "detenido". Pura. */
export function reconciliarAgentes(board: BoardState, estaVivo: (pid: number) => boolean, now = Date.now()): BoardState {
  let cambio = false;
  const tasks = board.tasks.map((t) => {
    const a = t.agent;
    if (!a || a.status !== "trabajando") return t;
    if (a.pid !== undefined && estaVivo(a.pid)) return t;
    cambio = true;
    return { ...t, agent: { ...a, status: "detenido" as const, endedAt: now } };
  });
  return cambio ? { ...board, tasks } : board;
}

/** Dependencias inyectables (para pruebas). */
export type AgenteDeps = {
  /** Ejecuta un comando y resuelve con stdout; rechaza si falla. */
  run: (cmd: string, args: string[], cwd: string) => Promise<string>;
  exists: (path: string) => boolean;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  /** Lanza el proceso desacoplado; `onExit` se llama con el código de salida. */
  spawn: (
    command: string,
    args: string[],
    opts: { cwd: string; logFile: string },
    onExit: (code: number | null) => void,
  ) => { pid?: number };
  mutate: (fn: (board: BoardState) => BoardState) => Promise<BoardState>;
  newSessionId: () => string;
  now: () => number;
  env: Env;
  repoDir: string;
};

function defaultDeps(): AgenteDeps {
  return {
    run: (cmd, args, cwd) =>
      new Promise((resolve, reject) => {
        execFile(cmd, args, { cwd }, (error, stdout, stderr) => {
          if (error) reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ""}`));
          else resolve(stdout);
        });
      }),
    exists: (p) => existsSync(p),
    writeFile: (p, data) => fsWriteFile(p, data),
    mkdir: async (p) => {
      await fsMkdir(p, { recursive: true });
    },
    spawn: (command, args, opts, onExit) => {
      const fd = openSync(opts.logFile, "a");
      try {
        const child = nodeSpawn(command, args, {
          cwd: opts.cwd,
          detached: true,
          stdio: ["ignore", fd, fd],
        });
        child.on("exit", (code) => onExit(code));
        child.on("error", () => onExit(-1));
        child.unref();
        return { pid: child.pid };
      } finally {
        closeSync(fd); // el hijo ya tiene su copia del descriptor
      }
    },
    mutate: async (fn) => {
      const { mutateBoard } = await import("./db");
      return mutateBoard(fn);
    },
    newSessionId: () => randomUUID(),
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

/**
 * Crea el worktree, verifica que tenga CLAUDE.md, lanza el agente y guarda `agent` en la tarea.
 * Nunca lanza excepción: si algo falla, la tarea queda con `agent.status = "fallo"` y `agent.error`.
 */
export async function lanzarAgente(task: Task, statusName: string, deps?: Partial<AgenteDeps>): Promise<TaskAgent> {
  const d = resolverDeps(deps);
  const sessionId = d.newSessionId();
  const plan = planLanzamiento(task, construirPrompt(task, statusName, d.env), {
    repoDir: d.repoDir,
    sessionId,
    env: d.env,
  });
  const base: TaskAgent = {
    status: "trabajando",
    sessionId,
    worktree: plan.worktree,
    branch: plan.branch,
    logFile: plan.logFile,
    startedAt: d.now(),
  };
  const guardar = (agent: TaskAgent) => d.mutate((b) => ops.updateTask(b, task.id, { agent }));

  try {
    await d.mkdir(path.dirname(plan.logFile));
    await d.run("git", ["worktree", "add", "-b", plan.branch, plan.worktree, "HEAD"], d.repoDir);
    if (!d.exists(path.join(plan.worktree, "CLAUDE.md"))) {
      throw new Error("La rama base no tiene CLAUDE.md: haz commit del flujo antes de lanzar agentes");
    }
    const url = d.env.KANBAN_AGENTE_URL ?? DEFAULT_URL;
    await d.writeFile(
      plan.mcpConfigFile,
      JSON.stringify({ mcpServers: { kanban: { type: "http", url: `${url}/api/mcp` } } }, null, 2),
    );

    const onExit = (code: number | null) => {
      const endedAt = d.now();
      void d
        .mutate((b) => {
          const actual = b.tasks.find((t) => t.id === task.id)?.agent;
          if (!actual || actual.status !== "trabajando" || actual.sessionId !== sessionId) return b;
          const agent: TaskAgent =
            code === 0
              ? { ...actual, status: "terminado", endedAt }
              : { ...actual, status: "fallo", endedAt, error: `Salió con código ${code}` };
          return ops.updateTask(b, task.id, { agent });
        })
        .catch(() => {});
    };

    const { pid } = d.spawn(plan.command, plan.args, { cwd: plan.worktree, logFile: plan.logFile }, onExit);
    const agent: TaskAgent = { ...base, pid };
    await guardar(agent);
    return agent;
  } catch (e) {
    const agent: TaskAgent = { ...base, status: "fallo", endedAt: d.now(), error: mensaje(e) };
    try {
      await guardar(agent);
    } catch {
      // si no se pudo guardar, al menos devolvemos el fallo
    }
    return agent;
  }
}

/** Termina el proceso del agente (si sigue vivo) y marca la tarea como "detenido". */
export async function detenerAgenteDeTarea(taskId: string, deps?: Partial<AgenteDeps>): Promise<BoardState> {
  const d = resolverDeps(deps);
  let pid: number | undefined;
  const endedAt = d.now();
  const board = await d.mutate((b) => {
    const agent = b.tasks.find((t) => t.id === taskId)?.agent;
    if (!agent || agent.status !== "trabajando") return b;
    pid = agent.pid;
    return ops.updateTask(b, taskId, { agent: { ...agent, status: "detenido", endedAt } });
  });
  if (pid !== undefined) {
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
