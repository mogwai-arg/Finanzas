// node js/bishu.test.mjs
import assert from 'node:assert/strict';
import { queDiceBishu, frasesDeBishu } from './bishu.js';
import * as F from './finance.js';

let ok = 0, mal = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };
const d = s => F.parseFecha(s);
const d2 = d;

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

t('tiene más de una cosa para decir, y la primera es la que importa', () => {
  const d = { excedida: { nombre: 'Combustible', exceso: 12000 },
              cierraManana: 'Galicia Visa',
              gastadoEsteMesAlDia: 300000, gastadoMesPasadoAlDia: 500000,
              ahorro: { falta: 200000 },
              mayor: { nombre: 'Coto', monto: 154136 } };
  const f = frasesDeBishu(d, d2('2026-09-15'));
  assert.ok(f.length >= 5, `solo tiene ${f.length} para decir`);
  assert.equal(f[0].texto, queDiceBishu(d, d2('2026-09-15')).texto);
  assert.match(f[0].texto, /Combustible se pasó \$ 12\.000/);
  // Cada una es corta y sabe a dónde lleva.
  for (const x of f) {
    assert.ok(x.texto.length <= 100, `muy largo: ${x.texto}`);
    assert.ok(x.animo, 'sin ánimo');
  }
});

t('un tope pasado va antes que una comparación que puede esperar', () => {
  const f = frasesDeBishu({ excedida: { nombre: 'Comida', exceso: 5000 },
    gastadoEsteMesAlDia: 100000, gastadoMesPasadoAlDia: 500000 }, d2('2026-09-15'));
  assert.match(f[0].texto, /Comida se pasó/);
  assert.match(f[1].texto, /menos que el mes pasado/);
});

t('el silencio de tres días gana incluso a un tope pasado', () => {
  const f = frasesDeBishu({ diasSinCargar: 4, excedida: { nombre: 'Comida', exceso: 5000 } },
    d2('2026-09-15'));
  assert.match(f[0].texto, /4 días/);
});

t('cuando el mes viene tranquilo igual tiene algo honesto que decir', () => {
  const f = frasesDeBishu({}, d2('2026-09-15'));
  assert.ok(f.length >= 1);
  assert.equal(f[f.length - 1].animo, 'dormido');
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

// --------------------------------------------------------- la memoria
const HOY = new Date(2026, 8, 20);
const haceDias = n => new Date(2026, 8, 20 - n).toISOString();

t('sin memoria dice lo mismo de siempre', () => {
  const f = frasesDeBishu({ excedida: { id: 'c3', nombre: 'Combustible', exceso: 12000 } }, HOY);
  assert.match(f[0].texto, /se pasó/);
});

t('lo que marcó y mejoró se dice PRIMERO', () => {
  // Es todo el punto: una app que solo señala lo que está mal solo trae malas
  // noticias, y a alguien así se lo deja de escuchar.
  const f = frasesDeBishu({
    memoria: { dichos: [{ k: 'tope:c3', valor: 12000, cuando: haceDias(10) }] },
    categorias: [{ id: 'c3', nombre: 'Combustible', gastado: 98000, tope: 140000 }]
  }, HOY);
  assert.match(f[0].texto, /se te había pasado del tope y ahora va dentro/);
});

t('si sigue pasada, no felicita', () => {
  // Felicitar por algo que no cambió es peor que no decir nada: la próxima vez
  // ya no se le cree.
  const f = frasesDeBishu({
    memoria: { dichos: [{ k: 'tope:c3', valor: 12000, cuando: haceDias(10) }] },
    categorias: [{ id: 'c3', nombre: 'Combustible', gastado: 160000, tope: 140000 }]
  }, HOY);
  assert.ok(!f.some(x => /ahora va dentro/.test(x.texto)));
});

t('un fijo que bajó después de marcarlo se reconoce, con el número del año', () => {
  const f = frasesDeBishu({
    memoria: { dichos: [{ k: 'aumento:Flow', valor: 46400, cuando: haceDias(25) }] },
    fijos: [{ nombre: 'Flow', monto: 32000 }]
  }, HOY);
  assert.match(f[0].texto, /Flow te lo bajaron/);
  assert.match(f[0].texto, /172\.800 en un año/);
});

t('una baja de dos pesos no cuenta como que lo bajaste', () => {
  const f = frasesDeBishu({
    memoria: { dichos: [{ k: 'aumento:Flow', valor: 46400, cuando: haceDias(25) }] },
    fijos: [{ nombre: 'Flow', monto: 46200 }]
  }, HOY);
  assert.ok(!f.some(x => /te lo bajaron/.test(x.texto)));
});

t('dar vuelta el ritmo se reconoce', () => {
  const f = frasesDeBishu({
    memoria: { dichos: [{ k: 'ritmo', valor: 80000, cuando: haceDias(10) }] },
    gastadoMesPasadoAlDia: 500000, gastadoEsteMesAlDia: 400000
  }, HOY);
  assert.match(f[0].texto, /lo diste vuelta/);
});

t('lo de ayer no vuelve a ser lo primero', () => {
  // Lo mismo dos días seguidos deja de leerse. No se borra: baja al final.
  const d = { memoria: { dichos: [{ k: 'tope:c3', cuando: haceDias(1) }] },
              excedida: { id: 'c3', nombre: 'Combustible', exceso: 12000 },
              cierraManana: 'Galicia Visa' };
  const f = frasesDeBishu(d, HOY);
  assert.match(f[0].texto, /cierra mañana/);
  assert.ok(f.some(x => /se pasó/.test(x.texto)), 'sigue estando, abajo');
});

t('lo de hace una semana sí puede volver a decirse', () => {
  const d = { memoria: { dichos: [{ k: 'tope:c3', cuando: haceDias(7) }] },
              excedida: { id: 'c3', nombre: 'Combustible', exceso: 12000 } };
  assert.match(frasesDeBishu(d, HOY)[0].texto, /se pasó/);
});

t('cada frase lleva de qué habla, para poder acordarse', () => {
  const f = frasesDeBishu({ excedida: { id: 'c3', nombre: 'Combustible', exceso: 12000 } }, HOY);
  assert.equal(f[0].k, 'tope:c3');
  assert.equal(f[0].valor, 12000);
});

t('lo dicho HOY sigue primero: no puede cambiar sola entre dos aperturas', () => {
  const d = { memoria: { dichos: [{ k: 'tope:c3', cuando: new Date(2026, 8, 20, 9).toISOString() }] },
              excedida: { id: 'c3', nombre: 'Combustible', exceso: 12000 },
              cierraManana: 'Galicia Visa' };
  assert.match(frasesDeBishu(d, HOY)[0].texto, /se pasó/);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
