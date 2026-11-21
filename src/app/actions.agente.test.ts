/**
 * T2 (rojo) — integración del agente automático en las server actions (src/app/actions.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardState, Task } from "@/lib/types";

const mem = vi.hoisted(() => ({ board: null as unknown as BoardState }));
const agente = vi.hoisted(() => ({
  debeLanzarAgente: vi.fn(() => true),
  lanzarAgente: vi.fn(async () => ({}) as unknown),
  detenerAgenteDeTarea: vi.fn(async () => ({ statuses: [], tasks: [] }) as unknown),
}));

vi.mock("@/lib/db", () => ({
  readBoard: vi.fn(async () => mem.board),
  mutateBoard: vi.fn(async (fn: (b: BoardState) => BoardState) => {
    mem.board = fn(mem.board);
    return mem.board;
  }),
}));

vi.mock("@/lib/agente", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  debeLanzarAgente: agente.debeLanzarAgente,
  lanzarAgente: agente.lanzarAgente,
  detenerAgenteDeTarea: agente.detenerAgenteDeTarea,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (fn: () => unknown) => {
    void Promise.resolve().then(fn);
  },
}));

function makeBoard(): BoardState {
  return {
    statuses: [
      { id: "todo", name: "Por hacer", color: "#64748b" },
      { id: "doing", name: "En progreso", color: "#3b82f6" },
    ],
    tasks: [],
  };
}

const task: Task = { id: "t-1", title: "Ticket", description: "", statusId: "todo", createdAt: 1 };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("addTask con agente automático", () => {
  beforeEach(() => {
    mem.board = makeBoard();
    agente.debeLanzarAgente.mockReset().mockReturnValue(true);
    agente.lanzarAgente.mockReset().mockResolvedValue({});
    agente.detenerAgenteDeTarea.mockReset();
  });

  it("lanza el agente con el nombre de la columna cuando corresponde", async () => {
    const { addTask } = await import("./actions");
    const result = await addTask(task);
    await flush();
    expect(result.tasks.some((t) => t.id === "t-1")).toBe(true);
    expect(agente.lanzarAgente).toHaveBeenCalledTimes(1);
    expect(agente.lanzarAgente).toHaveBeenCalledWith(expect.objectContaining({ id: "t-1" }), "Por hacer");
  });

  it("no lanza el agente cuando debeLanzarAgente es false", async () => {
    agente.debeLanzarAgente.mockReturnValue(false);
    const { addTask } = await import("./actions");
    await addTask(task);
    await flush();
    expect(agente.lanzarAgente).not.toHaveBeenCalled();
  });

  it("si lanzarAgente falla, addTask igual resuelve con el tablero", async () => {
    agente.lanzarAgente.mockRejectedValue(new Error("boom"));
    const { addTask } = await import("./actions");
    const result = await addTask(task);
    await flush();
    expect(result.tasks.some((t) => t.id === "t-1")).toBe(true);
    expect(agente.lanzarAgente).toHaveBeenCalled();
  });
});

describe("server action detenerAgente", () => {
  it("delegará en detenerAgenteDeTarea y devuelve su resultado", async () => {
    const tablero = { statuses: [], tasks: [] } as BoardState;
    agente.detenerAgenteDeTarea.mockReset().mockResolvedValue(tablero);
    const actions = (await import("./actions")) as unknown as Record<string, unknown>;
    const detenerAgente = actions.detenerAgente as ((id: string) => Promise<BoardState>) | undefined;
    expect(typeof detenerAgente).toBe("function");
    const result = await detenerAgente!("t-1");
    expect(agente.detenerAgenteDeTarea).toHaveBeenCalledWith("t-1");
    expect(result).toBe(tablero);
  });
});
