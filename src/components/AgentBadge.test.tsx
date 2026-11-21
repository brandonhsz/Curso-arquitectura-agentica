/**
 * T3 — Pruebas (rojo) del AgentBadge y su integración en Board y TaskList.
 *
 * Contrato del componente (lo implementa el agente Visual en `src/components/AgentBadge.tsx`):
 *
 *   export function AgentBadge({ task }: { task: Task }): JSX.Element | null
 *
 * - Si `task.agent` no existe → no renderiza nada.
 * - Renderiza un contenedor con `data-agent-status={status}` y texto:
 *   - "trabajando" → contiene "Agente trabajando el ticket" y un botón accesible "Detener agente".
 *   - "terminado"  → "Agente terminó".
 *   - "fallo"      → "Agente falló" y además `agent.error` si existe.
 *   - "detenido"   → "Agente detenido".
 * - Cuando el agente NO está "trabajando", o la fase de la tarea es "aprobacion_final",
 *   muestra dentro de un `<code>` exactamente: `cd <worktree> && claude --resume <sessionId>`.
 * - Clic en "Detener agente" llama `actions.stopAgent(task.id)` (store del cliente) y NO
 *   propaga el clic (en Board el clic en la tarjeta abre la edición con `onEdit`).
 * - En Board y TaskList, una tarea con `agent` muestra el AgentBadge; una sin `agent` no.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "@/lib/store";
import type { AgentStatus, BoardState, Task, TaskAgent } from "@/lib/types";
import { AgentBadge } from "./AgentBadge";
import { Board } from "./Board";
import { TaskList } from "./TaskList";

vi.mock("@/lib/store", () => ({
  actions: {
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    setTaskPhase: vi.fn(),
    clearTaskPhase: vi.fn(),
    stopAgent: vi.fn(),
  },
  useBoard: vi.fn(),
}));

const stopAgent = (actions as unknown as { stopAgent: ReturnType<typeof vi.fn> }).stopAgent;

const WORKTREE = "/repo/.worktrees/t1-agente";
const SESSION = "sess-123";
const RESUME = `cd ${WORKTREE} && claude --resume ${SESSION}`;

function agent(over: Partial<TaskAgent> = {}): TaskAgent {
  return {
    status: "trabajando",
    sessionId: SESSION,
    worktree: WORKTREE,
    branch: "flujo/t1",
    logFile: "/repo/.flujo/t1.log",
    pid: 4242,
    startedAt: 1_700_000_000_000,
    ...over,
  };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Ticket con agente",
    description: "",
    statusId: "s1",
    createdAt: 1,
    ...over,
  };
}

function resumeCode(container: HTMLElement) {
  return Array.from(container.querySelectorAll("code")).find((c) => c.textContent === RESUME) ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentBadge", () => {
  it("sin agent no renderiza nada", () => {
    const { container } = render(<AgentBadge task={task()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("trabajando: muestra 'Agente trabajando el ticket', el botón 'Detener agente' y data-agent-status", () => {
    const { container } = render(<AgentBadge task={task({ agent: agent({ status: "trabajando" }) })} />);
    expect(container).toHaveTextContent("Agente trabajando el ticket");
    expect(screen.getByRole("button", { name: "Detener agente" })).toBeInTheDocument();
    expect(container.querySelector("[data-agent-status]")).toHaveAttribute("data-agent-status", "trabajando");
  });

  it("trabajando (fase no final): no muestra el comando para retomar", () => {
    const { container } = render(
      <AgentBadge
        task={task({
          agent: agent({ status: "trabajando" }),
          phase: { phaseId: "implementacion", owner: "Ana", updatedAt: Date.now() },
        })}
      />,
    );
    expect(resumeCode(container)).toBeNull();
    expect(container).not.toHaveTextContent("claude --resume");
  });

  it("trabajando en fase aprobacion_final: muestra el comando para retomar en <code>", () => {
    const { container } = render(
      <AgentBadge
        task={task({
          agent: agent({ status: "trabajando" }),
          phase: { phaseId: "aprobacion_final", owner: "Ana", updatedAt: Date.now() },
        })}
      />,
    );
    expect(resumeCode(container)).not.toBeNull();
  });

  it("terminado: muestra 'Agente terminó', sin botón de detener", () => {
    const { container } = render(<AgentBadge task={task({ agent: agent({ status: "terminado" }) })} />);
    expect(container).toHaveTextContent("Agente terminó");
    expect(container.querySelector("[data-agent-status]")).toHaveAttribute("data-agent-status", "terminado");
    expect(screen.queryByRole("button", { name: "Detener agente" })).toBeNull();
  });

  it("fallo: muestra 'Agente falló' y el texto del error", () => {
    const { container } = render(
      <AgentBadge task={task({ agent: agent({ status: "fallo", error: "salió con código 1" }) })} />,
    );
    expect(container).toHaveTextContent("Agente falló");
    expect(container).toHaveTextContent("salió con código 1");
    expect(container.querySelector("[data-agent-status]")).toHaveAttribute("data-agent-status", "fallo");
  });

  it("fallo sin error: muestra 'Agente falló'", () => {
    const { container } = render(<AgentBadge task={task({ agent: agent({ status: "fallo" }) })} />);
    expect(container).toHaveTextContent("Agente falló");
  });

  it("detenido: muestra 'Agente detenido'", () => {
    const { container } = render(<AgentBadge task={task({ agent: agent({ status: "detenido" }) })} />);
    expect(container).toHaveTextContent("Agente detenido");
    expect(container.querySelector("[data-agent-status]")).toHaveAttribute("data-agent-status", "detenido");
  });

  it.each(["terminado", "fallo", "detenido"] as AgentStatus[])(
    "%s: muestra exactamente '%s' el comando para retomar dentro de <code>",
    (status) => {
      const { container } = render(<AgentBadge task={task({ agent: agent({ status }) })} />);
      const code = resumeCode(container);
      expect(code).not.toBeNull();
      expect(code?.tagName).toBe("CODE");
      expect(code).toHaveTextContent(RESUME);
    },
  );

  it("clic en 'Detener agente' llama actions.stopAgent(task.id)", async () => {
    const user = userEvent.setup();
    render(<AgentBadge task={task({ id: "t9", agent: agent({ status: "trabajando" }) })} />);
    await user.click(screen.getByRole("button", { name: "Detener agente" }));
    expect(stopAgent).toHaveBeenCalledTimes(1);
    expect(stopAgent).toHaveBeenCalledWith("t9");
  });

  it("el clic en 'Detener agente' no se propaga al contenedor", async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <AgentBadge task={task({ agent: agent({ status: "trabajando" }) })} />
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Detener agente" }));
    expect(stopAgent).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });
});

const board: BoardState = {
  statuses: [{ id: "s1", name: "Lunes", color: "#64748b" }],
  tasks: [
    task({ id: "t1", title: "Con agente", createdAt: 1, agent: agent({ status: "trabajando" }) }),
    task({ id: "t2", title: "Sin agente", createdAt: 2 }),
    task({ id: "t3", title: "Agente listo", createdAt: 3, agent: agent({ status: "terminado" }) }),
  ],
};

describe("Board con AgentBadge", () => {
  function cardOf(title: string) {
    return screen.getByText(title).closest("article") as HTMLElement;
  }

  it("la tarjeta de una tarea con agente muestra el AgentBadge", () => {
    render(<Board board={board} onEdit={() => {}} onCreate={() => {}} />);
    const card = cardOf("Con agente");
    expect(card).toHaveTextContent("Agente trabajando el ticket");
    expect(card.querySelector("[data-agent-status]")).toHaveAttribute("data-agent-status", "trabajando");
    expect(cardOf("Agente listo")).toHaveTextContent("Agente terminó");
  });

  it("la tarjeta de una tarea sin agente no muestra el AgentBadge", () => {
    render(<Board board={board} onEdit={() => {}} onCreate={() => {}} />);
    const card = cardOf("Sin agente");
    expect(card.querySelector("[data-agent-status]")).toBeNull();
    expect(card).not.toHaveTextContent("Agente trabajando el ticket");
  });

  it("pulsar 'Detener agente' en la tarjeta llama stopAgent y no abre la edición (onEdit)", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<Board board={board} onEdit={onEdit} onCreate={() => {}} />);
    const button = screen.getByRole("button", { name: "Detener agente" });
    expect(cardOf("Con agente")).toContainElement(button);
    await user.click(button);
    expect(stopAgent).toHaveBeenCalledWith("t1");
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe("TaskList con AgentBadge", () => {
  function rowOf(title: string) {
    return screen.getByText(title).closest("li") as HTMLElement;
  }

  it("la fila de una tarea con agente muestra el AgentBadge", () => {
    render(<TaskList board={board} onEdit={() => {}} />);
    const row = rowOf("Con agente");
    expect(row).toHaveTextContent("Agente trabajando el ticket");
    expect(row.querySelector("[data-agent-status]")).toHaveAttribute("data-agent-status", "trabajando");
    expect(rowOf("Agente listo")).toHaveTextContent("Agente terminó");
  });

  it("la fila de una tarea sin agente no muestra el AgentBadge", () => {
    render(<TaskList board={board} onEdit={() => {}} />);
    const row = rowOf("Sin agente");
    expect(row.querySelector("[data-agent-status]")).toBeNull();
    expect(row).not.toHaveTextContent("Agente trabajando el ticket");
  });

  it("pulsar 'Detener agente' en la fila llama stopAgent y no llama onEdit", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<TaskList board={board} onEdit={onEdit} />);
    await user.click(screen.getByRole("button", { name: "Detener agente" }));
    expect(stopAgent).toHaveBeenCalledWith("t1");
    expect(onEdit).not.toHaveBeenCalled();
  });
});
