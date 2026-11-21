/**
 * Operaciones puras sobre el tablero. Se usan igual en el cliente (actualización
 * optimista), en las Server Actions y en el servidor MCP.
 */
import { PHASES, getPhase, isHumanTurn } from "./phases";
import type { BoardState, Phase, PhaseChangeError, PhaseId, PhaseInput, Status, Task, TaskPhase } from "./types";

export const DEFAULT_BOARD: BoardState = {
  statuses: [
    { id: "todo", name: "Por hacer", color: "#64748b" },
    { id: "doing", name: "En progreso", color: "#3b82f6" },
    { id: "done", name: "Hecho", color: "#10b981" },
  ],
  tasks: [],
};

export function newId(): string {
  // crypto.randomUUID solo existe en contextos seguros (https / localhost).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const ops = {
  addStatus: (s: BoardState, status: Status): BoardState => ({
    ...s,
    statuses: [...s.statuses, status],
  }),

  updateStatus: (s: BoardState, id: string, changes: Partial<Omit<Status, "id">>): BoardState => ({
    ...s,
    statuses: s.statuses.map((st) => (st.id === id ? { ...st, ...changes } : st)),
  }),

  /** Elimina un estado y mueve sus tareas a `moveTasksTo`. */
  deleteStatus: (s: BoardState, id: string, moveTasksTo: string): BoardState => {
    if (id === moveTasksTo || !s.statuses.some((st) => st.id === moveTasksTo)) return s;
    return {
      statuses: s.statuses.filter((st) => st.id !== id),
      tasks: s.tasks.map((t) => (t.statusId === id ? { ...t, statusId: moveTasksTo } : t)),
    };
  },

  moveStatus: (s: BoardState, id: string, direction: -1 | 1): BoardState => {
    const idx = s.statuses.findIndex((st) => st.id === id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= s.statuses.length) return s;
    const statuses = [...s.statuses];
    [statuses[idx], statuses[target]] = [statuses[target], statuses[idx]];
    return { ...s, statuses };
  },

  addTask: (s: BoardState, task: Task): BoardState => ({ ...s, tasks: [...s.tasks, task] }),

  updateTask: (s: BoardState, id: string, changes: Partial<Omit<Task, "id" | "createdAt">>): BoardState => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...changes } : t)),
  }),

  deleteTask: (s: BoardState, id: string): BoardState => ({
    ...s,
    tasks: s.tasks.filter((t) => t.id !== id),
  }),

  /** Asigna o cambia la fase del grafo de una tarea. Asume que el input ya fue validado. */
  setTaskPhase: (s: BoardState, taskId: string, input: PhaseInput, now: number): BoardState => ({
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== taskId) return t;
      const prev = t.phase;
      const phaseId = input.phaseId as PhaseId;
      const owner = input.owner?.trim() || prev?.owner || "";
      const prevOrder = prev ? getPhase(prev.phaseId)?.order : undefined;
      const nextOrder = getPhase(phaseId)?.order;
      const regresses = prev && prevOrder !== undefined && nextOrder !== undefined && nextOrder < prevOrder;
      const phase: TaskPhase = { phaseId, owner, updatedAt: now };
      if (regresses) {
        phase.lastRegression = { from: prev.phaseId, to: phaseId, reason: (input.reason ?? "").trim(), at: now };
      } else if (prev?.lastRegression) {
        phase.lastRegression = prev.lastRegression;
      }
      return { ...t, phase };
    }),
  }),

  /** Quita la fase del grafo de una tarea. */
  clearTaskPhase: (s: BoardState, taskId: string): BoardState => ({
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== taskId || !("phase" in t)) return t;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { phase, ...rest } = t;
      return rest;
    }),
  }),
};

export const PHASE_ERROR_MESSAGES: Record<PhaseChangeError, string> = {
  TAREA_NO_ENCONTRADA: "No se encontró la tarea indicada.",
  FASE_INVALIDA: "La fase indicada no existe en el flujo.",
  RESPONSABLE_REQUERIDO: "Indica quién es el responsable humano al asignar la primera fase.",
  MOTIVO_REQUERIDO: "Para regresar a una fase anterior debes explicar el motivo.",
};

/** Valida un cambio de fase contra el tablero actual. Devuelve null si es válido. */
export function validatePhaseChange(s: BoardState, taskId: string, input: PhaseInput): PhaseChangeError | null {
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t) return "TAREA_NO_ENCONTRADA";
  const next = getPhase(input.phaseId);
  if (!next) return "FASE_INVALIDA";
  if (!t.phase) return input.owner?.trim() ? null : "RESPONSABLE_REQUERIDO";
  const current = getPhase(t.phase.phaseId);
  if (current && next.order < current.order && !input.reason?.trim()) return "MOTIVO_REQUERIDO";
  return null;
}

/** Tareas cuya fase actual le toca a un humano. */
export function tasksAwaitingHuman(s: BoardState): Task[] {
  return s.tasks.filter((t) => !!t.phase && isHumanTurn(t.phase.phaseId));
}

/**
 * Agrupa las tareas para la vista "Por fases": primero "Sin fase" (phase null,
 * por createdAt desc) y luego un grupo por cada fase de PHASES, en orden e
 * incluidas las vacías (por phase.updatedAt desc). Pura: no muta el tablero.
 */
export function groupByPhase(s: BoardState): { phase: Phase | null; tasks: Task[] }[] {
  const noPhase = s.tasks.filter((t) => !t.phase).sort((a, b) => b.createdAt - a.createdAt);
  const byPhase = PHASES.map((phase) => ({
    phase,
    tasks: s.tasks
      .filter((t) => t.phase?.phaseId === phase.id)
      .sort((a, b) => b.phase!.updatedAt - a.phase!.updatedAt),
  }));
  return [{ phase: null, tasks: noPhase }, ...byPhase];
}

const norm = (v: string) => v.trim().toLowerCase();

/** Busca un estado por id o por nombre (sin distinguir mayúsculas). */
export function findStatus(s: BoardState, idOrName: string): Status | undefined {
  return s.statuses.find((st) => st.id === idOrName) ?? s.statuses.find((st) => norm(st.name) === norm(idOrName));
}

/** Busca tareas por id o por título exacto (sin distinguir mayúsculas). */
export function findTasks(s: BoardState, idOrTitle: string): Task[] {
  const byId = s.tasks.find((t) => t.id === idOrTitle);
  if (byId) return [byId];
  return s.tasks.filter((t) => norm(t.title) === norm(idOrTitle));
}

export function isBoardState(v: unknown): v is BoardState {
  const b = v as BoardState;
  return !!b && Array.isArray(b.statuses) && Array.isArray(b.tasks);
}
