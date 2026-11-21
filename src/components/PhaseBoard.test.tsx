import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BoardState, PhaseId, Task } from "@/lib/types";
import { BLOCK_NAMES, PHASES } from "@/lib/phases";
import { PhaseBoard } from "./PhaseBoard";

vi.mock("@/lib/store", () => ({
  actions: { updateTask: vi.fn(), deleteTask: vi.fn(), setTaskPhase: vi.fn(), clearTaskPhase: vi.fn() },
  useBoard: vi.fn(),
}));

const NOW = Date.now();

function task(id: string, title: string, phaseId?: PhaseId, updatedAt = NOW): Task {
  return {
    id,
    title,
    description: "",
    statusId: "s1",
    createdAt: 1,
    phase: phaseId ? { phaseId, owner: "Ana", updatedAt } : undefined,
  };
}

const tasks: Task[] = [
  task("t1", "Tarea en intent A", "intent"),
  task("t2", "Tarea en intent B", "intent", NOW - 1000),
  task("t3", "Tarea implementando", "implementacion"),
  task("t4", "Tarea sin fase"),
  task("t5", "Tarea final", "evidencia_final"),
  task("t6", "Tarea por aprobar", "aprobacion_final"),
];

const board: BoardState = { statuses: [{ id: "s1", name: "Lunes", color: "#64748b" }], tasks };

const COLUMN_NAMES = ["Sin fase", ...PHASES.map((p) => p.name)];

function setup(b: BoardState = board) {
  const onEdit = vi.fn();
  const user = userEvent.setup();
  const utils = render(<PhaseBoard board={b} onEdit={onEdit} />);
  return { onEdit, user, ...utils };
}

const column = (name: string) => screen.getByRole("region", { name });

describe("PhaseBoard", () => {
  it("renderiza 12 columnas (region) en orden: 'Sin fase' + las 11 fases", () => {
    setup();
    const labels = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(labels).toEqual(COLUMN_NAMES);
    expect(labels).toHaveLength(12);
  });

  it("cada columna tiene un encabezado h2 con su nombre", () => {
    setup();
    for (const name of COLUMN_NAMES) {
      expect(within(column(name)).getByRole("heading", { level: 2 })).toHaveTextContent(name);
    }
  });

  it("cada columna muestra su cantidad de tarjetas como un elemento con el número", () => {
    setup();
    const expected: Record<string, number> = Object.fromEntries(COLUMN_NAMES.map((n) => [n, 0]));
    expected["Sin fase"] = 1;
    expected["Intent"] = 2;
    expected["Implementación"] = 1;
    expected["Evidencia final"] = 1;
    expected["Aprobación final"] = 1;
    for (const name of COLUMN_NAMES) {
      const col = column(name);
      expect(within(col).getByText(String(expected[name]), { exact: true })).toBeInTheDocument();
      expect(col.querySelectorAll("article")).toHaveLength(expected[name]);
    }
  });

  it("muestra cada encabezado de bloque 'Bloque N · <nombre>' exactamente una vez", () => {
    setup();
    for (const n of [1, 2, 3, 4, 5] as const) {
      expect(screen.getAllByText(`Bloque ${n} · ${BLOCK_NAMES[n]}`, { exact: true })).toHaveLength(1);
    }
    expect(screen.getByText("Bloque 1 · Idea")).toBeInTheDocument();
    expect(screen.getByText("Bloque 5 · Evidencia final")).toBeInTheDocument();
  });

  it("cada tarjeta aparece en la columna de su fase", () => {
    setup();
    expect(within(column("Intent")).getByText("Tarea en intent A")).toBeInTheDocument();
    expect(within(column("Intent")).getByText("Tarea en intent B")).toBeInTheDocument();
    expect(within(column("Implementación")).getByText("Tarea implementando")).toBeInTheDocument();
    expect(within(column("Evidencia final")).getByText("Tarea final")).toBeInTheDocument();
    expect(within(column("Mesa de diálogo")).queryByText("Tarea implementando")).toBeNull();
  });

  it("la tarea sin fase aparece en 'Sin fase' sin badge", () => {
    setup();
    const col = column("Sin fase");
    const card = within(col).getByText("Tarea sin fase").closest("article") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.querySelector("[data-turn]")).toBeNull();
  });

  it("indica 'turno humano' solo en 'Aprobación final' y 'turno del agente' en el resto; nada en 'Sin fase'", () => {
    setup();
    expect(within(column("Aprobación final")).getByText("turno humano")).toBeInTheDocument();
    expect(within(column("Intent")).queryByText("turno humano")).toBeNull();
    expect(within(column("Intent")).getByText("turno del agente")).toBeInTheDocument();
    expect(within(column("Implementación")).getByText("turno del agente")).toBeInTheDocument();
    for (const ph of PHASES) {
      const col = column(ph.name);
      if (ph.turn === "humano") {
        expect(within(col).getByText("turno humano")).toBeInTheDocument();
        expect(within(col).queryByText("turno del agente")).toBeNull();
      } else if (ph.turn === "agente") {
        expect(within(col).getByText("turno del agente")).toBeInTheDocument();
        expect(within(col).queryByText("turno humano")).toBeNull();
      } else {
        expect(within(col).queryByText(/turno/)).toBeNull();
      }
    }
    expect(within(column("Sin fase")).queryByText(/turno/)).toBeNull();
    expect(within(column("Evidencia final")).getByText("turno del agente")).toBeInTheDocument();
  });

  it("la tarjeta con fase muestra el PhaseBadge (p. ej. 'Te toca: Ana')", () => {
    setup();
    const card = within(column("Aprobación final")).getByText("Tarea por aprobar").closest("article") as HTMLElement;
    expect(card).toHaveTextContent("Te toca: Ana");
    expect(card.querySelector("[data-turn='humano']")).not.toBeNull();
    const agentCard = within(column("Implementación")).getByText("Tarea implementando").closest("article") as HTMLElement;
    expect(agentCard).toHaveTextContent("Agente trabajando");
  });

  it("clic en la tarjeta llama onEdit con la tarea", async () => {
    const { user, onEdit } = setup();
    await user.click(within(column("Implementación")).getByText("Tarea implementando"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(tasks[2]);
  });

  it("las tarjetas no son arrastrables", () => {
    const { container } = setup();
    const cards = container.querySelectorAll("article");
    expect(cards).toHaveLength(tasks.length);
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0);
    cards.forEach((c) => expect(c).not.toHaveAttribute("draggable", "true"));
  });

  it("una columna vacía muestra 'Sin tareas' y una con tarjetas no", () => {
    setup();
    expect(within(column("Mesa de diálogo")).getByText("Sin tareas")).toBeInTheDocument();
    expect(within(column("Validación")).getByText("Sin tareas")).toBeInTheDocument();
    expect(within(column("Intent")).queryByText("Sin tareas")).toBeNull();
  });

  it("con tablero vacío las 12 columnas muestran 'Sin tareas'", () => {
    setup({ statuses: board.statuses, tasks: [] });
    expect(screen.getAllByText("Sin tareas")).toHaveLength(12);
  });

  it("en la columna 'Implementación' el nombre de la fase aparece solo en el encabezado, no en el badge", () => {
    setup();
    const col = column("Implementación");
    const matches = within(col).getAllByText(/Implementación/);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe(within(col).getByRole("heading", { level: 2 }));
    const card = within(col).getByText("Tarea implementando").closest("article") as HTMLElement;
    expect(card).not.toHaveTextContent("Implementación");
    expect(card).toHaveTextContent("Agente trabajando");
  });

  it("en la columna 'Intent' la tarjeta no repite el nombre de la fase y muestra 'Agente trabajando'", () => {
    setup();
    const card = within(column("Intent")).getByText("Tarea en intent A").closest("article") as HTMLElement;
    expect(card.querySelector("[data-turn]")).not.toHaveTextContent(/Intent/);
    expect(card).toHaveTextContent("Agente trabajando");
    expect(card).not.toHaveTextContent("Te toca");
  });
});
