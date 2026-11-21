"use client";

import Link from "next/link";
import { useState } from "react";
import { tasksAwaitingHuman } from "@/lib/board";
import { useBoard } from "@/lib/store";
import type { Task } from "@/lib/types";
import { Board } from "./Board";
import { ExportButton } from "./ExportButton";
import { PhaseBoard } from "./PhaseBoard";
import { StatusManager } from "./StatusManager";
import { TaskForm } from "./TaskForm";
import { TaskList } from "./TaskList";

type View = "board" | "list" | "phases";

const VIEW_LABELS: Record<View, string> = { board: "Tablero", list: "Lista", phases: "Por fases" };
type Dialog =
  | { kind: "none" }
  | { kind: "create"; statusId?: string }
  | { kind: "edit"; task: Task }
  | { kind: "statuses" };

export function KanbanApp() {
  const board = useBoard();
  const [view, setView] = useState<View>("board");
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const close = () => setDialog({ kind: "none" });
  const edit = (task: Task) => setDialog({ kind: "edit", task });

  if (!board) {
    return <main className="flex flex-1 items-center justify-center text-sm text-zinc-500">Cargando tablero…</main>;
  }

  const awaitingHuman = tasksAwaitingHuman(board).length;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Tablero Kanban</h1>
        {awaitingHuman > 0 && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
            {`${awaitingHuman} esperando a un humano`}
          </span>
        )}

        <div className="ml-auto flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist">
          {(["board", "list", "phases"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-sm ${
                view === v ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        <ExportButton board={board} />
        <Link href="/webhooks" className="btn">
          Webhooks
        </Link>
        <button onClick={() => setDialog({ kind: "statuses" })} className="btn">
          Estados
        </button>
        <button onClick={() => setDialog({ kind: "create" })} className="btn btn-primary">
          + Nueva tarea
        </button>
      </header>

      {view === "board" && (
        <Board board={board} onEdit={edit} onCreate={(statusId) => setDialog({ kind: "create", statusId })} />
      )}
      {view === "list" && <TaskList board={board} onEdit={edit} />}
      {view === "phases" && <PhaseBoard board={board} onEdit={edit} />}

      {dialog.kind === "create" && (
        <TaskForm statuses={board.statuses} defaultStatusId={dialog.statusId} onClose={close} />
      )}
      {dialog.kind === "edit" && (
        <TaskForm statuses={board.statuses} task={dialog.task} onClose={close} />
      )}
      {dialog.kind === "statuses" && <StatusManager board={board} onClose={close} />}
    </main>
  );
}
