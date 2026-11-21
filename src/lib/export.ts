/**
 * Exportación de las tareas a un archivo de Excel (.xlsx), sin dependencias.
 * Un .xlsx es un ZIP con unos cuantos XML; aquí se arma uno mínimo y sin compresión.
 */
import { isBoardState } from "./board";
import { getPhase } from "./phases";
import type { BoardState, ExportRow } from "./types";

export const EXPORT_HEADERS = ["Título", "Descripción", "Estado", "Fase del flujo", "Responsable", "Creada"] as const;

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const DELETED_STATUS = "(estado eliminado)";

/** Una fila por tarea, en el orden de la vista Lista: por columna del tablero y luego más recientes primero. */
export function taskRows(board: BoardState): ExportRow[] {
  const statusName = new Map(board.statuses.map((s) => [s.id, s.name]));
  const order = new Map(board.statuses.map((s, i) => [s.id, i]));
  const pos = (statusId: string) => order.get(statusId) ?? Number.POSITIVE_INFINITY;
  return [...board.tasks]
    .sort((a, b) => pos(a.statusId) - pos(b.statusId) || b.createdAt - a.createdAt)
    .map((t) => ({
      titulo: t.title,
      descripcion: t.description,
      estado: statusName.get(t.statusId) ?? DELETED_STATUS,
      fase: t.phase ? (getPhase(t.phase.phaseId)?.name ?? t.phase.phaseId) : "",
      responsable: t.phase?.owner ?? "",
      creada: t.createdAt,
    }));
}

/**
 * Tablero recién leído del servidor, para que el archivo no salga con la copia del navegador
 * (que se refresca cada 2 s). Si la petición falla, devuelve `fallback`.
 */
export async function fetchLatestBoard(fallback: BoardState): Promise<BoardState> {
  try {
    const res = await fetch("/api/board", { cache: "no-store" });
    const data: unknown = await res.json();
    return res.ok && isBoardState(data) ? data : fallback;
  } catch {
    return fallback;
  }
}

/** `tareas-AAAA-MM-DD.xlsx` con la fecha local. */
export function exportFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `tareas-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.xlsx`;
}

// ---------- Hoja de cálculo (SpreadsheetML) ----------

const COLS = "ABCDEF";
const COL_WIDTHS = [40, 60, 18, 24, 18, 18];
const STYLE_HEADER = 1;
const STYLE_DATE = 2;

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Quita caracteres de control que XML no admite (deja tabulador y saltos de línea). */
const cleanXml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function textCell(ref: string, value: string, style?: number): string {
  if (!value) return "";
  const v = cleanXml(value);
  const preserve = /^\s|\s$|\n/.test(v) ? ' xml:space="preserve"' : "";
  const s = style ? ` s="${style}"` : "";
  return `<c r="${ref}" t="inlineStr"${s}><is><t${preserve}>${escapeXml(v)}</t></is></c>`;
}

/** Número de serie de Excel (días desde 1899-12-30) en hora local. */
function excelSerial(ms: number, tzOffsetMin: number): number {
  return 25569 + (ms - tzOffsetMin * 60_000) / 86_400_000;
}

function sheetXml(rows: ExportRow[], tzOffsetMin?: number): string {
  const header = `<row r="1">${EXPORT_HEADERS.map((h, i) => textCell(`${COLS[i]}1`, h, STYLE_HEADER)).join("")}</row>`;
  const body = rows
    .map((r, idx) => {
      const n = idx + 2;
      const offset = tzOffsetMin ?? new Date(r.creada).getTimezoneOffset();
      const cells = [r.titulo, r.descripcion, r.estado, r.fase, r.responsable]
        .map((v, i) => textCell(`${COLS[i]}${n}`, v))
        .join("");
      const date = `<c r="F${n}" s="${STYLE_DATE}"><v>${excelSerial(r.creada, offset)}</v></c>`;
      return `<row r="${n}">${cells}${date}</row>`;
    })
    .join("");
  const cols = COL_WIDTHS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="A1:F${rows.length + 1}"/>` +
    `</worksheet>`
  );
}

function xlsxParts(rows: ExportRow[], tzOffsetMin?: number): [string, string][] {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return [
    [
      "[Content_Types].xml",
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}">` +
        `<sheets><sheet name="Tareas" sheetId="1" r:id="rId1"/></sheets>` +
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Tareas!$A$1:$F$${rows.length + 1}</definedName></definedNames>` +
        `</workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ],
    [
      "xl/styles.xml",
      `${xml}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="3">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`,
    ],
    ["xl/worksheets/sheet1.xml", sheetXml(rows, tzOffsetMin)],
  ];
}

/**
 * Arma el .xlsx. `tzOffsetMin` es el desfase en minutos como `Date#getTimezoneOffset`;
 * si no se indica, se usa el de cada fecha en la zona horaria local.
 */
export function buildXlsx(rows: ExportRow[], tzOffsetMin?: number): Uint8Array {
  const enc = new TextEncoder();
  return zipStored(xlsxParts(rows, tzOffsetMin).map(([name, text]) => [name, enc.encode(text)]));
}

// ---------- ZIP sin compresión ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_DATE_1980_01_01 = 0x0021;

function zipStored(files: [string, Uint8Array][]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [name, data] of files) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // versión necesaria
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // método: sin compresión
    lv.setUint16(10, 0, true); // hora
    lv.setUint16(12, DOS_DATE_1980_01_01, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // versión que lo creó
    cv.setUint16(6, 20, true); // versión necesaria
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, DOS_DATE_1980_01_01, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
