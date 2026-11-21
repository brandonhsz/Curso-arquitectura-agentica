import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp } from "./apoyo";
import { leerConOpenpyxl, mostrarHoja } from "./excel";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa } from "./senales";

// Evidencia T5 (botón y aviso) y T4 (contenido del .xlsx).
// El archivo descargado se abre con openpyxl, un lector de Excel independiente de la app:
// define EXCEL_LECTOR_PY con la ruta a un python que tenga openpyxl.
// Crea 2 tarjetas "[evidencia]" y las borra al final.

test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

const CON_TEXTO = "[evidencia] Informe, con comas y «comillas»";
const DESCRIPCION = "Línea 1: ñandú & cía\nLínea 2: <sin etiquetas>";
const FORMULA = "[evidencia] =SUMA(1;2)";

test.beforeEach(async ({ page }) => borrarEvidencias(page));
test.afterEach(async ({ page }) => borrarEvidencias(page));

test("exportar a Excel: botón, aviso y contenido del archivo", async ({ page }, testInfo) => {
  await mostrarCursor(page);
  await page.goto("/");
  await crearTarea(page, FORMULA);
  // Tarea con descripción de varias líneas, acentos y caracteres especiales
  await page.getByRole("button", { name: /^\+ Nueva tarea$/ }).click();
  await page.getByPlaceholder("¿Qué hay que hacer?").fill(CON_TEXTO);
  await page.getByPlaceholder("Detalles opcionales").fill(DESCRIPCION);
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByText(CON_TEXTO)).toBeVisible();
  const tareas = JSON.parse((await mcp(page, "listar_tareas", {})).content[0].text) as { id: string; titulo: string }[];
  const id = tareas.find((t) => t.titulo === CON_TEXTO)!.id;
  await mcp(page, "actualizar_fase", { tarea: id, fase: "mesa", responsable: "Ana" });
  const total = tareas.length;

  // 1. El botón en la cabecera (T5)
  const boton = page.getByRole("button", { name: "Exportar a Excel" });
  await expect(boton).toBeVisible();
  await expect(boton).toHaveAttribute("title", "Descarga todas las tareas en .xlsx");
  await marcar(boton, "Exportar a Excel", { n: 1, tono: "ok" });
  await leyenda(page, "T5: botón «Exportar a Excel» en la cabecera, junto a las demás acciones");
  await pausa(page, 1200);
  await capturar(page, testInfo, "01-boton-exportar");
  await limpiar(page);

  // 2. Clic → descarga + aviso (T5)
  const [descarga] = await Promise.all([page.waitForEvent("download"), boton.click()]);
  const nombre = descarga.suggestedFilename();
  expect(nombre).toMatch(/^tareas-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const aviso = page.getByRole("status").filter({ hasText: "exportada" });
  await expect(aviso).toHaveText(`${total} tareas exportadas`);
  await marcar(aviso, "Aviso de descarga", { n: 1, tono: "ok", posicion: "derecha" });
  await leyenda(page, `T5: se descargó «${nombre}» y el aviso confirma ${total} tareas exportadas`);
  await pausa(page, 1500);
  await capturar(page, testInfo, "02-aviso-descarga");
  await limpiar(page);

  // 3. Contenido del archivo leído por un lector independiente (T4)
  const ruta = testInfo.outputPath(nombre);
  await descarga.saveAs(ruta);
  const hoja = leerConOpenpyxl(ruta);
  const [enc, ...filas] = hoja.filas;
  expect(hoja.hoja).toBe("Tareas");
  expect(enc.map((c) => c.v)).toEqual(["Título", "Descripción", "Estado", "Fase del flujo", "Responsable", "Creada"]);
  expect(filas).toHaveLength(total);
  const filaTexto = filas.find((f) => f[0].v === CON_TEXTO)!;
  expect(filaTexto.map((c) => c.v).slice(0, 5)).toEqual([CON_TEXTO, DESCRIPCION, "Por hacer", "Mesa de diálogo", "Ana"]);
  expect(filaTexto[5].fecha).toBe(true);
  const filaFormula = filas.find((f) => f[0].v === FORMULA)!;
  expect(filaFormula[0].tipo).toBe("s"); // texto, no fórmula

  await mostrarHoja(page, nombre, hoja);
  const n = (titulo: string) => filas.findIndex((f) => f[0].v === titulo) + 2;
  await marcar(page.locator('tr[data-fila="1"]'), "Fila de encabezados", { n: 1, tono: "ok", posicion: "derecha" });
  await marcar(page.locator(`tr[data-fila="${n(CON_TEXTO)}"]`), "Acentos, saltos de línea, fase y responsable", {
    n: 2,
    tono: "ok",
    posicion: "derecha",
  });
  await marcar(page.locator(`tr[data-fila="${n(FORMULA)}"] [data-col="A"]`), "«=SUMA» queda como texto", {
    n: 3,
    tono: "ok",
    posicion: "derecha",
  });
  await marcar(page.locator(`tr[data-fila="${hoja.filas.length}"] [data-col="F"]`), "Creada: fecha real", {
    n: 4,
    tono: "ok",
    posicion: "derecha",
  });
  await leyenda(page, `T4: ${total} filas + encabezados; nombres visibles, texto intacto y fecha como fecha`);
  await pausa(page, 1500);
  await capturar(page, testInfo, "03-contenido-xlsx", true);
});
