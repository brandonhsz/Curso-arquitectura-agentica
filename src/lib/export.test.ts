// @vitest-environment node
import { crc32 } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { buildXlsx, EXPORT_HEADERS, exportFileName, fetchLatestBoard, taskRows } from "./export";
import type { BoardState, ExportRow } from "./types";

/** Lee un ZIP sin compresión ("stored") y devuelve sus partes; falla si un CRC no cuadra. */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, string>();
  let p = 0;
  while (view.getUint32(p, true) === 0x04034b50) {
    const method = view.getUint16(p + 8, true);
    const crc = view.getUint32(p + 14, true);
    const size = view.getUint32(p + 18, true);
    const nameLen = view.getUint16(p + 26, true);
    const extraLen = view.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extraLen;
    const data = bytes.subarray(start, start + size);
    expect(method, `${name}: método`).toBe(0);
    expect(crc32(data) >>> 0, `${name}: CRC32`).toBe(crc);
    files.set(name, new TextDecoder().decode(data));
    p = start + size;
  }
  // Después de las partes viene el directorio central y el fin de directorio.
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  expect(view.getUint16(eocd + 10, true)).toBe(files.size);
  return files;
}

const board: BoardState = {
  statuses: [
    { id: "todo", name: "Por hacer", color: "#000" },
    { id: "done", name: "Hecho", color: "#000" },
  ],
  tasks: [
    { id: "1", title: "Vieja hecha", description: "", statusId: "done", createdAt: 100 },
    {
      id: "2",
      title: "Con fase",
      description: "desc",
      statusId: "todo",
      createdAt: 200,
      phase: { phaseId: "mesa", owner: "Ana", updatedAt: 1 },
    },
    { id: "3", title: "Reciente", description: "", statusId: "todo", createdAt: 300 },
    { id: "4", title: "Huérfana", description: "", statusId: "borrado", createdAt: 50 },
  ],
};

describe("taskRows", () => {
  it("ordena por columna del tablero y luego por más reciente; huérfanas al final", () => {
    expect(taskRows(board).map((r) => r.titulo)).toEqual(["Reciente", "Con fase", "Vieja hecha", "Huérfana"]);
  });

  it("usa los nombres visibles del estado y la fase, y el responsable", () => {
    const r = taskRows(board).find((x) => x.titulo === "Con fase")!;
    expect(r).toEqual({
      titulo: "Con fase",
      descripcion: "desc",
      estado: "Por hacer",
      fase: "Mesa de diálogo",
      responsable: "Ana",
      creada: 200,
    });
  });

  it("deja vacíos fase y responsable si la tarea no tiene fase", () => {
    const r = taskRows(board).find((x) => x.titulo === "Reciente")!;
    expect(r.fase).toBe("");
    expect(r.responsable).toBe("");
  });

  it("marca '(estado eliminado)' si el estado de la tarea ya no existe", () => {
    expect(taskRows(board).find((x) => x.titulo === "Huérfana")!.estado).toBe("(estado eliminado)");
  });

  it("devuelve una lista vacía si no hay tareas", () => {
    expect(taskRows({ statuses: board.statuses, tasks: [] })).toEqual([]);
  });
});

describe("buildXlsx", () => {
  const row: ExportRow = {
    titulo: 'A & B <x> "q"',
    descripcion: "línea 1\nlínea 2",
    estado: "Por hacer",
    fase: "",
    responsable: "",
    creada: Date.UTC(2026, 10, 21, 12, 0),
  };

  it("genera un ZIP válido con las partes mínimas de un .xlsx", () => {
    const bytes = buildXlsx([row], 0);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    const files = readZip(bytes);
    expect([...files.keys()].sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
      ].sort(),
    );
    expect(files.get("xl/workbook.xml")).toContain('name="Tareas"');
  });

  it("pone los encabezados en la primera fila", () => {
    const sheet = readZip(buildXlsx([], 0)).get("xl/worksheets/sheet1.xml")!;
    for (const h of EXPORT_HEADERS) expect(sheet).toContain(`<t>${h}</t>`);
    expect(sheet).toContain('<row r="1"');
    expect(sheet).not.toContain('<row r="2"');
  });

  it("escapa el texto y lo guarda como texto (nunca como fórmula)", () => {
    const sheet = readZip(buildXlsx([row, { ...row, titulo: "=1+1" }], 0)).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("A &amp; B &lt;x&gt; &quot;q&quot;");
    expect(sheet).toContain("línea 1\nlínea 2");
    expect(sheet).toContain("<t>=1+1</t>");
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('t="inlineStr"');
  });

  it("guarda 'Creada' como fecha de Excel (número de serie con formato de fecha)", () => {
    const files = readZip(buildXlsx([row], 0));
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toMatch(/<c r="F2" s="2"><v>46347\.5<\/v><\/c>/);
    expect(files.get("xl/styles.xml")).toMatch(/formatCode="[^"]*yyyy[^"]*"/);
  });

  it("aplica el desfase horario local a la fecha", () => {
    // UTC-6 (getTimezoneOffset = 360): 12:00 UTC son las 06:00 locales → .25
    const sheet = readZip(buildXlsx([row], 360)).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("<v>46347.25</v>");
  });
});

describe("exportFileName", () => {
  it("usa la fecha local con formato tareas-AAAA-MM-DD.xlsx", () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 59))).toBe("tareas-2026-01-05.xlsx");
  });
});

describe("fetchLatestBoard (H1: exportar el dato del servidor)", () => {
  const fresh: BoardState = { statuses: board.statuses, tasks: [...board.tasks, { id: "9", title: "Nueva", description: "", statusId: "todo", createdAt: 999 }] };

  it("pide /api/board sin caché y devuelve el tablero del servidor", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fresh)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchLatestBoard(board)).toEqual(fresh);
    expect(fetchMock).toHaveBeenCalledWith("/api/board", { cache: "no-store" });
    vi.unstubAllGlobals();
  });

  it("usa el tablero en memoria si la petición falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("sin red"))));
    expect(await fetchLatestBoard(board)).toBe(board);
    vi.unstubAllGlobals();
  });

  it("usa el tablero en memoria si la respuesta no es un tablero válido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 500 })));
    expect(await fetchLatestBoard(board)).toBe(board);
    vi.unstubAllGlobals();
  });
});
