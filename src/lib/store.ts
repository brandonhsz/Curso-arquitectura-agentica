"use client";

import { useSyncExternalStore } from "react";
import * as server from "@/app/actions";
import { isBoardState, newId, ops, validatePhaseChange } from "./board";
import type { BoardState, PhaseInput, Status, Task } from "./types";

/** Clave usada por la versión anterior, que guardaba todo en el navegador. */
const LEGACY_STORAGE_KEY = "kanban-board-v1";
const POLL_MS = 2000;

let state: BoardState | null = null;
const listeners = new Set<() => void>();
/** Sube con cada cambio local; descarta respuestas que llegan desfasadas. */
let seq = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

async function refresh() {
  const started = seq;
  try {
    const res = await fetch("/api/board", { cache: "no-store" });
    const data: unknown = await res.json();
    if (started === seq && isBoardState(data)) {
      state = data;
      emit();
    }
  } catch {
    // sin conexión: lo reintentamos en el siguiente ciclo
  }
}

async function migrateLegacy() {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;
    const legacy: unknown = JSON.parse(raw);
    if (isBoardState(legacy) && legacy.tasks.length > 0) await server.importBoard(legacy);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // si falla, seguimos con lo que haya en el servidor
  }
}

const onFocus = () => void refresh();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void migrateLegacy().then(refresh);
    pollTimer = setInterval(refresh, POLL_MS);
    window.addEventListener("focus", onFocus);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (pollTimer) clearInterval(pollTimer);
      window.removeEventListener("focus", onFocus);
    }
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => null;

/** Aplica el cambio al instante y lo confirma con el servidor. */
function apply(local: (s: BoardState) => BoardState, remote: () => Promise<BoardState>) {
  if (!state) return;
  state = local(state);
  const mine = ++seq;
  emit();
  remote()
    .then((next) => {
      if (mine === seq) {
        state = next;
        emit();
      }
    })
    .catch(() => {
      seq++;
      void refresh();
    });
}

export const actions = {
  addStatus(name: string, color: string) {
    const status: Status = { id: newId(), name, color };
    apply((s) => ops.addStatus(s, status), () => server.addStatus(status));
  },
  updateStatus(id: string, changes: Partial<Omit<Status, "id">>) {
    apply((s) => ops.updateStatus(s, id, changes), () => server.updateStatus(id, changes));
  },
  deleteStatus(id: string, moveTasksTo: string) {
    apply((s) => ops.deleteStatus(s, id, moveTasksTo), () => server.deleteStatus(id, moveTasksTo));
  },
  moveStatus(id: string, direction: -1 | 1) {
    apply((s) => ops.moveStatus(s, id, direction), () => server.moveStatus(id, direction));
  },
  addTask(data: Pick<Task, "title" | "description" | "statusId">) {
    const task: Task = { ...data, id: newId(), createdAt: Date.now() };
    apply((s) => ops.addTask(s, task), () => server.addTask(task));
  },
  updateTask(id: string, changes: Partial<Omit<Task, "id" | "createdAt">>) {
    apply((s) => ops.updateTask(s, id, changes), () => server.updateTask(id, changes));
  },
  deleteTask(id: string) {
    apply((s) => ops.deleteTask(s, id), () => server.deleteTask(id));
  },
  /** Si la validación local falla no aplica nada (la UI muestra el error con validatePhaseChange). */
  setTaskPhase(taskId: string, input: PhaseInput) {
    if (!state || validatePhaseChange(state, taskId, input)) return;
    const now = Date.now();
    apply((s) => ops.setTaskPhase(s, taskId, input, now), () => server.setTaskPhase(taskId, input));
  },
  clearTaskPhase(taskId: string) {
    apply((s) => ops.clearTaskPhase(s, taskId), () => server.clearTaskPhase(taskId));
  },
  /** Detiene el agente automático de la tarea (optimista: la marca "detenido" al instante). */
  stopAgent(taskId: string) {
    const now = Date.now();
    apply(
      (s) => {
        const agent = s.tasks.find((t) => t.id === taskId)?.agent;
        if (!agent || agent.status !== "trabajando") return s;
        return ops.updateTask(s, taskId, { agent: { ...agent, status: "detenido", endedAt: now } });
      },
      () => server.detenerAgente(taskId),
    );
  },
};

/** Devuelve `null` mientras se carga el tablero desde el servidor. */
export function useBoard(): BoardState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
