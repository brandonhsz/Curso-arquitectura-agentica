"use client";

import { useEffect, useState } from "react";
import { getPhase } from "@/lib/phases";
import type { TaskPhase } from "@/lib/types";

function timeAgo(from: number, now: number): string {
  const min = Math.floor(Math.max(0, now - from) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const TURN_STYLES = {
  humano:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  agente:
    "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  ninguno:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
} as const;

function useNow(fixed?: number): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [fixed]);
  return fixed ?? tick;
}

export function PhaseBadge({
  phase,
  now,
  showPhaseName = true,
}: {
  phase: TaskPhase;
  now?: number;
  showPhaseName?: boolean;
}) {
  const current = useNow(now);
  const def = getPhase(phase.phaseId);
  const turn = def?.turn ?? "ninguno";
  const name = def?.name ?? phase.phaseId;
  const reg = phase.lastRegression;
  const fromName = reg ? (getPhase(reg.from)?.name ?? reg.from) : "";

  return (
    <div
      data-turn={turn}
      className={`mt-2 flex flex-col gap-0.5 rounded-md border px-2 py-1 text-xs ${TURN_STYLES[turn]}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        {showPhaseName && (
          <span className="font-medium leading-snug" title={name}>
            {def ? `${def.order}. ` : ""}
            {name}
          </span>
        )}
        <span className="whitespace-nowrap opacity-70">{timeAgo(phase.updatedAt, current)}</span>
      </div>
      {turn === "humano" && (
        <span className="font-semibold">{`Te toca: ${phase.owner}`}</span>
      )}
      {turn === "agente" && <span className="italic">{"Agente trabajando"}</span>}
      {reg && (
        <span className="text-rose-700 dark:text-rose-300" title={reg.reason}>
          {`↩ Regresó de ${fromName}: ${reg.reason}`}
        </span>
      )}
    </div>
  );
}
