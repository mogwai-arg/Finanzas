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
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
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
const copia = guardarDemo ? readFileSync(demo) : null;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
if (copia) writeFileSync(demo, copia);

// Lo que el navegador necesita, y nada mas.
for (const d of ['css', 'vendor', 'icons', 'marca']) cpSync(d, join(OUT, d), { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'privacidad.html']) {
  if (existsSync(f)) cpSync(f, join(OUT, f));
}

// El service worker lleva la version del deploy adentro. Sin esto el archivo
// sale identico en cada publicacion, el navegador no ve nada nuevo, no vuelve
// a instalar y sigue sirviendo el JS viejo del cache para siempre: se publica
// una funcion y en el telefono no aparece nunca.
const version = (process.env.CF_PAGES_COMMIT_SHA || '').slice(0, 8) || String(Date.now());
// La version tambien va a la configuracion del navegador. Sin poder verla no
// hay forma de saber si un arreglo llego al telefono o si el service worker
// sigue sirviendo lo viejo, y eso convierte cada prueba en una adivinanza.
//
// Y la lista de lo que guarda se arma ACA, mirando los archivos que existen,
// en vez de mantenerse a mano. Escrita a mano se atrasa sola: cada pantalla
// nueva —fondos, categorizar, la ficha de una cuenta— quedaba afuera, y sin
// senal se ve igual que si estuviera, porque online se baja igual. El dia que
// no hay senal esa pantalla no abre y nadie sabe por que.
//
// pdf.mjs y su worker siguen afuera a proposito: pesan 1,7 MB entre los dos y
// solo hacen falta al importar un resumen. Se guardan solos la primera vez.
const paraElCache = [
  './', './index.html', './config.js', './manifest.webmanifest',
  ...readdirSync('css').filter(f => f.endsWith('.css')).map(f => `./css/${f}`),
  ...readdirSync('js').filter(f => f.endsWith('.js')).map(f => `./js/${f}`),
  ...readdirSync('js/vistas').filter(f => f.endsWith('.js')).map(f => `./js/vistas/${f}`),
  './vendor/supabase.js', './marca/isotipo.svg', './icons/icon-192.png'
];
writeFileSync(join(OUT, 'sw.js'),
  readFileSync('sw.js', 'utf8')
    .replace(/const V = '[^']*'/, `const V = 'bishusha-${version}'`)
    .replace(/const SHELL = \[[\s\S]*?\n\];/,
             `const SHELL = ${JSON.stringify(paraElCache, null, 2)};`));

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
  VAPID_PUBLIC:      ${JSON.stringify(VAPID_PUBLIC)},
  VERSION:           ${JSON.stringify(version)}
};
`);

console.log(`dist/ listo · ${SUPABASE_URL} · worker bishusha-${version}`);
