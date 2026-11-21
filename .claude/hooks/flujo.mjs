#!/usr/bin/env node
// Modo autónomo del flujo de CLAUDE.md.
//
// El estado del recorrido vive en `.flujo/estado.json` (una copia por worktree).
// Lo escribe el agente al entrar a cada fase y lo leen los hooks:
//
//   node .claude/hooks/flujo.mjs fase <fase> [--slug <slug>] [--intent "<texto>"]
//   node .claude/hooks/flujo.mjs estado
//   node .claude/hooks/flujo.mjs pretool   (hook PreToolUse: AskUserQuestion / ExitPlanMode)
//   node .claude/hooks/flujo.mjs stop      (hook Stop)
//
// Regla: mientras haya un recorrido activo, el agente no pregunta ni se detiene;
// la única pregunta permitida es la aprobación final (fase `aprobacion_final`).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const DIR = join(RAIZ, ".flujo");
const ARCHIVO = join(DIR, "estado.json");

const FASES = [
  "intent", "idea", "mesa", "sintesis", "respuesta", "consolidada",
  "implementacion", "analisis", "validacion", "evidencia_final",
  "aprobacion_final", "terminado", "inactivo",
];
// Fases en las que el agente puede preguntar y detenerse.
const LIBRES = new Set(["aprobacion_final", "terminado", "inactivo"]);
// Veces seguidas que el hook Stop obliga a continuar en la misma fase antes de soltar
// (evita un ciclo infinito si el agente está realmente atascado).
const MAX_EMPUJES = 3;

function leer() {
  try {
    return JSON.parse(readFileSync(ARCHIVO, "utf8"));
  } catch {
    return null;
  }
}

function guardar(estado) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify(estado, null, 2) + "\n");
}

function leerStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

const activo = (e) => e && !LIBRES.has(e.fase);

const [modo, ...args] = process.argv.slice(2);

if (modo === "fase") {
  const fase = args[0];
  if (!FASES.includes(fase)) {
    console.error(`Fase inválida: "${fase}". Usa una de: ${FASES.join(", ")}`);
    process.exit(1);
  }
  const opcion = (n) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  // Un recorrido nuevo (fase `intent`) arranca limpio; el resto conserva slug e intent.
  const previo = fase === "intent" ? {} : leer() ?? {};
  const estado = {
    ...previo,
    fase,
    slug: opcion("slug") ?? previo.slug,
    intent: opcion("intent") ?? previo.intent,
    actualizado: new Date().toISOString(),
    empujes: 0,
  };
  guardar(estado);
  console.log(`Flujo → ${fase}${estado.slug ? ` (${estado.slug})` : ""}`);
  process.exit(0);
}

if (modo === "estado") {
  console.log(existsSync(ARCHIVO) ? readFileSync(ARCHIVO, "utf8") : "Sin recorrido activo.");
  process.exit(0);
}

if (modo === "pretool") {
  const entrada = leerStdin();
  const estado = leer();
  if (!activo(estado)) process.exit(0);
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `Modo autónomo (fase "${estado.fase}"): no se pregunta al usuario a mitad del flujo` +
        (entrada.tool_name ? ` (${entrada.tool_name} bloqueado)` : "") +
        ". Decide tú la opción más razonable, regístrala en .flujo/decisiones.md con su porqué y continúa. " +
        "La única pregunta permitida es la aprobación final: pasa a `aprobacion_final` cuando el Bloque 5 esté entregado.",
    },
  }));
  process.exit(0);
}

if (modo === "stop") {
  const estado = leer();
  if (!activo(estado)) process.exit(0);
  if ((estado.empujes ?? 0) >= MAX_EMPUJES) {
    // Se suelta para no ciclar; queda registrado para la aprobación final.
    guardar({ ...estado, atascado: true });
    process.exit(0);
  }
  guardar({ ...estado, empujes: (estado.empujes ?? 0) + 1 });
  console.log(JSON.stringify({
    decision: "block",
    reason:
      `Modo autónomo: el recorrido sigue en la fase "${estado.fase}" y todavía no llega a la aprobación final. ` +
      "No esperes al usuario: toma la decisión pendiente, regístrala en .flujo/decisiones.md y continúa con el siguiente nodo del grafo. " +
      "Si de verdad no puedes avanzar, registra el bloqueo en .flujo/decisiones.md, completa lo que sí se pueda y pasa a `aprobacion_final` explicándolo.",
  }));
  process.exit(0);
}

console.error("Uso: flujo.mjs fase <fase> [--slug s] [--intent t] | estado | pretool | stop");
process.exit(1);
