import { expect, type Page } from "@playwright/test";

/**
 * Apoyo para evidencias del Bloque 3: hablar con el servidor MCP del tablero
 * como lo haría el agente, y crear/borrar tarjetas `[evidencia]` desde la UI.
 */

type McpResult = { isError?: boolean; content: { type: string; text: string }[] };

let rpcId = 1;

/** Llama una herramienta MCP (`tools/call`) y devuelve su resultado. */
export async function mcp(page: Page, name: string, args: Record<string, unknown>): Promise<McpResult> {
  const res = await page.request.post("/api/mcp", {
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name, arguments: args } },
  });
  const body = await res.text();
  const json = body.trimStart().startsWith("{")
    ? JSON.parse(body)
    : JSON.parse(
        body
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .pop() ?? "{}",
      );
  return json.result as McpResult;
}

export const texto = (r: McpResult) => r.content.map((c) => c.text).join("\n");

/** Busca el id de una tarea por su título exacto usando `listar_tareas`. */
export async function idDeTarea(page: Page, titulo: string): Promise<string> {
  const tareas = JSON.parse(texto(await mcp(page, "listar_tareas", {}))) as { id: string; titulo: string }[];
  const t = tareas.find((x) => x.titulo === titulo);
  if (!t) throw new Error(`No encontré la tarea "${titulo}"`);
  return t.id;
}

/** Crea una tarjeta desde la UI (estado por defecto) y devuelve su id. */
export async function crearTarea(page: Page, titulo: string): Promise<string> {
  await page.getByRole("button", { name: /^\+ Nueva tarea$/ }).click();
  await page.getByPlaceholder("¿Qué hay que hacer?").fill(titulo);
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(tarjeta(page, titulo)).toBeVisible();
  await expect.poll(() => idDeTarea(page, titulo).catch(() => null)).not.toBeNull();
  return idDeTarea(page, titulo);
}

/** La tarjeta del tablero (<article>) con ese título. */
export const tarjeta = (page: Page, titulo: string) =>
  page.locator("article").filter({ has: page.getByText(titulo, { exact: true }) });

/** Borra desde la UI todas las tarjetas cuyo título empieza con `[evidencia]`. */
export async function borrarEvidencias(page: Page) {
  await page.goto("/");
  // Espera a que el tablero termine de cargar antes de contar tarjetas.
  await expect(page.getByRole("heading", { name: "Tablero Kanban" })).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
  const pendientes = page.locator("article").filter({ hasText: "[evidencia]" });
  while ((await pendientes.count()) > 0) {
    const antes = await pendientes.count();
    await pendientes.first().click();
    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(pendientes).toHaveCount(antes - 1);
  }
  // El borrado en la UI es optimista: espera a que el servidor lo confirme.
  await expect
    .poll(async () => {
      const tareas = JSON.parse(texto(await mcp(page, "listar_tareas", {}))) as { titulo: string }[];
      return tareas.filter((t) => t.titulo.startsWith("[evidencia]")).length;
    })
    .toBe(0);
}
