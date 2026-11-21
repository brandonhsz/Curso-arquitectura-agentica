export type Status = {
  id: string;
  name: string;
  color: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  statusId: string;
  createdAt: number;
  phase?: TaskPhase;
  /** Agente que trabaja el ticket de forma automática (si se lanzó uno). */
  agent?: TaskAgent;
};

export type AgentStatus = "trabajando" | "terminado" | "fallo" | "detenido";

export type TaskAgent = {
  status: AgentStatus;
  /** Id de la sesión de Claude Code; sirve para retomarla con `claude --resume`. */
  sessionId: string;
  /** Carpeta (git worktree) donde trabaja el agente. */
  worktree: string;
  branch: string;
  logFile: string;
  pid?: number;
  startedAt: number;
  endedAt?: number;
  error?: string;
};

export type PhaseId =
  | "intent"
  | "idea"
  | "mesa"
  | "sintesis"
  | "respuesta"
  | "consolidada"
  | "implementacion"
  | "analisis"
  | "validacion"
  | "evidencia_final"
  | "aprobacion_final";

export type Turn = "humano" | "agente" | "ninguno";

export type PhaseBlock = 1 | 2 | 3 | 4 | 5;

export type Phase = { id: PhaseId; name: string; order: number; turn: Turn; block: PhaseBlock };

export type PhaseRegression = { from: PhaseId; to: PhaseId; reason: string; at: number };

export type TaskPhase = {
  phaseId: PhaseId;
  owner: string;
  updatedAt: number;
  lastRegression?: PhaseRegression;
};

export type PhaseInput = { phaseId: string; owner?: string; reason?: string };

export type PhaseChangeError =
  | "TAREA_NO_ENCONTRADA"
  | "FASE_INVALIDA"
  | "RESPONSABLE_REQUERIDO"
  | "MOTIVO_REQUERIDO";

export type BoardState = {
  statuses: Status[];
  tasks: Task[];
};

export const STATUS_COLORS = [
  "#64748b", // gris
  "#3b82f6", // azul
  "#f59e0b", // ámbar
  "#10b981", // verde
  "#ef4444", // rojo
  "#8b5cf6", // violeta
  "#ec4899", // rosa
  "#14b8a6", // turquesa
];
