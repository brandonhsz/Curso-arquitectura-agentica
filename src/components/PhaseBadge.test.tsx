import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TaskPhase } from "@/lib/types";
import { PhaseBadge } from "./PhaseBadge";

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function phase(over: Partial<TaskPhase> = {}): TaskPhase {
  return { phaseId: "intent", owner: "Ana", updatedAt: NOW, ...over };
}

function renderBadge(p: TaskPhase) {
  const { container } = render(<PhaseBadge phase={p} now={NOW} />);
  const root = container.querySelector("[data-turn]");
  return { container, root };
}

describe("PhaseBadge", () => {
  it("muestra el nombre de la fase", () => {
    const { container } = renderBadge(phase({ phaseId: "idea" }));
    expect(container).toHaveTextContent("Desarrollo de la idea");
  });

  it("en turno humano (aprobacion_final) muestra 'Te toca: <owner>' y data-turn='humano'", () => {
    const { container, root } = renderBadge(phase({ phaseId: "aprobacion_final", owner: "Ana" }));
    expect(container).toHaveTextContent("Aprobación final");
    expect(container).toHaveTextContent("Te toca: Ana");
    expect(root).toHaveAttribute("data-turn", "humano");
    expect(container).not.toHaveTextContent("Agente trabajando");
  });

  it("en turno agente muestra 'Agente trabajando' y data-turn='agente'", () => {
    const { container, root } = renderBadge(phase({ phaseId: "mesa", owner: "Ana" }));
    expect(container).toHaveTextContent("Mesa de diálogo");
    expect(container).toHaveTextContent("Agente trabajando");
    expect(root).toHaveAttribute("data-turn", "agente");
    expect(container).not.toHaveTextContent("Te toca");
  });

  it("en fase consolidada muestra 'Agente trabajando' y data-turn='agente'", () => {
    const { container, root } = renderBadge(phase({ phaseId: "consolidada", owner: "Ana" }));
    expect(container).toHaveTextContent("Idea consolidada");
    expect(container).toHaveTextContent("Agente trabajando");
    expect(root).toHaveAttribute("data-turn", "agente");
    expect(container).not.toHaveTextContent("Te toca");
  });

  it("en fase evidencia_final muestra 'Agente trabajando' y data-turn='agente'", () => {
    const { container, root } = renderBadge(phase({ phaseId: "evidencia_final", owner: "Ana" }));
    expect(container).toHaveTextContent("Evidencia final");
    expect(root).toHaveAttribute("data-turn", "agente");
    expect(container).toHaveTextContent("Agente trabajando");
    expect(container).not.toHaveTextContent("Te toca");
  });

  it.each(["intent", "idea", "respuesta"] as const)("en fase %s (ahora turno agente) no muestra 'Te toca'", (id) => {
    const { container, root } = renderBadge(phase({ phaseId: id, owner: "Ana" }));
    expect(root).toHaveAttribute("data-turn", "agente");
    expect(container).toHaveTextContent("Agente trabajando");
    expect(container).not.toHaveTextContent("Te toca");
  });

  it("en fase implementacion muestra 'Agente trabajando' y data-turn='agente'", () => {
    const { container, root } = renderBadge(phase({ phaseId: "implementacion", owner: "Ana" }));
    expect(container).toHaveTextContent("Implementación");
    expect(container).toHaveTextContent("Agente trabajando");
    expect(root).toHaveAttribute("data-turn", "agente");
    expect(container).not.toHaveTextContent("Te toca");
  });

  it.each([
    [30 * 1000, "hace un momento"],
    [5 * MIN, "hace 5 min"],
    [2 * HOUR, "hace 2 h"],
    [3 * DAY, "hace 3 d"],
  ])("con %i ms transcurridos muestra '%s'", (elapsed, text) => {
    const { container } = renderBadge(phase({ updatedAt: NOW - elapsed }));
    expect(container).toHaveTextContent(text);
  });

  it("con lastRegression muestra 'Regresó de <fase from>: <reason>'", () => {
    const { container } = renderBadge(
      phase({
        phaseId: "idea",
        lastRegression: { from: "sintesis", to: "idea", reason: "faltan datos", at: NOW - MIN },
      }),
    );
    expect(container).toHaveTextContent("Regresó de Síntesis: faltan datos");
  });

  it("sin lastRegression no muestra 'Regresó de'", () => {
    const { container } = renderBadge(phase());
    expect(container).not.toHaveTextContent("Regresó de");
  });

  describe("showPhaseName", () => {
    it("con showPhaseName={false} no muestra el nombre ni el número de la fase, pero sí lo demás", () => {
      const { container } = render(
        <PhaseBadge
          phase={phase({
            phaseId: "idea",
            owner: "Ana",
            updatedAt: NOW - 5 * MIN,
            lastRegression: { from: "sintesis", to: "idea", reason: "faltan datos", at: NOW - MIN },
          })}
          now={NOW}
          showPhaseName={false}
        />,
      );
      const root = container.querySelector("[data-turn]");
      expect(container).not.toHaveTextContent("Desarrollo de la idea");
      expect(container).not.toHaveTextContent(/^\s*2\./);
      expect(container.textContent).not.toMatch(/\b2\. /);
      expect(container).toHaveTextContent("Agente trabajando");
      expect(container).toHaveTextContent("hace 5 min");
      expect(container).toHaveTextContent("Regresó de Síntesis: faltan datos");
      expect(root).toHaveAttribute("data-turn", "agente");
    });

    it("con showPhaseName={false} en turno agente sigue mostrando 'Agente trabajando'", () => {
      const { container } = render(
        <PhaseBadge phase={phase({ phaseId: "implementacion" })} now={NOW} showPhaseName={false} />,
      );
      expect(container).not.toHaveTextContent("Implementación");
      expect(container).toHaveTextContent("Agente trabajando");
      expect(container.querySelector("[data-turn]")).toHaveAttribute("data-turn", "agente");
    });

    it("sin la prop (por defecto) sigue mostrando el nombre de la fase", () => {
      const { container } = render(<PhaseBadge phase={phase({ phaseId: "idea" })} now={NOW} />);
      expect(container).toHaveTextContent("Desarrollo de la idea");
      expect(container).toHaveTextContent("Agente trabajando");
    });

    it("con showPhaseName={true} muestra el nombre de la fase", () => {
      const { container } = render(
        <PhaseBadge phase={phase({ phaseId: "idea" })} now={NOW} showPhaseName />,
      );
      expect(container).toHaveTextContent("Desarrollo de la idea");
    });
  });
});
