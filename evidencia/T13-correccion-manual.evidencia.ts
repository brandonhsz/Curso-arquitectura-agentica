import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp, tarjeta } from "./apoyo";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa } from "./senales";

// Video: una persona corrige la fase a mano desde el formulario (T13, T9).
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

const TITULO = "[evidencia] Corrección manual";

test.beforeEach(async ({ page }) => borrarEvidencias(page));
test.afterEach(async ({ page }) => borrarEvidencias(page));

test("video: corregir la fase a mano, con motivo obligatorio al retroceder", async ({ page }, testInfo) => {
  await mostrarCursor(page);
  await page.goto("/");
  const id = await crearTarea(page, TITULO);
  await mcp(page, "actualizar_fase", { tarea: id, fase: "sintesis", responsable: "Ana" });
  const card = tarjeta(page, TITULO);
  await expect(card.getByText("Agente trabajando")).toBeVisible({ timeout: 10_000 });

  await leyenda(page, "1. La tarjeta está en Síntesis. Abrimos el formulario para corregir la fase");
  await pausa(page);
  await card.getByText(TITULO, { exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar tarea" });
  await expect(dialogo).toBeVisible();

  const fase = dialogo.getByLabel("Fase");
  await expect(fase).toHaveValue("sintesis");
  await marcar(fase, "Fase actual precargada", { n: 1, posicion: "derecha" });
  await marcar(dialogo.getByLabel("Responsable"), "Responsable precargado", { n: 2, posicion: "derecha" });
  await pausa(page, 1500);
  await capturar(page, testInfo, "01-formulario-fase");
  await limpiar(page);

  await leyenda(page, "2. Elegimos una fase anterior (Intent): aparece el campo de motivo");
  await fase.selectOption({ label: "Intent" });
  const motivo = dialogo.getByLabel("Motivo del retroceso");
  await expect(motivo).toBeVisible();
  await marcar(motivo, "Motivo requerido al retroceder", { n: 3, tono: "ok", posicion: "derecha" });
  await pausa(page, 1500);
  await limpiar(page);

  await leyenda(page, "3. Guardamos sin motivo: el formulario lo impide y explica por qué");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  const alerta = dialogo.getByRole("alert");
  await expect(alerta).toBeVisible();
  await expect(dialogo).toBeVisible();
  await marcar(alerta, "Error claro, no se cierra", { n: 4, tono: "ok", posicion: "derecha" });
  await pausa(page, 1500);
  await capturar(page, testInfo, "02-error-sin-motivo");
  await limpiar(page);

  await leyenda(page, "4. Escribimos el motivo y guardamos");
  await motivo.fill("la intención cambió");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(dialogo).toBeHidden();
  // Modo autónomo: Intent es turno del agente (el único turno humano es "Aprobación final")
  await expect(card.getByText("1. Intent")).toBeVisible();
  await expect(card.getByText("Agente trabajando")).toBeVisible();
  await expect(card.getByText(/Regresó de Síntesis: la intención cambió/)).toBeVisible();
  await marcar(card.locator("[data-turn]"), "Fase corregida + retroceso visible", { n: 5, tono: "ok", posicion: "derecha" });
  await pausa(page, 1800);
  await capturar(page, testInfo, "03-fase-corregida");
  await limpiar(page);

  await leyenda(page, "5. Quitamos la fase: la tarjeta vuelve a ser una tarea normal");
  await card.getByText(TITULO, { exact: true }).click();
  await page.getByRole("dialog", { name: "Editar tarea" }).getByLabel("Fase").selectOption({ label: "Sin fase" });
  await page.getByRole("dialog", { name: "Editar tarea" }).getByRole("button", { name: "Guardar" }).click();
  await expect(card.locator("[data-turn]")).toHaveCount(0);
  await marcar(card, "Sin fase: sin badge", { n: 6, tono: "ok", posicion: "derecha" });
  await pausa(page, 1500);
  await capturar(page, testInfo, "04-sin-fase");
  await limpiar(page);
});
