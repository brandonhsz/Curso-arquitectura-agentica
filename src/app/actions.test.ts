/**
 * T3 (rojo) — server actions setTaskPhase / clearTaskPhase (src/app/actions.ts)
 * y sus equivalentes optimistas en el store del cliente (src/lib/store.ts).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardState } from "@/lib/types";

const mem = vi.hoisted(() => ({ board: null as unknown as BoardState }));

vi.mock("@/lib/db", () => ({
  readBoard: vi.fn(async () => mem.board),
  mutateBoard: vi.fn(async (fn: (b: BoardState) => BoardState) => {
    mem.board = fn(mem.board);
    return mem.board;
  }),
}));

function makeBoard(): BoardState {
  return {
    statuses: [
      { id: "todo", name: "Por hacer", color: "#64748b" },
      { id: "doing", name: "En progreso", color: "#3b82f6" },
    ],
    tasks: [
      { id: "nueva", title: "Nueva", description: "", statusId: "todo", createdAt: 1 },
      {
        id: "enmesa",
        title: "En mesa",
        description: "",
        statusId: "doing",
        createdAt: 2,
        phase: { phaseId: "mesa", owner: "Ana", updatedAt: 100 },
      },
    ],
  };
}

const find = (b: BoardState, id: string) => b.tasks.find((t) => t.id === id)!;

describe("server action setTaskPhase", () => {
  beforeEach(() => {
    mem.board = makeBoard();
  });

  it("persiste el cambio de fase y devuelve el tablero nuevo", async () => {
    const { setTaskPhase } = await import("./actions");
    const result = await setTaskPhase("nueva", { phaseId: "intent", owner: "Luis" });
    expect(find(mem.board, "nueva").phase).toMatchObject({ phaseId: "intent", owner: "Luis" });
    expect(typeof find(mem.board, "nueva").phase?.updatedAt).toBe("number");
    expect(find(result, "nueva").phase?.phaseId).toBe("intent");
  });

  it("guarda el retroceso con motivo", async () => {
    const { setTaskPhase } = await import("./actions");
    await setTaskPhase("enmesa", { phaseId: "idea", reason: "Faltan datos" });
    expect(find(mem.board, "enmesa").phase?.lastRegression).toMatchObject({
      from: "mesa",
      to: "idea",
      reason: "Faltan datos",
    });
  });

  it.each([
    ["MOTIVO_REQUERIDO", "enmesa", { phaseId: "idea" }],
    ["RESPONSABLE_REQUERIDO", "nueva", { phaseId: "intent" }],
    ["TAREA_NO_ENCONTRADA", "no-existe", { phaseId: "intent", owner: "Ana" }],
    ["FASE_INVALIDA", "enmesa", { phaseId: "inventada" }],
  ] as const)("con error %s lanza Error cuyo message es el código y no modifica el tablero", async (code, id, input) => {
    const { setTaskPhase } = await import("./actions");
    const before = structuredClone(mem.board);
    const err = await setTaskPhase(id, { ...input }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(code);
    expect(mem.board).toEqual(before);
  });
});

describe("server action clearTaskPhase", () => {
  beforeEach(() => {
    mem.board = makeBoard();
  });

  it("elimina la fase de la tarea y persiste", async () => {
    const { clearTaskPhase } = await import("./actions");
    const result = await clearTaskPhase("enmesa");
    expect(find(mem.board, "enmesa").phase).toBeUndefined();
    expect(find(mem.board, "enmesa").statusId).toBe("doing");
    expect(find(result, "enmesa").phase).toBeUndefined();
  });
});

/*
 * Store del cliente. El store guarda su estado a nivel de módulo y solo carga el tablero
 * cuando hay un suscriptor (useBoard), así que en cada prueba se reimporta el módulo
 * (vi.resetModules), se simula fetch("/api/board") y se monta useBoard con renderHook.
 * La server action se simula con una promesa que no resuelve para observar el estado
 * optimista sin que la respuesta del servidor lo reemplace.
 */
describe("store: actions.setTaskPhase / actions.clearTaskPhase", () => {
  const serverMock = {
    setTaskPhase: vi.fn(() => new Promise<BoardState>(() => {})),
    clearTaskPhase: vi.fn(() => new Promise<BoardState>(() => {})),
    importBoard: vi.fn(async () => makeBoard()),
  };

  beforeEach(() => {
    vi.resetModules();
    serverMock.setTaskPhase.mockClear();
    serverMock.clearTaskPhase.mockClear();
    vi.doMock("@/app/actions", () => serverMock);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(makeBoard()), { headers: { "content-type": "application/json" } })),
    );
  });

  afterEach(() => {
    vi.doUnmock("@/app/actions");
    vi.unstubAllGlobals();
  });

  async function mountStore() {
    const store = await import("@/lib/store");
    const hook = renderHook(() => store.useBoard());
    await waitFor(() => expect(hook.result.current).not.toBeNull());
    return { store, hook };
  }

  it("expone setTaskPhase y clearTaskPhase", async () => {
    const store = await import("@/lib/store");
    expect(typeof store.actions.setTaskPhase).toBe("function");
    expect(typeof store.actions.clearTaskPhase).toBe("function");
  });

  it("setTaskPhase aplica el cambio al instante y llama a la server action con los mismos argumentos", async () => {
    const { store, hook } = await mountStore();
    const input = { phaseId: "intent", owner: "Luis" };
    act(() => store.actions.setTaskPhase("nueva", input));
    expect(find(hook.result.current!, "nueva").phase).toMatchObject({ phaseId: "intent", owner: "Luis" });
    expect(serverMock.setTaskPhase).toHaveBeenCalledWith("nueva", input);
    hook.unmount();
  });

  it("setTaskPhase con validación local fallida no aplica nada", async () => {
    const { store, hook } = await mountStore();
    const before = hook.result.current;
    act(() => store.actions.setTaskPhase("enmesa", { phaseId: "idea" })); // retroceso sin motivo
    expect(find(hook.result.current!, "enmesa").phase?.phaseId).toBe("mesa");
    expect(hook.result.current).toEqual(before);
    hook.unmount();
  });

  it("clearTaskPhase quita la fase al instante y llama a la server action", async () => {
    const { store, hook } = await mountStore();
    act(() => store.actions.clearTaskPhase("enmesa"));
    expect(find(hook.result.current!, "enmesa").phase).toBeUndefined();
    expect(serverMock.clearTaskPhase).toHaveBeenCalledWith("enmesa");
    hook.unmount();
  });
});
