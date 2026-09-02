// node js/bishu.test.mjs
import assert from 'node:assert/strict';
import { queDiceBishu } from './bishu.js';
import * as F from './finance.js';

let ok = 0, mal = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };
const d = s => F.parseFecha(s);

console.log('\nLO QUE DICE BISHU');

t('una promo de hoy va antes que todo: hoy se vence', () => {
  const r = queDiceBishu({ diasSinCargar: 5,
    promos: [{ dias: 0, titulo: 'YPF 25%', valor: 25, tipo: 'descuento', medio: 'MODO' }] },
    d('2026-09-10'));
  assert.match(r.texto, /Hoy es la de YPF/);
  assert.match(r.texto, /25 % de descuento con MODO/);
  assert.equal(r.ir, '/promos');
});

t('la que cae pronto se avisa, la que falta mucho no', () => {
  const prox = p => queDiceBishu({ promos: [{ dias: p, cuando: 'jueves 10', titulo: 'YPF 25%',
                                              valor: 25, tipo: 'descuento' }] }, d('2026-09-08'));
  assert.match(prox(2).texto, /El jueves 10 cae la de YPF/);
  assert.match(prox(1).texto, /Mañana cae la de YPF/);
  assert.doesNotMatch(prox(9).texto, /YPF/);
});

t('el silencio de tres días gana a la promo que todavía no es hoy', () => {
  const r = queDiceBishu({ diasSinCargar: 4,
    promos: [{ dias: 2, cuando: 'jueves 10', titulo: 'YPF 25%' }] }, d('2026-09-08'));
  assert.match(r.texto, /4 días/);
});

t('el silencio de tres días gana a cualquier otra cosa', () => {
  const r = queDiceBishu({ diasSinCargar: 3, gastadoEsteMesAlDia: 100000,
                           gastadoMesPasadoAlDia: 500000 }, d('2026-09-15'));
  assert.match(r.texto, /3 días/);
});

t('dos días de silencio todavía no son noticia', () => {
  const r = queDiceBishu({ diasSinCargar: 2, gastadoEsteMesAlDia: 400000,
                           gastadoMesPasadoAlDia: 500000 }, d('2026-09-15'));
  assert.match(r.texto, /menos que el mes pasado/);
});

t('gastar menos que el mes pasado se festeja, con el número', () => {
  const r = queDiceBishu({ gastadoEsteMesAlDia: 300000,
                           gastadoMesPasadoAlDia: 500000 }, d('2026-09-15'));
  assert.equal(r.animo, 'festejo');
  assert.match(r.texto, /200\.000 menos/);
});

t('gastar más lo dice sin retar', () => {
  const r = queDiceBishu({ gastadoEsteMesAlDia: 700000,
                           gastadoMesPasadoAlDia: 500000 }, d('2026-09-15'));
  assert.equal(r.animo, 'alerta');
  assert.match(r.texto, /200\.000 más/);
  assert.doesNotMatch(r.texto, /much|cuidado|mal/i);
});

t('una diferencia chica no es una noticia', () => {
  const r = queDiceBishu({ gastadoEsteMesAlDia: 505000,
                           gastadoMesPasadoAlDia: 500000 }, d('2026-09-15'));
  assert.match(r.texto, /casi igual/);
});

t('el 2 del mes no compara nada: no hay con qué', () => {
  const r = queDiceBishu({ gastadoEsteMesAlDia: 10000,
                           gastadoMesPasadoAlDia: 500000 }, d('2026-09-02'));
  assert.match(r.texto, /Arranca el mes/);
});

t('nunca dice dos cosas a la vez', () => {
  for (const caso of [{ diasSinCargar: 5 }, { gastadoEsteMesAlDia: 1, gastadoMesPasadoAlDia: 1 },
                      { cargoHoy: true }, {}]) {
    const r = queDiceBishu(caso, d('2026-09-15'));
    assert.ok(r.texto.length <= 90, `muy largo: ${r.texto}`);
    assert.ok(r.animo, 'sin ánimo');
  }
});

// --------------------------------------------------- lo que le da de comer
const TXS = [
  { id: 1, tipo: 'gasto', moneda: 'ARS', monto: 100000, fecha: '2026-08-03', fuente: 'manual' },
  { id: 2, tipo: 'gasto', moneda: 'ARS', monto: 400000, fecha: '2026-08-20', fuente: 'manual' },
  { id: 3, tipo: 'gasto', moneda: 'ARS', monto: 250000, fecha: '2026-09-04', fuente: 'manual' },
  { id: 4, tipo: 'ingreso', moneda: 'ARS', monto: 900000, fecha: '2026-09-01', fuente: 'manual' },
  { id: 5, tipo: 'gasto', moneda: 'USD', monto: 850, fecha: '2026-09-02', fuente: 'manual' }
];

t('compara los mismos días de cada mes, no el mes entero', () => {
  assert.equal(F.gastadoAlDia(TXS, '2026-09', 10), 250000);
  // Del mes pasado, hasta el día 10, entra solo el primero.
  assert.equal(F.gastadoAlDia(TXS, '2026-08', 10), 100000);
  assert.equal(F.gastadoAlDia(TXS, '2026-08', 31), 500000);
});

t('los ingresos y los dólares no entran en la comparación', () => {
  assert.equal(F.gastadoAlDia(TXS, '2026-09', 30), 250000);
  assert.equal(F.gastadoAlDia(TXS, '2026-09', 30, 'USD'), 850);
});

t('los días sin cargar cuentan desde lo último cargado a mano', () => {
  assert.equal(F.diasSinCargar(TXS, d('2026-09-07')), 3);
  assert.equal(F.diasSinCargar([], d('2026-09-07')), null);
  // Lo que entra solo no dice nada del hábito.
  const auto = [{ tipo: 'gasto', fecha: '2026-09-06', fuente: 'resumen' }, ...TXS];
  assert.equal(F.diasSinCargar(auto, d('2026-09-07')), 3);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
