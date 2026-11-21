import type { Phase, PhaseBlock, PhaseId } from "./types";

export const PHASES: Phase[] = [
  { id: "intent", name: "Intent", order: 1, turn: "agente", block: 1 },
  { id: "idea", name: "Desarrollo de la idea", order: 2, turn: "agente", block: 1 },
  { id: "mesa", name: "Mesa de diálogo", order: 3, turn: "agente", block: 1 },
  { id: "sintesis", name: "Síntesis", order: 4, turn: "agente", block: 1 },
  { id: "respuesta", name: "Respuesta del usuario", order: 5, turn: "agente", block: 1 },
  { id: "consolidada", name: "Idea consolidada", order: 6, turn: "agente", block: 1 },
  { id: "implementacion", name: "Implementación", order: 7, turn: "agente", block: 2 },
  { id: "analisis", name: "Análisis con evidencias", order: 8, turn: "agente", block: 3 },
  { id: "validacion", name: "Validación", order: 9, turn: "agente", block: 4 },
  { id: "evidencia_final", name: "Evidencia final", order: 10, turn: "agente", block: 5 },
  { id: "aprobacion_final", name: "Aprobación final", order: 11, turn: "humano", block: 5 },
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
