// node --experimental-strip-types supabase/functions/_shared/avisos.test.ts
import assert from 'node:assert/strict';
import { avisosDelDia, saldoDeCuenta } from './avisos.ts';

let ok = 0, mal = 0;
const t = (n: string, fn: () => void) => { try { fn(); console.log('  ok  ' + n); ok++; }
                                           catch (e: any) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };
const d = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };

const CUENTAS = [
  { id: 'gal', nombre: 'Galicia', tipo: 'cuenta', moneda: 'ARS', saldo_inicial: 100000, saldo_al: '2026-09-01' },
  { id: 'visa', nombre: 'Galicia Visa', tipo: 'credito', cierre_dia: 27, vencimiento_dia: 4 }
];
const RECURRINGS = [{ id: 'r1', nombre: 'Alquiler', monto_estimado: 850, moneda: 'USD',
                      dia_vencimiento: 5, activo: true }];

console.log('\nLO QUE AVISA BISHU');

t('avisa dos días antes, el día, y si venció', () => {
  const el3 = avisosDelDia({ recurrings: RECURRINGS }, d('2026-09-03'));
  assert.match(el3[0].titulo, /vence en 2 días/);
  assert.match(el3[0].cuerpo, /US\$ 850/);
  assert.match(avisosDelDia({ recurrings: RECURRINGS }, d('2026-09-05'))[0].titulo, /Hoy vence/);
  assert.match(avisosDelDia({ recurrings: RECURRINGS }, d('2026-09-06'))[0].titulo, /venció ayer/);
});

t('un gasto fijo ya pagado no molesta', () => {
  const pagos = [{ recurring_id: 'r1', periodo: '2026-09', pagado_at: '2026-09-02T10:00:00Z' }];
  assert.deepEqual(avisosDelDia({ recurrings: RECURRINGS, pagos }, d('2026-09-05')), []);
});

t('el día antes del cierre avisa, para llegar con la compra', () => {
  const a = avisosDelDia({ cuentas: CUENTAS }, d('2026-09-26'));
  assert.match(a[0].titulo, /cierra mañana/);
  assert.equal(a[0].url, './#/tarjetas');
  assert.deepEqual(avisosDelDia({ cuentas: CUENTAS }, d('2026-09-25')), []);
});

t('la promo marcada avisa el día que cae, y solo ese', () => {
  const promos = [{ id: 'p', titulo: 'YPF 25%', valor: 25, tipo: 'descuento', recordar: true,
                    medio_pago: 'MODO', tope: 20000, dias: [4],
                    vigencia_desde: '2026-09-10', vigencia_hasta: '2026-09-10' }];
  const a = avisosDelDia({ promos }, d('2026-09-10'));
  assert.match(a[0].titulo, /Hoy: YPF/);
  assert.match(a[0].cuerpo, /25% de descuento · MODO · tope \$ 20\.000/);
  assert.deepEqual(avisosDelDia({ promos }, d('2026-09-03')), []);   // otro jueves
});

t('la promo que no marcaste no avisa nunca', () => {
  const promos = [{ id: 'p', titulo: 'Coto', valor: 25, recordar: false, dias: [] }];
  assert.deepEqual(avisosDelDia({ promos }, d('2026-09-10')), []);
});

t('el saldo en rojo se avisa aunque no haya mínimo puesto', () => {
  const txs = [{ tipo: 'gasto', monto: 150000, fecha: '2026-09-02', account_id: 'gal' }];
  const a = avisosDelDia({ cuentas: [CUENTAS[0]], txs }, d('2026-09-03'));
  assert.match(a[0].titulo, /en rojo/);
  assert.match(a[0].cuerpo, /\$ 50\.000/);
});

t('el mínimo lo pone cada uno', () => {
  const txs = [{ tipo: 'gasto', monto: 70000, fecha: '2026-09-02', account_id: 'gal' }];
  assert.deepEqual(avisosDelDia({ cuentas: [CUENTAS[0]], txs }, d('2026-09-03')), []);
  const a = avisosDelDia({ cuentas: [CUENTAS[0]], txs, saldoMinimo: 50000 }, d('2026-09-03'));
  assert.match(a[0].titulo, /Queda poco/);
});

t('una compra con tarjeta no baja el saldo de la cuenta', () => {
  const txs = [{ tipo: 'gasto', monto: 900000, fecha: '2026-09-02', account_id: 'visa' }];
  assert.equal(saldoDeCuenta(CUENTAS[0], txs, d('2026-09-03')), 100000);
});

t('comprar dólares mueve las dos cuentas, cada una en su moneda', () => {
  const usd = { id: 'usd', nombre: 'Dólares', tipo: 'efectivo', moneda: 'USD', saldo_inicial: 0 };
  const txs = [{ tipo: 'transferencia', monto: 72500, moneda: 'ARS', fecha: '2026-09-02',
                 account_id: 'gal', destino_account_id: 'usd', monto_destino: 50 }];
  assert.equal(saldoDeCuenta(CUENTAS[0], txs, d('2026-09-03')), 27500);
  assert.equal(saldoDeCuenta(usd, txs, d('2026-09-03')), 50);
});

t('cada tipo se puede apagar por separado', () => {
  const datos = { recurrings: RECURRINGS, cuentas: CUENTAS,
                  prefs: { pagos: false, resumen: false } };
  assert.deepEqual(avisosDelDia(datos, d('2026-09-05')), []);
  assert.equal(avisosDelDia({ ...datos, prefs: { resumen: false } }, d('2026-09-05')).length, 1);
});

t('un tipo que todavía no estaba en las preferencias viene prendido', () => {
  const a = avisosDelDia({ recurrings: RECURRINGS, prefs: { promos: false } }, d('2026-09-05'));
  assert.equal(a.length, 1);
});

t('lo que hay que pagar va antes que la opinión de Bishu', () => {
  const a = avisosDelDia({
    recurrings: [{ id: 'r2', nombre: 'OSDE', monto_estimado: 302006, moneda: 'ARS',
                   dia_vencimiento: 16, activo: true }],
    gastadoEsteMes: 100000, gastadoMesPasado: 500000,
    promos: [{ id: 'p', titulo: 'Coto', valor: 25, recordar: true, dias: [] }]
  }, d('2026-09-14'));                                   // un lunes
  assert.deepEqual(a.map(x => x.tipo), ['pagos', 'promos', 'bishu']);
});

t('la opinión es semanal, no de todos los días', () => {
  const datos = { gastadoEsteMes: 100000, gastadoMesPasado: 500000 };
  assert.equal(avisosDelDia(datos, d('2026-09-14')).length, 1);   // lunes
  assert.equal(avisosDelDia(datos, d('2026-09-15')).length, 0);   // martes
  assert.equal(avisosDelDia(datos, d('2026-09-07')).length, 0);   // muy temprano en el mes
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
