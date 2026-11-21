import { expect, test } from "@playwright/test";
import { capturar, leyenda, limpiar, marcar } from "./senales";

// Ejemplo de referencia (captura). No crea ni borra datos.

test("captura: barra de acciones del tablero", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tablero Kanban" })).toBeVisible();

  await marcar(page.getByRole("heading", { name: "Tablero Kanban" }), "Encabezado", { n: 1, tono: "info" });
  await marcar(page.getByRole("button", { name: /^\+ Nueva tarea$/ }), "Crear tarea", { n: 2 });
  await leyenda(page, "Punto de interés: acciones principales del tablero");
  await capturar(page, testInfo, "01-acciones-tablero");
  await limpiar(page);
});
