// =====================================================================
// build-web.mjs — arma dist/ para publicar en Cloudflare Pages.
//
// Existe por dos razones:
//   1. config.js esta en .gitignore, asi que un deploy conectado a Git no lo
//      tendria. Aca se genera desde las variables de entorno de Pages, y las
//      claves no viajan al repositorio.
//   2. Publicar la carpeta entera subiria tests, SQL, migraciones y los
//      recibos de ejemplo. A dist/ va solo lo que el navegador necesita.
//
// En Cloudflare Pages:
//   Build command:  npm run build
//   Output:         dist
//   Variables:      SUPABASE_URL, SUPABASE_ANON_KEY
// =====================================================================
import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'dist';
const { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC = '' } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('\nFaltan SUPABASE_URL y/o SUPABASE_ANON_KEY.\n' +
    'En Cloudflare: Settings → Environment variables.\n' +
    'Para probar localmente:\n' +
    '  SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run build\n');
  process.exit(1);
}

// El demo empaquetado no se pisa: se genera aparte con `npm run demo`.
const demo = join(OUT, 'bishusha-demo.html');
const guardarDemo = existsSync(demo);
const copia = guardarDemo ? (await import('node:fs')).readFileSync(demo) : null;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
if (copia) writeFileSync(demo, copia);

// Lo que el navegador necesita, y nada mas.
for (const d of ['css', 'vendor', 'icons', 'marca']) cpSync(d, join(OUT, d), { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'privacidad.html']) {
  if (existsSync(f)) cpSync(f, join(OUT, f));
}

// js/ sin las pruebas ni los fixtures.
mkdirSync(join(OUT, 'js/vistas'), { recursive: true });
for (const f of readdirSync('js')) {
  if (f.endsWith('.test.mjs') || f === 'fixtures') continue;
  if (f === 'vistas') continue;
  cpSync(join('js', f), join(OUT, 'js', f));
}
for (const f of readdirSync('js/vistas')) cpSync(join('js/vistas', f), join(OUT, 'js/vistas', f));

// La anon key es publica por diseno: viaja en el navegador y lo que protege
// los datos es RLS. La service role key NO va aca nunca.
writeFileSync(join(OUT, 'config.js'), `// Generado por build-web.mjs. No editar a mano.
window.CONFIG = {
  DEMO: false,
  SUPABASE_URL:      ${JSON.stringify(SUPABASE_URL)},
  SUPABASE_ANON_KEY: ${JSON.stringify(SUPABASE_ANON_KEY)},
  FUNCTIONS_URL:     ${JSON.stringify(SUPABASE_URL.replace(/\/$/, '') + '/functions/v1')},
  VAPID_PUBLIC:      ${JSON.stringify(VAPID_PUBLIC)}
};
`);

console.log(`dist/ listo · ${SUPABASE_URL}`);
