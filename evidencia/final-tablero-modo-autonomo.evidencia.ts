import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp, tarjeta, texto } from "./apoyo";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa, portada } from "./senales";

// Recorrido "tablero-modo-autonomo" · Bloques 3 y 5.
// El agente mueve la tarjeta por el flujo autónomo vía MCP; solo "Aprobación final" es turno humano.
// Crea una tarjeta "[evidencia]" y la borra al final.
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

const TITULO = "[evidencia] Modo autónomo";

test("final: el tablero refleja el modo autónomo", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await mostrarCursor(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tablero Kanban" })).toBeVisible();
  await portada(page, "El tablero refleja el modo autónomo", [
    "Tipo: feature",
    "Todo el flujo es turno del agente; solo la aprobación final le toca a una persona",
  ]);

  const id = await crearTarea(page, TITULO);

  // 1. Intent: antes era turno humano, ahora trabaja el agente.
  expect(texto(await mcp(page, "actualizar_fase", { tarea: id, fase: "intent", responsable: "Ana" }))).toContain("turno: agente");
  const card = tarjeta(page, TITULO);
  await expect(card.getByText("Agente trabajando")).toBeVisible();
  await marcar(card, "Intent: Agente trabajando", { n: 1, tono: "ok" });
  await leyenda(page, "1. El agente arranca desde el Intent: ya no dice \"Te toca\"");
  await capturar(page, testInfo, "01-intent-agente");
  await pausa(page, 1500);
  await limpiar(page);

  // 2. Fases intermedias y evidencia final: todas del agente.
  for (const fase of ["idea", "mesa", "sintesis", "respuesta", "consolidada", "implementacion", "analisis", "validacion", "evidencia_final"]) {
    expect(texto(await mcp(page, "actualizar_fase", { tarea: id, fase }))).toContain("turno: agente");
  }
  await expect(card.getByText("Agente trabajando")).toBeVisible();
  await marcar(card, "Evidencia final: sigue el agente", { n: 2, tono: "ok" });
  await leyenda(page, "2. Recorre idea → … → evidencia final sin pedir nada a una persona");
  await capturar(page, testInfo, "02-evidencia-final-agente");
  await pausa(page, 1500);
  await limpiar(page);

  // 3. Aprobación final: el único turno humano.
  expect(texto(await mcp(page, "actualizar_fase", { tarea: id, fase: "aprobacion_final" }))).toContain("turno: humano");
  await expect(card.getByText("Te toca: Ana")).toBeVisible();
  await marcar(card, "Aprobación final: Te toca", { n: 3, tono: "ok" });
  await leyenda(page, "3. Solo en la aprobación final la tarjeta dice \"Te toca: Ana\"");
  await capturar(page, testInfo, "03-aprobacion-final-humano");
  await pausa(page, 1500);
  await limpiar(page);

  // 4. Vista "Por fases": la columna humana es la única resaltada.
  await page.getByRole("tab", { name: "Por fases" }).click();
  const columna = page.getByRole("region", { name: "Aprobación final" });
  await expect(columna.getByText("turno humano")).toBeVisible();
  await expect(page.getByText("turno humano")).toHaveCount(1);
  await columna.scrollIntoViewIfNeeded();
  await marcar(columna, "Única columna de turno humano", { n: 4, tono: "ok" });
  await leyenda(page, "4. En \"Por fases\", \"Aprobación final\" es la única columna de turno humano");
  await capturar(page, testInfo, "04-por-fases-columna-humana");
  await pausa(page, 1800);
  await limpiar(page);

  // 5. Rechazo: regresa a implementación con el motivo.
  expect(
    texto(await mcp(page, "actualizar_fase", { tarea: id, fase: "implementacion", motivo: "Rechazado: falta ajustar el texto" })),
  ).toContain("turno: agente");
  await page.getByRole("tab", { name: "Tablero" }).click();
  await expect(card.getByText(/Regresó de Aprobación final/)).toBeVisible();
  await marcar(card, "Rechazo: vuelve al agente con motivo", { n: 5, tono: "ok" });
  await leyenda(page, "5. Si la persona rechaza, la tarjeta vuelve al agente con el motivo visible");
  await capturar(page, testInfo, "05-rechazo-con-motivo");
  await pausa(page, 1800);
  await limpiar(page);

  await portada(page, "Resultado", [
    "Intent → Evidencia final: turno del agente ✅",
    "Aprobación final: único turno humano ✅",
    "Rechazo regresa al agente con motivo ✅",
  ]);

  await borrarEvidencias(page);
});
