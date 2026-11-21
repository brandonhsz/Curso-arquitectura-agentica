import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardState } from "@/lib/types";
import { Board } from "./Board";

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

function cardOf(title: string) {
  return screen.getByText(title).closest("article") as HTMLElement;
}

describe("Board con fases", () => {
  it("la tarjeta de una tarea con fase muestra el badge", () => {
    render(<Board board={board} onEdit={() => {}} onCreate={() => {}} />);
    const card = cardOf("Con fase");
    expect(card).toHaveTextContent("Aprobación final");
    expect(card).toHaveTextContent("Te toca: Ana");
  });

  it("la tarjeta de una tarea sin fase no muestra badge", () => {
    render(<Board board={board} onEdit={() => {}} onCreate={() => {}} />);
    const card = cardOf("Sin fase");
    expect(card).not.toHaveTextContent("Te toca");
    expect(card).not.toHaveTextContent("Agente trabajando");
    expect(card.querySelector("[data-turn]")).toBeNull();
  });
});
