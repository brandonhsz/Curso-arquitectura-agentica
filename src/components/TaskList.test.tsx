import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardState } from "@/lib/types";
import { TaskList } from "./TaskList";

vi.mock("@/lib/store", () => ({
  actions: { updateTask: vi.fn(), deleteTask: vi.fn(), setTaskPhase: vi.fn(), clearTaskPhase: vi.fn() },
  useBoard: vi.fn(),
}));

const board: BoardState = {
  statuses: [{ id: "s1", name: "Lunes", color: "#64748b" }],
  tasks: [
    {
      id: "t1",
      title: "Con fase",
      description: "",
      statusId: "s1",
      createdAt: 1,
      phase: { phaseId: "aprobacion_final", owner: "Ana", updatedAt: Date.now() },
    },
    { id: "t2", title: "Sin fase", description: "", statusId: "s1", createdAt: 2 },
  ],
};

function rowOf(title: string) {
  return screen.getByText(title).closest("li") as HTMLElement;
}

describe("TaskList con fases", () => {
  it("la fila de una tarea con fase muestra el badge", () => {
    render(<TaskList board={board} onEdit={() => {}} />);
    const row = rowOf("Con fase");
    expect(row).toHaveTextContent("Te toca: Ana");
  });

  it("la fila de una tarea sin fase no muestra badge", () => {
    render(<TaskList board={board} onEdit={() => {}} />);
    const row = rowOf("Sin fase");
    expect(row).not.toHaveTextContent("Te toca");
    expect(row).not.toHaveTextContent("Agente trabajando");
    expect(row.querySelector("[data-turn]")).toBeNull();
  });
});
