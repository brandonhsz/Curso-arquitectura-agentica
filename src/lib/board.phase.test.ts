/**
 * T2 (rojo) — reglas de fase en src/lib/board.ts:
 * validatePhaseChange, ops.setTaskPhase, ops.clearTaskPhase, tasksAwaitingHuman, PHASE_ERROR_MESSAGES,
 * groupByPhase (vista "Por fases").
 */
import { describe, expect, it } from "vitest";
import { PHASE_ERROR_MESSAGES, ops, tasksAwaitingHuman, validatePhaseChange } from "./board";
import { groupByPhase } from "@/lib/board";
import { PHASES } from "./phases";
import type { BoardState, PhaseChangeError, PhaseId, Task } from "./types";

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Tarea ${id}`,
  description: "",
  statusId: "todo",
  createdAt: 1,
  ...extra,
});

function makeBoard(): BoardState {
  return {
    statuses: [
      { id: "todo", name: "Por hacer", color: "#64748b" },
      { id: "doing", name: "En progreso", color: "#3b82f6" },
    ],
    tasks: [
      task("nueva"),
      task("enmesa", { statusId: "doing", phase: { phaseId: "mesa", owner: "Ana", updatedAt: 100 } }),
      task("otra", { phase: { phaseId: "intent", owner: "Luis", updatedAt: 50 } }),
    ],
  };
}

const get = (b: BoardState, id: string) => b.tasks.find((t) => t.id === id)!;

const boardWith = (...tasks: Task[]): BoardState => ({ statuses: makeBoard().statuses, tasks });

describe("validatePhaseChange", () => {
  it("tarea inexistente → TAREA_NO_ENCONTRADA", () => {
    expect(validatePhaseChange(makeBoard(), "nope", { phaseId: "intent", owner: "Ana" })).toBe("TAREA_NO_ENCONTRADA");
  });

  it("fase que no existe → FASE_INVALIDA", () => {
    expect(validatePhaseChange(makeBoard(), "enmesa", { phaseId: "inventada" })).toBe("FASE_INVALIDA");
  });

  it("primera fase sin responsable → RESPONSABLE_REQUERIDO", () => {
    expect(validatePhaseChange(makeBoard(), "nueva", { phaseId: "intent" })).toBe("RESPONSABLE_REQUERIDO");
  });

  it("primera fase con responsable vacío o solo espacios → RESPONSABLE_REQUERIDO", () => {
    expect(validatePhaseChange(makeBoard(), "nueva", { phaseId: "intent", owner: "" })).toBe("RESPONSABLE_REQUERIDO");
    expect(validatePhaseChange(makeBoard(), "nueva", { phaseId: "intent", owner: "  " })).toBe(
      "RESPONSABLE_REQUERIDO",
    );
  });

  it("primera fase con responsable → válido (null)", () => {
    expect(validatePhaseChange(makeBoard(), "nueva", { phaseId: "intent", owner: "Ana" })).toBeNull();
  });

  it("avanzar una tarea con fase no exige responsable ni motivo", () => {
    expect(validatePhaseChange(makeBoard(), "enmesa", { phaseId: "sintesis" })).toBeNull();
  });

  it("quedarse en la misma fase es válido", () => {
    expect(validatePhaseChange(makeBoard(), "enmesa", { phaseId: "mesa" })).toBeNull();
  });

  it("retroceder sin motivo → MOTIVO_REQUERIDO (también con motivo en blanco)", () => {
    const b = makeBoard();
    expect(validatePhaseChange(b, "enmesa", { phaseId: "idea" })).toBe("MOTIVO_REQUERIDO");
    expect(validatePhaseChange(b, "enmesa", { phaseId: "idea", reason: "   " })).toBe("MOTIVO_REQUERIDO");
  });

  it("retroceder con motivo → válido", () => {
    expect(validatePhaseChange(makeBoard(), "enmesa", { phaseId: "idea", reason: "Faltan datos" })).toBeNull();
  });

  it("retroceder entre bloques (validacion → implementacion) sin motivo → MOTIVO_REQUERIDO", () => {
    const b = boardWith(task("val", { phase: { phaseId: "validacion", owner: "Ana", updatedAt: 100 } }));
    expect(validatePhaseChange(b, "val", { phaseId: "implementacion" })).toBe("MOTIVO_REQUERIDO");
    expect(validatePhaseChange(b, "val", { phaseId: "implementacion", reason: "  " })).toBe("MOTIVO_REQUERIDO");
  });

  it("avanzar de consolidada a implementacion no pide motivo ni responsable", () => {
    const b = boardWith(task("con", { phase: { phaseId: "consolidada", owner: "Ana", updatedAt: 100 } }));
    expect(validatePhaseChange(b, "con", { phaseId: "implementacion" })).toBeNull();
  });
});

describe("ops.setTaskPhase", () => {
  it("asigna la primera fase con responsable (recortado) y updatedAt = now", () => {
    const next = ops.setTaskPhase(makeBoard(), "nueva", { phaseId: "intent", owner: "  Ana  " }, 500);
    expect(get(next, "nueva").phase).toEqual({ phaseId: "intent", owner: "Ana", updatedAt: 500 });
  });

  it("avanzar actualiza phaseId y updatedAt y conserva el responsable", () => {
    const next = ops.setTaskPhase(makeBoard(), "enmesa", { phaseId: "sintesis" }, 900);
    expect(get(next, "enmesa").phase).toMatchObject({ phaseId: "sintesis", owner: "Ana", updatedAt: 900 });
    expect(get(next, "enmesa").phase?.lastRegression).toBeUndefined();
  });

  it("un responsable nuevo reemplaza al anterior", () => {
    const next = ops.setTaskPhase(makeBoard(), "enmesa", { phaseId: "sintesis", owner: "Beto" }, 900);
    expect(get(next, "enmesa").phase?.owner).toBe("Beto");
  });

  it("retroceder con motivo guarda lastRegression {from, to, reason, at}", () => {
    const next = ops.setTaskPhase(makeBoard(), "enmesa", { phaseId: "idea", reason: "  Faltan datos " }, 1200);
    expect(get(next, "enmesa").phase).toEqual({
      phaseId: "idea",
      owner: "Ana",
      updatedAt: 1200,
      lastRegression: { from: "mesa", to: "idea", reason: "Faltan datos", at: 1200 },
    });
  });

  it("retroceder de validacion a implementacion con motivo guarda lastRegression (el hallazgo)", () => {
    const b = boardWith(task("val", { phase: { phaseId: "validacion", owner: "Ana", updatedAt: 100 } }));
    const next = ops.setTaskPhase(b, "val", { phaseId: "implementacion", reason: " Falla el botón guardar " }, 2000);
    expect(get(next, "val").phase).toEqual({
      phaseId: "implementacion",
      owner: "Ana",
      updatedAt: 2000,
      lastRegression: { from: "validacion", to: "implementacion", reason: "Falla el botón guardar", at: 2000 },
    });
  });

  it("avanzar de consolidada a implementacion no registra retroceso", () => {
    const b = boardWith(task("con", { phase: { phaseId: "consolidada", owner: "Ana", updatedAt: 100 } }));
    const next = ops.setTaskPhase(b, "con", { phaseId: "implementacion" }, 2000);
    expect(get(next, "con").phase).toEqual({ phaseId: "implementacion", owner: "Ana", updatedAt: 2000 });
  });

  it("avanzar después de un retroceso conserva lastRegression", () => {
    const back = ops.setTaskPhase(makeBoard(), "enmesa", { phaseId: "idea", reason: "Faltan datos" }, 1200);
    const fwd = ops.setTaskPhase(back, "enmesa", { phaseId: "mesa" }, 1500);
    expect(get(fwd, "enmesa").phase).toMatchObject({
      phaseId: "mesa",
      updatedAt: 1500,
      lastRegression: { from: "mesa", to: "idea", reason: "Faltan datos", at: 1200 },
    });
  });

  it("no toca statusId ni las demás tareas, y no muta el tablero original", () => {
    const before = makeBoard();
    const snapshot = structuredClone(before);
    const next = ops.setTaskPhase(before, "enmesa", { phaseId: "sintesis" }, 900);
    expect(get(next, "enmesa").statusId).toBe("doing");
    expect(get(next, "nueva")).toEqual(get(snapshot, "nueva"));
    expect(get(next, "otra")).toEqual(get(snapshot, "otra"));
    expect(next.statuses).toEqual(snapshot.statuses);
    expect(before).toEqual(snapshot);
  });

  it("las tareas sin fase no se alteran al cambiar la fase de otra", () => {
    const next = ops.setTaskPhase(makeBoard(), "otra", { phaseId: "idea" }, 900);
    expect(get(next, "nueva").phase).toBeUndefined();
    expect("phase" in get(next, "nueva")).toBe(false);
  });
});

describe("ops.clearTaskPhase", () => {
  it("elimina la fase de la tarea sin tocar lo demás", () => {
    const next = ops.clearTaskPhase(makeBoard(), "enmesa");
    const t = get(next, "enmesa");
    expect(t.phase).toBeUndefined();
    expect(t.statusId).toBe("doing");
    expect(t.title).toBe("Tarea enmesa");
    expect(get(next, "otra").phase?.phaseId).toBe("intent");
  });
});

describe("tasksAwaitingHuman", () => {
  it("devuelve solo tareas en aprobacion_final (única fase de turno humano)", () => {
    const b: BoardState = {
      statuses: makeBoard().statuses,
      tasks: [
        task("a", { phase: { phaseId: "intent", owner: "x", updatedAt: 1 } }),
        task("b", { phase: { phaseId: "idea", owner: "x", updatedAt: 1 } }),
        task("c", { phase: { phaseId: "mesa", owner: "x", updatedAt: 1 } }),
        task("d", { phase: { phaseId: "sintesis", owner: "x", updatedAt: 1 } }),
        task("e", { phase: { phaseId: "respuesta", owner: "x", updatedAt: 1 } }),
        task("f", { phase: { phaseId: "consolidada", owner: "x", updatedAt: 1 } }),
        task("g"),
        task("h", { phase: { phaseId: "implementacion", owner: "x", updatedAt: 1 } }),
        task("i", { phase: { phaseId: "analisis", owner: "x", updatedAt: 1 } }),
        task("j", { phase: { phaseId: "validacion", owner: "x", updatedAt: 1 } }),
        task("k", { phase: { phaseId: "evidencia_final", owner: "x", updatedAt: 1 } }),
        task("l", { phase: { phaseId: "aprobacion_final", owner: "x", updatedAt: 1 } }),
      ],
    };
    expect(tasksAwaitingHuman(b).map((t) => t.id)).toEqual(["l"]);
  });

  it("tablero sin fases → lista vacía", () => {
    expect(tasksAwaitingHuman({ statuses: [], tasks: [task("x")] })).toEqual([]);
  });
});

describe("PHASE_ERROR_MESSAGES", () => {
  it("tiene un mensaje no vacío por cada código de error", () => {
    const codes: PhaseChangeError[] = [
      "TAREA_NO_ENCONTRADA",
      "FASE_INVALIDA",
      "RESPONSABLE_REQUERIDO",
      "MOTIVO_REQUERIDO",
    ];
    expect(Object.keys(PHASE_ERROR_MESSAGES).sort()).toEqual([...codes].sort());
    for (const c of codes) {
      expect(typeof PHASE_ERROR_MESSAGES[c]).toBe("string");
      expect(PHASE_ERROR_MESSAGES[c].trim().length).toBeGreaterThan(0);
    }
  });
});

describe("groupByPhase", () => {
  const ph = (phaseId: PhaseId, updatedAt: number) => ({ phaseId, owner: "x", updatedAt });

  function sample(): BoardState {
    return boardWith(
      task("s1", { createdAt: 10 }),
      task("s2", { createdAt: 30 }),
      task("s3", { createdAt: 20 }),
      task("m1", { phase: ph("mesa", 100) }),
      task("m2", { phase: ph("mesa", 300) }),
      task("m3", { phase: ph("mesa", 200) }),
      task("i1", { phase: ph("intent", 5) }),
      task("v1", { phase: ph("validacion", 7) }),
      task("e1", { phase: ph("evidencia_final", 9) }),
    );
  }

  const groupFor = (groups: ReturnType<typeof groupByPhase>, phaseId: string | null) =>
    groups.find((g) => (g.phase ? g.phase.id : null) === phaseId)!;

  it("devuelve 12 grupos: primero 'Sin fase' (phase null) y luego las 11 fases en el orden de PHASES", () => {
    const groups = groupByPhase(sample());
    expect(groups).toHaveLength(12);
    expect(groups[0].phase).toBeNull();
    expect(groups.slice(1).map((g) => g.phase!.id)).toEqual(PHASES.map((p) => p.id));
    expect(groups.slice(1).map((g) => g.phase)).toEqual(PHASES);
  });

  it("incluye grupos vacíos para fases sin tareas", () => {
    const groups = groupByPhase(sample());
    for (const id of ["idea", "sintesis", "respuesta", "consolidada", "implementacion", "analisis", "aprobacion_final"]) {
      expect(groupFor(groups, id).tasks).toEqual([]);
    }
  });

  it("tablero vacío → 12 grupos vacíos", () => {
    const groups = groupByPhase({ statuses: [], tasks: [] });
    expect(groups).toHaveLength(12);
    for (const g of groups) expect(g.tasks).toEqual([]);
  });

  it("el grupo 'Sin fase' contiene solo las tareas sin fase", () => {
    const groups = groupByPhase(sample());
    expect(groups[0].tasks.every((t) => t.phase === undefined)).toBe(true);
    expect(groups[0].tasks.map((t) => t.id).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("cada tarea con fase aparece en el grupo de su fase y solo ahí", () => {
    const b = sample();
    const groups = groupByPhase(b);
    for (const g of groups.slice(1)) {
      for (const t of g.tasks) expect(t.phase?.phaseId).toBe(g.phase!.id);
    }
    const allIds = groups.flatMap((g) => g.tasks.map((t) => t.id)).sort();
    expect(allIds).toEqual(b.tasks.map((t) => t.id).sort());
    expect(groupFor(groups, "intent").tasks.map((t) => t.id)).toEqual(["i1"]);
    expect(groupFor(groups, "validacion").tasks.map((t) => t.id)).toEqual(["v1"]);
    expect(groupFor(groups, "evidencia_final").tasks.map((t) => t.id)).toEqual(["e1"]);
  });

  it("dentro de un grupo de fase, ordena por phase.updatedAt descendente", () => {
    const groups = groupByPhase(sample());
    expect(groupFor(groups, "mesa").tasks.map((t) => t.id)).toEqual(["m2", "m3", "m1"]);
  });

  it("en 'Sin fase', ordena por createdAt descendente", () => {
    const groups = groupByPhase(sample());
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["s2", "s3", "s1"]);
  });

  it("no muta el tablero original", () => {
    const b = sample();
    const snapshot = structuredClone(b);
    groupByPhase(b);
    expect(b).toEqual(snapshot);
  });
});
