import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { after } from "next/server";
import type { BoardState } from "./types";

/**
 * Webhook de cambios de estado de tareas.
 *
 * Configuración (en .env.local):
 *   KANBAN_WEBHOOK_URL     URL(s) destino; varias separadas por coma.
 *   KANBAN_WEBHOOK_SECRET  (opcional) firma cada envío con HMAC-SHA256 en el
 *                          header `X-Kanban-Signature: sha256=<hex>`.
 */

export type TaskStatusChangedEvent = {
  id: string;
  type: "task.status_changed";
  occurredAt: string;
  task: { id: string; title: string; description: string };
  from: { id: string; name: string };
  to: { id: string; name: string };
};

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5_000;

function webhookUrls(): string[] {
  return (process.env.KANBAN_WEBHOOK_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

/** Compara dos versiones del tablero y devuelve un evento por cada tarea que cambió de estado. */
export function diffStatusChanges(before: BoardState, after: BoardState): TaskStatusChangedEvent[] {
  // Los nombres salen de ambas versiones: si se borró una columna, su nombre sólo existe en `before`.
  const names = new Map([...before.statuses, ...after.statuses].map((s) => [s.id, s.name]));
  const previous = new Map(before.tasks.map((t) => [t.id, t.statusId]));
  const occurredAt = new Date().toISOString();

  return after.tasks.flatMap((task) => {
    const fromId = previous.get(task.id);
    if (fromId === undefined || fromId === task.statusId) return []; // tarea nueva o sin movimiento
    return [
      {
        id: randomUUID(),
        type: "task.status_changed" as const,
        occurredAt,
        task: { id: task.id, title: task.title, description: task.description },
        from: { id: fromId, name: names.get(fromId) ?? fromId },
        to: { id: task.statusId, name: names.get(task.statusId) ?? task.statusId },
      },
    ];
  });
}

async function deliver(url: string, event: TaskStatusChangedEvent) {
  const body = JSON.stringify(event);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "kanban-webhook/1.0",
    "X-Kanban-Event": event.type,
    "X-Kanban-Delivery": event.id,
  };
  const secret = process.env.KANBAN_WEBHOOK_SECRET;
  if (secret) headers["X-Kanban-Signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return;
      // Un 4xx (salvo 429) no se arregla reintentando.
      if (res.status < 500 && res.status !== 429) {
        console.error(`[webhook] ${url} rechazó ${event.id}: HTTP ${res.status}`);
        return;
      }
      console.warn(`[webhook] ${url} intento ${attempt}/${MAX_ATTEMPTS}: HTTP ${res.status}`);
    } catch (err) {
      console.warn(`[webhook] ${url} intento ${attempt}/${MAX_ATTEMPTS}: ${(err as Error).message}`);
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
  }
  console.error(`[webhook] no se pudo entregar ${event.id} a ${url}`);
}

/** Notifica los cambios de estado sin bloquear la respuesta al usuario. */
export function notifyStatusChanges(before: BoardState, next: BoardState) {
  const urls = webhookUrls();
  if (urls.length === 0) return;
  const events = diffStatusChanges(before, next);
  if (events.length === 0) return;

  const send = () => Promise.all(urls.flatMap((url) => events.map((e) => deliver(url, e)))).then(() => {});
  try {
    after(send); // corre tras enviar la respuesta (Server Actions y Route Handlers)
  } catch {
    void send(); // fuera del ciclo de una petición
  }
}
