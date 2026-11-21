"use server";

import { after } from "next/server";
import { debeLanzarAgente, detenerAgenteDeTarea, lanzarAgente } from "@/lib/agente";
import { isBoardState, ops, validatePhaseChange } from "@/lib/board";
import { mutateBoard, readBoard } from "@/lib/db";
import type { BoardState, PhaseInput, Status, Task } from "@/lib/types";


export async function addStatus(status: Status) {
  return mutateBoard((s) => ops.addStatus(s, status));
}

export async function updateStatus(id: string, changes: Partial<Omit<Status, "id">>) {
  return mutateBoard((s) => ops.updateStatus(s, id, changes));
}

export async function deleteStatus(id: string, moveTasksTo: string) {
  return mutateBoard((s) => ops.deleteStatus(s, id, moveTasksTo));
}

export async function moveStatus(id: string, direction: -1 | 1) {
  return mutateBoard((s) => ops.moveStatus(s, id, direction));
}

export async function addTask(task: Task) {
  const board = await mutateBoard((s) => ops.addTask(s, task));
  if (debeLanzarAgente(task)) {
    const statusName = board.statuses.find((s) => s.id === task.statusId)?.name ?? task.statusId;
    const lanzar = () => lanzarAgente(task, statusName).catch(() => undefined);
    try {
      after(lanzar); // corre después de responder, sin bloquear la creación
    } catch {
      void lanzar(); // fuera de una petición (p. ej. scripts): lo lanzamos igual
    }
  }
  return board;
}

/** Detiene el agente automático de una tarea y la marca como "detenido". */
export async function detenerAgente(taskId: string) {
  return detenerAgenteDeTarea(taskId);
}

export async function updateTask(id: string, changes: Partial<Omit<Task, "id" | "createdAt">>) {
  return mutateBoard((s) => ops.updateTask(s, id, changes));
}

export async function deleteTask(id: string) {
  return mutateBoard((s) => ops.deleteTask(s, id));
}

/**
 * Asigna o cambia la fase de una tarea. Valida contra el tablero actual dentro de la cola de
 * escritura; si no es válido lanza `Error(código)` y no se escribe nada.
 */
export async function setTaskPhase(taskId: string, input: PhaseInput) {
  return mutateBoard((s) => {
    const error = validatePhaseChange(s, taskId, input);
    if (error) throw new Error(error);
    return ops.setTaskPhase(s, taskId, input, Date.now());
  });
}

export async function clearTaskPhase(taskId: string) {
  return mutateBoard((s) => ops.clearTaskPhase(s, taskId));
}

/** Importa un tablero guardado en el navegador (versión anterior) si el servidor está vacío. */
export async function importBoard(board: BoardState) {
  if (!isBoardState(board)) return readBoard();
  return mutateBoard((s) => (s.tasks.length === 0 ? board : s));
}
