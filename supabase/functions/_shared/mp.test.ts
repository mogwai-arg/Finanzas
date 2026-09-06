// node --experimental-strip-types supabase/functions/_shared/mp.test.ts
import assert from 'node:assert/strict';
import { direccion } from './mp.ts';

let ok = 0, mal = 0;
const t = (n: string, fn: () => void) => { try { fn(); console.log('  ok  ' + n); ok++; }
                                           catch (e) { console.log('  FALLA  ' + n + '\n         ' + (e as Error).message); mal++; } };

console.log('\nDIRECCIÓN DE UN PAGO DE MERCADO PAGO');

const YO = '123456';

t('si sos el pagador, sale', () => {
  assert.equal(direccion({ payer: { id: YO }, collector_id: '999' }, YO), 'sale');
  assert.equal(direccion({ payer: { id: Number(YO) }, collector_id: 999 }, YO), 'sale');
});

t('si te pagaron y se sabe quién, entra', () => {
  assert.equal(direccion({ payer: { id: '999' }, collector_id: YO }, YO), 'entra');
});

t('si sos las dos puntas, es plata tuya moviéndose', () => {
  // Cargarla de un lado solo descuadra el mes.
  assert.equal(direccion({ payer: { id: YO }, collector_id: YO }, YO), 'propio');
});

t('sin pagador NO se inventa un ingreso', () => {
  // El bug: `String(p.payer?.id ?? '') === String(it.cuenta)` daba false con
  // el campo vacío, así que "no sos el pagador", así que INGRESO. Un dato que
  // falta se convertía en plata que entra. Pasa en los pagos por QR y en los
  // que se pagan con plata en cuenta, que son la mayoría.
  assert.equal(direccion({ collector_id: YO }, YO), 'nose');
  assert.equal(direccion({ payer: {}, collector_id: YO }, YO), 'nose');
  assert.equal(direccion({ payer: { id: null }, collector_id: YO }, YO), 'nose');
});

t('si no aparece tu id por ningún lado, tampoco se inventa', () => {
  assert.equal(direccion({ payer: { id: '111' }, collector_id: '222' }, YO), 'nose');
});

t('sin saber quién sos, nada se puede decidir', () => {
  assert.equal(direccion({ payer: { id: '111' }, collector_id: '222' }, ''), 'nose');
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
