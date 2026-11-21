/**
 * Rojo — fase "aprobacion_final": única fase de turno humano,
 * y sincronía entre PHASES y el arreglo FASES del hook .claude/hooks/flujo.mjs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHASES, getPhase, isHumanTurn } from "./phases";

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
