// node js/lista.test.mjs
import assert from 'node:assert/strict';
import * as L from './lista.js';

let ok = 0, mal = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nLISTA DE MOVIMIENTOS DE LA APP DEL BANCO');

// Tal como sale de la pantalla "Movimientos" de Galicia.
const GALICIA = `Ing. brutos s/ cred
02/09/26
-$29.600,00
Dep.efvo.autoservicio ticket: 291802
02/09/26
$1.480.000,00
Transf. ctas propias
01/09/26
-$280.000,00
Pago de servicios
01/09/26
-$20.581,06
Compra venta de dolares
01/09/26
-$23.100,00`;

t('el signo escrito manda: no hay que deducirlo del saldo', () => {
  // Es toda la ventaja de este formato sobre el PDF, donde las columnas se
  // pierden y hay que sacar el signo de la diferencia contra el saldo.
  const r = L.parseLista(GALICIA);
  const dep = r.movimientos.find(m => /Dep\.efvo/.test(m.descripcion));
  const ret = r.movimientos.find(m => /brutos/.test(m.descripcion));
  assert.equal(dep.entra, true);
  assert.equal(ret.entra, false);
});

t('los centavos no se pierden', () => {
  const r = L.parseLista(GALICIA);
  assert.equal(r.movimientos.find(m => m.importe === 20581.06).importe, 20581.06);
});

t('la fecha de dos dígitos es de este siglo', () => {
  const r = L.parseLista(GALICIA);
  assert.equal(r.movimientos[0].fecha, '2026-09-02');
  assert.deepEqual(r.periodo, { desde: '2026-09-01', hasta: '2026-09-02' });
});

t('el número de ticket no forma parte del comercio', () => {
  // Con el ticket adentro, el mismo depósito de todos los meses son doce
  // comercios distintos y no se agrupa ni se reconoce nunca.
  const r = L.parseLista(GALICIA);
  const dep = r.movimientos.find(m => /Dep\.efvo/.test(m.descripcion));
  assert.equal(dep.comercio, 'Dep.efvo.autoservicio');
  assert.ok(dep.descripcion.includes('291802'), 'el original se guarda entero');
});

t('las transferencias propias se marcan como movidas, no como gastos', () => {
  const r = L.parseLista(GALICIA);
  assert.equal(r.movimientos.find(m => /Transf/.test(m.descripcion)).clase, 'transferencia');
  assert.equal(r.movimientos.find(m => /servicios/.test(m.descripcion)).clase, null);
});

t('los dólares salen en dólares', () => {
  const r = L.parseLista(`Compra de dólares
01/09/26
-US$ 850,00
Venta
02/09/26
US$ 100,00`);
  assert.equal(r.movimientos[0].moneda, 'USD');
  assert.equal(r.movimientos[0].importe, 850);
});

t('el orden pegado no importa: el importe puede venir antes que la fecha', () => {
  // Copiar de la captura con el dedo, de la app o del navegador da órdenes
  // distintos y los tres son válidos.
  const r = L.parseLista(`Pago de servicios
-$20.581,06
01/09/26
Ing. brutos s/ cred
-$29.600,00
02/09/26`);
  assert.equal(r.movimientos.length, 2);
  assert.equal(r.movimientos[0].comercio, 'Pago de servicios');
  assert.equal(r.movimientos[0].importe, 20581.06);
  assert.equal(r.movimientos[0].fecha, '2026-09-01');
});

t('un movimiento no se lleva el importe del de al lado', () => {
  const r = L.parseLista(GALICIA);
  const importes = r.movimientos.map(m => m.importe);
  assert.equal(new Set(importes).size, importes.length);
  assert.equal(r.movimientos.length, 5);
});

t('reconoce la cuota de un consumo con tarjeta', () => {
  const r = L.parseLista(`Coto Abasto Cuota 2 de 6
15/08/26
-$47.310,00
Shell
16/08/26
-$52.000,00`);
  assert.deepEqual(r.movimientos[0].cuota, { nro: 2, total: 6 });
  assert.equal(r.movimientos[1].cuota, null);
});

t('no confunde cualquier cosa con una lista', () => {
  assert.equal(L.parseLista('hola qué tal'), null);
  assert.equal(L.parseLista(''), null);
  // Una sola terna no alcanza: un ticket, una promo, media pantalla de otra
  // cosa también tienen una fecha y un precio.
  assert.equal(L.parseLista('Coto\n01/09/26\n-$1.000,00'), null);
});

t('tampoco un resumen en PDF, que tiene su propio lector', () => {
  assert.equal(L.parseLista(`SALDO ANTERIOR                     1.000.000,00
02/09  DEBITO AUTOMATICO EDESUR    20.581,06     979.418,94
05/09  ACREDITAMIENTO DE HABERES  2.026.665,38  3.005.960,83`), null);
});

t('los movimientos salen listos para guardar', () => {
  const m = L.aMovimientos(L.parseLista(GALICIA), 'gal');
  assert.equal(m.length, 5);
  assert.equal(m[0].account_id, 'gal');
  assert.equal(m[0].tipo, 'gasto');
  assert.equal(m.find(x => /Dep\.efvo/.test(x.descripcion)).tipo, 'ingreso');
  assert.equal(m[0].fuente, 'lista-cuenta');
  assert.equal(m[0].revisado, false, 'no se da por bueno solo: lo pegó una persona');
});

t('el mismo movimiento pegado dos veces da el mismo identificador', () => {
  // Es lo único que evita cargarlo dos veces: la lista no trae número de
  // operación, así que la clave se arma con fecha, importe y nombre.
  const a = L.aMovimientos(L.parseLista(GALICIA), 'gal');
  const b = L.aMovimientos(L.parseLista(GALICIA), 'gal');
  assert.deepEqual(a.map(x => x.externo_id), b.map(x => x.externo_id));
  assert.equal(new Set(a.map(x => x.externo_id)).size, a.length);
});

t('los de tarjeta se marcan como de tarjeta', () => {
  const m = L.aMovimientos(L.parseLista(GALICIA), 'visa', { tarjeta: true });
  assert.equal(m[0].fuente, 'lista-tarjeta');
});

t('cuando no puede, dice qué vio', () => {
  const v = L.revisarLista(`Ing. brutos s/ cred
Dep.efvo.autoservicio
Transf. ctas propias`);
  assert.equal(v.fechas, 0);
  assert.equal(v.importes, 0);
  assert.equal(v.nombres, 3);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
