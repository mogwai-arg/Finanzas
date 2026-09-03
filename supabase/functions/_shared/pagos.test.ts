// node --experimental-strip-types supabase/functions/_shared/pagos.test.ts
import assert from 'node:assert/strict';
import { esPagoDeTarjeta, comoPagoDeTarjeta } from './pagos.ts';

let ok = 0, mal = 0;
const t = (n: string, fn: () => void) => { try { fn(); console.log('  ok  ' + n); ok++; }
                                           catch (e: any) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nEL PAGO DE UN RESUMEN NO ES UN GASTO');

const CUENTAS = [
  { id: 'visa', nombre: 'Galicia Visa', tipo: 'credito', ultimos4: '0926' },
  { id: 'mc', nombre: 'Galicia Mastercard', tipo: 'credito', ultimos4: '4412' },
  { id: 'gal', nombre: 'Galicia', tipo: 'cuenta' },
  { id: 'vieja', nombre: 'Naranja', tipo: 'credito', activo: false }
];

t('los últimos cuatro números mandan sobre todo lo demás', () => {
  // Es lo único inequívoco. El texto puede decir "visa" por otra razón.
  assert.equal(esPagoDeTarjeta('Pago de tarjeta 4412', CUENTAS)?.id, 'mc');
});

t('y si no hay números, la marca escrita', () => {
  assert.equal(esPagoDeTarjeta('Pago de tarjeta VISA', CUENTAS)?.id, 'visa');
  assert.equal(esPagoDeTarjeta('Pago tarjeta Mastercard', CUENTAS)?.id, 'mc');
});

t('con dos tarjetas y ninguna pista NO se adivina', () => {
  // Mandar el pago a la tarjeta equivocada deja una saldada de más y la otra
  // impaga: es peor que dejarlo como estaba.
  assert.equal(esPagoDeTarjeta('Pago de tu resumen', CUENTAS), null);
});

t('pero con una sola tarjeta no hay nada que adivinar', () => {
  const una = [CUENTAS[0], CUENTAS[2]];
  assert.equal(esPagoDeTarjeta('Pago de tu resumen', una)?.id, 'visa');
});

t('una tarjeta dada de baja no cuenta', () => {
  const soloVieja = [{ ...CUENTAS[3] }, CUENTAS[2]];
  assert.equal(esPagoDeTarjeta('Pago de tu resumen', soloVieja), null);
});

t('sin tarjetas no pasa nada', () => {
  assert.equal(esPagoDeTarjeta('Pago de tarjeta VISA', [CUENTAS[2]]), null);
});

t('una compra común no es el pago de un resumen', () => {
  for (const txt of ['COTO CICSA 3456', 'Pago de servicios', 'Compraste en Mercado Libre',
                     'Consumo con tarjeta VISA en Shell'])
    assert.equal(esPagoDeTarjeta(txt, CUENTAS), null, txt);
});

t('un importe con cuatro dígitos no se confunde con los últimos cuatro', () => {
  // "$ 4412,00" no dice nada de qué tarjeta es.
  assert.equal(esPagoDeTarjeta('Pago de tu resumen por $ 4412,00', CUENTAS), null);
});

console.log('\nCÓMO QUEDA LA FILA');

const fila = { descripcion: 'Pago tarjeta', comercio: 'Pago tarjeta', monto: 939323,
               tipo: 'gasto', account_id: 'gal', category_id: 'c9', cuotas: 1 };

t('queda como movida con destino a la tarjeta, que es lo que la da por pagada', () => {
  const r = comoPagoDeTarjeta(fila, CUENTAS[0]);
  assert.equal(r.tipo, 'transferencia');
  assert.equal(r.destino_account_id, 'visa');
  assert.equal(r.account_id, 'gal', 'el origen es de dónde salió la plata');
});

t('sin categoría: la plata sigue siendo tuya, cambió de lugar', () => {
  // Con categoría entraría al gráfico de en qué se fue, contando dos veces las
  // compras que ese pago está saldando.
  assert.equal(comoPagoDeTarjeta(fila, CUENTAS[0]).category_id, null);
});

t('sin origen conocido se deja en null, no se inventa', () => {
  const r = comoPagoDeTarjeta({ ...fila, account_id: null }, CUENTAS[0]);
  assert.equal(r.account_id, null);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
