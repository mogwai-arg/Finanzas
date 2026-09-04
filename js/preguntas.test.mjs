// node js/preguntas.test.mjs
import assert from 'node:assert/strict';
import * as P from './preguntas.js';

let ok = 0, mal = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nLO QUE BISHU SABE CONTESTAR');

t('reconoce las ocho', () => {
  const esperado = {
    '¿cuánto gasté este mes?': 'cuantoGaste',
    '¿cuánto entró?': 'cuantoEntro',
    '¿cuánto me queda?': 'plataLibre',
    '¿cuánto tengo?': 'cuantoTengo',
    '¿en qué se me fue?': 'enQueSeFue',
    '¿qué se viene?': 'loQueViene',
    '¿cuánto debo de tarjetas?': 'tarjetas',
    '¿cuánto rinde mi plata?': 'rinde'
  };
  for (const [q, id] of Object.entries(esperado)) assert.equal(P.quePregunta(q), id, q);
});

t('también sin signos ni tildes', () => {
  assert.equal(P.quePregunta('cuanto me queda'), 'plataLibre');
  assert.equal(P.quePregunta('en que se me fue'), 'enQueSeFue');
});

t('cargar un gasto NO es preguntar', () => {
  // Es la colisión que importa: si una carga se toma por pregunta, el gasto
  // no se anota y uno se entera a fin de mes.
  for (const s of ['coto 47310', '45 lucas de nafta', 'café 800 ayer',
                   'zapatillas 120000 en 6 cuotas con la visa', 'cobré 3,5 palos'])
    assert.equal(P.quePregunta(s), null, s);
});

t('corregir tampoco', () => {
  for (const s of ['ay la pagué con efectivo', 'es gastronomía', 'no, eran 8500',
                   'fue ayer', 'borralo', 'ponelo en mascotas'])
    assert.equal(P.quePregunta(s), null, s);
});

t('una pregunta con un número adentro sigue siendo una pregunta', () => {
  // "cuánto me queda de los 50000" tiene un monto: sin esto se anotaba un
  // gasto de cincuenta mil que nadie hizo.
  assert.equal(P.quePregunta('¿cuánto me queda de los 50000?'), 'plataLibre');
});

t('lo que no entiende devuelve null en vez de contestar cualquier cosa', () => {
  for (const s of ['hola', '', 'nafta', 'qué tal', 'gracias'])
    assert.notEqual(P.quePregunta(s), 'cuantoGaste', s);
});

console.log('\nLAS RESPUESTAS');

const HOY = new Date(2026, 8, 20);
const ESTADO = {
  accounts: [
    { id: 'gal', nombre: 'Galicia', tipo: 'cuenta', moneda: 'ARS',
      saldo_inicial: 800000, saldo_al: '2026-09-01' },
    { id: 'mp', nombre: 'Mercado Pago', tipo: 'billetera', moneda: 'ARS', tna: 32,
      saldo_inicial: 400000, saldo_al: '2026-09-01' },
    { id: 'w', nombre: 'Wallbit', tipo: 'billetera', moneda: 'USD',
      saldo_inicial: 5000, saldo_al: '2026-09-01' }
  ],
  transactions: [
    { id: 'g1', tipo: 'gasto', moneda: 'ARS', monto: 47310, fecha: '2026-09-05',
      account_id: 'gal', category_id: 'c1' },
    { id: 'g2', tipo: 'gasto', moneda: 'ARS', monto: 20000, fecha: '2026-09-06',
      account_id: 'gal', category_id: 'c2' },
    { id: 'i1', tipo: 'ingreso', moneda: 'ARS', monto: 3000000, fecha: '2026-09-05',
      account_id: 'gal' }
  ],
  recurrings: [], recurring_payments: [],
  categories: [{ id: 'c1', nombre: 'Supermercado' }, { id: 'c2', nombre: 'Gastronomía' }],
  settings: { usd_ref: 1500 }
};

t('cuánto gasté da el número del mes', () => {
  const r = P.contestar('cuantoGaste', ESTADO, HOY);
  assert.match(r.titulo, /67\.310/);
  assert.equal(r.ir, '/gastos');
});

t('en qué se fue nombra la categoría más grande y su parte', () => {
  const r = P.contestar('enQueSeFue', ESTADO, HOY);
  assert.match(r.titulo, /Supermercado/);
  assert.match(r.titulo, /47\.310/);
  assert.match(r.titulo, /70 %/, 'la parte que representa');
});

t('cuánto tengo suma los dólares cuando hay cotización', () => {
  const r = P.contestar('cuantoTengo', ESTADO, HOY);
  assert.match(r.titulo, /US\$\s5\.000/);
  assert.match(r.detalle, /Todo junto/);
});

t('y avisa cuando falta la cotización en vez de sumar mal', () => {
  const sinRef = { ...ESTADO, settings: {} };
  const r = P.contestar('cuantoTengo', sinRef, HOY);
  assert.match(r.detalle, /falta la cotización/);
});

t('lo que rinde dice cuál es la mejor', () => {
  const r = P.contestar('rinde', ESTADO, HOY);
  assert.match(r.detalle, /Mercado Pago/);
  assert.match(r.detalle, /32 %/);
});

t('sin tasas cargadas no inventa un rendimiento', () => {
  const sinTasa = { ...ESTADO, accounts: ESTADO.accounts.map(({ tna, ...a }) => a) };
  const r = P.contestar('rinde', sinTasa, HOY);
  assert.match(r.titulo, /no cargaste la tasa/);
});

t('sin nada por pagar lo dice, no muestra una lista vacía', () => {
  const r = P.contestar('loQueViene', ESTADO, HOY);
  assert.match(r.titulo, /No te queda nada por pagar/);
});

t('sin tarjetas tampoco inventa', () => {
  const r = P.contestar('tarjetas', ESTADO, HOY);
  assert.match(r.titulo, /No tenés tarjetas/);
});

t('toda respuesta lleva a la pantalla donde se ve entero', () => {
  // Una cifra sola invita a preguntar "¿de qué?", y esa respuesta ya existe y
  // es una pantalla, no otro renglón de chat.
  for (const id of ['cuantoGaste', 'cuantoEntro', 'plataLibre', 'cuantoTengo',
                    'enQueSeFue', 'loQueViene', 'tarjetas', 'rinde']) {
    const r = P.contestar(id, ESTADO, HOY);
    assert.ok(r && r.titulo, id);
    assert.ok(r.ir && r.ir.startsWith('/'), id + ' tiene que llevar a algún lado');
  }
});

t('un id que no existe devuelve null', () => {
  assert.equal(P.contestar('cualquiera', ESTADO, HOY), null);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
