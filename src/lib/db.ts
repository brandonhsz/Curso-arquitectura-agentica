import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BOARD, isBoardState } from "./board";
import type { BoardState } from "./types";
import { notifyStatusChanges } from "./webhook";

const DATA_FILE = path.join(process.cwd(), "data", "board.json");

export async function readBoard(): Promise<BoardState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(DATA_FILE, "utf8"));
    if (isBoardState(parsed)) return parsed;
  } catch {
    // el archivo aún no existe o está corrupto
  }
  return DEFAULT_BOARD;
}

async function writeBoard(board: BoardState) {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(board, null, 2));
  await rename(tmp, DATA_FILE); // escritura atómica
}

// Serializamos las escrituras para que dos cambios simultáneos no se pisen.
let queue: Promise<unknown> = Promise.resolve();

export async function mutateBoard(fn: (board: BoardState) => BoardState): Promise<BoardState> {
  const run = queue.then(async () => {
    const before = await readBoard();
    const next = fn(before);
    await writeBoard(next);
    return { before, next };
  });
  queue = run.catch(() => {});
  const { before, next } = await run;
  notifyStatusChanges(before, next);
  return next;
}
