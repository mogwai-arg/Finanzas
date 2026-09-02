// =====================================================================
// build-funciones.mjs — deja cada Edge Function en UN solo archivo.
//
// Por que: el panel de Supabase permite crear y desplegar funciones desde el
// navegador, pero pegando codigo, no carpetas. Nuestras funciones importan de
// ../_shared, asi que pegadas tal cual no arrancan.
//
// Esto junta cada funcion con lo que importa de _shared en un archivo solo,
// listo para copiar y pegar. Lo de afuera (esm.sh, npm:) queda como esta: eso
// lo resuelve Deno del otro lado.
//
//   npm run funciones     →  supabase/para-pegar/<nombre>.ts
// =====================================================================
import { build } from 'esbuild';
import { mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ORIGEN = 'supabase/functions';
// Va versionado a proposito: sin terminal, la unica forma de tener el codigo
// a mano es abrirlo en GitHub y copiarlo.
const SALIDA = 'supabase/para-pegar';

const funciones = readdirSync(ORIGEN, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== '_shared')
  .map(d => d.name);

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

for (const nombre of funciones) {
  await build({
    entryPoints: [join(ORIGEN, nombre, 'index.ts')],
    outfile: join(SALIDA, `${nombre}.ts`),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    // Todo lo remoto lo baja Deno cuando corre: no hay que empaquetarlo.
    external: ['https://*', 'http://*', 'npm:*', 'jsr:*', 'node:*'],
    legalComments: 'none'
  });

  const p = join(SALIDA, `${nombre}.ts`);
  writeFileSync(p, `// ${nombre} — generado por build-funciones.mjs, no editar a mano.\n` +
    `// El original vive en ${ORIGEN}/${nombre}/index.ts\n\n` + readFileSync(p, 'utf8'));
  console.log(`${SALIDA}/${nombre}.ts`);
}
