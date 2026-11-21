import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp } from "./apoyo";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa, portada } from "./senales";

// Bloque 5 · Evidencia final (feature, recorrido 2): las fases del flujo como columnas en "Por fases".
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });
test.setTimeout(240_000);

const TAREA = "[evidencia] Nueva función del equipo";
const OTRA = "[evidencia] Esperando aprobación";

test.beforeEach(async ({ page }) => borrarEvidencias(page));
test.afterEach(async ({ page }) => borrarEvidencias(page));

test("final: las tareas avanzan por columnas con los pasos del flujo", async ({ page }, testInfo) => {
  await mostrarCursor(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tablero Kanban" })).toBeVisible();

  await portada(
    page,
    "Que el equipo vea las tareas avanzar por columnas con cada paso del flujo",
    ["Tipo: feature", "Nueva vista «Por fases»: 11 pasos de los 5 bloques, junto a las columnas de siempre"],
    4000,
  );

  const columna = (n: string) => page.getByRole("region", { name: n });
  const tab = (n: string) => page.getByRole("tab", { name: n });

  // 1. Las columnas de siempre siguen ahí
  await leyenda(page, "1. Creamos dos tareas: el tablero de siempre (Por hacer / En progreso / Hecho) no cambia");
  const id = await crearTarea(page, TAREA);
  const id2 = await crearTarea(page, OTRA);
  // Modo autónomo: la única fase de turno humano es "Aprobación final"
  await mcp(page, "actualizar_fase", { tarea: id2, fase: "aprobacion_final", responsable: "Ana" });
  await marcar(page.getByRole("heading", { name: "Por hacer" }), "Columnas actuales intactas", { n: 1, tono: "ok", posicion: "derecha" });
  await pausa(page, 2200);
  await capturar(page, testInfo, "01-tablero-de-siempre");
  await limpiar(page);

  // 2. Pestaña Por fases (T8, T6)
  await leyenda(page, "2. La pestaña nueva «Por fases» muestra una columna por paso, agrupadas por bloque");
  await tab("Por fases").click();
  await expect(columna("Sin fase").getByText(TAREA)).toBeVisible();
  await marcar(tab("Por fases"), "Pestaña nueva", { n: 2, tono: "ok", posicion: "abajo" });
  await marcar(columna("Sin fase"), "La tarea aún no entra al flujo", { n: 3, tono: "ok", posicion: "abajo" });
  await pausa(page, 2500);
  await capturar(page, testInfo, "02-por-fases");
  await limpiar(page);

  // 3. El agente recorre el Bloque 1 (T1, T5, T7)
  const pasos: [string, string, string][] = [
    ["intent", "Intent", "3. El agente registra el Intent: la tarjeta salta a «Intent» (turno del agente)"],
    ["mesa", "Mesa de diálogo", "4. Mesa de diálogo: turno del agente"],
    ["respuesta", "Respuesta del usuario", "5. Síntesis lista: en modo autónomo la respuesta también es del agente"],
    ["consolidada", "Idea consolidada", "6. Idea consolidada: el agente sigue sin esperar a nadie (turno del agente)"],
  ];
  let n = 4;
  for (const [fase, nombre, texto] of pasos) {
    await mcp(page, "actualizar_fase", { tarea: id, fase, responsable: "Ana" });
    await expect(columna(nombre).getByText(TAREA, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(columna(nombre).getByText("turno del agente")).toBeVisible();
    await leyenda(page, texto);
    await marcar(columna(nombre), nombre, { n: n++, tono: "ok", posicion: "abajo" });
    await pausa(page, 1800);
    if (fase === "consolidada") await capturar(page, testInfo, "03-consolidada-turno-agente");
    await limpiar(page);
  }

  // 4. Bloques 2-4 con una vuelta de validación (T1, T7)
  await mcp(page, "actualizar_fase", { tarea: id, fase: "implementacion" });
  await expect(columna("Implementación").getByText(TAREA, { exact: true })).toBeVisible({ timeout: 10_000 });
  await leyenda(page, "7. Plan aprobado: la tarjeta pasa a Implementación (Bloque 2)");
  await marcar(columna("Implementación"), "Implementación", { n: n++, tono: "ok", posicion: "abajo" });
  await pausa(page, 1800);
  await limpiar(page);

  await mcp(page, "actualizar_fase", { tarea: id, fase: "analisis" });
  await mcp(page, "actualizar_fase", { tarea: id, fase: "validacion" });
  await expect(columna("Validación").getByText(TAREA, { exact: true })).toBeVisible({ timeout: 10_000 });
  await leyenda(page, "8. Análisis con evidencias → Validación (Bloques 3 y 4)");
  await marcar(columna("Validación"), "Validación", { n: n++, tono: "ok", posicion: "abajo" });
  await pausa(page, 1800);
  await limpiar(page);

  await mcp(page, "actualizar_fase", { tarea: id, fase: "implementacion", motivo: "H1: un nombre de columna se corta" });
  const impl = columna("Implementación");
  await expect(impl.getByText(/Regresó de Validación: H1: un nombre de columna se corta/)).toBeVisible({ timeout: 10_000 });
  await leyenda(page, "9. Validación encontró un hallazgo: vuelve a Implementación con el hallazgo como motivo");
  await marcar(impl.locator("article").filter({ hasText: TAREA }), "Vuelta con el hallazgo visible", { n: n++, tono: "ok", posicion: "abajo" });
  await pausa(page, 2500);
  await capturar(page, testInfo, "04-vuelta-con-hallazgo");
  await limpiar(page);

  // 5. Entrega (Bloque 5)
  for (const fase of ["analisis", "validacion", "evidencia_final"]) await mcp(page, "actualizar_fase", { tarea: id, fase });
  await expect(columna("Evidencia final").getByText(TAREA, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(columna("Evidencia final").getByText("turno del agente")).toBeVisible();
  await leyenda(page, "10. Corregido y validado: Evidencia final (Bloque 5), todavía turno del agente");
  await marcar(columna("Evidencia final"), "Evidencia final", { n: n++, tono: "ok", posicion: "abajo" });
  await pausa(page, 2200);
  await capturar(page, testInfo, "05-evidencia-final");
  await limpiar(page);

  // Aprobación final: el único turno humano (y el contador lo refleja)
  await mcp(page, "actualizar_fase", { tarea: id, fase: "aprobacion_final" });
  const aprobacion = columna("Aprobación final");
  await expect(aprobacion.getByText(TAREA, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(aprobacion.getByText("turno humano")).toBeVisible();
  await expect(page.getByRole("region").getByText("turno humano", { exact: true })).toHaveCount(1);
  await expect(page.getByText("2 esperando a un humano")).toBeVisible();
  await leyenda(page, "11. Aprobación final: la única columna de turno humano; el contador muestra quién espera");
  await marcar(aprobacion, "Aprobación final · turno humano", { n: n++, tono: "ok", posicion: "abajo" });
  await marcar(page.getByText(/esperando a un humano/), "Contador de espera humana", { n: n++, tono: "ok", posicion: "derecha" });
  await pausa(page, 2200);
  await capturar(page, testInfo, "05b-aprobacion-final-turno-humano");
  await limpiar(page);

  // 6. Clic abre el formulario (T8)
  await leyenda(page, "12. Desde la vista, un clic en la tarjeta abre el formulario para corregir a mano");
  await aprobacion.getByText(TAREA, { exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar tarea" });
  await expect(dialogo.getByLabel("Fase")).toHaveValue("aprobacion_final");
  await marcar(dialogo.getByLabel("Fase"), "Fase actual", { n: n++, tono: "ok", posicion: "derecha" });
  await pausa(page, 2200);
  await capturar(page, testInfo, "06-formulario");
  await limpiar(page);
  await dialogo.getByRole("button", { name: "Cancelar" }).click();

  // 7. Conviven: de vuelta al tablero de siempre
  await leyenda(page, "13. Las dos vistas conviven: en «Tablero» la tarea sigue en su columna semanal");
  await tab("Tablero").click();
  const card = page.locator("article").filter({ hasText: TAREA });
  await expect(card).toBeVisible();
  await marcar(card, "Misma tarea, columna semanal", { n: n++, tono: "ok", posicion: "derecha" });
  await pausa(page, 2500);
  await capturar(page, testInfo, "07-conviven");
  await limpiar(page);

  await portada(
    page,
    "Resultado",
    [
      "T1 ✅ 11 pasos de los 5 bloques, con turno de cada uno",
      "T5 ✅ Agrupación de tareas por fase (Sin fase + 11)",
      "T6 ✅ Vista «Por fases»: columnas por paso y bloque",
      "T7 ✅ El agente mueve la tarjeta con actualizar_fase en todo el flujo",
      "T8 ✅ Pestaña nueva; clic abre el formulario; Tablero y Lista intactos",
      "T9 ✅ Protocolo de los Bloques 2-5 en CLAUDE.md (sin pantalla)",
      "Bloque 4 ✅ Nombres de columna completos y etiquetas sin palabras partidas",
    ],
    5500,
  );
});
