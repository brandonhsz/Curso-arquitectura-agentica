import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp, tarjeta } from "./apoyo";
import { capturar, leyenda, limpiar, marcar } from "./senales";

// Captura: cómo se ven las fases en el tablero y en la lista (T8, T11, T12).
// Crea 3 tarjetas "[evidencia]" y las borra al final.

const HUMANO = "[evidencia] Turno humano";
const AGENTE = "[evidencia] Turno agente";
const RETRO = "[evidencia] Con retroceso";

test.beforeEach(async ({ page }) => borrarEvidencias(page));
test.afterEach(async ({ page }) => borrarEvidencias(page));

test("captura: badge de fase, turno y contador de espera humana", async ({ page }, testInfo) => {
  await page.goto("/");
  const idHumano = await crearTarea(page, HUMANO);
  const idAgente = await crearTarea(page, AGENTE);
  const idRetro = await crearTarea(page, RETRO);

  await mcp(page, "actualizar_fase", { tarea: idHumano, fase: "idea", responsable: "Ana" });
  await mcp(page, "actualizar_fase", { tarea: idAgente, fase: "mesa", responsable: "Beto" });
  await mcp(page, "actualizar_fase", { tarea: idRetro, fase: "sintesis", responsable: "Luis" });
  await mcp(page, "actualizar_fase", { tarea: idRetro, fase: "idea", motivo: "faltan datos del equipo" });

  // El tablero se refresca solo (sondeo cada 2 s)
  const contador = page.getByText("2 esperando a un humano");
  await expect(contador).toBeVisible({ timeout: 10_000 });
  await expect(tarjeta(page, HUMANO).getByText("Te toca: Ana")).toBeVisible();
  await expect(tarjeta(page, AGENTE).getByText("Agente trabajando")).toBeVisible();
  await expect(tarjeta(page, RETRO).getByText(/Regresó de Síntesis: faltan datos del equipo/)).toBeVisible();

  await marcar(contador, "Contador: 2 tareas esperan a un humano", { n: 1, tono: "ok", posicion: "derecha" });
  await marcar(tarjeta(page, HUMANO).locator("[data-turn]"), "Turno humano: te toca Ana", { n: 2, tono: "ok", posicion: "derecha" });
  await marcar(tarjeta(page, AGENTE).locator("[data-turn]"), "Turno del agente", { n: 3, tono: "ok", posicion: "derecha" });
  await marcar(tarjeta(page, RETRO).locator("[data-turn]"), "Retroceso con motivo", { n: 4, tono: "ok", posicion: "derecha" });
  await leyenda(page, "Tablero: cada tarjeta muestra su fase, de quién es el turno y el último retroceso");
  await capturar(page, testInfo, "01-tablero-fases");
  await limpiar(page);

  // Hallazgo: en la tarjeta (18rem) el nombre de la fase se corta con "…"
  const nombreFase = tarjeta(page, HUMANO).getByText("2. Desarrollo de la idea");
  const cortado = await nombreFase.evaluate((el) => el.scrollWidth > el.clientWidth);
  await marcar(nombreFase, cortado ? "Nombre de fase cortado" : "Nombre de fase completo", {
    n: 1,
    tono: cortado ? "error" : "ok",
    posicion: "derecha",
  });
  await leyenda(page, cortado ? "Hallazgo: el nombre de la fase no cabe en la tarjeta y se corta" : "El nombre de la fase cabe completo");
  await capturar(page, testInfo, "01b-nombre-fase-cortado");
  await limpiar(page);
  // Criterio (hallazgo H1, ronda 1): el nombre completo de la fase se lee en la tarjeta
  expect(cortado, "el nombre de la fase no debe cortarse en la tarjeta").toBe(false);

  await page.getByRole("tab", { name: "Lista" }).click();
  const fila = page.locator("li").filter({ hasText: HUMANO });
  await expect(fila.getByText("Te toca: Ana")).toBeVisible();
  await marcar(fila.locator("[data-turn]"), "La vista de lista también muestra la fase", { n: 1, tono: "ok" });
  await leyenda(page, "Lista: la misma información de fase en cada fila");
  await capturar(page, testInfo, "02-lista-fases");
  await limpiar(page);
});
