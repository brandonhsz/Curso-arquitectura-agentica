"use client";

import { useEffect, useState } from "react";
import { buildXlsx, exportFileName, fetchLatestBoard, taskRows, XLSX_MIME } from "@/lib/export";
import type { BoardState } from "@/lib/types";

const NOTICE_MS = 4000;

export function ExportButton({ board }: { board: BoardState }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  async function exportTasks() {
    if (busy) return;
    setBusy(true);
    const rows = taskRows(await fetchLatestBoard(board));
    setBusy(false);
    const bytes = buildXlsx(rows);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_MIME }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(rows.length === 1 ? "1 tarea exportada" : `${rows.length} tareas exportadas`);
  }

  return (
    <div className="relative">
      <button
        onClick={exportTasks}
        aria-busy={busy}
        className="btn"
        title="Descarga todas las tareas en .xlsx"
      >
        Exportar a Excel
      </button>
      {notice && (
        <span
          role="status"
          className="absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
        >
          {notice}
        </span>
      )}
    </div>
  );
}
