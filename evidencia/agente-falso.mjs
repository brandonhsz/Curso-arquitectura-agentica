#!/usr/bin/env node
// Agente de prueba para las evidencias de "ticket-dispara-agente".
// Recibe los mismos argumentos que `claude -p` y recorre las fases de la tarjeta vía el MCP
// del tablero, como lo haría el agente real, sin gastar una sesión de Claude.
// Uso: KANBAN_AGENTE_CMD=<ruta a este archivo>  (AGENTE_FALSO_MS = pausa entre fases, def. 1500)
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const prompt = args[args.indexOf("-p") + 1] ?? "";
const mcpConfig = JSON.parse(readFileSync(args[args.indexOf("--mcp-config") + 1], "utf8"));
const url = mcpConfig.mcpServers.kanban.url;
const id = /- id: (\S+)/.exec(prompt)?.[1];
const responsable = /`responsable` = "([^"]+)"/.exec(prompt)?.[1] ?? "Equipo";
const ms = Number(process.env.AGENTE_FALSO_MS ?? 1500);

async function tool(name, args) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await res.text();
  console.log(`[agente-falso] ${name} ${JSON.stringify(args)} → ${body.slice(0, 200).replace(/\s+/g, " ")}`);
}

const fases = ["intent", "idea", "mesa", "sintesis", "respuesta", "consolidada", "implementacion", "analisis", "validacion", "evidencia_final", "aprobacion_final"];
console.log(`[agente-falso] ticket ${id} en ${process.cwd()}`);
for (const [i, fase] of fases.entries()) {
  await tool("actualizar_fase", i === 0 ? { tarea: id, fase, responsable } : { tarea: id, fase });
  await new Promise((r) => setTimeout(r, ms));
}
console.log("[agente-falso] listo: esperando la aprobación final");
