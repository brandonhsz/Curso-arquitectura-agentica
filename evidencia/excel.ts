import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";

/**
 * Apoyo para evidencias de la exportación a Excel: abre el .xlsx descargado con openpyxl,
 * un lector independiente de la app, y lo muestra como tabla en la página.
 * Requiere EXCEL_LECTOR_PY: ruta a un python con openpyxl instalado.
 */

export type Hoja = { hoja: string; filas: { v: string | number | null; tipo: string; fecha: boolean }[][] };

export function leerConOpenpyxl(ruta: string): Hoja {
  const py = process.env.EXCEL_LECTOR_PY;
  if (!py) throw new Error("Falta EXCEL_LECTOR_PY (python con openpyxl)");
  const script = `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb.active
filas = [[{"v": (c.value.isoformat(sep=" ", timespec="minutes") if c.is_date and c.value else c.value), "tipo": c.data_type, "fecha": bool(c.is_date)} for c in fila] for fila in ws.iter_rows()]
print(json.dumps({"hoja": ws.title, "filas": filas}, ensure_ascii=False))`;
  return JSON.parse(execFileSync(py, ["-I", "-c", script, ruta], { encoding: "utf8" }));
}

export async function mostrarHoja(page: Page, nombreArchivo: string, hoja: Hoja) {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
  const filas = hoja.filas
    .map((f, i) => {
      const tag = i === 0 ? "th" : "td";
      return `<tr data-fila="${i + 1}"><td class="n">${i + 1}</td>${f
        .map((c, j) => `<${tag} data-col="${"ABCDEF"[j]}">${esc(c.v)}</${tag}>`)
        .join("")}</tr>`;
    })
    .join("");
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{font:14px system-ui;margin:24px 24px 24px 24px;background:#f8fafc;color:#111}
    h1{font-size:18px;margin:0 0 4px} p{margin:0 0 16px;color:#475569}
    table{border-collapse:separate;border-spacing:0 10px;background:transparent} tr{background:#fff} td,th{border:1px solid #cbd5e1;padding:14px 12px;text-align:left;vertical-align:top;max-width:320px}
    th{background:#e2e8f0} td.n{background:#f1f5f9;color:#64748b;text-align:center}
  </style>
  <h1>${esc(nombreArchivo)} — hoja «${esc(hoja.hoja)}»</h1>
  <p>Así lee el archivo descargado openpyxl, un lector de Excel independiente de la app.</p>
  <table>${filas}</table>`);
}
