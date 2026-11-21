import type { Locator, Page, TestInfo } from "@playwright/test";

/**
 * Señales visuales para evidencias (Bloque 3 de CLAUDE.md).
 * Todo lo que se dibuja vive en una capa con `data-evidencia` y `pointer-events: none`,
 * así no interfiere con la app y se puede limpiar entre capturas.
 */

export type Tono = "foco" | "ok" | "error" | "info";

const COLORES: Record<Tono, string> = {
  foco: "#f97316", // naranja: punto de interés
  ok: "#16a34a", // verde: funciona como se esperaba
  error: "#dc2626", // rojo: problema encontrado
  info: "#2563eb", // azul: contexto
};

/** Encierra un elemento con un recuadro numerado y una etiqueta. */
export async function marcar(
  locator: Locator,
  etiqueta: string,
  opciones: { n?: number; tono?: Tono; posicion?: "arriba" | "derecha" | "abajo" } = {},
) {
  const { n, tono = "foco", posicion = "arriba" } = opciones;
  await locator.scrollIntoViewIfNeeded();
  const caja = await locator.boundingBox();
  if (!caja) throw new Error(`No se pudo marcar "${etiqueta}": el elemento no es visible`);

  await locator.page().evaluate(
    ({ caja, etiqueta, n, color, posicion }) => {
      const pad = 6;
      const x = caja.x + window.scrollX - pad;
      const y = caja.y + window.scrollY - pad;

      const marco = document.createElement("div");
      marco.dataset.evidencia = "";
      Object.assign(marco.style, {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${caja.width + pad * 2}px`,
        height: `${caja.height + pad * 2}px`,
        border: `3px solid ${color}`,
        borderRadius: "8px",
        boxShadow: `0 0 0 4px ${color}33`,
        pointerEvents: "none",
        zIndex: "2147483646",
      });

      const rotulo = document.createElement("div");
      rotulo.dataset.evidencia = "";
      rotulo.textContent = n != null ? `${n}  ${etiqueta}` : etiqueta;
      Object.assign(rotulo.style, {
        position: "absolute",
        // "derecha" evita tapar lo que está justo encima del elemento (títulos, labels)
        left: posicion === "derecha" ? `${x + caja.width + pad * 2 + 8}px` : `${x}px`,
        top:
          posicion === "derecha"
            ? `${y + pad}px`
            : posicion === "abajo"
              ? `${y + caja.height + pad * 2 + 4}px`
              : `${Math.max(0, y - 30)}px`,
        padding: "3px 8px",
        background: color,
        color: "#fff",
        font: "600 13px/1.4 system-ui, sans-serif",
        borderRadius: "6px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: "2147483647",
      });

      document.body.append(marco, rotulo);
    },
    { caja, etiqueta, n, color: COLORES[tono], posicion },
  );
}

/** Banda de texto fija abajo: explica qué se está viendo (útil sobre todo en videos). */
export async function leyenda(page: Page, texto: string) {
  await page.evaluate((texto) => {
    let banda = document.getElementById("evidencia-leyenda");
    if (!banda) {
      banda = document.createElement("div");
      banda.id = "evidencia-leyenda";
      banda.dataset.evidencia = "";
      Object.assign(banda.style, {
        position: "fixed",
        left: "50%",
        bottom: "16px",
        transform: "translateX(-50%)",
        maxWidth: "90vw",
        padding: "8px 14px",
        background: "rgba(17,24,39,.9)",
        color: "#fff",
        font: "500 15px/1.4 system-ui, sans-serif",
        borderRadius: "8px",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      document.body.append(banda);
    }
    banda.textContent = texto;
  }, texto);
}

/** Quita todas las señales (antes de pasar al siguiente punto de interés). */
export async function limpiar(page: Page) {
  await page.evaluate(() => document.querySelectorAll("[data-evidencia]").forEach((e) => e.remove()));
}

/**
 * Cursor visible y onda en cada clic. Playwright no graba el puntero en los videos;
 * llámalo antes de navegar para que quien vea el video sepa dónde se hizo clic.
 */
export async function mostrarCursor(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const cursor = document.createElement("div");
      cursor.dataset.evidenciaCursor = "";
      Object.assign(cursor.style, {
        position: "fixed",
        width: "18px",
        height: "18px",
        marginLeft: "-9px",
        marginTop: "-9px",
        borderRadius: "50%",
        background: "rgba(249,115,22,.85)",
        border: "2px solid #fff",
        pointerEvents: "none",
        zIndex: "2147483647",
        transition: "left .08s, top .08s",
      });
      document.body.append(cursor);
      document.addEventListener("mousemove", (e) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
      }, true);
      document.addEventListener("mousedown", (e) => {
        const onda = document.createElement("div");
        Object.assign(onda.style, {
          position: "fixed",
          left: `${e.clientX - 20}px`,
          top: `${e.clientY - 20}px`,
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: "3px solid #f97316",
          pointerEvents: "none",
          zIndex: "2147483647",
          transition: "transform .4s, opacity .4s",
        });
        document.body.append(onda);
        requestAnimationFrame(() => {
          onda.style.transform = "scale(1.8)";
          onda.style.opacity = "0";
        });
        setTimeout(() => onda.remove(), 450);
      }, true);
    });
  });
}

/** Guarda una captura en la carpeta de evidencias de esta prueba. */
export async function capturar(page: Page, testInfo: TestInfo, nombre: string, completa = false) {
  const ruta = testInfo.outputPath(`${nombre}.png`);
  await page.screenshot({ path: ruta, fullPage: completa });
  return ruta;
}

/** Pausa breve para que el video muestre cada paso a ritmo legible. */
export const pausa = (page: Page, ms = 900) => page.waitForTimeout(ms);

/**
 * Tarjeta a pantalla completa (portada o cierre del video final del Bloque 5).
 * Se muestra `ms` milisegundos y luego desaparece sola.
 */
export async function portada(page: Page, titulo: string, lineas: string[] = [], ms = 2500) {
  await page.evaluate(
    ({ titulo, lineas }) => {
      const tarjeta = document.createElement("div");
      tarjeta.id = "evidencia-portada";
      tarjeta.dataset.evidencia = "";
      Object.assign(tarjeta.style, {
        position: "fixed",
        inset: "0",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: "12px",
        background: "rgba(17,24,39,.94)",
        color: "#fff",
        font: "500 20px/1.5 system-ui, sans-serif",
        textAlign: "center",
        padding: "40px",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      const h = document.createElement("div");
      h.textContent = titulo;
      Object.assign(h.style, { font: "700 34px/1.2 system-ui, sans-serif" });
      tarjeta.append(h);
      for (const linea of lineas) {
        const p = document.createElement("div");
        p.textContent = linea;
        p.style.opacity = ".85";
        tarjeta.append(p);
      }
      document.body.append(tarjeta);
    },
    { titulo, lineas },
  );
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.getElementById("evidencia-portada")?.remove());
}
