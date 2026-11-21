/**
 * Receptor local de webhooks, para desarrollo.
 *
 * Apunta KANBAN_WEBHOOK_URL a http://localhost:3000/api/webhook y cada aviso
 * queda guardado en data/webhooks.json; se ven en la página /webhooks.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LOG_FILE = path.join(process.cwd(), "data", "webhooks.json");
const MAX_ENTRIES = 100;

export type ReceivedWebhook = {
  receivedAt: string;
  event: string | null;
  signature: "valida" | "invalida" | "sin firma";
  payload: unknown;
};

async function readLog(): Promise<ReceivedWebhook[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(LOG_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function checkSignature(body: string, header: string | null): ReceivedWebhook["signature"] {
  const secret = process.env.KANBAN_WEBHOOK_SECRET;
  if (!secret || !header) return "sin firma";
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const ok = header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  return ok ? "valida" : "invalida";
}

// Serializa las escrituras: dos avisos simultáneos no deben pisarse.
let queue: Promise<unknown> = Promise.resolve();

export async function POST(request: Request) {
  const body = await request.text();
  const signature = checkSignature(body, request.headers.get("x-kanban-signature"));
  if (signature === "invalida") return new Response("firma inválida", { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const entry: ReceivedWebhook = {
    receivedAt: new Date().toISOString(),
    event: request.headers.get("x-kanban-event"),
    signature,
    payload,
  };

  const p = payload as { task?: { title?: string }; from?: { name?: string }; to?: { name?: string } };
  console.log(`[webhook recibido] "${p.task?.title}": ${p.from?.name} → ${p.to?.name}`);

  const run = queue.then(async () => {
    const log = [entry, ...(await readLog())].slice(0, MAX_ENTRIES);
    await mkdir(path.dirname(LOG_FILE), { recursive: true });
    await writeFile(LOG_FILE, JSON.stringify(log, null, 2));
  });
  queue = run.catch(() => {});
  await run;

  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json(await readLog(), { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  await mkdir(path.dirname(LOG_FILE), { recursive: true });
  await writeFile(LOG_FILE, "[]");
  return Response.json({ ok: true });
}
