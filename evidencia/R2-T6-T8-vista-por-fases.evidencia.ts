import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp } from "./apoyo";
import { capturar, leyenda, limpiar, marcar } from "./senales";

// Recorrido 2 · Captura: la pestaña "Por fases" (T6, T8). Crea tarjetas "[evidencia]" y las borra al final.

const HUMANO = "[evidencia] Esperando a Ana";
const IMPL = "[evidencia] En implementación";
const VALID = "[evidencia] Corrigiendo hallazgo";
const FINAL = "[evidencia] Entregada";

test.beforeEach(async ({ page }) => borrarEvidencias(page));
test.afterEach(async ({ page }) => borrarEvidencias(page));

test("captura: vista Por fases con columnas por paso y bloque", async ({ page }, testInfo) => {
  await page.goto("/");
  const ids = {
    humano: await crearTarea(page, HUMANO),
    impl: await crearTarea(page, IMPL),
    valid: await crearTarea(page, VALID),
    final: await crearTarea(page, FINAL),
  };
  await mcp(page, "actualizar_fase", { tarea: ids.humano, fase: "aprobacion_final", responsable: "Ana" });
  await mcp(page, "actualizar_fase", { tarea: ids.impl, fase: "implementacion", responsable: "Beto" });
  await mcp(page, "actualizar_fase", { tarea: ids.valid, fase: "validacion", responsable: "Luis" });
  await mcp(page, "actualizar_fase", {
    tarea: ids.valid,
    fase: "implementacion",
    motivo: "H1: el nombre de la fase se corta",
  });
  await mcp(page, "actualizar_fase", { tarea: ids.final, fase: "evidencia_final", responsable: "Ana" });

  await page.getByRole("tab", { name: "Por fases" }).click();
  await expect(page.getByRole("tab", { name: "Por fases" })).toHaveAttribute("aria-selected", "true");
  const columna = (n: string) => page.getByRole("region", { name: n });
  await expect(columna("Implementación").getByText(IMPL)).toBeVisible({ timeout: 10_000 });

  // 1. Bloque 1: pestaña, encabezado de bloque, columna humana con su tarjeta
  await marcar(page.getByRole("tab", { name: "Por fases" }), "Pestaña nueva", { n: 1, tono: "ok", posicion: "abajo" });
  await marcar(columna("Sin fase"), "Tareas fuera del flujo", { n: 2, tono: "info", posicion: "abajo" });
  await marcar(columna("Intent"), "Columna por paso, bajo «Bloque 1 · Idea»", { n: 3, tono: "ok", posicion: "abajo" });
  await leyenda(page, "Por fases (1/2): Bloque 1, una columna por paso; las tareas sin fase quedan aparte");
  await capturar(page, testInfo, "01-por-fases-bloque-1");
  await limpiar(page);

  // Modo autónomo: "Idea consolidada" ya es del agente; la única columna humana es "Aprobación final"
  await expect(columna("Idea consolidada").getByText("turno del agente")).toBeVisible();
  const aprobacion = columna("Aprobación final");
  await expect(aprobacion.getByText(HUMANO)).toBeVisible();
  await expect(aprobacion.getByText("turno humano")).toBeVisible();
  await expect(page.getByRole("region").getByText("turno humano", { exact: true })).toHaveCount(1);
  await marcar(aprobacion, "Único turno humano", { n: 4, tono: "ok", posicion: "abajo" });
  await leyenda(page, "La aprobación final es la única columna de turno humano: te toca");
  await capturar(page, testInfo, "02-aprobacion-final-turno-humano");
  await limpiar(page);

  // 2. Bloques 2-5
  const impl = columna("Implementación");
  await expect(impl.getByText(VALID)).toBeVisible();
  await expect(impl.getByText(/Regresó de Validación: H1: el nombre de la fase se corta/)).toBeVisible();
  await expect(columna("Evidencia final").getByText(FINAL)).toBeVisible();
  await expect(columna("Evidencia final").getByText("turno del agente")).toBeVisible();
  // Desplaza primero hasta el final para que ambas señales queden sobre sus columnas
  await columna("Evidencia final").scrollIntoViewIfNeeded();
  await marcar(impl, "Implementación (turno del agente)", { n: 5, tono: "ok", posicion: "abajo" });
  await marcar(columna("Evidencia final"), "Entregada: turno del agente", { n: 6, tono: "ok", posicion: "abajo" });
  await leyenda(page, "Por fases (2/2): Bloques 2-5; la vuelta de Validación muestra el hallazgo como motivo");
  await capturar(page, testInfo, "03-por-fases-bloques-2-5");
  await limpiar(page);

  // 3. Nombres de columna legibles (sin cortar)
  const cortados = await page
    .getByRole("region")
    .getByRole("heading", { level: 2 })
    .evaluateAll((hs) => hs.filter((h) => h.scrollWidth > h.clientWidth).map((h) => h.textContent));
  if (cortados.length === 0) {
    await marcar(columna("Análisis con evidencias").getByRole("heading"), "Nombre completo", { tono: "ok", posicion: "abajo" });
    await leyenda(page, "Todos los nombres de columna se leen completos");
    await capturar(page, testInfo, "04-nombres-columnas");
    await limpiar(page);
  }
  for (const [i, nombre] of cortados.entries()) {
    const h = page.getByRole("heading", { level: 2, name: nombre ?? "" });
    await marcar(h, "Nombre cortado", { n: i + 1, tono: "error", posicion: "abajo" });
    await leyenda(page, `Hallazgo ${i + 1}/${cortados.length}: el nombre de la columna "${nombre}" no se lee completo`);
    await capturar(page, testInfo, `04-nombre-cortado-${i + 1}`);
    await limpiar(page);
  }

  // 3b. Hallazgo H2: ninguna palabra de las etiquetas se parte a la mitad dentro de la vista
  const partidas = await page.getByRole("region").locator("[data-turn]").evaluateAll((badges) => {
    const rotas: string[] = [];
    for (const b of badges) {
      const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const texto = n.textContent ?? "";
        for (const m of texto.matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, m.index!);
          r.setEnd(n, m.index! + m[0].length);
          const lineas = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
          if (lineas.size > 1) rotas.push(m[0]);
        }
      }
    }
    return rotas;
  });
  const badgeImpl = impl.locator("article").filter({ hasText: IMPL }).locator("[data-turn]");
  await marcar(badgeImpl, partidas.length ? `Palabras partidas: ${[...new Set(partidas)].join(", ")}` : "Sin palabras partidas", {
    n: 1,
    tono: partidas.length ? "error" : "ok",
    posicion: "abajo",
  });
  await leyenda(page, partidas.length ? "Hallazgo H2: la etiqueta parte palabras en columnas angostas" : "Las etiquetas se leen sin partir palabras");
  await capturar(page, testInfo, "04b-etiqueta-en-columna");
  await limpiar(page);

  // 4. Clic en una tarjeta abre el formulario
  await impl.getByText(IMPL, { exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar tarea" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByLabel("Fase")).toHaveValue("implementacion");
  await marcar(dialogo.getByLabel("Fase"), "Abre el formulario con la fase", { n: 7, tono: "ok", posicion: "derecha" });
  await leyenda(page, "Clic en una tarjeta de la vista: abre el mismo formulario de edición");
  await capturar(page, testInfo, "05-clic-abre-formulario");
  await limpiar(page);
  await dialogo.getByRole("button", { name: "Cancelar" }).click();

  expect(cortados, "los nombres de columna deben leerse completos").toEqual([]);
  expect(partidas, "las etiquetas no deben partir palabras a la mitad").toEqual([]);
});
