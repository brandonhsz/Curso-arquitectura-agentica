/**
 * Rojo — panel de detalle al pasar el cursor (o enfocar) una tarjeta en "Por fases".
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getPhase } from "@/lib/phases";
import type { BoardState, Task } from "@/lib/types";
import { PhaseBoard } from "./PhaseBoard";

vi.mock("@/lib/store", () => ({
  actions: { updateTask: vi.fn(), deleteTask: vi.fn(), setTaskPhase: vi.fn(), clearTaskPhase: vi.fn() },
  useBoard: vi.fn(),
}));

const NOW = Date.now();

const implementando: Task = {
  id: "t1",
  title: "Exportar a excel",
  description: "Botón para bajar las tareas a un archivo",
  statusId: "doing",
  createdAt: 1,
  phase: {
    phaseId: "implementacion",
    owner: "Equipo",
    updatedAt: NOW - 5 * 60_000,
    lastRegression: { from: "validacion", to: "implementacion", reason: "H1: el nombre se corta", at: NOW - 60_000 },
  },
  agent: {
    status: "fallo",
    error: "npm test falló",
    worktree: "/tmp/wt",
    branch: "b",
    logFile: "/tmp/log",
    startedAt: 1,
  },
};

const aprobando: Task = {
  id: "t2",
  title: "Tarea por aprobar",
  description: "",
  statusId: "todo",
  createdAt: 1,
  phase: {
    phaseId: "aprobacion_final",
    owner: "Ana",
    updatedAt: NOW,
    // Regresión vieja: ya pasó la fase de la que regresó → no se muestra.
    lastRegression: { from: "validacion", to: "implementacion", reason: "Motivo viejo", at: 1 },
  },
};

const sinFase: Task = { id: "t3", title: "Tarea sin fase", description: "algo", statusId: "todo", createdAt: 1 };

const board: BoardState = {
  statuses: [
    { id: "todo", name: "Por hacer", color: "#64748b" },
    { id: "doing", name: "En progreso", color: "#3b82f6" },
  ],
  tasks: [implementando, aprobando, sinFase],
};

function setup() {
  const onEdit = vi.fn();
  const user = userEvent.setup();
  render(<PhaseBoard board={board} onEdit={onEdit} />);
  const card = (title: string) => screen.getByText(title).closest("article") as HTMLElement;
  return { onEdit, user, card };
}

describe("PhaseDetailPanel en 'Por fases'", () => {
  it("sin pasar el cursor no hay panel", () => {
    setup();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("al pasar el cursor aparece el panel con la frase de la fase, el avance, responsable y descripción", async () => {
    const { user, card } = setup();
    await user.hover(card("Exportar a excel"));
    const panel = await screen.findByRole("tooltip");
    const def = getPhase("implementacion")!;
    expect(panel).toHaveTextContent(def.name);
    expect(panel).toHaveTextContent(def.description);
    expect(panel).toHaveTextContent("Fase 7 de 11 · Bloque 2 de 5");
    expect(panel).toHaveTextContent("Equipo");
    expect(panel).toHaveTextContent(/Última actualización: hace 5 min/);
    expect(panel).toHaveTextContent("Botón para bajar las tareas a un archivo");
  });

  it("muestra el estado real del agente (falló + error) y la regresión activa con su motivo", async () => {
    const { user, card } = setup();
    await user.hover(card("Exportar a excel"));
    const panel = await screen.findByRole("tooltip");
    expect(panel).toHaveTextContent(/Agente \(último reporte\): falló/);
    expect(panel).toHaveTextContent("npm test falló");
    expect(panel).toHaveTextContent("H1: el nombre se corta");
    expect(panel).toHaveTextContent(/Regresó de Validación/);
  });

  it("en turno humano dice a quién le toca y no muestra una regresión ya superada", async () => {
    const { user, card } = setup();
    await user.hover(card("Tarea por aprobar"));
    const panel = await screen.findByRole("tooltip");
    expect(panel).toHaveTextContent(/Turno humano/);
    expect(panel).toHaveTextContent("Ana");
    expect(panel).not.toHaveTextContent("Motivo viejo");
    expect(panel).not.toHaveTextContent(/Agente \(último reporte\)/);
  });

  it("la tarjeta referencia al panel con aria-describedby", async () => {
    const { user, card } = setup();
    const c = card("Exportar a excel");
    await user.hover(c);
    const panel = await screen.findByRole("tooltip");
    expect(c.getAttribute("aria-describedby")).toBe(panel.id);
  });

  it("al salir el cursor el panel desaparece", async () => {
    const { user, card } = setup();
    await user.hover(card("Exportar a excel"));
    await screen.findByRole("tooltip");
    await user.unhover(card("Exportar a excel"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("al desplazar, el panel sigue a la tarjeta mientras esté en pantalla (H1: el foco desplaza el tablero)", async () => {
    const { card } = setup();
    const c = card("Exportar a excel");
    c.focus();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    act(() => {
      fireEvent.scroll(window);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("al desplazar, el panel se cierra si la tarjeta sale de la pantalla", async () => {
    const { user, card } = setup();
    const c = card("Exportar a excel");
    await user.hover(c);
    await screen.findByRole("tooltip");
    c.getBoundingClientRect = () => ({ top: -500, bottom: -400, left: 10, right: 200, width: 190, height: 100, x: 10, y: -500, toJSON: () => ({}) }) as DOMRect;
    act(() => {
      fireEvent.scroll(window);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("con teclado: Tab enfoca la tarjeta y muestra el panel, Escape lo oculta y Enter abre el editor", async () => {
    const { user, card, onEdit } = setup();
    const c = card("Exportar a excel");
    expect(c).toHaveAttribute("tabindex", "0");
    c.focus();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledWith(implementando);
  });

  it("la tarjeta sin fase no muestra panel", async () => {
    const { user, card } = setup();
    await user.hover(card("Tarea sin fase"));
    await new Promise((r) => setTimeout(r, 500));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(within(card("Tarea sin fase")).queryByRole("tooltip")).toBeNull();
  });
});
