import assert from 'node:assert/strict';
import * as F from './finance.js';

const d = s => F.parseFecha(s);
let ok = 0; const t = (n, fn) => { fn(); ok++; console.log('  ok  ' + n); };

console.log('Ciclo de tarjeta (cierre 20, vence 30)');
const gal = { id: 'g', tipo: 'credito', cierre_dia: 20, vencimiento_dia: 30 };

t('compra el 05/09 cierra el 20/09 y vence el 30/09', () => {
  const c = F.cierreDeCompra(d('2026-09-05'), 20);
  assert.equal(F.fechaISO(c), '2026-09-20');
  assert.equal(F.fechaISO(F.vencimientoDeCierre(c, 30)), '2026-09-30');
});
t('compra el mismo dia del cierre pasa al resumen siguiente', () => {
  assert.equal(F.fechaISO(F.cierreDeCompra(d('2026-09-20'), 20)), '2026-10-20');
});
t('compra el 25/09 cierra el 20/10', () => {
  assert.equal(F.fechaISO(F.cierreDeCompra(d('2026-09-25'), 20)), '2026-10-20');
});

console.log('Cierre 31 en meses cortos');
t('cierre 31 en febrero cae el 28', () => {
  assert.equal(F.fechaISO(F.cierreDeCompra(d('2026-02-10'), 31)), '2026-02-28');
});

console.log('Vencimiento en el mes siguiente (cierre 26, vence 10)');
t('cierre 26/09 vence 10/10', () => {
  const c = F.cierreDeCompra(d('2026-09-10'), 26);
  assert.equal(F.fechaISO(c), '2026-09-26');
  assert.equal(F.fechaISO(F.vencimientoDeCierre(c, 10)), '2026-10-10');
});

console.log('Cronograma de cuotas');
t('12 cuotas de 120.000 arrancan en el resumen de septiembre', () => {
  const tx = { fecha: '2026-09-05', monto: 120000, cuotas: 12, moneda: 'ARS', tipo: 'gasto', account_id: 'g' };
  const cr = F.cronograma(tx, gal, d('2026-09-01'));
  assert.equal(cr.length, 12);
  assert.equal(cr[0].monto, 10000);
  assert.equal(cr[0].periodoVenc, '2026-09');
  assert.equal(cr[11].periodoVenc, '2027-08');
  assert.equal(F.round2(cr.reduce((a, c) => a + c.monto, 0)), 120000);
});
t('1 cuota tambien funciona', () => {
  const cr = F.cronograma({ fecha: '2026-09-05', monto: 5000, cuotas: 1 }, gal);
  assert.equal(cr.length, 1);
  assert.equal(cr[0].monto, 5000);
});
t('debito impacta el mismo dia', () => {
  const cr = F.cronograma({ fecha: '2026-09-05', monto: 5000, cuotas: 1 }, { tipo: 'debito' });
  assert.equal(F.fechaISO(cr[0].vence), '2026-09-05');
});

console.log('Total a pagar y deuda futura');
const txs = [
  { id: 1, fecha: '2026-09-05', monto: 120000, cuotas: 12, moneda: 'ARS', tipo: 'gasto', account_id: 'g' },
  { id: 2, fecha: '2026-09-06', monto: 30000, cuotas: 3, moneda: 'ARS', tipo: 'gasto', account_id: 'g' },
  { id: 3, fecha: '2026-09-07', monto: 900000, cuotas: 1, moneda: 'ARS', tipo: 'ingreso', account_id: null }
];
t('resumen de septiembre suma 10.000 + 10.000', () => {
  assert.equal(F.totalTarjetaEnPeriodo(txs, gal, '2026-09'), 20000);
});
t('los ingresos no entran en el total de la tarjeta', () => {
  assert.equal(F.totalTarjetaEnPeriodo(txs, gal, '2026-12'), 10000);
});
t('deuda futura arranca en el mes corriente y no repite periodos', () => {
  const df = F.deudaFutura(txs, [gal], 'ARS', d('2026-09-01'), 14);
  assert.equal(df[0].periodo, '2026-09');
  assert.equal(df[0].monto, 20000);
  assert.equal(new Set(df.map(x => x.periodo)).size, df.length);
  assert.equal(F.round2(df.reduce((a, x) => a + x.monto, 0)), 150000);
});

console.log('Resumen del mes');
t('separa gastos, ingresos y balance', () => {
  const r = F.resumenMes(txs, '2026-09');
  assert.equal(r.gastos, 150000);
  assert.equal(r.ingresos, 900000);
  assert.equal(r.balance, 750000);
});
t('no mezcla monedas', () => {
  const r = F.resumenMes([...txs, { fecha: '2026-09-08', monto: 100, cuotas: 1, moneda: 'USD', tipo: 'gasto' }], '2026-09', 'USD');
  assert.equal(r.gastos, 100);
});

console.log('Recurrentes');
const recs = [
  { id: 'r1', nombre: 'Colegio', activo: true, dia_vencimiento: 10, monto_estimado: 250000 },
  { id: 'r2', nombre: 'Luz', activo: true, dia_vencimiento: 22, monto_estimado: 60000, variable: true },
  { id: 'r3', nombre: 'Viejo', activo: false, dia_vencimiento: 5, monto_estimado: 1 }
];
t('marca vencidos y ordena por fecha', () => {
  const rr = F.recurrentesDelMes(recs, [], '2026-09', d('2026-09-15'));
  assert.equal(rr.length, 2);
  assert.equal(rr[0].nombre, 'Colegio');
  assert.equal(rr[0].vencido, true);
  assert.equal(rr[1].vencido, false);
});
t('un pago registrado lo saca de vencido y usa el monto real', () => {
  const rr = F.recurrentesDelMes(recs, [{ recurring_id: 'r1', periodo: '2026-09', monto: 262000, pagado_at: 'x' }], '2026-09', d('2026-09-15'));
  assert.equal(rr[0].pagado, true);
  assert.equal(rr[0].monto, 262000);
});

console.log('Presupuesto');
t('clasifica ok / alerta / excedido', () => {
  const res = { porCategoria: { a: 500, b: 850, c: 1200 } };
  const st = F.estadoPresupuesto([
    { category_id: 'a', monto: 1000 }, { category_id: 'b', monto: 1000 }, { category_id: 'c', monto: 1000 }
  ], res, 80);
  assert.deepEqual(st.map(x => x.estado), ['ok', 'alerta', 'excedido']);
  assert.equal(st[2].restante, -200);
});

console.log('Promos');
const promos = [
  { id: 1, activa: true, dias: [2], valor: 20, tope: 20000, favorita: false },
  { id: 2, activa: true, dias: [], valor: 10, favorita: true },
  { id: 3, activa: true, dias: [6], valor: 25, favorita: false },
  { id: 4, activa: false, dias: [], valor: 99, favorita: false },
  { id: 5, activa: true, dias: [], valor: 30, vigencia_hasta: '2026-08-31', favorita: false }
];
t('filtra por dia, vigencia y estado', () => {
  const p = F.promosDelDia(promos, d('2026-09-01')); // martes
  assert.deepEqual(p.map(x => x.id), [2, 1]);
});
t('el sabado aparece la de sabado', () => {
  const p = F.promosDelDia(promos, d('2026-09-05'));
  assert.deepEqual(p.map(x => x.id), [2, 3]);
});
t('el reintegro respeta el tope', () => {
  assert.equal(F.reintegroEstimado(200000, promos[0]), 20000);
  assert.equal(F.reintegroEstimado(50000, promos[0]), 10000);
  assert.equal(F.reintegroEstimado(50000, { tipo: 'cuotas', valor: 12 }), 0);
});

console.log(`\n${ok} pruebas OK`);
