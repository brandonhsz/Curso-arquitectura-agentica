import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardState, Task, TaskPhase } from "@/lib/types";
import { useBoard } from "@/lib/store";
import { KanbanApp } from "./KanbanApp";

vi.mock("@/lib/store", () => ({
  actions: { updateTask: vi.fn(), deleteTask: vi.fn(), setTaskPhase: vi.fn(), clearTaskPhase: vi.fn() },
  useBoard: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function task(id: string, phase?: TaskPhase): Task {
  return { id, title: `Tarea ${id}`, description: "", statusId: "s1", createdAt: 1, phase };
}

const p = (phaseId: TaskPhase["phaseId"]): TaskPhase => ({ phaseId, owner: "Ana", updatedAt: Date.now() });

function boardWith(tasks: Task[]): BoardState {
  return { statuses: [{ id: "s1", name: "Lunes", color: "#64748b" }], tasks };
}

describe("KanbanApp: contador de tareas esperando a un humano", () => {
  beforeEach(() => vi.mocked(useBoard).mockReset());

  it("muestra '2 esperando a un humano' con dos tareas en aprobacion_final y otras en turno agente", () => {
    vi.mocked(useBoard).mockReturnValue(
      boardWith([task("a", p("aprobacion_final")), task("b", p("aprobacion_final")), task("c", p("mesa")), task("i", p("intent")), task("d")]),
    );
    render(<KanbanApp />);
    expect(screen.getByText(/2 esperando a un humano/)).toBeInTheDocument();
  });

  it("no muestra el contador si ninguna tarea espera a un humano", () => {
    vi.mocked(useBoard).mockReturnValue(boardWith([task("c", p("mesa")), task("e", p("evidencia_final")), task("f", p("implementacion")), task("d")]));
    render(<KanbanApp />);
    expect(screen.queryByText(/esperando a un humano/)).toBeNull();
  });

  it("no cuenta intent, idea, respuesta ni consolidada como esperando a un humano", () => {
    vi.mocked(useBoard).mockReturnValue(
      boardWith([task("a", p("intent")), task("b", p("idea")), task("r", p("respuesta")), task("e", p("consolidada"))]),
    );
    render(<KanbanApp />);
    expect(screen.queryByText(/esperando a un humano/)).toBeNull();
  });

  it("cuenta 'Aprobación final' como tarea esperando a un humano", () => {
    vi.mocked(useBoard).mockReturnValue(boardWith([task("e", p("aprobacion_final")), task("c", p("mesa"))]));
    render(<KanbanApp />);
    expect(screen.getByText(/1 esperando a un humano/)).toBeInTheDocument();
  });
});

describe("KanbanApp: pestaña 'Por fases'", () => {
  beforeEach(() => {
    vi.mocked(useBoard).mockReset();
    vi.mocked(useBoard).mockReturnValue(boardWith([task("a", p("intent")), task("c", p("implementacion")), task("d")]));
  });

  it("existen las pestañas 'Tablero', 'Lista' y 'Por fases', en ese orden", () => {
    render(<KanbanApp />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(tabs).toEqual(["Tablero", "Lista", "Por fases"]);
  });

  it("antes de elegirla no se muestra la vista por fases", () => {
    render(<KanbanApp />);
    expect(screen.queryByRole("region", { name: "Sin fase" })).toBeNull();
  });

  it("al hacer clic en 'Por fases' se marca seleccionada y se muestra la vista por fases", async () => {
    const user = userEvent.setup();
    render(<KanbanApp />);
    const tab = screen.getByRole("tab", { name: "Por fases" });
    await user.click(tab);
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Sin fase" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Intent" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Implementación" })).getByText("Tarea c")).toBeInTheDocument();
  });

  it("clic en una tarjeta de la vista por fases abre el diálogo 'Editar tarea'", async () => {
    const user = userEvent.setup();
    render(<KanbanApp />);
    await user.click(screen.getByRole("tab", { name: "Por fases" }));
    await user.click(within(screen.getByRole("region", { name: "Intent" })).getByText("Tarea a"));
    const dialog = screen.getByRole("dialog", { name: "Editar tarea" });
    expect(within(dialog).getByLabelText("Título")).toHaveValue("Tarea a");
  });
});
