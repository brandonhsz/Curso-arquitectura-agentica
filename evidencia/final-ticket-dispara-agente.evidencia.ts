import { expect, test, type Page } from "@playwright/test";
import { mcp, tarjeta, texto } from "./apoyo";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa, portada } from "./senales";

// Recorrido "ticket-dispara-agente" · Bloques 3 y 5.
// Requiere el tablero con KANBAN_AGENTE_CMD=evidencia/agente-falso.mjs (sin él lanzaría una sesión REAL de Claude)
// (el agente de prueba recorre las fases vía MCP igual que el real).
// Las tarjetas usan el prefijo "[evidencia-agente]": "[evidencia]" está excluido del lanzamiento automático.
// Se borran al final.
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

const PREFIJO = "[evidencia-agente]";
const TICKET = `${PREFIJO} Exportar tareas a CSV`;
const DETENER = `${PREFIJO} Ticket que se detiene`;

async function abrirTicket(page: Page, titulo: string, descripcion: string) {
  await page.getByRole("button", { name: /^\+ Nueva tarea$/ }).click();
  await page.getByPlaceholder("¿Qué hay que hacer?").fill(titulo);
  await page.getByPlaceholder("Detalles opcionales").fill(descripcion);
}

async function borrarTarjetas(page: Page) {
  const tareas = JSON.parse(texto(await mcp(page, "listar_tareas", {}))) as { titulo: string }[];
  if (!tareas.some((t) => t.titulo.startsWith(PREFIJO))) return;
  const pendientes = page.locator("article").filter({ hasText: PREFIJO });
  while ((await pendientes.count()) > 0) {
    const antes = await pendientes.count();
    await pendientes.first().click();
    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(pendientes).toHaveCount(antes - 1);
  }
}

test("final: abrir un ticket lanza al agente y mueve la tarjeta", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await mostrarCursor(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tablero Kanban" })).toBeVisible();
  await borrarTarjetas(page);
  await portada(page, "Abrir un ticket lo pone a trabajar al agente", [
    "Tipo: feature",
    "El agente recibe el contexto del ticket y mueve la tarjeta por las fases",
  ]);

  // 1. Se abre un ticket con su contexto.
  await abrirTicket(page, TICKET, "Botón para descargar todas las tareas del tablero en un archivo CSV");
  const form = page.getByRole("dialog");
  await marcar(form, "Ticket con título y descripción", { n: 1, tono: "foco" });
  await leyenda(page, "1. Alguien abre un ticket con su contexto (título y descripción)");
  await capturar(page, testInfo, "01-abrir-ticket");
  await pausa(page, 1500);
  await limpiar(page);
  await page.getByRole("button", { name: "Crear tarea" }).click();

  // 2. Sin hacer nada más, el agente arranca y toma la tarjeta.
  const card = tarjeta(page, TICKET);
  await expect(card.getByText("Agente trabajando el ticket")).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText(/Intent|Desarrollo de la idea|Mesa de diálogo/)).toBeVisible({ timeout: 15_000 });
  await marcar(card.getByRole("status"), "Agente lanzado solo", { n: 2, tono: "ok" });
  await leyenda(page, "2. Nadie lanzó nada: el tablero arrancó al agente con el contexto del ticket");
  await capturar(page, testInfo, "02-agente-arranca");
  await pausa(page, 1500);
  await limpiar(page);

  // 3. El agente avanza la tarjeta por las fases.
  await expect(card.getByText(/Implementación|Análisis con evidencias|Validación/)).toBeVisible({ timeout: 30_000 });
  await marcar(card, "El agente mueve la fase", { n: 3, tono: "ok" });
  await leyenda(page, "3. Conforme avanza, el agente mueve la tarjeta por las fases del flujo");
  await capturar(page, testInfo, "03-agente-avanza");
  await pausa(page, 1500);
  await limpiar(page);

  // 4. Aprobación final: turno humano, con el comando para retomar la sesión.
  await expect(card.getByText("Te toca: Equipo")).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("Agente terminó")).toBeVisible({ timeout: 15_000 });
  const comando = card.locator("code");
  await expect(comando).toContainText("claude --resume");
  await marcar(card.getByText("Te toca: Equipo"), "Turno humano", { n: 4, tono: "ok" });
  await marcar(comando, "Retomar la sesión para aprobar", { n: 5, tono: "ok" });
  await leyenda(page, "4. Llega a la aprobación final: le toca a una persona, que retoma la sesión del agente");
  await capturar(page, testInfo, "04-aprobacion-final");
  await pausa(page, 2500);
  await limpiar(page);

  // 5. Un agente se puede detener desde la tarjeta.
  await abrirTicket(page, DETENER, "Ticket para mostrar el botón de detener");
  await page.getByRole("button", { name: "Crear tarea" }).click();
  const otra = tarjeta(page, DETENER);
  const boton = otra.getByRole("button", { name: "Detener agente" });
  await expect(boton).toBeVisible({ timeout: 15_000 });
  await marcar(boton, "Detener agente", { n: 6, tono: "foco" });
  await leyenda(page, "5. Si hace falta, el agente se detiene desde la propia tarjeta");
  await pausa(page, 1500);
  await limpiar(page);
  await boton.click();
  await expect(otra.getByText("Agente detenido")).toBeVisible();
  await page.waitForTimeout(2500); // el sondeo del tablero confirma el estado del servidor
  await expect(otra.getByText("Agente detenido")).toBeVisible();
  await marcar(otra.getByRole("status"), "Agente detenido", { n: 7, tono: "ok" });
  await capturar(page, testInfo, "05-agente-detenido");
  await pausa(page, 1500);
  await limpiar(page);

  await portada(page, "Resultado", [
    "T4 ✅ Al crear el ticket se lanza el agente con su contexto (worktree + sesión propia)",
    "T4 ✅ El agente mueve la tarjeta por las fases hasta la aprobación final",
    "T5 ✅ La tarjeta muestra al agente: trabajando, terminó, detenido y cómo retomarlo",
  ]);

  await borrarTarjetas(page);
});
