// node --experimental-strip-types supabase/functions/_shared/clash.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerPromosClash } from './clash.ts';

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

t('una página vacía no rompe', () => {
  assert.deepEqual(leerPromosClash('<html><body>nada</body></html>'), []);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
