import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp, texto } from "./apoyo";
import { leerConOpenpyxl, mostrarHoja } from "./excel";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa, portada } from "./senales";

// Video final (Bloque 5, feature): exportar las tareas a Excel.
// Requiere EXCEL_LECTOR_PY (python con openpyxl). Crea 2 tarjetas "[evidencia]" y las borra al final.

test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

const ANALISIS = "[evidencia] Analizar tiempos de entrega, Q4";
const FORMULA = "[evidencia] =SUMA(1;2)";

test.beforeEach(async ({ page }) => borrarEvidencias(page));
test.afterEach(async ({ page }) => borrarEvidencias(page));

test("final: exportar las tareas a Excel para analizarlas fuera", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await mostrarCursor(page);
  await page.goto("/");
  await crearTarea(page, FORMULA);
  const id = await crearTarea(page, ANALISIS);

  await portada(page, "Exportar las tareas a Excel para analizarlas fuera de la app", [
    "Tipo: feature",
    "Un botón descarga todas las tareas en un .xlsx real, listo para filtrar y agrupar",
  ]);
  await page.goto("/");
  await expect(page.getByText(ANALISIS)).toBeVisible();

  // 1. Dónde está el botón
  const boton = page.getByRole("button", { name: "Exportar a Excel" });
  await leyenda(page, "El botón «Exportar a Excel» vive en la cabecera, con cualquier vista activa");
  await marcar(boton, "Exportar a Excel", { n: 1, tono: "ok" });
  await pausa(page, 1800);
  await capturar(page, testInfo, "01-boton");
  await limpiar(page);

  // 2. Un agente cambia la fase justo antes de exportar: el archivo trae el dato del servidor
  await mcp(page, "actualizar_fase", { tarea: id, fase: "implementacion", responsable: "Ana" });
  await leyenda(page, "Un agente acaba de mover una tarea a «Implementación»; exportamos enseguida");
  await pausa(page, 600);
  const [descarga] = await Promise.all([page.waitForEvent("download"), boton.click()]);
  const nombre = descarga.suggestedFilename();
  const tareas = JSON.parse(texto(await mcp(page, "listar_tareas", {}))) as unknown[];
  const aviso = page.getByRole("status").filter({ hasText: "exportada" });
  await expect(aviso).toHaveText(`${tareas.length} tareas exportadas`);
  await marcar(aviso, "Aviso de descarga", { n: 2, tono: "ok", posicion: "derecha" });
  await leyenda(page, `Se descargó «${nombre}» y el aviso confirma cuántas tareas trae`);
  await pausa(page, 2000);
  await capturar(page, testInfo, "02-aviso");
  await limpiar(page);

  // 3. El archivo, abierto con un lector de Excel independiente
  const ruta = testInfo.outputPath(nombre);
  await descarga.saveAs(ruta);
  const hoja = leerConOpenpyxl(ruta);
  const filas = hoja.filas.slice(1);
  const fila = (titulo: string) => filas.findIndex((f) => f[0].v === titulo) + 2;
  expect(filas[fila(ANALISIS) - 2].map((c) => c.v).slice(2, 5)).toEqual(["Por hacer", "Implementación", "Ana"]);
  expect(filas[fila(FORMULA) - 2][0].tipo).toBe("s");

  await mostrarHoja(page, nombre, hoja);
  await leyenda(page, "El .xlsx abre como hoja «Tareas»: una fila por tarea con nombres legibles");
  await marcar(page.locator('tr[data-fila="1"]'), "Columnas para analizar", { n: 3, tono: "ok", posicion: "derecha" });
  await pausa(page, 1600);
  await marcar(page.locator(`tr[data-fila="${fila(ANALISIS)}"]`), "Fase y responsable al día", {
    n: 4,
    tono: "ok",
    posicion: "derecha",
  });
  await pausa(page, 1600);
  await marcar(page.locator(`tr[data-fila="${fila(FORMULA)}"] [data-col="A"]`), "Texto intacto, nunca fórmula", {
    n: 5,
    tono: "ok",
    posicion: "derecha",
  });
  await marcar(page.locator(`tr[data-fila="${hoja.filas.length}"] [data-col="F"]`), "Fecha real (filtrable)", {
    n: 6,
    tono: "ok",
    posicion: "derecha",
  });
  await pausa(page, 2200);
  await capturar(page, testInfo, "03-archivo", true);
  await limpiar(page);

  await portada(page, "Resultado", [
    "T5 ✅ Botón «Exportar a Excel» en la cabecera + aviso «N tareas exportadas»",
    "T4 ✅ .xlsx real sin dependencias: nombres visibles, texto intacto, fecha como fecha",
    "H1 ✅ Exporta el tablero recién leído del servidor (fase y responsable al día)",
  ]);
});
