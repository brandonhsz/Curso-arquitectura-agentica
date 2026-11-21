import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp, tarjeta, texto } from "./apoyo";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa } from "./senales";

// Video: el agente cambia la fase por MCP y el tablero se actualiza solo (T10, T9, T8).
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

const TITULO = "[evidencia] Flujo del agente";

test.beforeEach(async ({ page }) => borrarEvidencias(page));
test.afterEach(async ({ page }) => borrarEvidencias(page));

test("video: el agente recorre el grafo y la tarjeta lo refleja", async ({ page }, testInfo) => {
  await mostrarCursor(page);
  await page.goto("/");
  await leyenda(page, "0. Creamos una tarjeta de prueba");
  const id = await crearTarea(page, TITULO);
  const card = tarjeta(page, TITULO);
  const badge = card.locator("[data-turn]");

  // 1. Intent
  await leyenda(page, "1. El agente registra el Intent vía MCP: actualizar_fase(fase: intent, responsable: Ana)");
  await mcp(page, "actualizar_fase", { tarea: id, fase: "intent", responsable: "Ana" });
  await expect(card.getByText("Te toca: Ana")).toBeVisible({ timeout: 10_000 });
  await marcar(badge, "Turno humano", { n: 1, tono: "ok", posicion: "derecha" });
  await pausa(page, 1500);
  await capturar(page, testInfo, "01-intent-te-toca");
  await limpiar(page);

  // 2. Mesa de diálogo
  await leyenda(page, "2. El agente lanza la mesa de diálogo: fase = mesa (turno del agente)");
  await mcp(page, "actualizar_fase", { tarea: id, fase: "mesa" });
  await expect(card.getByText("Agente trabajando")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/esperando a un humano/)).toHaveCount(0);
  await marcar(badge, "Agente trabajando", { n: 2, tono: "ok", posicion: "derecha" });
  await pausa(page, 1500);
  await capturar(page, testInfo, "02-mesa-agente");
  await limpiar(page);

  // 3. Respuesta del usuario
  await mcp(page, "actualizar_fase", { tarea: id, fase: "Respuesta del usuario" });
  await expect(card.getByText("Te toca: Ana")).toBeVisible({ timeout: 10_000 });
  await leyenda(page, "3. Síntesis presentada: vuelve el turno humano (fase por nombre, sin importar mayúsculas)");
  await marcar(badge, "Te toca de nuevo", { n: 3, tono: "ok", posicion: "derecha" });
  await pausa(page, 1500);
  await limpiar(page);

  // 4. Retroceso sin motivo: rechazado
  const rechazo = await mcp(page, "actualizar_fase", { tarea: id, fase: "idea" });
  expect(rechazo.isError).toBe(true);
  await leyenda(page, `4. Retroceso sin motivo → rechazado: "${texto(rechazo)}"`);
  await expect(card.getByText("Respuesta del usuario")).toBeVisible();
  await marcar(badge, "Sin cambios", { n: 4, tono: "ok", posicion: "derecha" });
  await pausa(page, 2000);
  await capturar(page, testInfo, "03-retroceso-sin-motivo-rechazado");
  await limpiar(page);

  // 5. Retroceso con motivo
  await mcp(page, "actualizar_fase", { tarea: id, fase: "idea", motivo: "quedan dudas sobre quién responde" });
  await expect(card.getByText(/Regresó de Respuesta del usuario: quedan dudas sobre quién responde/)).toBeVisible({
    timeout: 10_000,
  });
  await leyenda(page, "5. Retroceso con motivo: la tarjeta muestra el feedback al equipo");
  await marcar(badge, "Retroceso visible con su motivo", { n: 5, tono: "ok", posicion: "derecha" });
  await pausa(page, 2000);
  await capturar(page, testInfo, "04-retroceso-con-motivo");
  await limpiar(page);
});
