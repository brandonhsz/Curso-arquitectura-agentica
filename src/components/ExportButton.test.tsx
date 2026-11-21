import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardState, Task } from "@/lib/types";
import { ExportButton } from "./ExportButton";

const task = (id: string): Task => ({ id, title: `Tarea ${id}`, description: "", statusId: "s1", createdAt: 1 });
const boardWith = (tasks: Task[]): BoardState => ({ statuses: [{ id: "s1", name: "Por hacer", color: "#000" }], tasks });

describe("ExportButton", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;
  let downloads: string[];

  beforeEach(() => {
    downloads = [];
    createObjectURL = vi.fn(() => "blob:fake");
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    // Por defecto el servidor no responde: se exporta el tablero en memoria.
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("sin red"))));
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  });
  afterEach(() => {
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("muestra el botón 'Exportar a Excel' con una pista de qué descarga", () => {
    render(<ExportButton board={boardWith([task("a")])} />);
    const btn = screen.getByRole("button", { name: "Exportar a Excel" });
    expect(btn).toBeEnabled();
    expect(btn).toHaveAttribute("title", "Descarga todas las tareas en .xlsx");
  });

  it("al hacer clic descarga un .xlsx con fecha y avisa cuántas tareas exportó", async () => {
    render(<ExportButton board={boardWith([task("a"), task("b")])} />);
    await userEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
    await screen.findByRole("status");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(blob.size).toBeGreaterThan(0);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^tareas-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(await screen.findByRole("status")).toHaveTextContent("2 tareas exportadas");
  });

  it("H1: exporta el tablero recién pedido al servidor, no la copia en memoria", async () => {
    const fresh = boardWith([task("a"), task("b"), task("c")]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fresh))));
    render(<ExportButton board={boardWith([task("a")])} />);
    await userEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
    expect(await screen.findByRole("status")).toHaveTextContent("3 tareas exportadas");
  });

  it("usa singular con una sola tarea", async () => {
    render(<ExportButton board={boardWith([task("a")])} />);
    await userEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
    expect(await screen.findByRole("status")).toHaveTextContent("1 tarea exportada");
  });

  it("sin tareas igual descarga (solo encabezados)", async () => {
    render(<ExportButton board={boardWith([])} />);
    await userEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
    expect(await screen.findByRole("status")).toHaveTextContent("0 tareas exportadas");
    expect(downloads).toHaveLength(1);
  });
});
