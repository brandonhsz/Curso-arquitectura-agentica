import { expect, test } from "@playwright/test";
import { borrarEvidencias, crearTarea, mcp, tarjeta, texto } from "./apoyo";
import { capturar, leyenda, limpiar, marcar, mostrarCursor, pausa, portada } from "./senales";

// Bloque 5 · Evidencia final (feature): recorrido completo de la fase del grafo en el tablero.
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });
test.setTimeout(180_000);

const TITULO = "[evidencia] Visibilidad de fases";

test.beforeEach(async ({ page }) => borrarEvidencias(page));
test.afterEach(async ({ page }) => borrarEvidencias(page));

test("final: el equipo ve la fase del grafo y cuándo le toca a un humano", async ({ page }, testInfo) => {
  await mostrarCursor(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tablero Kanban" })).toBeVisible();

  await portada(
    page,
    "Que el equipo vea en qué fase va cada tarea y cuándo le toca a un humano",
    ["Tipo: feature", "Cada tarjeta muestra la fase del grafo, de quién es el turno y por qué retrocedió"],
    4000,
  );

  const card = tarjeta(page, TITULO);
  const badge = card.locator("[data-turn]");
  const contador = page.getByText(/esperando a un humano/);

  // 1. Tarjeta de trabajo
  await leyenda(page, "1. Alguien del equipo crea la tarjeta de la tarea");
  const id = await crearTarea(page, TITULO);
  await marcar(card, "Tarea normal, todavía sin fase", { n: 1, tono: "ok", posicion: "derecha" });
  await pausa(page, 1800);
  await capturar(page, testInfo, "01-tarjeta-sin-fase");
  await limpiar(page);

  // 2. Intent (T10 + T8 + T11 + T12)
  await leyenda(page, "2. El agente registra el Intent por MCP: la tarjeta dice a quién le toca");
  await mcp(page, "actualizar_fase", { tarea: id, fase: "intent", responsable: "Ana" });
  await expect(card.getByText("Te toca: Ana")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("1 esperando a un humano")).toBeVisible();
  await marcar(badge, "Fase Intent · te toca: Ana", { n: 2, tono: "ok", posicion: "derecha" });
  await marcar(contador, "Contador de espera humana", { n: 3, tono: "ok", posicion: "derecha" });
  await pausa(page, 2500);
  await capturar(page, testInfo, "02-intent-te-toca");
  await limpiar(page);

  // 3. Mesa de diálogo (turno del agente)
  await leyenda(page, "3. El agente lanza la mesa de diálogo: ahora el turno es suyo");
  await mcp(page, "actualizar_fase", { tarea: id, fase: "mesa" });
  await expect(card.getByText("Agente trabajando")).toBeVisible({ timeout: 10_000 });
  await expect(contador).toHaveCount(0);
  await marcar(badge, "Agente trabajando · nadie espera", { n: 4, tono: "ok", posicion: "derecha" });
  await pausa(page, 2500);
  await capturar(page, testInfo, "03-mesa-agente");
  await limpiar(page);

  // 4. Respuesta del usuario
  await leyenda(page, "4. Síntesis lista: vuelve el turno humano para responder");
  await mcp(page, "actualizar_fase", { tarea: id, fase: "respuesta" });
  await expect(card.getByText("Te toca: Ana")).toBeVisible({ timeout: 10_000 });
  await marcar(badge, "Respuesta del usuario · te toca", { n: 5, tono: "ok", posicion: "derecha" });
  await pausa(page, 2200);
  await capturar(page, testInfo, "04-respuesta-te-toca");
  await limpiar(page);

  // 5. Retroceso sin motivo: rechazado
  const rechazo = await mcp(page, "actualizar_fase", { tarea: id, fase: "idea" });
  expect(rechazo.isError).toBe(true);
  await leyenda(page, `5. El agente intenta retroceder sin motivo → rechazado: "${texto(rechazo)}"`);
  await marcar(badge, "La tarjeta no cambia", { n: 6, tono: "ok", posicion: "derecha" });
  await pausa(page, 3000);
  await capturar(page, testInfo, "05-retroceso-sin-motivo");
  await limpiar(page);

  // 6. Retroceso con motivo
  await leyenda(page, "6. Retrocede con motivo: el equipo ve el feedback en la tarjeta");
  await mcp(page, "actualizar_fase", { tarea: id, fase: "idea", motivo: "quedan dudas sobre a quién le toca" });
  await expect(card.getByText(/Regresó de Respuesta del usuario: quedan dudas sobre a quién le toca/)).toBeVisible({
    timeout: 10_000,
  });
  await marcar(badge, "Retroceso visible con su motivo", { n: 7, tono: "ok", posicion: "derecha" });
  await pausa(page, 3000);
  await capturar(page, testInfo, "06-retroceso-con-motivo");
  await limpiar(page);

  // 7. Vista de lista (T12)
  await leyenda(page, "7. En la vista de Lista se ve la misma información");
  await page.getByRole("tab", { name: "Lista" }).click();
  const fila = page.locator("li").filter({ hasText: TITULO });
  await expect(fila.locator("[data-turn]")).toBeVisible();
  await marcar(fila.locator("[data-turn]"), "Fase, turno y retroceso en la lista", { n: 8, tono: "ok", posicion: "abajo" });
  await pausa(page, 2500);
  await capturar(page, testInfo, "07-lista");
  await limpiar(page);
  await page.getByRole("tab", { name: "Tablero" }).click();

  // 8. Corrección manual (T13 + T9)
  await leyenda(page, "8. Una persona corrige la fase a mano desde el formulario de la tarjeta");
  await pausa(page);
  await card.getByText(TITULO, { exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar tarea" });
  const fase = dialogo.getByLabel("Fase");
  await expect(fase).toHaveValue("idea");
  await marcar(fase, "Fase actual", { n: 9, tono: "ok", posicion: "derecha" });
  await pausa(page, 1800);
  await limpiar(page);

  await leyenda(page, "9. Si elige una fase anterior, el motivo es obligatorio");
  await fase.selectOption({ label: "Intent" });
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  const alerta = dialogo.getByRole("alert");
  await expect(alerta).toBeVisible();
  await marcar(alerta, "Sin motivo no se guarda", { n: 10, tono: "ok", posicion: "derecha" });
  await pausa(page, 2500);
  await capturar(page, testInfo, "08-motivo-obligatorio");
  await limpiar(page);

  await leyenda(page, "10. Escribe el motivo y guarda: la tarjeta se actualiza al instante");
  await dialogo.getByLabel("Motivo del retroceso").fill("hay que redefinir la intención");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(dialogo).toBeHidden();
  await expect(card.getByText(/Regresó de Desarrollo de la idea: hay que redefinir la intención/)).toBeVisible();
  await marcar(badge, "Corrección manual aplicada", { n: 11, tono: "ok", posicion: "derecha" });
  await pausa(page, 2500);
  await capturar(page, testInfo, "09-correccion-manual");
  await limpiar(page);

  // 9. Idea consolidada
  await leyenda(page, "11. El agente entrega la evidencia final: ya no le toca a nadie");
  await mcp(page, "actualizar_fase", { tarea: id, fase: "evidencia_final" });
  await expect(badge).toHaveAttribute("data-turn", "ninguno", { timeout: 10_000 });
  await expect(contador).toHaveCount(0);
  await marcar(badge, "Evidencia final · sin turno pendiente", { n: 12, tono: "ok", posicion: "derecha" });
  await pausa(page, 2500);
  await capturar(page, testInfo, "10-consolidada");
  await limpiar(page);

  await portada(
    page,
    "Resultado",
    [
      "T8 ✅ Reglas: responsable al iniciar, motivo obligatorio al retroceder",
      "T9 ✅ Guardado de la fase desde la app (instantáneo)",
      "T10 ✅ Herramienta MCP actualizar_fase para el agente",
      "T11 ✅ Etiqueta de fase: te toca / agente trabajando / retroceso",
      "T12 ✅ Fase en Tablero y Lista + contador de espera humana",
      "T13 ✅ Corrección manual con motivo obligatorio",
      "T14 ✅ Protocolo del agente en CLAUDE.md (sin pantalla)",
    ],
    5000,
  );
});
