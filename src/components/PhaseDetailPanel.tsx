"use client";

import { createPortal } from "react-dom";
import { BLOCK_NAMES, PHASES, getPhase, isRegressionActive } from "@/lib/phases";
import type { AgentStatus, Task } from "@/lib/types";
import { timeAgo } from "./PhaseBadge";

export const PANEL_WIDTH = 288;
const GAP = 8;

export type PanelPosition = { left: number; top?: number; bottom?: number };

/** Junto a la tarjeta: a la derecha si cabe, si no a la izquierda; hacia arriba si la tarjeta está abajo. */
export function panelPosition(rect: DOMRect, viewport = { width: window.innerWidth, height: window.innerHeight }): PanelPosition {
  let left = rect.right + GAP;
  if (left + PANEL_WIDTH > viewport.width - GAP) left = rect.left - GAP - PANEL_WIDTH;
  left = Math.max(GAP, Math.min(left, viewport.width - GAP - PANEL_WIDTH));
  if (rect.top > viewport.height * 0.6) return { left, bottom: Math.max(GAP, viewport.height - rect.bottom) };
  return { left, top: Math.max(GAP, rect.top) };
}

const AGENT_LABELS: Record<AgentStatus, string> = {
  trabajando: "trabajando",
  terminado: "terminó",
  fallo: "falló",
  detenido: "detenido",
};

const AGENT_TONE: Record<AgentStatus, string> = {
  trabajando: "text-violet-700 dark:text-violet-300",
  terminado: "text-emerald-700 dark:text-emerald-300",
  fallo: "text-rose-700 dark:text-rose-300",
  detenido: "text-zinc-600 dark:text-zinc-400",
};

export function PhaseDetailPanel({
  id,
  task,
  position,
  now,
}: {
  id: string;
  task: Task;
  position: PanelPosition;
  now: number;
}) {
  const phase = task.phase;
  if (!phase) return null;
  const def = getPhase(phase.phaseId);
  const human = def?.turn === "humano";
  const reg = isRegressionActive(phase) ? phase.lastRegression : undefined;
  const fromName = reg ? (getPhase(reg.from)?.name ?? reg.from) : "";
  const agent = task.agent;

  return createPortal(
    <div
      id={id}
      role="tooltip"
      style={{ width: PANEL_WIDTH, ...position }}
      className="pointer-events-none fixed z-50 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{def?.name ?? phase.phaseId}</span>
        {def && (
          <span className="text-zinc-500 dark:text-zinc-400">
            {`Fase ${def.order} de ${PHASES.length} · Bloque ${def.block} de 5 · ${BLOCK_NAMES[def.block]}`}
          </span>
        )}
      </div>
      {def && <p className="leading-snug">{def.description}</p>}

      <dl className="flex flex-col gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
        <div className="flex gap-1">
          <dt className={human ? "font-semibold text-amber-700 dark:text-amber-300" : "font-medium text-sky-700 dark:text-sky-300"}>
            {human ? "Turno humano · le toca a:" : "Turno del agente · responsable:"}
          </dt>{" "}
          <dd className="font-medium text-zinc-900 dark:text-zinc-100">{phase.owner || "—"}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="opacity-70">Última actualización:</dt>{" "}
          <dd>{timeAgo(phase.updatedAt, now)}</dd>
        </div>
        {agent && (
          <div className="flex flex-col">
            <div className="flex gap-1">
              <dt className="opacity-70">Agente (último reporte):</dt>{" "}
              <dd className={`font-medium ${AGENT_TONE[agent.status]}`}>{AGENT_LABELS[agent.status]}</dd>
            </div>
            {agent.status === "fallo" && agent.error && (
              <dd className="break-words text-rose-700 dark:text-rose-300">{agent.error}</dd>
            )}
          </div>
        )}
      </dl>

      {reg && (
        <p className="break-words rounded-md bg-rose-50 px-2 py-1 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
          {`↩ Regresó de ${fromName} ${timeAgo(reg.at, now)}: ${reg.reason || "sin motivo"}`}
        </p>
      )}

      {task.description.trim() && (
        <div className="flex flex-col gap-0.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <span className="opacity-70">Descripción</span>
          <p className="line-clamp-3 break-words text-zinc-900 dark:text-zinc-100">{task.description}</p>
        </div>
      )}
    </div>,
    document.body,
  );
}
