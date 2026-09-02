// =====================================================================
// build-demo.mjs — empaqueta la app en UN solo archivo HTML, en modo demo.
// Sirve para probarla sin servidor, sin Supabase y sin instalar nada.
//   node build-demo.mjs  ->  dist/bishusha-demo.html
// =====================================================================
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// En demo no hace falta supabase-js: db.js usa un stub. Sin este atajo,
// esbuild se traeria toda la libreria y el archivo pesaria de mas.
const sinSupabase = {
  name: 'sin-supabase',
  setup(build) {
    build.onResolve({ filter: /vendor\/supabase\.js$/ }, () => ({ path: 'supabase-stub', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const createClient = () => { throw new Error("modo demo"); };',
      loader: 'js'
    }));
  }
};

const { outputFiles } = await esbuild.build({
  entryPoints: ['js/app.js'],
  bundle: true, format: 'esm', target: 'es2022',   // esm: db.js usa await de nivel superior
  minify: true, write: false, plugins: [sinSupabase]
});
const js = outputFiles[0].text;

// tokens.css entra por @import; para un archivo suelto hay que resolverlo.
const css = readFileSync('css/app.css', 'utf8')
  .replace(/@import url\(['"]tokens\.css['"]\);?/, readFileSync('css/tokens.css', 'utf8'));

const B = 'M16 13.5A3.5 3.5 0 0 1 19.5 10h8A3.5 3.5 0 0 1 31 13.5v73a3.5 3.5 0 0 1-3.5 3.5h-8A3.5 3.5 0 0 1 16 86.5Z M22 10h24a18 18 0 0 1 0 36H22Z M31 35h15a7 7 0 0 0 0-14H31Z M22 54h46a18 18 0 0 1 0 36H22Z M31 79h37a7 7 0 0 0 0-14H31Z';

const html = `<title>BISHUSHA</title>
<style>
${css}
/* El artefacto se compone sobre el fondo del visor: el body tiene que
   pintar el suyo o hereda el del anfitrion y el tema queda mezclado. */
html, body { background: var(--bg); min-height: 100%; }
</style>

<div id="app" class="app">
  <div class="splash"><svg width="44" height="44" viewBox="0 0 100 100" aria-label="BISHUSHA">
    <path style="fill:var(--tx3)" d="${B}"/>
  </svg></div>
</div>
<nav class="tabs" id="tabs" hidden aria-label="Secciones"></nav>

<script>window.CONFIG = { DEMO: true };</script>
<script type="module">${js}</script>
`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/bishusha-demo.html', html);
console.log(`dist/bishusha-demo.html · ${(html.length / 1024).toFixed(0)} KB`);
