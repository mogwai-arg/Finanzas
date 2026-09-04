// node js/filas.test.mjs
import assert from 'node:assert/strict';
import { normalizar } from './filas.js';

let ok = 0, mal = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nLO QUE SE SUBE A LA BASE');

t('un campo calculado por una pantalla no viaja', () => {
  // La pantalla de Cuentas le pega un `saldo` a cada cuenta para mostrarlo.
  const f = normalizar('accounts', { id: 'a', nombre: 'Galicia', tipo: 'cuenta', saldo: 823133.5 });
  assert.equal('saldo' in f, false);
  assert.equal(f.nombre, 'Galicia');
});

t('un día de cierre imposible se guarda como vacío', () => {
  const f = normalizar('accounts', { id: 'b', tipo: 'credito', cierre_dia: 509, vencimiento_dia: 1009 });
  assert.equal(f.cierre_dia, null);
  assert.equal(f.vencimiento_dia, null);
});

t('un día de cierre válido se respeta', () => {
  const f = normalizar('accounts', { id: 'c', tipo: 'credito', cierre_dia: 5, vencimiento_dia: 10 });
  assert.equal(f.cierre_dia, 5);
  assert.equal(f.vencimiento_dia, 10);
});

t('los bordes del mes son válidos, el cero no', () => {
  assert.equal(normalizar('accounts', { cierre_dia: 1 }).cierre_dia, 1);
  assert.equal(normalizar('accounts', { cierre_dia: 31 }).cierre_dia, 31);
  assert.equal(normalizar('accounts', { cierre_dia: 0 }).cierre_dia, null);
  assert.equal(normalizar('accounts', { cierre_dia: 32 }).cierre_dia, null);
});

t('un importe negativo se guarda positivo', () => {
  // La base no acepta importes negativos: una devolución es un ingreso.
  const f = normalizar('transactions', { id: 'd', monto: -461.46, tipo: 'ingreso' });
  assert.equal(f.monto, 461.46);
});

t('los ciclos del resumen sí son una columna', () => {
  const ciclos = [{ cierre: '2026-08-27', vence: '2026-09-04' }];
  assert.deepEqual(normalizar('accounts', { id: 'e', ciclos }).ciclos, ciclos);
});

t('una tabla sin lista de columnas pasa entera', () => {
  const f = normalizar('recibos', { id: 'f', cualquier_cosa: 1 });
  assert.equal(f.cualquier_cosa, 1);
});


// --------------------------------------------------------- valores con check
t('un origen que la base no acepta se cambia por el de siempre', () => {
  // Marcar pagado un gasto fijo guardaba origen 'gasto fijo', y el check de la
  // tabla solo acepta 'manual' e 'import': la fila se rechazaba, y con ella el
  // pago del gasto fijo, que le apunta por clave foranea. El pago se veia
  // hecho y volvia a aparecer pendiente en la siguiente sincronizacion.
  assert.equal(normalizar('transactions', { id: '1', origen: 'gasto fijo' }).origen, 'manual');
});

t('un origen valido no se toca', () => {
  assert.equal(normalizar('transactions', { id: '1', origen: 'import' }).origen, 'import');
});

t('sin origen no se inventa ninguno', () => {
  assert.equal('origen' in normalizar('transactions', { id: '1', monto: 5 }), false);
});

t('un tipo imposible cae en gasto', () => {
  assert.equal(normalizar('transactions', { id: '1', tipo: 'cualquiera' }).tipo, 'gasto');
});

// =====================================================================
// LA BASE TIENE LAS COLUMNAS QUE LA APP ESCRIBE
//
// Es la unica prueba de este archivo que no mira una funcion: lee el codigo
// y lo compara contra las migraciones. Existe porque el mismo error pasa dos
// veces y cuesta lo mismo las dos.
//
// Se escribe la pantalla, se guarda un campo nuevo en `settings` y no se
// escribe el SQL que crea la columna. Postgres rechaza LA FILA ENTERA —"Could
// not find the 'cotejos' column of 'settings' in the schema cache"—, el
// cambio queda en el cajon de pendientes y Ajustes muestra "1 cambios no se
// pudieron subir". No se pierde nada, pero la app deja de guardar ESA fila
// hasta que alguien se acuerde de correr un SQL que nunca se escribio.
//
// Paso con `cotejos` y con `suscripciones`, las dos a la vez.
// =====================================================================
import { readFileSync, readdirSync } from 'node:fs';

/** Las llaves de primer nivel de un objeto literal, contando llaves. */
function llavesDe(src, desde) {
  const fin = (() => {
    let n = 0;
    for (let i = desde; i < src.length; i++) {
      if (src[i] === '{') n++;
      else if (src[i] === '}' && --n === 0) return i;
    }
    return -1;
  })();
  if (fin < 0) return [];
  const cuerpo = src.slice(desde + 1, fin);
  // Solo el primer nivel: se saltea lo que este adentro de otras llaves.
  const llaves = [];
  let n = 0, tok = '';
  for (const c of cuerpo) {
    if (c === '{' || c === '[' || c === '(') n++;
    else if (c === '}' || c === ']' || c === ')') n--;
    else if (n === 0 && c === ',') { tok = ''; continue; }
    else if (n === 0 && c === ':') { const m = tok.trim().match(/([A-Za-z_]\w*)$/);
                                     if (m) llaves.push(m[1]); tok = ''; continue; }
    if (n === 0) tok += c;
  }
  return llaves;
}

t('la base tiene todas las columnas que la app le escribe a settings', () => {
  const archivos = [];
  const recorrer = d => readdirSync(d, { withFileTypes: true }).forEach(e => {
    const f = `${d}/${e.name}`;
    if (e.isDirectory()) recorrer(f);
    else if (f.endsWith('.js')) archivos.push(f);
  });
  recorrer('js');

  const escritas = new Set();
  for (const f of archivos) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/guardar\('settings',\s*\{/g)) {
      for (const k of llavesDe(src, m.index + m[0].length - 1)) escritas.add(k);
    }
  }
  assert.ok(escritas.size >= 4, `no encontro las escrituras a settings (${escritas.size})`);

  const sql = readdirSync('supabase/migrations')
    .map(f => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');
  const faltan = [...escritas].filter(c =>
    !new RegExp(`add column if not exists\\s+${c}\\b`, 'i').test(sql));

  assert.deepEqual(faltan, [],
    `la app escribe settings.${faltan.join(', settings.')} y ninguna migración crea ` +
    'esa columna: la fila entera se va a rechazar');
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
