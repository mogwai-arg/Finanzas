// node js/texto.test.mjs
import assert from 'node:assert/strict';
import { tituloTx, dondeTx } from './texto.js';

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

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
