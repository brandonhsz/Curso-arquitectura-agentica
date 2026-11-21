import { expect, test } from "@playwright/test";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa } from "./senales";

// Bloque 3 · T3 + T4: panel de detalle al pasar el cursor (o enfocar) una tarjeta en "Por fases".
// Usa tarjetas "[evidencia]" sembradas en data/board.json de la app de este worktree (EVIDENCIA_URL).
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

const IMPL = "[evidencia] Exportar tareas a Excel";
const APROB = "[evidencia] Revisar cambio del tablero";
const MESA = "[evidencia] Idea de filtros por responsable";

test("video: detalle del estado al pasar el cursor en Por fases", async ({ page }, testInfo) => {
  await mostrarCursor(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Por fases" }).click();
  const tarjeta = (t: string) => page.locator("article").filter({ has: page.getByText(t, { exact: true }) });
  const panel = page.getByRole("tooltip");
  await expect(tarjeta(IMPL)).toBeVisible({ timeout: 15_000 });

  // 1. Sin cursor no hay panel
  await leyenda(page, "1. Vista «Por fases»: la tarjeta solo muestra título y badge; no hay panel");
  await expect(panel).toHaveCount(0);
  await pausa(page, 1200);

  // 2. Hover sobre una tarjeta en Implementación (agente falló + regresión activa)
  await tarjeta(IMPL).scrollIntoViewIfNeeded();
  await tarjeta(IMPL).hover();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Fase 7 de 11 · Bloque 2 de 5");
  await expect(panel).toContainText("Los agentes escriben las pruebas y el código");
  await expect(panel).toContainText("Agente (último reporte): falló");
  await expect(panel).toContainText("H1: el nombre de la fase se corta");
  await marcar(tarjeta(IMPL), "Cursor encima", { n: 1, tono: "info", posicion: "abajo" });
  await marcar(panel, "Detalle del estado", { n: 2, tono: "ok" });
  await leyenda(page, "2. Al pasar el cursor: qué pasa en la fase, avance, responsable, agente real, regresión y descripción");
  await pausa(page, 2500);
  await capturar(page, testInfo, "01-panel-implementacion");
  await limpiar(page);

  // 3. Al salir el cursor desaparece
  await page.mouse.move(640, 760);
  await expect(panel).toHaveCount(0);
  await leyenda(page, "3. Al salir el cursor el panel desaparece");
  await pausa(page, 1000);

  // 4. Mesa de diálogo: agente trabajando, sin descripción
  await tarjeta(MESA).hover();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Agente (último reporte): trabajando");
  await marcar(panel, "Agente trabajando · sin descripción", { n: 3, tono: "ok" });
  await leyenda(page, "4. Cada fase explica qué ocurre en ella; las secciones vacías no se muestran");
  await pausa(page, 2000);
  await capturar(page, testInfo, "02-panel-mesa");
  await limpiar(page);
  await page.mouse.move(640, 760);

  // 5. Última columna: el panel se abre a la izquierda para no cortarse
  await tarjeta(APROB).scrollIntoViewIfNeeded();
  await tarjeta(APROB).hover();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Turno humano · le toca a: Ana");
  await expect(panel).not.toContainText("Motivo viejo");
  const pc = (await panel.boundingBox())!;
  const tc = (await tarjeta(APROB).boundingBox())!;
  expect(pc.x + pc.width).toBeLessThanOrEqual(tc.x);
  await marcar(panel, "Se abre a la izquierda · turno humano", { n: 4, tono: "ok" });
  await leyenda(page, "5. En la última columna el panel se voltea; la regresión ya superada no aparece");
  await pausa(page, 2500);
  await capturar(page, testInfo, "03-panel-aprobacion-izquierda");
  await limpiar(page);
  await page.mouse.move(640, 760);
  await expect(panel).toHaveCount(0);

  // 6. Teclado: foco muestra el panel; Escape lo oculta
  await tarjeta(MESA).focus();
  await expect(panel).toBeVisible();
  await marcar(tarjeta(MESA), "Foco con teclado", { n: 5, tono: "ok", posicion: "abajo" });
  await leyenda(page, "6. Con teclado: al enfocar la tarjeta aparece el panel…");
  await pausa(page, 1800);
  await capturar(page, testInfo, "04-teclado-foco");
  await limpiar(page);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await leyenda(page, "…y Escape lo oculta sin abrir el editor");
  await pausa(page, 1500);
  await capturar(page, testInfo, "05-teclado-escape");
});
