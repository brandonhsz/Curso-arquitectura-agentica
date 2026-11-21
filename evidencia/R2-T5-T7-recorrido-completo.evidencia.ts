import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp } from "./apoyo";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa } from "./senales";

// Recorrido 2 · Video: el agente lleva una tarjeta por los 10 pasos y salta sola de columna (T1, T5, T7).
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });
test.setTimeout(180_000);

const TITULO = "[evidencia] Recorrido por fases";

test.beforeEach(async ({ page }) => borrarEvidencias(page));
test.afterEach(async ({ page }) => borrarEvidencias(page));

const PASOS: { fase: string; columna: string; extra?: Record<string, string> }[] = [
  { fase: "intent", columna: "Intent", extra: { responsable: "Ana" } },
  { fase: "idea", columna: "Desarrollo de la idea" },
  { fase: "mesa", columna: "Mesa de diálogo" },
  { fase: "sintesis", columna: "Síntesis" },
  { fase: "respuesta", columna: "Respuesta del usuario" },
  { fase: "consolidada", columna: "Idea consolidada" },
  { fase: "implementacion", columna: "Implementación" },
  { fase: "analisis", columna: "Análisis con evidencias" },
  { fase: "validacion", columna: "Validación" },
];

test("video: la tarjeta recorre las columnas de los 5 bloques", async ({ page }, testInfo) => {
  await mostrarCursor(page);
  await page.goto("/");
  const id = await crearTarea(page, TITULO);
  await page.getByRole("tab", { name: "Por fases" }).click();
  const columna = (n: string) => page.getByRole("region", { name: n });
  await expect(columna("Sin fase").getByText(TITULO)).toBeVisible();

  let i = 0;
  for (const paso of PASOS) {
    i++;
    await mcp(page, "actualizar_fase", { tarea: id, fase: paso.fase, ...paso.extra });
    const card = columna(paso.columna).getByText(TITULO, { exact: true });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await leyenda(page, `${i}. El agente llama actualizar_fase("${paso.fase}") → la tarjeta pasa a "${paso.columna}"`);
    await marcar(columna(paso.columna), paso.columna, { n: i, tono: "ok", posicion: "abajo" });
    await pausa(page, 1200);
    if (["consolidada", "validacion"].includes(paso.fase)) await capturar(page, testInfo, `0${i}-${paso.fase}`);
    await limpiar(page);
  }

  // Bloque 4 → vuelta a corregir: retroceso con el hallazgo como motivo
  const sinMotivo = await mcp(page, "actualizar_fase", { tarea: id, fase: "implementacion" });
  expect(sinMotivo.isError).toBe(true);
  await mcp(page, "actualizar_fase", { tarea: id, fase: "implementacion", motivo: "H1: el contador no se actualiza" });
  const impl = columna("Implementación");
  await expect(impl.getByText(/Regresó de Validación: H1: el contador no se actualiza/)).toBeVisible({ timeout: 10_000 });
  await leyenda(page, "10. Validación encontró un hallazgo: vuelve a Implementación con el hallazgo como motivo");
  await marcar(impl.locator("article").filter({ hasText: TITULO }), "Vuelta con motivo = hallazgo", { n: 10, tono: "ok", posicion: "abajo" });
  await pausa(page, 2000);
  await capturar(page, testInfo, "10-vuelta-con-hallazgo");
  await limpiar(page);

  // Cierre: avanza otra vez y se entrega
  for (const fase of ["analisis", "validacion", "evidencia_final"]) {
    await mcp(page, "actualizar_fase", { tarea: id, fase });
  }
  const final = columna("Evidencia final");
  await expect(final.getByText(TITULO, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/esperando a un humano/)).toHaveCount(0);
  await leyenda(page, "11. Corregido y validado: se entrega la evidencia final, ya no le toca a nadie");
  await marcar(final, "Evidencia final", { n: 11, tono: "ok", posicion: "abajo" });
  await pausa(page, 2000);
  await capturar(page, testInfo, "11-evidencia-final");
  await limpiar(page);
});
