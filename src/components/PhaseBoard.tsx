"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { groupByPhase } from "@/lib/board";
import { BLOCK_NAMES } from "@/lib/phases";
import type { BoardState, Phase, PhaseBlock, Task } from "@/lib/types";
import { PhaseBadge } from "./PhaseBadge";
import { PhaseDetailPanel, panelPosition, type PanelPosition } from "./PhaseDetailPanel";

type Props = {
  board: BoardState;
  onEdit: (task: Task) => void;
};

type Group = { phase: Phase | null; tasks: Task[] };

const TURN_DOT = {
  humano: "bg-amber-500",
  agente: "bg-sky-500",
  ninguno: "bg-emerald-500",
} as const;

const HOVER_DELAY = 300;

function PhaseCard({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const ref = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ position: PanelPosition; now: number } | null>(null);
  const panelId = useId();
  const hasDetail = Boolean(task.phase);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const close = useCallback(() => {
    cancel();
    setPos(null);
  }, []);
  const show = () => {
    cancel();
    if (hasDetail && ref.current) setPos({ position: panelPosition(ref.current.getBoundingClientRect()), now: Date.now() });
  };

  // Al desplazar (también el que provoca el foco con teclado) el panel sigue a la tarjeta;
  // solo se cierra si la tarjeta sale de la pantalla.
  const open = pos !== null;
  useEffect(() => {
    if (!open) return;
    const follow = () => {
      const rect = ref.current?.getBoundingClientRect();
      const offscreen =
        !rect ||
        rect.bottom < 0 ||
        rect.right < 0 ||
        rect.top > window.innerHeight ||
        rect.left > window.innerWidth;
      if (offscreen) close();
      else setPos((p) => (p ? { ...p, position: panelPosition(rect) } : p));
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open, close]);
  useEffect(() => cancel, []);

  return (
    <article
      ref={ref}
      tabIndex={0}
      role="button"
      aria-describedby={pos ? panelId : undefined}
      onClick={() => {
        close();
        onEdit(task);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          close();
          onEdit(task);
        }
      }}
      onMouseEnter={() => {
        if (!hasDetail) return;
        cancel();
        timer.current = setTimeout(show, HOVER_DELAY);
      }}
      onMouseLeave={close}
      onFocus={show}
      onBlur={close}
      className="cursor-pointer rounded-lg bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-zinc-800"
    >
      <p className="break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">{task.title}</p>
      {task.phase && <PhaseBadge phase={task.phase} showPhaseName={false} />}
      {pos && <PhaseDetailPanel id={panelId} task={task} position={pos.position} now={pos.now} />}
    </article>
  );
}

function Column({ group, onEdit }: { group: Group; onEdit: (task: Task) => void }) {
  const { phase, tasks } = group;
  const name = phase?.name ?? "Sin fase";
  const turn = phase?.turn;
  const human = turn === "humano";

  return (
    <section
      aria-label={name}
      className={`flex w-56 shrink-0 flex-col rounded-xl p-2.5 ${
        human
          ? "bg-amber-50/70 ring-1 ring-amber-200 dark:bg-amber-500/5 dark:ring-amber-500/25"
          : "bg-zinc-100 dark:bg-zinc-900"
      }`}
    >
      <header className="mb-2.5 flex flex-col gap-0.5">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${turn ? TURN_DOT[turn] : "bg-zinc-400 dark:bg-zinc-600"}`}
          />
          <h2 className="min-w-0 text-sm leading-snug font-semibold text-zinc-900 dark:text-zinc-100" title={name}>
            {phase ? `${phase.order}. ` : ""}
            {name}
          </h2>
          <span className="ml-auto shrink-0 rounded-full bg-white px-1.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {tasks.length}
          </span>
        </div>
        {turn === "humano" && (
          <span className="pl-4.5 text-xs font-medium text-amber-700 dark:text-amber-300">turno humano</span>
        )}
        {turn === "agente" && (
          <span className="pl-4.5 text-xs text-sky-700 dark:text-sky-300">turno del agente</span>
        )}
      </header>

      <div className="flex min-h-16 flex-col gap-2">
        {tasks.map((task) => (
          <PhaseCard key={task.id} task={task} onEdit={onEdit} />
        ))}
        {tasks.length === 0 && (
          <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Sin tareas</p>
        )}
      </div>
    </section>
  );
}

export function PhaseBoard({ board, onEdit }: Props) {
  const groups = groupByPhase(board);
  const unphased = groups.filter((g) => g.phase === null);
  const blocks: { block: PhaseBlock; groups: Group[] }[] = [];
  for (const g of groups) {
    if (!g.phase) continue;
    const last = blocks[blocks.length - 1];
    if (last && last.block === g.phase.block) last.groups.push(g);
    else blocks.push({ block: g.phase.block, groups: [g] });
  }

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-4">
      {unphased.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2">
          <p aria-hidden className="h-5 px-1 text-xs font-semibold uppercase tracking-wide text-transparent">
            &nbsp;
          </p>
          {unphased.map((g) => (
            <Column key="sin-fase" group={g} onEdit={onEdit} />
          ))}
        </div>
      )}
      {blocks.map(({ block, groups: cols }) => (
        <div key={block} className="flex shrink-0 flex-col gap-2">
          <p className="h-5 border-b border-zinc-200 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {`Bloque ${block} · ${BLOCK_NAMES[block]}`}
          </p>
          <div className="flex gap-3">
            {cols.map((g) => (
              <Column key={g.phase!.id} group={g} onEdit={onEdit} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
