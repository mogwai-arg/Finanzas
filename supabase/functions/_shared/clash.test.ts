// node --experimental-strip-types supabase/functions/_shared/clash.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerPromosClash, leerDatosClash, recorteJSON, fechasDe } from './clash.ts';

let ok = 0, mal = 0;
const t = (n: string, fn: () => void) => { try { fn(); console.log('  ok  ' + n); ok++; }
                                           catch (e: any) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

const html = readFileSync(new URL('../../../js/fixtures/clash-combustibles.html', import.meta.url), 'utf8');
const promos = leerPromosClash(html);

console.log('\nLAS PROMOS DE CLASH');

t('lee la página entera de combustibles', () => {
  assert.ok(promos.length >= 40, `solo leyó ${promos.length}`);
});

t('no repite ninguna', () => {
  assert.equal(new Set(promos.map(p => p.id)).size, promos.length);
});

t('todas tienen emisor, comercio y porcentaje', () => {
  for (const p of promos) {
    assert.ok(p.emisor && p.comercio, JSON.stringify(p));
    assert.ok(p.valor > 0 && p.valor <= 100, `porcentaje raro: ${p.valor}`);
  }
});

t('lee el tope y cada cuánto se renueva', () => {
  const p = promos.find(x => x.id === 'b_41715');     // Mercado Pago en YPF
  assert.equal(p!.valor, 10);
  assert.equal(p!.tope, 5000);
  assert.equal(p!.topePeriodo, 'mensual');
});

t('lee los días marcados, en domingo = 0', () => {
  const p = promos.find(x => x.id === 'b_41715');
  assert.deepEqual(p!.dias, [0]);                     // solo domingos
});

t('la letra chica se conserva', () => {
  const p = promos.find(x => x.id === 'b_41715');
  assert.equal(p!.nota, 'Tarjeta física prepaga');
});

t('guarda el link a la promo', () => {
  const p = promos.find(x => x.id === 'b_41715');
  assert.match(p!.url!, /^https:\/\/promos\.clash\.com\.ar\//);
});

t('las de Galicia, que el sitio marca distinto, no se pierden', () => {
  // El bloque viene con class="ci__d ci__d--s": pedir el atributo exacto
  // dejaba afuera justo las cuatro de Galicia.
  const g = promos.filter(p => p.emisor === 'galicia');
  assert.equal(g.length, 4, `leyó ${g.length} de Galicia`);
  const ypf = g.find(p => p.comercio === 'ypf')!;
  assert.equal(ypf.valor, 25);
  assert.equal(ypf.tope, 20000);
  assert.deepEqual(ypf.dias, [4]);                    // el jueves 10
  assert.match(ypf.nota!, /Cuenta Sueldo/);
  assert.match(ypf.nota!, /10\/09/);
});

t('dice con qué tarjeta o billetera se paga', () => {
  const p = promos.find(x => x.id === 'm_galicia_ypf_mtk9x5lk')!;
  assert.deepEqual(p.medios, ['MODO', 'MASTERCARD PLATINUM']);
});

t('ninguna sale con un campo en null que la app tenga que mostrar', () => {
  for (const p of promos) {
    assert.ok(Number.isFinite(p.valor), `valor no numérico: ${JSON.stringify(p)}`);
    assert.ok(p.id && p.emisor && p.comercio, JSON.stringify(p));
    assert.ok(Array.isArray(p.dias) && Array.isArray(p.medios));
  }
});

t('lee la promo aunque no sea un link', () => {
  // El sitio arma algunas tarjetas como <div>. Atarse al <a> era atarse a
  // que la promo tuviera ficha propia.
  const html = '<div class="ci" data-pid="x1" data-bk="galicia" data-mc="ypf">' +
               '<span class="ci__d ci__d--s">30%</span>' +
               '<span class="ci__meta">Tope: $10.000<br>x mes</span></div>';
  const [p] = leerPromosClash(html);
  assert.equal(p.valor, 30);
  assert.equal(p.tope, 10000);
  assert.equal(p.topePeriodo, 'mensual');
});

t('las tarjetas de relleno no cuentan como promo', () => {
  assert.deepEqual(leerPromosClash('<div class="ci"></div><div class="ci"></div>'), []);
});

t('si falta el porcentaje lo saca del link', () => {
  const html = '<a class="ci ci--link" href="/combustibles/promocion/15-off-en-shell-con-galicia-b_9/"' +
               ' data-pid="b_9" data-bk="galicia" data-mc="shell"><span class="ci__x">off</span></a>';
  assert.equal(leerPromosClash(html)[0].valor, 15);
});

t('la promo de una vez al mes queda con su fecha, no con su día', () => {
  // "Jueves 10/09" no es todos los jueves: es el jueves 10.
  const p = promos.find(x => x.id === 'm_galicia_ypf_mtk9x5lk')!;
  assert.deepEqual(p.fechas, ['2026-09-10']);
});

t('lee la fecha aunque no diga el día de la semana', () => {
  const ref = new Date(2026, 8, 2);
  assert.deepEqual(fechasDe('10/09', ref), ['2026-09-10']);
  assert.deepEqual(fechasDe('Del 10/09 al 12/09', ref), ['2026-09-10', '2026-09-12']);
});

t('elige el año que deja la fecha más cerca', () => {
  // Leída el 28 de diciembre, "02/01" es del año que viene.
  assert.deepEqual(fechasDe('Viernes 02/01', new Date(2026, 11, 28)), ['2027-01-02']);
  // Y leída el 2 de enero, "28/12" es del que pasó.
  assert.deepEqual(fechasDe('28/12', new Date(2027, 0, 2)), ['2026-12-28']);
});

t('una fecha imposible no se inventa', () => {
  assert.deepEqual(fechasDe('31/02'), []);
  assert.deepEqual(fechasDe('Tope: $10.000'), []);
  assert.deepEqual(fechasDe(null), []);
});

t('una página vacía no rompe', () => {
  assert.deepEqual(leerPromosClash('<html><body>nada</body></html>'), []);
});

// =====================================================================
// EL data.js, QUE ES POR DONDE VIENEN AHORA
// =====================================================================
const js = readFileSync(new URL('../../../js/fixtures/clash-data.js', import.meta.url), 'utf8');
const datos = leerDatosClash(js, 'combustibles', new Date(2026, 8, 2));

console.log('\nLAS PROMOS, COMO VIENEN AHORA');

t('lee todas las que tienen algo que mostrar', () => {
  // Una no tiene ni porcentaje ni cuotas: no es una promo.
  assert.equal(datos.length, 4);
});

t('el mismo banco en el mismo comercio va una sola vez, con la mejor', () => {
  // Galicia tiene dos en YPF: la de 25 % con MODO y una de 15 % con débito.
  const ypf = datos.filter(p => p.emisor === 'galicia' && p.comercio === 'YPF');
  assert.equal(ypf.length, 1);
  assert.equal(ypf[0].valor, 25);
});

t('la de Galicia queda entera', () => {
  const p = datos.find(x => x.id === 'm_galicia_ypf_mtk9x5lk')!;
  assert.equal(p.valor, 25);
  assert.equal(p.tipo, 'descuento');
  assert.equal(p.tope, 20000);
  assert.equal(p.topePeriodo, 'mensual');
  assert.deepEqual(p.dias, [4]);                       // jueves
  assert.deepEqual(p.fechas, ['2026-09-10']);          // y solo el 10
  assert.deepEqual(p.medios, ['MODO', 'MASTERCARD PLATINUM']);
  assert.equal(p.nota, 'Cuenta Sueldo · Jueves 10/09');
});

t('dice el nombre del comercio, no su identificador', () => {
  assert.equal(datos.find(x => x.id === 'b_50001')!.comercio, 'Puma Energy');
  assert.equal(datos.find(x => x.id === 'b_41715')!.emisorNombre, 'Mercado Pago');
});

t('los días vienen del lunes y la app los guarda desde el domingo', () => {
  assert.deepEqual(datos.find(x => x.id === 'b_41715')!.dias, [0]);    // domingo
  assert.deepEqual(datos.find(x => x.id === 'b_50001')!.dias, [5, 6]); // viernes y sábado
  assert.deepEqual(datos.find(x => x.id === 'b_39100')!.dias, []);     // los siete = todos
});

t('un reintegro no se confunde con un descuento', () => {
  const p = datos.find(x => x.id === 'b_39100')!;
  assert.equal(p.tipo, 'reintegro');
  assert.equal(p.topePeriodo, 'semanal');
});

t('las cuotas entran aunque no haya porcentaje', () => {
  const p = datos.find(x => x.id === 'b_50001')!;
  assert.equal(p.tipo, 'cuotas');
  assert.equal(p.valor, 6);
});

t('el link lleva a la ficha de esa promo', () => {
  assert.equal(datos.find(x => x.id === 'b_41715')!.url,
    'https://promos.clash.com.ar/combustibles/promocion/10-off-en-ypf-con-mercado-pago-b_41715/');
});

t('una llave adentro de un texto no corta el recorte', () => {
  // La tercera promo trae "{tope}" en la letra chica a propósito.
  assert.equal(datos.find(x => x.id === 'b_39100')!.valor, 20);
  const j = recorteJSON('x = {"a":"}{{","b":{"c":1}} ; sobra', 0);
  assert.equal(j, '{"a":"}{{","b":{"c":1}}');
});

t('un data.js que no se entiende no rompe nada', () => {
  assert.deepEqual(leerDatosClash('window.__clashData = {roto', 'x'), []);
  assert.deepEqual(leerDatosClash('nada de nada', 'x'), []);
  assert.deepEqual(leerDatosClash('', 'x'), []);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
