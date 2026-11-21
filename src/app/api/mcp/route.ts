import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { findStatus, findTasks, ops, PHASE_ERROR_MESSAGES, validatePhaseChange } from "@/lib/board";
import { mutateBoard, readBoard } from "@/lib/db";
import { getPhase, PHASES } from "@/lib/phases";
import type { PhaseChangeError, Task } from "@/lib/types";

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const error = (message: string) => ({ ...text(message), isError: true });

/** Traduce un nombre de fase (sin distinguir mayúsculas) a su id; si no coincide, lo deja tal cual. */
function resolvePhaseId(idOrName: string): string {
  const v = idOrName.trim().toLowerCase();
  return PHASES.find((p) => p.id === v || p.name.toLowerCase() === v)?.id ?? idOrName;
}

function phaseFields(t: Task) {
  const phase = t.phase ? getPhase(t.phase.phaseId) : undefined;
  return {
    fase: phase?.name ?? null,
    turno: phase?.turn ?? null,
    responsable: t.phase ? t.phase.owner || null : null,
    // Estado del agente automático: si dice "detenido", el agente debe parar (detención cooperativa).
    agente: t.agent?.status ?? null,
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "listar_estados",
      {
        title: "Listar estados",
        description: "Devuelve los estados (columnas) del tablero kanban, en orden, con cuántas tareas tiene cada uno.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async () => {
        const board = await readBoard();
        return text(
          board.statuses.map((s) => ({
            id: s.id,
            nombre: s.name,
            tareas: board.tasks.filter((t) => t.statusId === s.id).length,
          })),
        );
      },
    );

    server.registerTool(
      "listar_tareas",
      {
        title: "Listar tareas",
        description:
          "Devuelve las tareas del tablero con su estado actual y su fase del flujo de trabajo, Bloques 1 a 5 (fase, turno y responsable; null si la tarea aún no tiene fase). Opcionalmente filtra por estado (id o nombre).",
        inputSchema: z.object({
          estado: z.string().optional().describe("Id o nombre del estado para filtrar, p. ej. 'En progreso'"),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ estado }) => {
        const board = await readBoard();
        let tasks = board.tasks;
        if (estado) {
          const status = findStatus(board, estado);
          if (!status) return error(`No existe el estado "${estado}". Usa listar_estados para ver los disponibles.`);
          tasks = tasks.filter((t) => t.statusId === status.id);
        }
        const names = new Map(board.statuses.map((s) => [s.id, s.name]));
        return text(
          tasks.map((t) => ({
            id: t.id,
            titulo: t.title,
            descripcion: t.description,
            estado: names.get(t.statusId) ?? t.statusId,
            ...phaseFields(t),
          })),
        );
      },
    );

    server.registerTool(
      "mover_tarea",
      {
        title: "Mover tarea de estado",
        description:
          "Cambia el estado de una tarea. La tarea se identifica por id o por título exacto, y el estado por id o nombre.",
        inputSchema: z.object({
          tarea: z.string().min(1).describe("Id o título exacto de la tarea"),
          estado: z.string().min(1).describe("Id o nombre del estado destino, p. ej. 'Hecho'"),
        }),
        annotations: { destructiveHint: false, idempotentHint: true },
      },
      async ({ tarea, estado }) => {
        const board = await readBoard();
        const status = findStatus(board, estado);
        if (!status) {
          return error(
            `No existe el estado "${estado}". Estados disponibles: ${board.statuses.map((s) => s.name).join(", ")}.`,
          );
        }
        const matches = findTasks(board, tarea);
        if (matches.length === 0) return error(`No encontré ninguna tarea con id o título "${tarea}".`);
        if (matches.length > 1) {
          return error(
            `Hay ${matches.length} tareas con el título "${tarea}". Indica el id: ${matches.map((t) => t.id).join(", ")}.`,
          );
        }
        const task = matches[0];
        const before = board.statuses.find((s) => s.id === task.statusId)?.name ?? task.statusId;
        await mutateBoard((s) => ops.updateTask(s, task.id, { statusId: status.id }));
        return text(`Tarea "${task.title}" movida de "${before}" a "${status.name}".`);
      },
    );

    server.registerTool(
      "actualizar_fase",
      {
        title: "Actualizar fase del grafo",
        description:
          "Registra en qué fase del flujo de trabajo completo (Bloques 1 a 5) está una tarea. " +
          "El flujo es autónomo: corre solo y todas las fases son del agente, salvo 'aprobacion_final' (Aprobación final), el único turno humano. " +
          "Llámala cada vez que la tarea entre a una fase nueva: " +
          "Bloque 1 (de la intención a la idea): en cada nodo — al registrar el Intent, al escribir una Idea (vN), al lanzar la mesa de diálogo, " +
          "al presentar la síntesis, al responder las dudas de la ronda y al consolidar la idea; " +
          "Bloque 2: al pasar del plan de tareas a la ejecución → 'implementacion' (Implementación); " +
          "Bloque 3: al iniciar el análisis con evidencias → 'analisis'; " +
          "Bloque 4: al entrar a validación o corrección → 'validacion'; " +
          "Bloque 5: al entregar el video final → 'evidencia_final' (Evidencia final), y enseguida → 'aprobacion_final' (Aprobación final) para que la persona apruebe o rechace el cambio. " +
          "También pasa a 'aprobacion_final' si el recorrido se atasca y necesita a la persona. " +
          "Si la persona rechaza, regresa a la fase que corresponda con 'motivo' = el motivo del rechazo. " +
          `Fases válidas en orden: ${PHASES.map((p) => `${p.name} (id: ${p.id}, turno: ${p.turn})`).join(", ")}. ` +
          "La primera vez que una tarea recibe fase, 'responsable' (la persona humana a cargo) es obligatorio. " +
          "Si regresas a una fase anterior (p. ej. de Respuesta del usuario a Desarrollo de la idea, o de Validación a Implementación), 'motivo' es obligatorio. " +
          "En el Bloque 4, al retroceder de Validación a Implementación, el motivo es el hallazgo que obliga a corregir.",
        inputSchema: z.object({
          tarea: z.string().min(1).describe("Id de la tarea (usa listar_tareas para verlo)"),
          fase: z
            .string()
            .min(1)
            .describe("Id o nombre de la fase destino, sin distinguir mayúsculas, p. ej. 'mesa' o 'Mesa de diálogo'"),
          responsable: z
            .string()
            .optional()
            .describe("Persona humana responsable. Obligatorio la primera vez que la tarea recibe fase"),
          motivo: z.string().optional().describe("Por qué se regresa a una fase anterior. Obligatorio al retroceder; en el Bloque 4 es el hallazgo"),
        }),
        annotations: { destructiveHint: false, idempotentHint: true },
      },
      async ({ tarea, fase, responsable, motivo }) => {
        const phaseId = resolvePhaseId(fase);
        const input = { phaseId, owner: responsable, reason: motivo };
        let failure: PhaseChangeError | null = null;
        let before: Task | undefined;
        let after: Task | undefined;
        // Se valida dentro de mutateBoard, con el tablero recién leído, para evitar carreras.
        await mutateBoard((s) => {
          failure = validatePhaseChange(s, tarea, input);
          if (failure) return s;
          before = s.tasks.find((t) => t.id === tarea);
          const next = ops.setTaskPhase(s, tarea, input, Date.now());
          after = next.tasks.find((t) => t.id === tarea);
          return next;
        });
        if (failure) return error(PHASE_ERROR_MESSAGES[failure]);
        const prevName = before?.phase ? (getPhase(before.phase.phaseId)?.name ?? before.phase.phaseId) : "sin fase";
        const next = getPhase(after!.phase!.phaseId)!;
        return text(`Tarea "${after!.title}": ${prevName} → ${next.name} (turno: ${next.turn})`);
      },
    );
  },
  { serverInfo: { name: "kanban", version: "1.0.0" } },
);

export { handler as GET, handler as POST, handler as DELETE };
