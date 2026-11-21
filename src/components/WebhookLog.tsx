"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReceivedWebhook } from "@/app/api/webhook/route";

const POLL_MS = 1500;

type Payload = {
  task?: { title?: string };
  from?: { name?: string };
  to?: { name?: string };
};

export function WebhookLog() {
  const [entries, setEntries] = useState<ReceivedWebhook[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/webhook", { cache: "no-store" });
        if (res.ok && alive) setEntries(await res.json());
      } catch {
        // el servidor se está reiniciando; se reintenta en el siguiente ciclo
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const clear = async () => {
    await fetch("/api/webhook", { method: "DELETE" });
    setEntries([]);
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Webhooks recibidos</h1>
          <p className="text-sm text-zinc-500">
            Mueve una tarea en el <Link href="/" className="text-blue-600 hover:underline">tablero</Link> y el aviso aparece aquí.
          </p>
        </div>
        <button onClick={clear} className="btn" disabled={!entries?.length}>
          Limpiar
        </button>
      </header>

      {entries === null ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Todavía no llega ningún aviso.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e, i) => {
            const p = e.payload as Payload;
            return (
              <li key={`${e.receivedAt}-${i}`} className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    «{p.task?.title}»: {p.from?.name} → {p.to?.name}
                  </p>
                  <time className="text-xs text-zinc-500">{new Date(e.receivedAt).toLocaleTimeString()}</time>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {e.event} · firma {e.signature}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-zinc-500">Ver payload</summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
