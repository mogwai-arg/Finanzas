// node js/texto.test.mjs
import assert from 'node:assert/strict';
import { tituloTx, dondeTx, aNumero } from './texto.js';

let ok = 0, mal = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nCOMO SE NOMBRA UN MOVIMIENTO');

t('lo que compraste manda sobre donde', () => {
  const tx = { descripcion: 'zapatillas para Feli', comercio: 'Dexter' };
  assert.equal(tituloTx(tx), 'zapatillas para Feli');
  assert.equal(dondeTx(tx), 'Dexter');
});

t('un consumo del resumen no repite el comercio dos veces', () => {
  const tx = { descripcion: 'ADOBE', comercio: 'ADOBE' };
  assert.equal(tituloTx(tx), 'ADOBE');
  assert.equal(dondeTx(tx), '');
});

t('sin decir que compraste, queda el comercio', () => {
  const tx = { descripcion: '', comercio: 'Coto' };
  assert.equal(tituloTx(tx), 'Coto');
  assert.equal(dondeTx(tx), '');
});

t('sin comercio, queda lo que compraste', () => {
  const tx = { descripcion: 'super de la semana', comercio: null };
  assert.equal(tituloTx(tx), 'super de la semana');
  assert.equal(dondeTx(tx), '');
});

t('los espacios de mas no cuentan como diferencia', () => {
  const tx = { descripcion: '  Coto  ', comercio: 'Coto' };
  assert.equal(tituloTx(tx), 'Coto');
  assert.equal(dondeTx(tx), '');
});

t('un movimiento sin nada tiene igual un nombre', () => {
  assert.equal(tituloTx({}), 'Movimiento');
  assert.equal(dondeTx({}), '');
});

console.log('\nUN IMPORTE ESCRITO A MANO');

t('con coma decimal, como se escribe acá', () => {
  assert.equal(aNumero('88,23'), 88.23);
  assert.equal(aNumero('1.234,56'), 1234.56);
  assert.equal(aNumero('2.474.636,31'), 2474636.31);
});

t('con punto decimal, que es lo que a veces mete el teclado', () => {
  // Este era el bug: 88.23 se convertía en 8823.
  assert.equal(aNumero('88.23'), 88.23);
  assert.equal(aNumero('0.5'), 0.5);
});

t('un punto con tres dígitos detrás es de miles', () => {
  assert.equal(aNumero('1.234'), 1234);
  assert.equal(aNumero('45.300'), 45300);
});

t('varios puntos son todos de miles', () => {
  assert.equal(aNumero('2.474.636'), 2474636);
});

t('sin separadores', () => {
  assert.equal(aNumero('45300'), 45300);
  assert.equal(aNumero(45300), 45300);
});

t('el signo y los símbolos no molestan', () => {
  assert.equal(aNumero('$ 1.234,56'), 1234.56);
  assert.equal(aNumero('US$ 850'), 850);
  assert.equal(aNumero('-500,50'), -500.50);
});

t('vacío o basura da cero', () => {
  assert.equal(aNumero(''), 0);
  assert.equal(aNumero(null), 0);
  assert.equal(aNumero('abc'), 0);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
