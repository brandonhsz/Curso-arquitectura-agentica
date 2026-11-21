// @vitest-environment node
/**
 * T4 (rojo) — herramienta MCP `actualizar_fase` y campos de fase en `listar_tareas`.
 * Se invoca el handler POST exportado por la ruta con peticiones JSON-RPC de MCP,
 * sobre un tablero en memoria (se simula "@/lib/db").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardState } from "@/lib/types";

const mem = vi.hoisted(() => ({ board: null as unknown as BoardState }));

vi.mock("@/lib/db", () => ({
  readBoard: vi.fn(async () => mem.board),
  mutateBoard: vi.fn(async (fn: (b: BoardState) => BoardState) => {
    mem.board = fn(mem.board);
    return mem.board;
  }),
}));

import { POST } from "./route";
import { PHASE_ERROR_MESSAGES } from "@/lib/board";

function makeBoard(): BoardState {
  return {
    statuses: [
      { id: "todo", name: "Por hacer", color: "#64748b" },
      { id: "doing", name: "En progreso", color: "#3b82f6" },
    ],
    tasks: [
      { id: "t1", title: "Sin fase", description: "", statusId: "todo", createdAt: 1 },
      {
        id: "t2",
        title: "En mesa",
        description: "",
        statusId: "doing",
        createdAt: 2,
        phase: { phaseId: "mesa", owner: "Ana", updatedAt: 1000 },
      },
    ],
  };
}

let rpcId = 0;

/** Envía una petición JSON-RPC al handler y devuelve el objeto de respuesta (soporta JSON o SSE). */
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const req = new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const res = await POST(req);
  const raw = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    const dataLines = raw
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    const msgs = dataLines.map((l) => JSON.parse(l));
    return msgs.find((m) => m.id === rpcId) ?? msgs[msgs.length - 1];
  }
  return JSON.parse(raw);
}

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const msg = await rpc("tools/call", { name, arguments: args });
  expect(msg.error, JSON.stringify(msg.error)).toBeUndefined();
  return msg.result as ToolResult;
}

const textOf = (r: ToolResult) => r.content.map((c) => c.text).join("\n");

beforeEach(() => {
  mem.board = makeBoard();
});

describe("MCP tools/list", () => {
  it("incluye la herramienta actualizar_fase", async () => {
    const msg = await rpc("tools/list");
    const names = (msg.result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain("listar_tareas");
    expect(names).toContain("actualizar_fase");
  });
});

describe("MCP actualizar_fase", () => {
  it("cambia la fase usando el id de la fase y responde con la fase nueva", async () => {
    const r = await callTool("actualizar_fase", { tarea: "t2", fase: "sintesis" });
    expect(r.isError).toBeFalsy();
    expect(mem.board.tasks.find((t) => t.id === "t2")?.phase?.phaseId).toBe("sintesis");
    expect(mem.board.tasks.find((t) => t.id === "t2")?.phase?.owner).toBe("Ana");
    expect(textOf(r)).toContain("En mesa");
    expect(textOf(r)).toContain("Mesa de diálogo");
    expect(textOf(r)).toContain("Síntesis");
    expect(textOf(r)).toContain("agente");
  });

  it("acepta el nombre de la fase sin distinguir mayúsculas", async () => {
    const r = await callTool("actualizar_fase", { tarea: "t2", fase: "respuesta DEL usuario" });
    expect(r.isError).toBeFalsy();
    expect(mem.board.tasks.find((t) => t.id === "t2")?.phase?.phaseId).toBe("respuesta");
    expect(textOf(r)).toContain("Respuesta del usuario");
    expect(textOf(r)).toContain("turno: agente");
  });

  it("primera fase con responsable: indica 'sin fase' como fase anterior", async () => {
    const r = await callTool("actualizar_fase", { tarea: "t1", fase: "intent", responsable: "Luis" });
    expect(r.isError).toBeFalsy();
    expect(mem.board.tasks.find((t) => t.id === "t1")?.phase).toMatchObject({ phaseId: "intent", owner: "Luis" });
    expect(textOf(r)).toContain("sin fase");
    expect(textOf(r)).toContain("Intent");
  });

  it("retroceder sin motivo devuelve isError con el mensaje de MOTIVO_REQUERIDO y no cambia nada", async () => {
    const r = await callTool("actualizar_fase", { tarea: "t2", fase: "idea" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain(PHASE_ERROR_MESSAGES.MOTIVO_REQUERIDO);
    expect(mem.board.tasks.find((t) => t.id === "t2")?.phase?.phaseId).toBe("mesa");
  });

  it("retroceder con motivo guarda el retroceso", async () => {
    const r = await callTool("actualizar_fase", { tarea: "t2", fase: "idea", motivo: "Faltan datos" });
    expect(r.isError).toBeFalsy();
    expect(mem.board.tasks.find((t) => t.id === "t2")?.phase?.lastRegression).toMatchObject({
      from: "mesa",
      to: "idea",
      reason: "Faltan datos",
    });
  });

  it("id de tarea inexistente devuelve isError", async () => {
    const r = await callTool("actualizar_fase", { tarea: "no-existe", fase: "intent", responsable: "Ana" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain(PHASE_ERROR_MESSAGES.TAREA_NO_ENCONTRADA);
  });

  it("fase inexistente devuelve isError", async () => {
    const r = await callTool("actualizar_fase", { tarea: "t2", fase: "inventada" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain(PHASE_ERROR_MESSAGES.FASE_INVALIDA);
  });
});

describe("MCP listar_tareas", () => {
  it("incluye fase, turno y responsable (null si no tiene fase)", async () => {
    const r = await callTool("listar_tareas", {});
    expect(r.isError).toBeFalsy();
    const tasks = JSON.parse(textOf(r)) as Record<string, unknown>[];
    const t1 = tasks.find((t) => t.id === "t1")!;
    const t2 = tasks.find((t) => t.id === "t2")!;
    expect(t1).toMatchObject({ fase: null, turno: null, responsable: null });
    expect(t2).toMatchObject({ fase: "Mesa de diálogo", turno: "agente", responsable: "Ana" });
  });

  it("incluye el estado del agente automático (null si no tiene)", async () => {
    mem.board.tasks[0] = {
      ...mem.board.tasks[0],
      agent: { status: "detenido", worktree: "/w", branch: "b", logFile: "/l", startedAt: 1 },
    };
    const r = await callTool("listar_tareas", {});
    const tasks = JSON.parse(textOf(r)) as Record<string, unknown>[];
    expect(tasks.find((t) => t.id === "t1")).toMatchObject({ agente: "detenido" });
    expect(tasks.find((t) => t.id === "t2")).toMatchObject({ agente: null });
  });
});

describe("MCP — flujo completo (11 fases, Bloques 1-5)", () => {
  /** Agrega tareas en fases nuevas al tablero en memoria. */
  function addTask(id: string, phaseId: string) {
    mem.board.tasks.push({
      id,
      title: `Tarea ${id}`,
      description: "",
      statusId: "doing",
      createdAt: 10,
      phase: { phaseId: phaseId as never, owner: "Ana", updatedAt: 1000 },
    });
  }

  it("actualizar_fase acepta 'Validación' por nombre (mayúsculas indistintas) y responde con turno agente", async () => {
    addTask("t3", "analisis");
    const r = await callTool("actualizar_fase", { tarea: "t3", fase: "VALIDACIÓN" });
    expect(r.isError).toBeFalsy();
    expect(mem.board.tasks.find((t) => t.id === "t3")?.phase?.phaseId).toBe("validacion");
    expect(textOf(r)).toContain("Validación");
    expect(textOf(r)).toContain("turno: agente");
  });

  it("actualizar_fase acepta 'evidencia_final' por id y responde con turno agente", async () => {
    addTask("t3", "validacion");
    const r = await callTool("actualizar_fase", { tarea: "t3", fase: "evidencia_final" });
    expect(r.isError).toBeFalsy();
    expect(mem.board.tasks.find((t) => t.id === "t3")?.phase?.phaseId).toBe("evidencia_final");
    expect(textOf(r)).toContain("Evidencia final");
    expect(textOf(r)).toContain("turno: agente");
  });

  it("actualizar_fase acepta 'aprobacion_final' por id y responde con turno humano", async () => {
    addTask("t3", "evidencia_final");
    const r = await callTool("actualizar_fase", { tarea: "t3", fase: "aprobacion_final" });
    expect(r.isError).toBeFalsy();
    expect(mem.board.tasks.find((t) => t.id === "t3")?.phase?.phaseId).toBe("aprobacion_final");
    expect(textOf(r)).toContain("Aprobación final");
    expect(textOf(r)).toContain("(turno: humano)");
  });

  it("retroceder de validacion a implementacion sin motivo devuelve isError MOTIVO_REQUERIDO", async () => {
    addTask("t3", "validacion");
    const r = await callTool("actualizar_fase", { tarea: "t3", fase: "implementacion" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain(PHASE_ERROR_MESSAGES.MOTIVO_REQUERIDO);
    expect(mem.board.tasks.find((t) => t.id === "t3")?.phase?.phaseId).toBe("validacion");
  });

  it("listar_tareas devuelve turno agente para consolidada y analisis, y humano para aprobacion_final", async () => {
    addTask("t4", "consolidada");
    addTask("t6", "aprobacion_final");
    addTask("t5", "analisis");
    const r = await callTool("listar_tareas", {});
    const tasks = JSON.parse(textOf(r)) as Record<string, unknown>[];
    expect(tasks.find((t) => t.id === "t4")).toMatchObject({ fase: "Idea consolidada", turno: "agente" });
    expect(tasks.find((t) => t.id === "t6")).toMatchObject({ fase: "Aprobación final", turno: "humano" });
    expect(tasks.find((t) => t.id === "t5")).toMatchObject({ fase: "Análisis con evidencias", turno: "agente" });
  });

  it("tools/list: la descripción de actualizar_fase menciona 'Evidencia final' e 'Implementación'", async () => {
    const msg = await rpc("tools/list");
    const tool = (msg.result.tools as { name: string; description: string }[]).find(
      (t) => t.name === "actualizar_fase",
    )!;
    expect(tool.description).toContain("Evidencia final");
    expect(tool.description).toContain("Implementación");
  });

  it("tools/list: la descripción de actualizar_fase cubre el flujo completo (Bloque 4: el motivo es el hallazgo)", async () => {
    const msg = await rpc("tools/list");
    const tool = (msg.result.tools as { name: string; description: string }[]).find(
      (t) => t.name === "actualizar_fase",
    )!;
    expect(tool.description.toLowerCase()).toContain("hallazgo");
  });
});
