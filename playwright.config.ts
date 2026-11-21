import { defineConfig, devices } from "@playwright/test";

// Configuración del Bloque 3 (análisis con evidencias). No son pruebas de regresión:
// cada archivo `*.evidencia.ts` recorre la app y deja capturas/videos con señales.
// EVIDENCIA_URL permite grabar contra otra copia de la app (p. ej. la versión previa a un fix en :3001).
const url = process.env.EVIDENCIA_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./evidencia",
  testMatch: "**/*.evidencia.ts",
  outputDir: "./evidencia/salidas",
  reporter: [["list"]],
  workers: 1,
  use: {
    baseURL: url,
    ...devices["Desktop Chrome"],
    // Después de `devices`: si va antes, el preset lo sobrescribe (1280×720).
    viewport: { width: 1280, height: 800 },
  },
  webServer: process.env.EVIDENCIA_URL
    ? undefined
    : { command: "npm run dev", url, reuseExistingServer: true, timeout: 120_000 },
});
