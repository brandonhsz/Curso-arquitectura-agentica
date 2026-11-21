"use client";

import { useId, useState } from "react";
import { PHASE_ERROR_MESSAGES, validatePhaseChange } from "@/lib/board";
import { getPhase, PHASES } from "@/lib/phases";
import { actions, useBoard } from "@/lib/store";
import type { BoardState, PhaseChangeError, Status, Task } from "@/lib/types";
import { Modal } from "./Modal";

type Props = {
  statuses: Status[];
  /** Tarea a editar; si no se pasa, se crea una nueva. */
  task?: Task;
  defaultStatusId?: string;
  onClose: () => void;
};

export function TaskForm({ statuses, task, defaultStatusId, onClose }: Props) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [statusId, setStatusId] = useState(
    task?.statusId ?? defaultStatusId ?? statuses[0]?.id ?? "",
  );
  const board = useBoard();
  const currentPhaseId = task?.phase?.phaseId ?? "";
  const currentOwner = task?.phase?.owner ?? "";
  const [phaseId, setPhaseId] = useState<string>(currentPhaseId);
  const [owner, setOwner] = useState(currentOwner);
  const [reason, setReason] = useState("");
  const [phaseError, setPhaseError] = useState<PhaseChangeError | null>(null);
  const phaseFieldId = useId();
  const ownerFieldId = useId();
  const reasonFieldId = useId();

  const currentOrder = getPhase(currentPhaseId)?.order;
  const selectedOrder = getPhase(phaseId)?.order;
  const isRegression =
    currentOrder !== undefined && selectedOrder !== undefined && selectedOrder < currentOrder;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !statusId) return;
    if (task) {
      const clearPhase = !phaseId && !!task.phase;
      const changePhase = !!phaseId && (phaseId !== currentPhaseId || owner.trim() !== currentOwner);
      const input = {
        phaseId,
        owner: owner.trim(),
        reason: isRegression ? reason.trim() : undefined,
      };
      if (changePhase) {
        // Validar antes de guardar nada, para no dejar la tarea a medias.
        const state: BoardState =
          board && board.tasks.some((t) => t.id === task.id) ? board : { statuses, tasks: [task] };
        const error = validatePhaseChange(state, task.id, input);
        if (error) {
          setPhaseError(error);
          return;
        }
      }
      setPhaseError(null);
      actions.updateTask(task.id, { title: trimmed, description: description.trim(), statusId });
      if (changePhase) actions.setTaskPhase(task.id, input);
      else if (clearPhase) actions.clearTaskPhase(task.id);
    } else {
      actions.addTask({ title: trimmed, description: description.trim(), statusId });
    }
    onClose();
  };

  return (
    <Modal title={task ? "Editar tarea" : "Nueva tarea"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Título
          <input
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="¿Qué hay que hacer?"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Descripción
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="input resize-none"
            placeholder="Detalles opcionales"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Estado
          <select
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
            className="input"
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {task && (
          <>
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor={phaseFieldId}>Fase</label>
              <select
                id={phaseFieldId}
                value={phaseId}
                onChange={(e) => {
                  setPhaseId(e.target.value);
                  setPhaseError(null);
                }}
                className="input"
              >
                <option value="">Sin fase</option>
                {PHASES.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor={ownerFieldId}>Responsable</label>
              <input
                id={ownerFieldId}
                value={owner}
                onChange={(e) => {
                  setOwner(e.target.value);
                  setPhaseError(null);
                }}
                className="input"
                placeholder="¿A quién le toca?"
              />
            </div>
            {isRegression && (
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor={reasonFieldId}>Motivo del retroceso</label>
                <input
                  id={reasonFieldId}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setPhaseError(null);
                  }}
                  className="input"
                  placeholder="¿Por qué regresa a una fase anterior?"
                />
              </div>
            )}
            {phaseError && (
              <p role="alert" className="text-sm text-red-600">
                {PHASE_ERROR_MESSAGES[phaseError]}
              </p>
            )}
          </>
        )}
        <div className="mt-2 flex justify-end gap-2">
          {task && (
            <button
              type="button"
              onClick={() => {
                actions.deleteTask(task.id);
                onClose();
              }}
              className="btn mr-auto text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Eliminar
            </button>
          )}
          <button type="button" onClick={onClose} className="btn">
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            {task ? "Guardar" : "Crear tarea"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
