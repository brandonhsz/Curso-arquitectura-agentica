import { reconciliarAgentes } from "@/lib/agente";
import { mutateBoard, readBoard } from "@/lib/db";

/** `true` si el proceso existe (la señal 0 solo comprueba, no mata). */
function estaVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // existe, pero de otro usuario
  }
}

export async function GET() {
  let board = await readBoard();
  // Agentes "trabajando" cuyo proceso murió (p. ej. el servidor se reinició) pasan a "detenido".
  if (reconciliarAgentes(board, estaVivo) !== board) {
    board = await mutateBoard((b) => reconciliarAgentes(b, estaVivo));
  }
  return Response.json(board, {
    headers: { "Cache-Control": "no-store" },
  });
}
