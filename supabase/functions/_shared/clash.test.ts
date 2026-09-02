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

t('una página vacía no rompe', () => {
  assert.deepEqual(leerPromosClash('<html><body>nada</body></html>'), []);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
