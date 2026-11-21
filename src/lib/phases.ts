import type { Phase, PhaseBlock, PhaseId, TaskPhase } from "./types";

export const PHASES: Phase[] = [
  { id: "intent", name: "Intent", order: 1, turn: "agente", block: 1, description: "Se resume qué se quiere lograr y para quién, sin decidir aún cómo." },
  { id: "idea", name: "Desarrollo de la idea", order: 2, turn: "agente", block: 1, description: "El agente desarrolla la idea: qué haría, cómo se vería y qué cambiaría." },
  { id: "mesa", name: "Mesa de diálogo", order: 3, turn: "agente", block: 1, description: "Tres agentes (usabilidad, ingeniería y viabilidad) cuestionan la idea en paralelo." },
  { id: "sintesis", name: "Síntesis", order: 4, turn: "agente", block: 1, description: "Se juntan las preguntas de la mesa y se ven acuerdos y tensiones." },
  { id: "respuesta", name: "Respuesta del usuario", order: 5, turn: "agente", block: 1, description: "El agente decide cada cuestionamiento y elige si hace otra ronda o consolida." },
  { id: "consolidada", name: "Idea consolidada", order: 6, turn: "agente", block: 1, description: "La idea quedó cerrada y se parte en tareas pequeñas para implementar." },
  { id: "implementacion", name: "Implementación", order: 7, turn: "agente", block: 2, description: "Los agentes escriben las pruebas y el código, capa por capa." },
  { id: "analisis", name: "Análisis con evidencias", order: 8, turn: "agente", block: 3, description: "Se ve el resultado funcionando en la app y se graban capturas y videos." },
  { id: "validacion", name: "Validación", order: 9, turn: "agente", block: 4, description: "Se corrigen los hallazgos del análisis y se vuelve a grabar la evidencia." },
  { id: "evidencia_final", name: "Evidencia final", order: 10, turn: "agente", block: 5, description: "Se graba el video final que resume lo que se trabajó." },
  { id: "aprobacion_final", name: "Aprobación final", order: 11, turn: "humano", block: 5, description: "Una persona revisa el resultado y aprueba o rechaza el cambio." },
];

export const BLOCK_NAMES: Record<PhaseBlock, string> = {
  1: "Idea",
  2: "Implementación",
  3: "Análisis",
  4: "Validación",
  5: "Evidencia final",
};

export function getPhase(id: string): Phase | undefined {
  return PHASES.find((p) => p.id === id);
}

export function isHumanTurn(id: string): boolean {
  return getPhase(id)?.turn === "humano";
}

export function isPhaseId(v: unknown): v is PhaseId {
  return typeof v === "string" && PHASES.some((p) => p.id === v);
}

/**
 * Una regresión sigue vigente mientras la tarea no haya vuelto a llegar a la fase
 * de la que regresó. Pasada esa fase, el motivo ya es historia.
 */
export function isRegressionActive(phase: TaskPhase): boolean {
  const reg = phase.lastRegression;
  if (!reg) return false;
  const current = getPhase(phase.phaseId)?.order;
  const from = getPhase(reg.from)?.order;
  if (current === undefined || from === undefined) return false;
  return current < from;
}
