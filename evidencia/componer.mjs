// Bloque 5: compone dos videos lado a lado (izquierda: error, derecha: fix) en un solo .webm.
// No necesita ffmpeg: reproduce ambos videos en una página y la graba con Chromium de Playwright.
//
// Uso:
//   node evidencia/componer.mjs <antes.webm> <despues.webm> <salida.webm> "<título>"
import { chromium } from "@playwright/test";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [antes, despues, salida, titulo = "Antes y después"] = process.argv.slice(2);
if (!antes || !despues || !salida) {
  console.error('Uso: node evidencia/componer.mjs <antes.webm> <despues.webm> <salida.webm> "<título>"');
  process.exit(1);
}

const ANCHO = 1920;
const ALTO = 720;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// La página y los videos van en la misma carpeta temporal para que file:// los cargue.
const trabajo = mkdtempSync(join(tmpdir(), "evidencia-componer-"));
copyFileSync(resolve(antes), join(trabajo, "antes.webm"));
copyFileSync(resolve(despues), join(trabajo, "despues.webm"));
writeFileSync(
  join(trabajo, "index.html"),
  `<!doctype html><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0 }
  body { width: ${ANCHO}px; height: ${ALTO}px; background: #111827; color: #fff;
         font: 600 20px/1.3 system-ui, sans-serif; display: grid;
         grid-template-rows: 56px 1fr; overflow: hidden }
  header { display: flex; align-items: center; justify-content: center; font-size: 22px }
  main { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 12px 12px }
  section { display: grid; grid-template-rows: 44px 1fr; border-radius: 10px; overflow: hidden }
  h2 { display: flex; align-items: center; padding: 0 14px; font-size: 18px }
  .antes { border: 4px solid #dc2626 } .antes h2 { background: #dc2626 }
  .despues { border: 4px solid #16a34a } .despues h2 { background: #16a34a }
  video { width: 100%; height: 100%; object-fit: contain; background: #000; min-height: 0 }
</style>
<header>${esc(titulo)}</header>
<main>
  <section class="antes"><h2>❌ Antes: reproducción del error</h2><video src="antes.webm" muted preload="auto"></video></section>
  <section class="despues"><h2>✅ Después: con el fix</h2><video src="despues.webm" muted preload="auto"></video></section>
</main>`,
);

const navegador = await chromium.launch();
const dirVideo = join(trabajo, "grabacion");
const contexto = await navegador.newContext({
  viewport: { width: ANCHO, height: ALTO },
  recordVideo: { dir: dirVideo, size: { width: ANCHO, height: ALTO } },
});
const pagina = await contexto.newPage();
await pagina.goto(pathToFileURL(join(trabajo, "index.html")).href);

// Espera a que ambos videos estén listos, los arranca juntos y espera a que terminen.
await pagina.evaluate(async () => {
  const videos = [...document.querySelectorAll("video")];
  await Promise.all(
    videos.map((v) => (v.readyState >= 3 ? null : new Promise((ok, mal) => {
      v.addEventListener("canplaythrough", ok, { once: true });
      v.addEventListener("error", () => mal(new Error(`No se pudo cargar ${v.src}`)), { once: true });
    }))),
  );
  await new Promise((r) => setTimeout(r, 800)); // un instante para leer los títulos
  await Promise.all(videos.map((v) => v.play()));
});

// Vista previa a la mitad: Read no puede ver .webm, pero sí este .png.
const mitad = await pagina.evaluate(() => Math.max(...[...document.querySelectorAll("video")].map((v) => v.duration)) / 2);
await pagina.waitForTimeout(mitad * 1000);
const vistaPrevia = resolve(salida).replace(/\.webm$/, "") + "-vista-previa.png";
mkdirSync(dirname(vistaPrevia), { recursive: true });
await pagina.screenshot({ path: vistaPrevia });

await pagina.evaluate(() =>
  Promise.all([...document.querySelectorAll("video")].map((v) =>
    v.ended ? null : new Promise((r) => v.addEventListener("ended", r, { once: true })))),
);
await pagina.waitForTimeout(1500); // cierre: último cuadro de ambos

await contexto.close();
await navegador.close();

const [grabado] = readdirSync(dirVideo).filter((f) => f.endsWith(".webm"));
mkdirSync(dirname(resolve(salida)), { recursive: true });
copyFileSync(join(dirVideo, grabado), resolve(salida));
console.log(`Video lado a lado: ${resolve(salida)} (${basename(antes)} | ${basename(despues)})`);
console.log(`Vista previa: ${vistaPrevia}`);
