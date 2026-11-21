import { expect, test } from "@playwright/test";
import { leyenda, limpiar, marcar, mostrarCursor, pausa } from "./senales";

// Ejemplo de referencia (video). `test.use({ video })` debe ir al nivel superior del archivo.
// No crea ni borra datos: solo abre y cierra el formulario.
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

test("video: abrir y cerrar el formulario de nueva tarea", async ({ page }) => {
  await mostrarCursor(page);
  await page.goto("/");
  await leyenda(page, "1. Abrimos el formulario de nueva tarea");
  await pausa(page);
  await page.getByRole("button", { name: /^\+ Nueva tarea$/ }).click();

  const titulo = page.getByPlaceholder("¿Qué hay que hacer?");
  await expect(titulo).toBeVisible();
  await marcar(titulo, "Campo obligatorio", { n: 1 });
  await leyenda(page, "2. El formulario aparece con el título como primer campo");
  await pausa(page, 1500);

  await limpiar(page);
  await page.getByRole("button", { name: "Cerrar" }).click();
  await leyenda(page, "3. Se cierra sin crear nada");
  await pausa(page, 1200);
});
