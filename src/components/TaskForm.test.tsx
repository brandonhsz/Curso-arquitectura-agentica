import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardState, Status, Task } from "@/lib/types";
import { actions, useBoard } from "@/lib/store";
import { PHASE_ERROR_MESSAGES } from "@/lib/board";
import { PHASES } from "@/lib/phases";
import { TaskForm } from "./TaskForm";

vi.mock("@/lib/store", () => ({
  actions: {
    addTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    setTaskPhase: vi.fn(),
    clearTaskPhase: vi.fn(),
  },
  useBoard: vi.fn(),
}));

const statuses: Status[] = [{ id: "s1", name: "Lunes", color: "#64748b" }];

const taskWithPhase: Task = {
  id: "t1",
  title: "Con fase",
  description: "",
  statusId: "s1",
  createdAt: 1,
  phase: { phaseId: "sintesis", owner: "Ana", updatedAt: Date.now() },
};

const taskWithoutPhase: Task = { id: "t2", title: "Sin fase", description: "", statusId: "s1", createdAt: 2 };

const board: BoardState = { statuses, tasks: [taskWithPhase, taskWithoutPhase] };

function setup(task?: Task) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<TaskForm statuses={statuses} task={task} onClose={onClose} />);
  return { user, onClose };
}

describe("TaskForm: corrección manual de fase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBoard).mockReturnValue(board);
  });

  it("al editar una tarea muestra 'Fase' (Sin fase + 11 fases en orden) y 'Responsable'", () => {
    setup(taskWithPhase);
    const select = screen.getByLabelText("Fase") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(options).toEqual(["Sin fase", ...PHASES.map((ph) => ph.name)]);
    expect(options).toEqual([
      "Sin fase",
      "Intent",
      "Desarrollo de la idea",
      "Mesa de diálogo",
      "Síntesis",
      "Respuesta del usuario",
      "Idea consolidada",
      "Implementación",
      "Análisis con evidencias",
      "Validación",
      "Evidencia final",
      "Aprobación final",
    ]);
    expect(screen.getByLabelText("Responsable")).toBeInTheDocument();
  });

  it("al editar, los campos parten de la fase y responsable actuales", () => {
    setup(taskWithPhase);
    const select = screen.getByLabelText("Fase") as HTMLSelectElement;
    expect(select.selectedOptions[0].textContent).toBe("Síntesis");
    expect(screen.getByLabelText("Responsable")).toHaveValue("Ana");
  });

  it("al crear una tarea nueva no muestra 'Fase' ni 'Responsable'", () => {
    setup();
    expect(screen.queryByLabelText("Fase")).toBeNull();
    expect(screen.queryByLabelText("Responsable")).toBeNull();
  });

  it("elegir una fase anterior a la actual muestra 'Motivo del retroceso'", async () => {
    const { user } = setup(taskWithPhase);
    expect(screen.queryByLabelText("Motivo del retroceso")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Fase"), "Desarrollo de la idea");
    expect(screen.getByLabelText("Motivo del retroceso")).toBeInTheDocument();
  });

  it("elegir una fase posterior no muestra 'Motivo del retroceso'", async () => {
    const { user } = setup(taskWithPhase);
    await user.selectOptions(screen.getByLabelText("Fase"), "Respuesta del usuario");
    expect(screen.queryByLabelText("Motivo del retroceso")).toBeNull();
  });

  it("guardar con nueva fase y responsable llama setTaskPhase y cierra", async () => {
    const { user, onClose } = setup(taskWithoutPhase);
    await user.selectOptions(screen.getByLabelText("Fase"), "Intent");
    await user.type(screen.getByLabelText("Responsable"), "Luis");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(actions.setTaskPhase).toHaveBeenCalledWith(
      "t2",
      expect.objectContaining({ phaseId: "intent", owner: "Luis" }),
    );
    expect(actions.updateTask).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("retroceder con motivo llama setTaskPhase con reason", async () => {
    const { user } = setup(taskWithPhase);
    await user.selectOptions(screen.getByLabelText("Fase"), "Desarrollo de la idea");
    await user.type(screen.getByLabelText("Motivo del retroceso"), "faltan datos");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(actions.setTaskPhase).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ phaseId: "idea", reason: "faltan datos" }),
    );
  });

  it("retroceder sin motivo muestra el error en role='alert', no llama setTaskPhase y no cierra", async () => {
    const { user, onClose } = setup(taskWithPhase);
    await user.selectOptions(screen.getByLabelText("Fase"), "Desarrollo de la idea");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert")).toHaveTextContent(PHASE_ERROR_MESSAGES.MOTIVO_REQUERIDO);
    expect(actions.setTaskPhase).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("elegir 'Sin fase' en una tarea con fase llama clearTaskPhase", async () => {
    const { user } = setup(taskWithPhase);
    await user.selectOptions(screen.getByLabelText("Fase"), "Sin fase");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(actions.clearTaskPhase).toHaveBeenCalledWith("t1");
    expect(actions.setTaskPhase).not.toHaveBeenCalled();
  });

  it("guardar sin tocar la fase no llama setTaskPhase ni clearTaskPhase (conserva comportamiento actual)", async () => {
    const { user, onClose } = setup(taskWithPhase);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(actions.updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ title: "Con fase" }));
    expect(actions.setTaskPhase).not.toHaveBeenCalled();
    expect(actions.clearTaskPhase).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("crear una tarea nueva sigue llamando addTask", async () => {
    const { user, onClose } = setup();
    await user.type(screen.getByLabelText("Título"), "Nueva");
    await user.click(screen.getByRole("button", { name: "Crear tarea" }));
    expect(actions.addTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Nueva", statusId: "s1" }));
    expect(onClose).toHaveBeenCalled();
  });
});
