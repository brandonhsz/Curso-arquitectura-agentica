/**
 * Rojo — fase "aprobacion_final": única fase de turno humano,
 * y sincronía entre PHASES y el arreglo FASES del hook .claude/hooks/flujo.mjs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHASES, getPhase, isHumanTurn, isRegressionActive } from "./phases";
import type { TaskPhase } from "./types";

describe("PHASES — turnos", () => {
  it("la única fase con turno 'humano' es aprobacion_final", () => {
    expect(PHASES.filter((p) => p.turn === "humano").map((p) => p.id)).toEqual(["aprobacion_final"]);
  });

  it("ninguna fase queda con turno 'ninguno'; el resto es 'agente'", () => {
    for (const p of PHASES) {
      expect(p.turn, p.id).not.toBe("ninguno");
      if (p.id !== "aprobacion_final") expect(p.turn, p.id).toBe("agente");
    }
  });

  it("aprobacion_final es la última fase: orden 11, bloque 5, nombre 'Aprobación final'", () => {
    expect(PHASES).toHaveLength(11);
    expect(PHASES[PHASES.length - 1]).toEqual({
      id: "aprobacion_final",
      name: "Aprobación final",
      order: 11,
      turn: "humano",
      block: 5,
      description: expect.any(String),
    });
    expect(getPhase("aprobacion_final")?.name).toBe("Aprobación final");
    expect(isHumanTurn("aprobacion_final")).toBe(true);
    expect(isHumanTurn("intent")).toBe(false);
  });
});

describe("Sincronía con .claude/hooks/flujo.mjs", () => {
  it("el arreglo FASES del hook contiene todos los ids de PHASES", () => {
    const hookPath = path.resolve(__dirname, "../../.claude/hooks/flujo.mjs");
    const src = readFileSync(hookPath, "utf8");
    const match = src.match(/const\s+FASES\s*=\s*\[([\s\S]*?)\]/);
    expect(match, "no se encontró `const FASES = [...]` en el hook").not.toBeNull();
    const hookIds = [...match![1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    expect(hookIds.length).toBeGreaterThan(0);
    for (const p of PHASES) expect(hookIds, `falta "${p.id}" en FASES del hook`).toContain(p.id);
  });
});

describe("PHASES — descripción de cada fase", () => {
  it("cada fase tiene una descripción no vacía y distinta de las demás", () => {
    for (const p of PHASES) {
      expect(typeof p.description, p.id).toBe("string");
      expect(p.description.trim().length, p.id).toBeGreaterThan(10);
    }
    expect(new Set(PHASES.map((p) => p.description)).size).toBe(PHASES.length);
  });
});

describe("isRegressionActive", () => {
  const base: TaskPhase = { phaseId: "implementacion", owner: "Ana", updatedAt: 1 };

  it("false si no hay regresión", () => {
    expect(isRegressionActive(base)).toBe(false);
  });

  it("true mientras la fase actual está antes de la fase de la que regresó", () => {
    const reg = { from: "validacion" as const, to: "implementacion" as const, reason: "H1", at: 1 };
    expect(isRegressionActive({ ...base, lastRegression: reg })).toBe(true);
    expect(isRegressionActive({ ...base, phaseId: "analisis", lastRegression: reg })).toBe(true);
  });

  it("false cuando la tarea ya llegó o pasó la fase de la que regresó", () => {
    const reg = { from: "validacion" as const, to: "implementacion" as const, reason: "H1", at: 1 };
    expect(isRegressionActive({ ...base, phaseId: "validacion", lastRegression: reg })).toBe(false);
    expect(isRegressionActive({ ...base, phaseId: "aprobacion_final", lastRegression: reg })).toBe(false);
  });
});
