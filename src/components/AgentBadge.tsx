"use client";

import { useEffect, useState } from "react";
import { actions } from "@/lib/store";
import type { AgentStatus, Task } from "@/lib/types";

const STATUS_STYLES: Record<AgentStatus, string> = {
  trabajando:
    "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200",
  terminado:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  fallo:
    "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
  detenido:
    "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

const STATUS_LABELS: Record<Exclude<AgentStatus, "trabajando">, string> = {
  terminado: "Agente terminó",
  fallo: "Agente falló",
  detenido: "Agente detenido",
};

export function AgentBadge({ task }: { task: Task }) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const timer = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(timer);
  }, [copiado]);

  const agent = task.agent;
  if (!agent) return null;

  const { status } = agent;
  const working = status === "trabajando";
  const orca = agent.orca;
  const showResume = !orca && (!working || task.phase?.phaseId === "aprobacion_final");
  const orcaName = agent.worktree.split("/").filter(Boolean).pop() ?? agent.worktree;
  const resume = `cd ${agent.worktree} && claude --resume ${agent.sessionId}`;

  return (
    <div
      role="status"
      data-agent-status={status}
      className={`mt-2 flex flex-col gap-1 rounded-md border px-2 py-1 text-xs ${STATUS_STYLES[status]}`}
    >
      {working ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500 dark:bg-violet-400"
            />
            🤖 Agente trabajando el ticket
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              actions.stopAgent(task.id);
            }}
            className="rounded border border-violet-300 bg-white px-1.5 py-0.5 font-medium text-violet-800 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-500/40 dark:bg-transparent dark:text-violet-200 dark:hover:bg-violet-500/20"
          >
            Detener agente
          </button>
        </div>
      ) : (
        <span className="font-medium">{STATUS_LABELS[status]}</span>
      )}
      {status === "fallo" && agent.error && (
        <span className="break-words opacity-90">{agent.error}</span>
      )}
      {orca && status === "detenido" && (
        <span className="opacity-80">
          El chat se detendrá al cambiar de fase; para cortarlo ya, ábrelo en Orca.
        </span>
      )}
      {orca && (
        <div className="flex items-center justify-between gap-1.5">
          <span className="min-w-0 truncate opacity-70" title={agent.worktree}>
            En Orca: {orcaName}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              actions.openInOrca(task.id);
            }}
            className="shrink-0 rounded border border-current/30 bg-white px-1.5 py-0.5 font-medium hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-transparent dark:hover:bg-white/10"
          >
            Abrir en Orca
          </button>
        </div>
      )}
      {showResume && (
        <div className="flex flex-col gap-0.5">
          <span className="opacity-70">Retomar la sesión:</span>
          <div className="flex items-center gap-1.5">
            <code
              title={resume}
              className="block min-w-0 flex-1 select-all truncate rounded bg-black/5 px-1 py-0.5 font-mono text-[11px] dark:bg-white/10"
            >
              {resume}
            </code>
            <button
              type="button"
              aria-label="Copiar comando"
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard
                  ?.writeText(resume)
                  .then(() => setCopiado(true))
                  .catch(() => {});
              }}
              className="shrink-0 rounded border border-current/30 bg-white px-1.5 py-0.5 font-medium hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-transparent dark:hover:bg-white/10"
            >
              {copiado ? "Copiado" : "Copiar comando"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
