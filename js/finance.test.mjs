import assert from 'node:assert/strict';
import * as F from './finance.js';

const d = s => F.parseFecha(s);
let ok = 0; const t = (n, fn) => { fn(); ok++; console.log('  ok  ' + n); };

console.log('Ciclo de tarjeta (cierre 20, vence 30)');
const gal = { id: 'g', tipo: 'credito', cierre_dia: 20, vencimiento_dia: 30 };

const ALQ = { id: 'alq', activo: true, nombre: 'Alquiler', monto_estimado: 850,
              moneda: 'USD', dia_vencimiento: 5 };
const PAGOS_ALQ = [
  { recurring_id: 'alq', periodo: '2026-06', monto: 900, pagado_at: '2026-06-05' },
  { recurring_id: 'alq', periodo: '2026-07', monto: 800, pagado_at: '2026-07-05' },
  { recurring_id: 'alq', periodo: '2026-08', monto: 900, pagado_at: '2026-08-05' }
];

t('pagar de mas deja saldo a favor para el mes siguiente', () => {
  // Junio: pago 900 por algo que vale 850.
  assert.equal(F.aPagarRecurrente(ALQ, PAGOS_ALQ, '2026-07').saldo, 50);
  assert.equal(F.aPagarRecurrente(ALQ, PAGOS_ALQ, '2026-07').sugerido, 800);
});

t('el saldo se consume y vuelve a cero', () => {
  // Julio uso los 50 pagando 800: agosto arranca en cero.
  assert.equal(F.aPagarRecurrente(ALQ, PAGOS_ALQ, '2026-08').saldo, 0);
  assert.equal(F.aPagarRecurrente(ALQ, PAGOS_ALQ, '2026-08').sugerido, 850);
});

t('el saldo se acumula mes a mes', () => {
  const pagos = [
    { recurring_id: 'alq', periodo: '2026-06', monto: 900, pagado_at: 'x' },
    { recurring_id: 'alq', periodo: '2026-07', monto: 900, pagado_at: 'x' }
  ];
  assert.equal(F.aPagarRecurrente(ALQ, pagos, '2026-08').saldo, 100);
  assert.equal(F.aPagarRecurrente(ALQ, pagos, '2026-08').sugerido, 750);
});

t('pagar de menos deja saldo en contra', () => {
  const pagos = [{ recurring_id: 'alq', periodo: '2026-06', monto: 800, pagado_at: 'x' }];
  const { saldo, sugerido } = F.aPagarRecurrente(ALQ, pagos, '2026-07');
  assert.equal(saldo, -50);
  assert.equal(sugerido, 900);
});

t('un saldo a favor mas grande que el mes no da un pago negativo', () => {
  const pagos = [{ recurring_id: 'alq', periodo: '2026-06', monto: 2000, pagado_at: 'x' }];
  const { saldo, sugerido } = F.aPagarRecurrente(ALQ, pagos, '2026-07');
  assert.equal(saldo, 1150);
  assert.equal(sugerido, 0);          // y los 300 que sobran siguen arrastrandose
});

t('un mes sin pagar no mueve el saldo', () => {
  const pagos = [{ recurring_id: 'alq', periodo: '2026-06', monto: 900, pagado_at: null }];
  assert.equal(F.aPagarRecurrente(ALQ, pagos, '2026-07').saldo, 0);
});

t('el colegio en pesos funciona igual', () => {
  const col = { id: 'col', activo: true, nombre: 'Colegio', monto_estimado: 259000, moneda: 'ARS', dia_vencimiento: 10 };
  const pagos = [{ recurring_id: 'col', periodo: '2026-08', monto: 260000, pagado_at: 'x' }];
  const { saldo, sugerido } = F.aPagarRecurrente(col, pagos, '2026-09');
  assert.equal(saldo, 1000);
  assert.equal(sugerido, 258000);
});

t('el mes trae el saldo que queda despues de pagar', () => {
  const r = F.recurrentesDelMes([ALQ], PAGOS_ALQ, '2026-06', new Date(2026, 5, 20))[0];
  assert.equal(r.valor, 850);
  assert.equal(r.monto, 900);           // lo que pago de verdad
  assert.equal(r.saldoDespues, 50);     // lo que se lleva a julio
});

t('un reintegro le gana a un descuento del mismo tamaño', () => {
  const promos = [
    { id: 'd', titulo: 'Descuento', tipo: 'descuento', valor: 20, activa: true, dias: [] },
    { id: 'r', titulo: 'Reintegro', tipo: 'reintegro', valor: 20, activa: true, dias: [] }
  ];
  assert.equal(F.promosDelDia(promos, d('2026-09-02'))[0].id, 'r');
});

t('y también a uno un poco más grande', () => {
  const promos = [
    { id: 'd', titulo: 'Descuento', tipo: 'descuento', valor: 30, activa: true, dias: [] },
    { id: 'r', titulo: 'Reintegro', tipo: 'reintegro', valor: 15, activa: true, dias: [] }
  ];
  assert.equal(F.promosDelDia(promos, d('2026-09-02'))[0].id, 'r');
});

t('una marcada como favorita va primero igual', () => {
  const promos = [
    { id: 'r', titulo: 'Reintegro', tipo: 'reintegro', valor: 30, activa: true, dias: [] },
    { id: 'f', titulo: 'La mía', tipo: 'descuento', valor: 10, activa: true, dias: [], favorita: true }
  ];
  assert.equal(F.promosDelDia(promos, d('2026-09-02'))[0].id, 'f');
});

t('entre dos reintegros gana el más alto', () => {
  const promos = [
    { id: 'a', tipo: 'reintegro', valor: 15, activa: true, dias: [] },
    { id: 'b', tipo: 'reintegro', valor: 25, activa: true, dias: [] }
  ];
  assert.equal(F.promosDelDia(promos, d('2026-09-02'))[0].id, 'b');
});

const MANUAL = [
  { id: 'm1', fuente: 'manual', tipo: 'gasto', moneda: 'ARS', monto: 45300,
    fecha: '2026-08-28', account_id: 'visa', comercio: 'super' },
  { id: 'm2', fuente: 'manual', tipo: 'gasto', moneda: 'ARS', monto: 12000,
    fecha: '2026-08-10', account_id: null, comercio: 'nafta' },
  { id: 'a1', fuente: 'resumen', tipo: 'gasto', moneda: 'ARS', monto: 99000,
    fecha: '2026-08-28', account_id: 'visa', comercio: 'COTO' }
];

t('el mismo gasto del resumen reconoce al que anoté a mano', () => {
  const d = F.duplicadoManual({ monto: 45300, fecha: '2026-08-29', tipo: 'gasto',
    moneda: 'ARS', account_id: 'visa' }, MANUAL);
  assert.equal(d?.id, 'm1');       // un día de diferencia, el mismo importe
});

t('sin cuenta cargada igual lo reconoce', () => {
  const d = F.duplicadoManual({ monto: 12000, fecha: '2026-08-11', tipo: 'gasto',
    moneda: 'ARS', account_id: 'mp' }, MANUAL);
  assert.equal(d?.id, 'm2');
});

t('otra tarjeta es otro movimiento', () => {
  const d = F.duplicadoManual({ monto: 45300, fecha: '2026-08-28', tipo: 'gasto',
    moneda: 'ARS', account_id: 'master' }, MANUAL);
  assert.equal(d, null);
});

t('lejos en el tiempo no es el mismo', () => {
  const d = F.duplicadoManual({ monto: 45300, fecha: '2026-09-15', tipo: 'gasto',
    moneda: 'ARS', account_id: 'visa' }, MANUAL);
  assert.equal(d, null);
});

t('otro importe no es el mismo', () => {
  const d = F.duplicadoManual({ monto: 45400, fecha: '2026-08-28', tipo: 'gasto',
    moneda: 'ARS', account_id: 'visa' }, MANUAL);
  assert.equal(d, null);
});

t('un ingreso no se confunde con un gasto del mismo importe', () => {
  const d = F.duplicadoManual({ monto: 45300, fecha: '2026-08-28', tipo: 'ingreso',
    moneda: 'ARS', account_id: 'visa' }, MANUAL);
  assert.equal(d, null);
});

t('los dólares no se cruzan con los pesos', () => {
  const d = F.duplicadoManual({ monto: 45300, fecha: '2026-08-28', tipo: 'gasto',
    moneda: 'USD', account_id: 'visa' }, MANUAL);
  assert.equal(d, null);
});

t('no toca los que ya vinieron de un origen automático', () => {
  const d = F.duplicadoManual({ monto: 99000, fecha: '2026-08-28', tipo: 'gasto',
    moneda: 'ARS', account_id: 'visa' }, MANUAL);
  assert.equal(d, null);          // ese ya se deduplica por su identificador
});

t('un dia de cierre que no es un dia del mes no sirve', () => {
  assert.equal(F.diaDelMes(5), true);
  assert.equal(F.diaDelMes('31'), true);
  assert.equal(F.diaDelMes(0), false);
  assert.equal(F.diaDelMes(509), false);     // '5/09' escrito en un campo numerico
  assert.equal(F.tieneCiclo({ tipo: 'credito', cierre_dia: 509 }), false);
});

t('una tarjeta sin cierre ni ciclos no tiene con que calcular', () => {
  assert.equal(F.tieneCiclo({ tipo: 'credito' }), false);
  assert.equal(F.tieneCiclo({ tipo: 'credito', cierre_dia: 5 }), true);
  assert.equal(F.tieneCiclo({ tipo: 'credito', ciclos: [{ cierre: '2026-09-05', vence: '2026-09-10' }] }), true);
  assert.equal(F.tieneCiclo({ tipo: 'credito', ciclos: [] }), false);
});

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
  // Por id y no por posición: los pagados se van al final de la lista.
  const pagado = rr.find(x => x.id === 'r1');
  assert.equal(pagado.pagado, true);
  assert.equal(pagado.monto, 262000);
  assert.equal(pagado.vencido, false);
});

t('los gastos fijos pendientes van primero', () => {
  const rs = [
    { id: 'a', activo: true, nombre: 'Edesur', monto_estimado: 20000, moneda: 'ARS', dia_vencimiento: 1 },
    { id: 'b', activo: true, nombre: 'Colegio', monto_estimado: 500000, moneda: 'ARS', dia_vencimiento: 10 },
    { id: 'c', activo: true, nombre: 'OSDE', monto_estimado: 300000, moneda: 'ARS', dia_vencimiento: 15 }
  ];
  // Edesur, que vence primero, ya está pagado: tiene que quedar al final.
  const pagos = [{ recurring_id: 'a', periodo: '2026-09', monto: 20000, pagado_at: 'x' }];
  const out = F.recurrentesDelMes(rs, pagos, '2026-09', d('2026-09-05'));
  assert.deepEqual(out.map(x => x.id), ['b', 'c', 'a']);
  // Y entre los pendientes sigue mandando la fecha.
  assert.deepEqual(F.recurrentesDelMes(rs, [], '2026-09', d('2026-09-05')).map(x => x.id),
                   ['a', 'b', 'c']);
});

console.log('Estadísticas');
const SERIE = [
  { tipo: 'ingreso', moneda: 'ARS', monto: 3000000, fecha: '2026-07-01' },
  { tipo: 'gasto',   moneda: 'ARS', monto: 800000,  fecha: '2026-07-05', category_id: 'c1' },
  { tipo: 'gasto',   moneda: 'ARS', monto: 200000,  fecha: '2026-07-06', category_id: 'c2' },
  { tipo: 'ingreso', moneda: 'ARS', monto: 3200000, fecha: '2026-08-01' },
  { tipo: 'gasto',   moneda: 'ARS', monto: 1500000, fecha: '2026-08-10', category_id: 'c1' },
  { tipo: 'gasto',   moneda: 'ARS', monto: 300000,  fecha: '2026-09-02', category_id: 'c2' },
  { tipo: 'gasto',   moneda: 'ARS', monto: 100000,  fecha: '2026-09-02' },
  { tipo: 'transferencia', moneda: 'ARS', monto: 999999, fecha: '2026-09-02' },
  { tipo: 'gasto',   moneda: 'USD', monto: 900,     fecha: '2026-09-02' }
];

t('la serie mensual va del más viejo al más nuevo y marca el mes en curso', () => {
  const s = F.serieMensual(SERIE, 3, 'ARS', d('2026-09-03'));
  assert.deepEqual(s.map(x => x.periodo), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(s.map(x => x.enCurso), [false, false, true]);
  assert.equal(s[0].ingresos, 3000000);
  assert.equal(s[0].gastos, 1000000);
  assert.equal(s[0].balance, 2000000);
});

t('las movidas entre cuentas y los dólares no entran en la serie de pesos', () => {
  const s = F.serieMensual(SERIE, 1, 'ARS', d('2026-09-03'))[0];
  assert.equal(s.gastos, 400000);          // 300.000 + 100.000, sin la movida
  assert.equal(s.ingresos, 0);
});

t('las categorías salen de mayor a menor, con su parte del total', () => {
  const cs = F.gastoPorCategoria(SERIE, '2026-07');
  assert.deepEqual(cs.map(x => x.id), ['c1', 'c2']);
  assert.equal(cs[0].monto, 800000);
  assert.equal(Math.round(cs[0].parte * 100), 80);
});

t('lo que no tiene categoría también se cuenta, sin inventarle una', () => {
  const cs = F.gastoPorCategoria(SERIE, '2026-09');
  assert.deepEqual(cs.map(x => x.id), ['c2', null]);
  assert.equal(cs[1].monto, 100000);
});

console.log('Ahorro');
const META = [{ clase: 'ahorro', moneda: 'ARS', monto: 350000 },
              { clase: 'ahorro', moneda: 'USD', monto: 200 }];
const CTAS_AH = [
  { id: 'gal', nombre: 'Galicia', tipo: 'cuenta', moneda: 'ARS',
    saldo_inicial: 1000000, saldo_al: '2026-08-01' },
  { id: 'usd', nombre: 'Dólares', tipo: 'efectivo', moneda: 'USD',
    saldo_inicial: 500, saldo_al: '2026-08-01' }
];

t('el mes en curso nunca se declara cumplido: el día 3 no se sabe', () => {
  // Entró el sueldo el 1 y todavía no se gastó nada: la plata libre está
  // genuinamente arriba, pero eso no es ahorro todavía.
  const txs = [{ tipo: 'ingreso', moneda: 'ARS', monto: 3000000, fecha: '2026-09-01',
                 account_id: 'gal' }];
  const a = F.estadoAhorro(META, { cuentas: CTAS_AH, txs }, '2026-09', 'ARS', d('2026-09-03'));
  assert.equal(a.enCurso, true);
  assert.equal(a.logrado, false, 'no puede darse por cumplido con el mes corriendo');
  assert.equal(a.dias, 27);
  // Y trae con qué compararlo: cómo venía a esta altura del mes pasado.
  assert.equal(typeof a.referencia, 'number');
});

t('un mes cerrado sí se puede declarar cumplido', () => {
  const txs = [
    { tipo: 'ingreso', moneda: 'ARS', monto: 3000000, fecha: '2026-08-01', account_id: 'gal' },
    { tipo: 'gasto',   moneda: 'ARS', monto: 2500000, fecha: '2026-08-15', account_id: 'gal' }
  ];
  const a = F.estadoAhorro(META, { cuentas: CTAS_AH, txs }, '2026-08', 'ARS', d('2026-09-03'));
  assert.equal(a.enCurso, false);
  assert.equal(a.ahorrado, 500000);
  assert.equal(a.logrado, true);
  assert.equal(a.falta, 0);
});

t('en dólares: entraron 1000 y salieron 900, ahorraste 100', () => {
  const txs = [
    { tipo: 'ingreso', moneda: 'USD', monto: 1000, fecha: '2026-09-02', account_id: 'usd' },
    { tipo: 'gasto',   moneda: 'USD', monto: 900,  fecha: '2026-09-02', account_id: 'usd' }
  ];
  const a = F.estadoAhorro(META, { cuentas: CTAS_AH, txs }, '2026-09', 'USD', d('2026-09-03'));
  assert.equal(a.ahorrado, 100);
  assert.equal(a.desde, 500);
  assert.equal(a.ahora, 600);
  assert.equal(a.pct, 50);                 // 100 de los 200 que se propuso
});

t('gastar más de lo que entró da ahorro negativo, no un cero piadoso', () => {
  const txs = [{ tipo: 'gasto', moneda: 'USD', monto: 900, fecha: '2026-09-02', account_id: 'usd' }];
  const a = F.estadoAhorro(META, { cuentas: CTAS_AH, txs }, '2026-09', 'USD', d('2026-09-03'));
  assert.equal(a.ahorrado, -900);
  assert.equal(a.falta, 1100);             // los 200 que quería más los 900 que perdió
});

t('sin meta cargada no hay nada que mostrar', () => {
  assert.equal(F.estadoAhorro([], { cuentas: CTAS_AH, txs: [] }, '2026-09', 'ARS'), null);
  assert.equal(F.estadoAhorro([{ clase: 'ahorro', moneda: 'ARS', monto: 0 }],
    { cuentas: CTAS_AH, txs: [] }, '2026-09', 'ARS'), null);
});

console.log('Presupuesto');
t('clasifica ok / alerta / excedido', () => {
  const res = { porCategoria: { a: 500, b: 850, c: 1200 } };
  const st = F.estadoPresupuesto([
    { category_id: 'a', monto: 1000 }, { category_id: 'b', monto: 1000 }, { category_id: 'c', monto: 1000 }
  ], res, 80);
  // Sale ordenado del más usado al menos: el excedido primero.
  assert.deepEqual(st.map(x => x.estado), ['excedido', 'alerta', 'ok']);
  assert.deepEqual(st.map(x => x.category_id), ['c', 'b', 'a']);
  assert.equal(st[0].restante, -200);      // el excedido, que ahora va primero
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
t('la promo de una vez al mes cae solo ese día', () => {
  // "Jueves 10/09" es el jueves 10, no todos los jueves.
  const nafta = { id: 'g', activa: true, recordar: true, dias: [4], valor: 25,
                  vigencia_desde: '2026-09-10', vigencia_hasta: '2026-09-10' };
  assert.equal(F.fechaISO(F.proximaFechaPromo(nafta, d('2026-09-02'))), '2026-09-10');
  assert.equal(F.proximaFechaPromo(nafta, d('2026-09-11')), null);
  assert.deepEqual(F.promosDelDia([nafta], d('2026-09-03')).map(x => x.id), []); // el jueves 3, no
  assert.deepEqual(F.promosDelDia([nafta], d('2026-09-10')).map(x => x.id), ['g']);
});

t('la de todos los jueves cae el jueves que viene', () => {
  const j = { id: 'j', activa: true, recordar: true, dias: [4], valor: 15 };
  assert.equal(F.fechaISO(F.proximaFechaPromo(j, d('2026-09-02'))), '2026-09-03');
  assert.equal(F.fechaISO(F.proximaFechaPromo(j, d('2026-09-04'))), '2026-09-10');
});

t('en Hoy solo se ven las que pediste que te recuerde', () => {
  const lista = [
    { id: 'g', activa: true, recordar: true, dias: [4], valor: 25,
      vigencia_desde: '2026-09-10', vigencia_hasta: '2026-09-10' },
    { id: 'j', activa: true, recordar: true, dias: [4], valor: 15 },
    { id: 'x', activa: true, recordar: false, dias: [], valor: 40 },
    { id: 'v', activa: true, recordar: true, dias: [], valor: 10, vigencia_hasta: '2026-08-31' }
  ];
  const v = F.promosQueSeVienen(lista, d('2026-09-02'), 14);
  // La de todos los jueves es mañana; la del 10 va después; la vencida no está,
  // y la que no marcó tampoco.
  assert.deepEqual(v.map(x => x.promo.id), ['j', 'g']);
  assert.equal(F.fechaISO(v[0].fecha), '2026-09-03');
  assert.equal(F.fechaISO(v[1].fecha), '2026-09-10');
});

t('comprar dólares se ve en las dos monedas', () => {
  const txs = [{ id: 'c', tipo: 'transferencia', moneda: 'ARS', monto: 148500,
                 moneda_destino: 'USD', monto_destino: 100, fecha: '2026-09-02',
                 account_id: 'gal', destino_account_id: 'usd' }];
  // En pesos salieron 148.500; en dólares entraron 100. Antes la pantalla de
  // dólares no mostraba nada.
  const enPesos = F.movimientosEnMoneda(txs, 'ARS');
  assert.equal(enPesos.length, 1);
  assert.equal(enPesos[0].monto, 148500);
  assert.equal(enPesos[0].entrante, false);

  const enDolares = F.movimientosEnMoneda(txs, 'USD');
  assert.equal(enDolares.length, 1);
  assert.equal(enDolares[0].monto, 100);
  assert.equal(enDolares[0].entrante, true);

  assert.equal(F.resumenMes(txs, '2026-09', 'ARS').movido, 148500);
  assert.equal(F.resumenMes(txs, '2026-09', 'USD').movido, 100);
});

t('una movida entre cuentas de la misma moneda se ve una sola vez', () => {
  const txs = [{ id: 'm', tipo: 'transferencia', moneda: 'ARS', monto: 50000,
                 fecha: '2026-09-02', account_id: 'gal', destino_account_id: 'mp' }];
  assert.equal(F.movimientosEnMoneda(txs, 'ARS').length, 1);
  assert.equal(F.movimientosEnMoneda(txs, 'USD').length, 0);
  assert.equal(F.resumenMes(txs, '2026-09', 'USD').movido, 0);
});

t('el presupuesto se ordena por lo más usado, y los vacíos al final', () => {
  const budgets = [
    { id: 'a', category_id: 'c1', monto: 260000, periodo: '2026-09' },
    { id: 'b', category_id: 'c2', monto: 180000, periodo: '2026-09' },
    { id: 'c', category_id: 'c3', monto: 140000, periodo: '2026-09' }
  ];
  const resumen = { porCategoria: { c1: 202336, c2: 0, c3: 152000 } };
  // Combustible está excedido (109 %), Supermercado al 78 %, Gastronomía en 0.
  assert.deepEqual(F.estadoPresupuesto(budgets, resumen).map(x => x.id), ['c', 'a', 'b']);
});

t('un resto de centavos cuenta como resumen pagado', () => {
  const tj = { id: 'v', tipo: 'credito', nombre: 'Visa', moneda: 'ARS',
               ciclos: [{ cierre: '2026-08-27', vence: '2026-09-04' }] };
  const ciclo = { cierre: F.parseFecha('2026-08-27'), vence: F.parseFecha('2026-09-04') };
  const txs = [
    { id: 'g', tipo: 'gasto', moneda: 'ARS', monto: 939323.25, fecha: '2026-08-20',
      account_id: 'v', cuotas: 1 },
    { id: 'p', tipo: 'transferencia', moneda: 'ARS', monto: 939323, fecha: '2026-09-02',
      account_id: 'gal', destino_account_id: 'v' }
  ];
  // Se pagó redondo un resumen con centavos: queda saldado, no "a pagar".
  assert.equal(F.faltaPagarDeResumen(txs, tj, ciclo), 0);
  // Pero una parte de verdad sigue figurando.
  const parcial = [txs[0], { ...txs[1], monto: 400000 }];
  assert.equal(F.faltaPagarDeResumen(parcial, tj, ciclo), 539323.25);
  // Y sin ningún pago, el total entero.
  assert.equal(F.faltaPagarDeResumen([txs[0]], tj, ciclo), 939323.25);
});

t('el resumen nuevo arranca debiendo las cuotas de antes', () => {
  const tj = { id: 'v', tipo: 'credito', moneda: 'ARS', cierre_dia: 27, vencimiento_dia: 4 };
  const txs = [
    // Comprada en julio en 3 cuotas: la 2 y la 3 caen en los resúmenes siguientes.
    { id: 'a', tipo: 'gasto', moneda: 'ARS', monto: 300000, cuotas: 3,
      fecha: '2026-07-10', account_id: 'v' },
    // Comprada este ciclo, en una: es gasto nuevo, no compromiso viejo.
    { id: 'b', tipo: 'gasto', moneda: 'ARS', monto: 50000, cuotas: 1,
      fecha: '2026-09-02', account_id: 'v' }
  ];
  assert.equal(F.comprometidoEnPeriodo(txs, tj, '2026-10'), 100000);
  assert.equal(F.totalTarjetaEnPeriodo(txs, tj, '2026-10'), 150000);
  // En el resumen de la compra, la cuota 1 no es un compromiso de antes.
  assert.equal(F.comprometidoEnPeriodo(txs, tj, '2026-08'), 0);
});

t('el compromiso en cuotas se puede abrir y dice de qué está hecho', () => {
  const tj = { id: 'v', tipo: 'credito', moneda: 'ARS', cierre_dia: 27, vencimiento_dia: 4 };
  const txs = [
    { id: 'a', tipo: 'gasto', moneda: 'ARS', monto: 300000, cuotas: 3, comercio: 'Naked',
      fecha: '2026-07-10', account_id: 'v' },
    { id: 'b', tipo: 'gasto', moneda: 'ARS', monto: 60000, cuotas: 6, comercio: 'Juguetería',
      fecha: '2026-08-01', account_id: 'v' },
    { id: 'c', tipo: 'gasto', moneda: 'ARS', monto: 50000, cuotas: 1, comercio: 'Coto',
      fecha: '2026-09-02', account_id: 'v' }
  ];
  const cs = F.cuotasComprometidas(txs, tj, '2026-10');
  // La compra en una cuota de este ciclo no es un compromiso de antes.
  assert.deepEqual(cs.map(x => x.tx.comercio), ['Naked', 'Juguetería']);
  // Ordenadas de mayor a menor, con cuál de cuántas y cuándo termina.
  assert.equal(cs[0].monto, 100000);
  assert.equal(cs[0].nro, 3);
  assert.equal(cs[0].quedan, 0);
  assert.equal(cs[1].nro, 2);
  assert.equal(cs[1].quedan, 4);
  assert.equal(cs[1].ultimo, '2027-02');
  // Y la suma es exactamente el total que muestra la tarjeta.
  assert.equal(F.comprometidoEnPeriodo(txs, tj, '2026-10'), 110000);
});

t('pagar el resumen libera el límite en el momento', () => {
  const tj = { id: 'v', tipo: 'credito', moneda: 'ARS', limite: 1000000,
               cierre_dia: 27, vencimiento_dia: 4 };
  const txs = [{ id: 'g', tipo: 'gasto', moneda: 'ARS', monto: 300000,
                 fecha: '2026-08-20', account_id: 'v', cuotas: 1 }];
  const sinPagar = F.limiteDeTarjeta(tj, txs, d('2026-09-02'));
  assert.equal(sinPagar.consumido, 300000);
  const pagada = F.limiteDeTarjeta(tj, txs, d('2026-09-02'), 'ARS', 300000);
  assert.equal(pagada.consumido, 0);
  assert.equal(pagada.disponible, 1000000);
});

// --------------------------------------------------------- plata libre
const CUENTAS_PL = [
  { id: 'gal', nombre: 'Galicia', tipo: 'cuenta', moneda: 'ARS',
    saldo_inicial: 3000000, saldo_al: '2026-09-01' },
  { id: 'visa', nombre: 'Visa', tipo: 'credito', moneda: 'ARS',
    ciclos: [{ cierre: '2026-08-27', vence: '2026-09-04' },
             { cierre: '2026-10-01', vence: '2026-10-09' }] }
];
const FIJOS_PL = [
  { id: 'r1', nombre: 'Colegio', monto_estimado: 500000, moneda: 'ARS',
    dia_vencimiento: 10, activo: true, account_id: 'gal' },
  { id: 'r2', nombre: 'Spotify', monto_estimado: 9000, moneda: 'ARS', debito_automatico: true,
    dia_vencimiento: 12, activo: true, account_id: 'visa' }   // cae solo en la tarjeta
];
// El colegio se paga a mano y a veces sale con la tarjeta: no es lo mismo.
const A_MANO_EN_VISA = { id: 'r3', nombre: 'OSDE', monto_estimado: 300000, moneda: 'ARS',
                         dia_vencimiento: 15, activo: true, account_id: 'visa' };
const TXS_PL = [
  // Consumo de agosto: entra al resumen que vence el 4/9.
  { id: 'a', tipo: 'gasto', moneda: 'ARS', monto: 900000, fecha: '2026-08-20',
    account_id: 'visa', cuotas: 1 },
  // Consumo de septiembre: entra al resumen que vence el 9/10.
  { id: 'b', tipo: 'gasto', moneda: 'ARS', monto: 400000, fecha: '2026-09-01',
    account_id: 'visa', cuotas: 1 }
];

t('la plata libre descuenta el resumen y los fijos que faltan', () => {
  const r = F.plataLibre(CUENTAS_PL, TXS_PL, FIJOS_PL, [], d('2026-09-02'));
  assert.equal(r.enCuentas, 3000000);
  assert.equal(r.resumenes, 900000);       // el resumen que vence el 4/9
  assert.equal(r.fijos, 500000);           // el colegio; Spotify va en la tarjeta
  assert.equal(r.libre, 1600000);
});

t('lo consumido este ciclo se aparta para el mes que viene', () => {
  const r = F.plataLibre(CUENTAS_PL, TXS_PL, FIJOS_PL, [], d('2026-09-02'));
  // 400.000 consumidos + 9.000 de Spotify, que todavía no cayó.
  assert.equal(r.proximo, 409000);
  assert.equal(r.libreEstricta, 1191000);
});

t('un fijo que se debita solo en la tarjeta no se cuenta dos veces', () => {
  const soloTarjeta = [FIJOS_PL[1]];
  const r = F.plataLibre(CUENTAS_PL, TXS_PL, soloTarjeta, [], d('2026-09-02'));
  assert.equal(r.fijos, 0);
  assert.ok(F.debitoEnTarjeta(FIJOS_PL[1], CUENTAS_PL));
  assert.ok(!F.debitoEnTarjeta(FIJOS_PL[0], CUENTAS_PL));
});

t('el que se paga a mano sigue contando, aunque a veces salga con la tarjeta', () => {
  // OSDE tiene la Visa como cuenta pero NO es débito automático: hay que
  // acordarse de pagarlo, y con qué se paga se decide ese día.
  assert.ok(!F.debitoEnTarjeta(A_MANO_EN_VISA, CUENTAS_PL));
  const r = F.plataLibre(CUENTAS_PL, TXS_PL, [A_MANO_EN_VISA], [], d('2026-09-02'));
  assert.equal(r.fijos, 300000);
  // Y no se da por descontado en el resumen: no está pagado todavía.
  const ciclo = F.proximoCiclo(CUENTAS_PL[1], d('2026-09-02'));
  assert.equal(F.debitosPrevistos([A_MANO_EN_VISA], TXS_PL, CUENTAS_PL[1], ciclo).total, 0);
});

t('el débito del mes pasado no tapa el de este mes', () => {
  // Spotify cayó en agosto; el ciclo que cierra el 1/10 todavía lo espera.
  const agosto = [...TXS_PL,
    { id: 'v', tipo: 'gasto', moneda: 'ARS', monto: 8999, fecha: '2026-08-12',
      account_id: 'visa', descripcion: 'Spotify', cuotas: 1 }];
  const ciclo = { cierre: F.parseFecha('2026-10-01'), cierreAnterior: F.parseFecha('2026-08-27') };
  assert.equal(F.debitosPrevistos(FIJOS_PL, agosto, CUENTAS_PL[1], ciclo).total, 9000);
});

t('un débito que ya cayó en el resumen no se prevé de nuevo', () => {
  const conSpotify = [...TXS_PL,
    { id: 'c', tipo: 'gasto', moneda: 'ARS', monto: 8999, fecha: '2026-09-12',
      account_id: 'visa', descripcion: 'MERPAGO*SPOTIFY', comercio: 'Spotify', cuotas: 1 }];
  const ciclo = F.proximoCiclo(CUENTAS_PL[1], d('2026-09-13'));
  const antes = F.debitosPrevistos(FIJOS_PL, TXS_PL, CUENTAS_PL[1], ciclo, d('2026-09-13'));
  const despues = F.debitosPrevistos(FIJOS_PL, conSpotify, CUENTAS_PL[1], ciclo, d('2026-09-13'));
  assert.equal(antes.total, 9000);
  assert.equal(despues.total, 0);
});

t('pagar el resumen sube la plata libre en cero: sale de la cuenta y salda la deuda', () => {
  const pago = [...TXS_PL, { id: 'p', tipo: 'transferencia', moneda: 'ARS', monto: 900000,
                             fecha: '2026-09-02', account_id: 'gal', destino_account_id: 'visa' }];
  const r = F.plataLibre(CUENTAS_PL, pago, FIJOS_PL, [], d('2026-09-02'));
  assert.equal(r.enCuentas, 2100000);      // salió la plata
  assert.equal(r.resumenes, 0);            // ya no se debe
  assert.equal(r.libre, 1600000);          // la plata libre no se movió: es la misma
});

t('el reintegro respeta el tope', () => {
  assert.equal(F.reintegroEstimado(200000, promos[0]), 20000);
  assert.equal(F.reintegroEstimado(50000, promos[0]), 10000);
  assert.equal(F.reintegroEstimado(50000, { tipo: 'cuotas', valor: 12 }), 0);
});

// ---------------------------------------------------------------------
// CICLOS DECLARADOS
// En Galicia el cierre no cae un dia fijo del mes: en el resumen de agosto/26
// los cierres son 30-jul, 27-ago y 1-oct. Cuando la tarjeta trae los ciclos
// leidos del resumen, mandan sobre cierre_dia.
// ---------------------------------------------------------------------
console.log('\nCICLOS DECLARADOS');

const GALICIA = {
  id: 'g', tipo: 'credito', cierre_dia: 27, vencimiento_dia: 4,
  ciclos: [
    { cierre: '2026-07-30', vence: '2026-08-07' },
    { cierre: '2026-08-27', vence: '2026-09-04' },
    { cierre: '2026-10-01', vence: '2026-10-09' }
  ]
};

t('pagar el resumen baja lo que falta', () => {
  const t = [
    { id:'g1', account_id:'g', tipo:'gasto', moneda:'ARS', monto:100000, fecha:'2026-08-20', cuotas:1 },
    { id:'p1', tipo:'transferencia', destino_account_id:'g', moneda:'ARS', monto:60000, fecha:'2026-09-02' }
  ];
  const ciclo = { cierre: d('2026-08-27'), vence: d('2026-09-04') };
  assert.equal(F.pagadoDeResumen(t, GALICIA, ciclo), 60000);
  assert.equal(F.faltaPagarDeResumen(t, GALICIA, ciclo), 40000);
});

t('un pago fuera de la ventana no cuenta para ese resumen', () => {
  const t = [
    { id:'g1', account_id:'g', tipo:'gasto', moneda:'ARS', monto:100000, fecha:'2026-08-20', cuotas:1 },
    { id:'p1', tipo:'transferencia', destino_account_id:'g', moneda:'ARS', monto:60000, fecha:'2026-10-30' }
  ];
  const ciclo = { cierre: d('2026-08-27'), vence: d('2026-09-04') };
  assert.equal(F.pagadoDeResumen(t, GALICIA, ciclo), 0);
});

t('pagar de más no deja el resumen en negativo', () => {
  const t = [
    { id:'g1', account_id:'g', tipo:'gasto', moneda:'ARS', monto:100000, fecha:'2026-08-20', cuotas:1 },
    { id:'p1', tipo:'transferencia', destino_account_id:'g', moneda:'ARS', monto:150000, fecha:'2026-09-02' }
  ];
  const ciclo = { cierre: d('2026-08-27'), vence: d('2026-09-04') };
  assert.equal(F.faltaPagarDeResumen(t, GALICIA, ciclo), 0);
});

t('una compra antes del cierre entra en ese resumen', () => {
  const c = F.cicloDeCompra(d('2026-08-20'), GALICIA);
  assert.equal(F.fechaISO(c.cierre), '2026-08-27');
  assert.equal(F.fechaISO(c.vence), '2026-09-04');
  assert.equal(c.declarado, true);
});
t('una compra el dia del cierre entra en el siguiente', () => {
  const c = F.cicloDeCompra(d('2026-08-27'), GALICIA);
  assert.equal(F.fechaISO(c.cierre), '2026-10-01');
});
t('el 30 de agosto NO cierra el 27 de septiembre: cierra el 1 de octubre', () => {
  // con cierre_dia = 27 la cuenta daria 2026-09-27, que no existe como cierre
  const c = F.cicloDeCompra(d('2026-08-30'), GALICIA);
  assert.equal(F.fechaISO(c.cierre), '2026-10-01');
  assert.notEqual(F.fechaISO(c.cierre), '2026-09-27');
});
t('fuera de los ciclos conocidos vuelve al dia fijo y lo avisa', () => {
  const c = F.cicloDeCompra(d('2027-05-10'), GALICIA);
  assert.equal(c.declarado, false);
  assert.equal(F.fechaISO(c.cierre), '2027-05-27');
});
t('sin ciclos declarados se comporta igual que antes', () => {
  const sinCiclos = { id: 'x', tipo: 'credito', cierre_dia: 27, vencimiento_dia: 4 };
  const c = F.cicloDeCompra(d('2026-08-20'), sinCiclos);
  assert.equal(F.fechaISO(c.cierre), '2026-08-27');
  assert.equal(c.declarado, false);
});
t('la primera cuota usa el ciclo declarado', () => {
  const cr = F.cronograma({ fecha: '2026-08-22', monto: 37400, cuotas: 3 }, GALICIA);
  assert.equal(F.fechaISO(cr[0].vence), '2026-09-04');
  assert.equal(cr[0].declarado, true);
});
t('la segunda cuota salta al ciclo declarado siguiente, no al mes calendario', () => {
  const cr = F.cronograma({ fecha: '2026-08-22', monto: 37400, cuotas: 3 }, GALICIA);
  assert.equal(F.fechaISO(cr[1].cierre), '2026-10-01');
  assert.equal(F.fechaISO(cr[1].vence), '2026-10-09');
});
t('cuando se acaban los ciclos conocidos, extrapola desde el ultimo', () => {
  const cr = F.cronograma({ fecha: '2026-08-22', monto: 37400, cuotas: 3 }, GALICIA);
  assert.equal(cr[2].declarado, false);
  assert.equal(cr.length, 3);
});
t('el monto por cuota no cambia por usar ciclos declarados', () => {
  const cr = F.cronograma({ fecha: '2026-08-22', monto: 37400, cuotas: 3 }, GALICIA);
  cr.forEach(c => assert.equal(Math.round(c.monto * 100) / 100, 12466.67));
});
t('proximoCiclo dice si la fecha es del banco o estimada', () => {
  assert.equal(F.proximoCiclo(GALICIA, d('2026-08-20')).declarado, true);
  assert.equal(F.proximoCiclo(GALICIA, d('2027-05-10')).declarado, false);
});


// ---------------------------------------------------------------------
// LIMITE Y FINANCIACION
// Tres tarjetas reales: las dos de Galicia cierran el 27, Mercado Pago el 5.
// ---------------------------------------------------------------------
console.log('\nLIMITE Y FINANCIACION');

const MP = {
  id: 'mp', tipo: 'credito', nombre: 'Mercado Pago', limite: 2555000,
  cierre_dia: 5, vencimiento_dia: 15,
  ciclos: [{ cierre: '2026-09-05', vence: '2026-09-15' },
           { cierre: '2026-10-05', vence: '2026-10-15' }]
};
const TARJETAS = [GALICIA, { ...GALICIA, id: 'g2', nombre: 'Mastercard' }, MP];

t('el limite consumido incluye las cuotas que todavia no vencieron', () => {
  const txs = [
    // una compra en 3 cuotas de 100.000: las 3 toman limite
    { id: '1', account_id: 'mp', tipo: 'gasto', moneda: 'ARS',
      fecha: '2026-09-02', monto: 300000, cuotas: 3 }
  ];
  const l = F.limiteDeTarjeta(MP, txs, d('2026-09-03'));
  assert.equal(l.consumido, 300000);
  assert.equal(l.disponible, 2255000);
});
t('lo ya vencido deja de tomar limite', () => {
  const txs = [{ id: '1', account_id: 'mp', tipo: 'gasto', moneda: 'ARS',
                 fecha: '2026-09-02', monto: 300000, cuotas: 3 }];
  // pasado el vencimiento de la primera cuota quedan dos
  const l = F.limiteDeTarjeta(MP, txs, d('2026-09-20'));
  assert.equal(l.consumido, 200000);
});
t('los consumos de otra tarjeta no cuentan', () => {
  const txs = [{ id: '1', account_id: 'g', tipo: 'gasto', moneda: 'ARS',
                 fecha: '2026-09-02', monto: 300000, cuotas: 1 }];
  assert.equal(F.limiteDeTarjeta(MP, txs, d('2026-09-03')).consumido, 0);
});
t('los ingresos no consumen limite', () => {
  const txs = [{ id: '1', account_id: 'mp', tipo: 'ingreso', moneda: 'ARS',
                 fecha: '2026-09-02', monto: 300000, cuotas: 1 }];
  assert.equal(F.limiteDeTarjeta(MP, txs, d('2026-09-03')).consumido, 0);
});
t('sin limite cargado no divide por cero', () => {
  const l = F.limiteDeTarjeta({ ...MP, limite: null }, [], d('2026-09-03'));
  assert.equal(l.usado, 0);
});

t('una compra del 4 de septiembre: Galicia da un mes mas de aire', () => {
  const f = F.financiacion(d('2026-09-04'), TARJETAS);
  assert.equal(f[0].tarjeta.id === 'g' || f[0].tarjeta.id === 'g2', true);
  assert.equal(F.fechaISO(f[0].vence), '2026-10-09');
  const mp = f.find(x => x.tarjeta.id === 'mp');
  assert.equal(F.fechaISO(mp.vence), '2026-09-15');   // cierra al dia siguiente
  assert.equal(f[0].diasDeAire - mp.diasDeAire, 24);
});
t('una compra del 6 de septiembre: se da vuelta', () => {
  const f = F.financiacion(d('2026-09-06'), TARJETAS);
  const gal = f.find(x => x.tarjeta.id === 'g');
  const mp = f.find(x => x.tarjeta.id === 'mp');
  // MP ya cerro el 5, asi que cae en el resumen de octubre
  assert.equal(F.fechaISO(mp.vence), '2026-10-15');
  assert.equal(F.fechaISO(gal.vence), '2026-10-09');
  assert.equal(mp.diasDeAire > gal.diasDeAire, true);
});
t('viene ordenado de mas a menos dias de aire', () => {
  const f = F.financiacion(d('2026-09-06'), TARJETAS);
  for (let i = 1; i < f.length; i++)
    assert.equal(f[i - 1].diasDeAire >= f[i].diasDeAire, true);
});
t('las cuentas que no son credito quedan afuera', () => {
  const f = F.financiacion(d('2026-09-06'),
    [...TARJETAS, { id: 'ef', tipo: 'efectivo' }, { id: 'db', tipo: 'debito' }]);
  assert.equal(f.length, 3);
});
t('una tarjeta dada de baja tampoco aparece', () => {
  const f = F.financiacion(d('2026-09-06'), [...TARJETAS, { id: 'x', tipo: 'credito', activo: false }]);
  assert.equal(f.length, 3);
});
t('avisa cuando la fecha sale de los ciclos declarados', () => {
  const f = F.financiacion(d('2027-03-10'), TARJETAS);
  assert.equal(f.every(x => x.declarado === false), true);
});


// ---------------------------------------------------------------------
// TRANSFERENCIAS
// Del extracto real del 01/09: de $ 823.133 que salieron de la cuenta,
// solo $ 84.453 son gasto. El resto cambio de lugar, no se gasto.
// ---------------------------------------------------------------------
console.log('\nTRANSFERENCIAS');

const GAL = { id: 'gal', tipo: 'cuenta', moneda: 'ARS' };
const MPW = { id: 'mpw', tipo: 'billetera', moneda: 'ARS' };
const PP  = { id: 'pp',  tipo: 'billetera', moneda: 'ARS' };
const USD = { id: 'usd', tipo: 'cuenta', moneda: 'USD' };

const DIA1 = [
  { id: 'h', fecha: '2026-09-01', tipo: 'ingreso', moneda: 'ARS', monto: 2026665.38,
    account_id: 'gal', descripcion: 'Acreditamiento de haberes' },
  { id: 't1', fecha: '2026-09-01', tipo: 'transferencia', moneda: 'ARS', monto: 280000,
    account_id: 'gal', destino_account_id: 'mpw' },
  { id: 't2', fecha: '2026-09-01', tipo: 'transferencia', moneda: 'ARS', monto: 62780,
    account_id: 'gal', destino_account_id: 'pp' },
  { id: 't3', fecha: '2026-09-01', tipo: 'transferencia', moneda: 'ARS', monto: 372800,
    account_id: 'gal', destino_account_id: 'mpw' },
  { id: 's1', fecha: '2026-09-01', tipo: 'gasto', moneda: 'ARS', monto: 20581.06, account_id: 'gal' },
  { id: 's2', fecha: '2026-09-01', tipo: 'gasto', moneda: 'ARS', monto: 37784.00, account_id: 'gal' },
  { id: 's3', fecha: '2026-09-01', tipo: 'gasto', moneda: 'ARS', monto: 26087.98, account_id: 'gal' },
  { id: 'd1', fecha: '2026-09-01', tipo: 'transferencia', moneda: 'ARS', monto: 23100,
    account_id: 'gal', destino_account_id: 'usd', monto_destino: 15.55, moneda_destino: 'USD' }
];

t('el gasto del dia son $ 84.453, no $ 823.133', () => {
  const r = F.resumenMes(DIA1, '2026-09');
  assert.equal(r.gastos, 84453.04);
});
t('las transferencias se informan aparte, no como gasto', () => {
  const r = F.resumenMes(DIA1, '2026-09');
  assert.equal(r.movido, 738680);          // 715.580 a billeteras + 23.100 a dolares
});
t('contarlas como gasto inflaria el dia casi diez veces', () => {
  const r = F.resumenMes(DIA1, '2026-09');
  assert.equal(Math.round((r.gastos + r.movido) / r.gastos), 10);
});
t('el ingreso no se ve afectado', () => {
  assert.equal(F.resumenMes(DIA1, '2026-09').ingresos, 2026665.38);
});
t('una transferencia no cae en ninguna categoria', () => {
  const r = F.resumenMes(DIA1, '2026-09');
  assert.equal(Object.values(r.porCategoria).reduce((a, b) => a + b, 0), 84453.04);
});

t('el saldo de Galicia despues del dia 1', () => {
  assert.equal(F.saldoDeCuenta(GAL, DIA1, d('2026-09-01')), 1203532.34);
});
t('lo transferido aparece en la billetera de destino', () => {
  assert.equal(F.saldoDeCuenta(MPW, DIA1, d('2026-09-01')), 652800);   // 280.000 + 372.800
  assert.equal(F.saldoDeCuenta(PP, DIA1, d('2026-09-01')), 62780);
});
t('la plata no se crea ni se destruye: los saldos suman el ingreso menos el gasto', () => {
  const total = [GAL, MPW, PP].reduce((s, c) => s + F.saldoDeCuenta(c, DIA1, d('2026-09-01')), 0);
  const usd = F.saldoDeCuenta(USD, DIA1, d('2026-09-01'));
  assert.equal(F.round2(total), F.round2(2026665.38 - 84453.04 - 23100));
  assert.equal(usd, 15.55);
});
t('comprar dolares deja el importe en dolares del otro lado', () => {
  assert.equal(F.saldoDeCuenta(USD, DIA1, d('2026-09-01')), 15.55);
});
t('de la transferencia entre monedas sale el tipo de cambio', () => {
  const tc = F.tipoDeCambio(DIA1.find(x => x.id === 'd1'));
  assert.equal(tc.de, 'ARS'); assert.equal(tc.a, 'USD');
  assert.equal(tc.valor, 1485.53);
});
t('una transferencia en la misma moneda no tiene tipo de cambio', () => {
  assert.equal(F.tipoDeCambio(DIA1.find(x => x.id === 't1')), null);
});
t('un gasto comun tampoco', () => {
  assert.equal(F.tipoDeCambio(DIA1.find(x => x.id === 's1')), null);
});
t('el saldo respeta la fecha de corte', () => {
  assert.equal(F.saldoDeCuenta(GAL, DIA1, d('2026-08-31')), 0);
});
t('un saldo inicial se suma', () => {
  assert.equal(F.saldoDeCuenta(GAL, DIA1, d('2026-09-01'), 100000), 1303532.34);
});
t('una compra con tarjeta NO baja el saldo de la cuenta', () => {
  const txs = [{ id: 'c', fecha: '2026-09-02', tipo: 'gasto', moneda: 'ARS',
                 monto: 50000, account_id: 'tc' }];
  const tc = { id: 'tc', tipo: 'credito' };
  assert.equal(F.saldoDeCuenta(tc, txs, d('2026-09-03')), 0);
});


console.log('\nSALDO CON CORTE Y RESUMEN A PAGAR');
t('un saldo declarado no vuelve a sumar lo anterior a su fecha', () => {
  const txs = [
    { id: 'a', fecha: '2026-08-20', tipo: 'gasto', moneda: 'ARS', monto: 500000, account_id: 'gal' },
    { id: 'b', fecha: '2026-09-02', tipo: 'gasto', moneda: 'ARS', monto: 100000, account_id: 'gal' }
  ];
  // saldo del banco al 01/09: ya tiene adentro el gasto del 20/08
  const s = F.saldoDeCuenta(GAL, txs, d('2026-09-05'), 1000000, '2026-09-01');
  assert.equal(s, 900000);
});
t('sin fecha de corte se cuenta todo, como antes', () => {
  const txs = [{ id: 'a', fecha: '2026-08-20', tipo: 'gasto', moneda: 'ARS', monto: 500000, account_id: 'gal' }];
  assert.equal(F.saldoDeCuenta(GAL, txs, d('2026-09-05'), 1000000), 500000);
});
t('un movimiento del mismo dia del corte SI cuenta', () => {
  const txs = [{ id: 'a', fecha: '2026-09-01', tipo: 'gasto', moneda: 'ARS', monto: 100000, account_id: 'gal' }];
  assert.equal(F.saldoDeCuenta(GAL, txs, d('2026-09-05'), 1000000, '2026-09-01'), 900000);
});

t('el 1 de septiembre hay un resumen cerrado esperando pago', () => {
  const r = F.resumenAPagar(GALICIA, d('2026-09-01'));
  assert.equal(F.fechaISO(r.cierre), '2026-08-27');
  assert.equal(F.fechaISO(r.vence), '2026-09-04');
});
t('el ciclo en curso es otro: cierra el 1 de octubre', () => {
  assert.equal(F.fechaISO(F.proximoCiclo(GALICIA, d('2026-09-01')).cierre), '2026-10-01');
});
t('pasado el vencimiento ya no hay resumen a pagar', () => {
  assert.equal(F.resumenAPagar(GALICIA, d('2026-09-06')), null);
});
t('el dia del vencimiento todavia cuenta', () => {
  assert.ok(F.resumenAPagar(GALICIA, d('2026-09-04')));
});



// ------------------------------------------------ de dónde sale el número
t('un movimiento sin moneda cuenta como pesos, no desaparece', () => {
  // La base pone 'ARS' por omision, pero una fila vieja puede venir sin nada.
  // Comparando con ===, esa fila no era ni de pesos ni de dolares: el sueldo
  // en sobre no sumaba a lo que entro y la app decia que habia entrado la
  // mitad, sin que nada dijera que faltaba algo.
  const txs = [{ id: '1', fecha: '2026-09-01', tipo: 'ingreso', monto: 2026665, moneda: 'ARS' },
               { id: '2', fecha: '2026-09-01', tipo: 'ingreso', monto: 1532000 }];
  assert.equal(F.resumenMes(txs, '2026-09', 'ARS').ingresos, 3558665);
});

t('las categorías suman exactamente lo que salió', () => {
  const txs = [{ id: '1', fecha: '2026-09-02', tipo: 'gasto', monto: 100, moneda: 'ARS', category_id: 'a' },
               { id: '2', fecha: '2026-09-03', tipo: 'gasto', monto: 50, moneda: 'ARS', category_id: 'a' },
               { id: '3', fecha: '2026-09-04', tipo: 'gasto', monto: 30, moneda: 'ARS', category_id: 'b' }];
  const d = F.deDondeSale(txs, '2026-09', 'ARS', []);
  assert.equal(d.totalGastos, 180);
  assert.equal(d.categorias.reduce((s, c) => s + c.monto, 0), 180);
  assert.equal(d.categorias[0].cuantos, 2);      // de mayor a menor
});

t('el pago de tarjeta y la movida se separan, y ninguno es gasto', () => {
  const cuentas = [{ id: 'tj', tipo: 'credito' }, { id: 'mp', tipo: 'cuenta' }];
  const txs = [{ id: '1', fecha: '2026-09-02', tipo: 'transferencia', monto: 939323,
                 moneda: 'ARS', destino_account_id: 'tj' },
               { id: '2', fecha: '2026-09-02', tipo: 'transferencia', monto: 652800,
                 moneda: 'ARS', destino_account_id: 'mp' }];
  const d = F.deDondeSale(txs, '2026-09', 'ARS', cuentas);
  assert.equal(d.totalGastos, 0);
  assert.equal(d.pagosTarjeta.monto, 939323);
  assert.equal(d.movidas.monto, 652800);
});

t('mismo día y mismo importe se marca como posible repetido', () => {
  const txs = [{ id: '1', fecha: '2026-09-02', tipo: 'gasto', monto: 48200, moneda: 'ARS' },
               { id: '2', fecha: '2026-09-02', tipo: 'gasto', monto: 48200, moneda: 'ARS' },
               { id: '3', fecha: '2026-09-03', tipo: 'gasto', monto: 48200, moneda: 'ARS' }];
  const r = F.repetidos(txs);
  assert.equal(r.length, 1);
  assert.equal(r[0].cuantos, 2);
});

t('una transferencia nunca se marca como repetida', () => {
  // Pagar dos tarjetas el mismo dia el mismo importe es normal.
  const txs = [{ id: '1', fecha: '2026-09-02', tipo: 'transferencia', monto: 5000, moneda: 'ARS' },
               { id: '2', fecha: '2026-09-02', tipo: 'transferencia', monto: 5000, moneda: 'ARS' }];
  assert.equal(F.repetidos(txs).length, 0);
});

// ------------------------------------------------- extracto de una cuenta
t('una cuenta sin saldo inicial de la que sale plata queda marcada', () => {
  // "Eso estaba en efectivo antes, en algun momento ingreso y no lo veo": una
  // movida entre cuentas propias no es un ingreso, asi que si el efectivo
  // nunca tuvo saldo inicial ni ingresos cargados, la plata que sale de ahi
  // no vino de ningun lado que la app conozca.
  const c = { id: 'ef', tipo: 'efectivo', moneda: 'ARS' };
  const txs = [{ id: '1', fecha: '2026-09-02', tipo: 'transferencia', monto: 1480000,
                 moneda: 'ARS', account_id: 'ef', destino_account_id: 'ga' }];
  const e = F.extractoDeCuenta(c, txs, new Date(2026, 8, 3));
  assert.equal(e.saldo, -1480000);
  assert.equal(e.faltaOrigen, true);
});

t('con el saldo inicial cargado, la cuenta cierra y no se marca', () => {
  const c = { id: 'ef', tipo: 'efectivo', moneda: 'ARS',
              saldo_inicial: 1600000, saldo_al: '2026-08-01' };
  const txs = [{ id: '1', fecha: '2026-09-02', tipo: 'transferencia', monto: 1480000,
                 moneda: 'ARS', account_id: 'ef', destino_account_id: 'ga' }];
  const e = F.extractoDeCuenta(c, txs, new Date(2026, 8, 3));
  assert.equal(e.saldo, 120000);
  assert.equal(e.faltaOrigen, false);
  assert.equal(e.salidas, 1480000);
});

t('la cuenta que recibe la movida la ve entrar', () => {
  const c = { id: 'ga', tipo: 'cuenta', moneda: 'ARS' };
  const txs = [{ id: '1', fecha: '2026-09-02', tipo: 'transferencia', monto: 1480000,
                 moneda: 'ARS', account_id: 'ef', destino_account_id: 'ga' }];
  const e = F.extractoDeCuenta(c, txs, new Date(2026, 8, 3));
  assert.equal(e.entradas, 1480000);
  assert.equal(e.filas.length, 1);
  assert.equal(e.filas[0].entra, true);
});

t('lo anterior al saldo declarado no se cuenta dos veces', () => {
  const c = { id: 'ga', tipo: 'cuenta', moneda: 'ARS',
              saldo_inicial: 500000, saldo_al: '2026-09-01' };
  const txs = [{ id: 'viejo', fecha: '2026-08-15', tipo: 'ingreso', monto: 999999,
                 moneda: 'ARS', account_id: 'ga' },
               { id: 'nuevo', fecha: '2026-09-02', tipo: 'gasto', monto: 100000,
                 moneda: 'ARS', account_id: 'ga' }];
  const e = F.extractoDeCuenta(c, txs, new Date(2026, 8, 3));
  assert.equal(e.saldo, 400000);
  assert.equal(e.filas.length, 1);
});

// ----------------------------------------------------------- cierre del mes
t('un mes que todavia no termino no cierra', () => {
  assert.equal(F.cierreDeMes({ txs: [] }, '2026-09', 'ARS', new Date(2026, 8, 3)), null);
});

t('el cierre compara contra el mes anterior, categoria por categoria', () => {
  const txs = [
    { id: 'a', fecha: '2026-07-05', tipo: 'gasto', monto: 200000, moneda: 'ARS', category_id: 'c1' },
    { id: 'b', fecha: '2026-07-10', tipo: 'gasto', monto: 80000, moneda: 'ARS', category_id: 'c2' },
    { id: 'c', fecha: '2026-08-03', tipo: 'gasto', monto: 260000, moneda: 'ARS', category_id: 'c1' },
    { id: 'd', fecha: '2026-08-12', tipo: 'gasto', monto: 40000, moneda: 'ARS', category_id: 'c2' }
  ];
  const cats = [{ id: 'c1', nombre: 'Supermercado' }, { id: 'c2', nombre: 'Salidas' }];
  const d = F.cierreDeMes({ txs, categorias: cats }, '2026-08', 'ARS', new Date(2026, 8, 1));
  assert.equal(d.subio.nombre, 'Supermercado');
  assert.equal(d.subio.cambio, 60000);
  assert.equal(d.bajo.nombre, 'Salidas');
  assert.equal(d.bajo.cambio, -40000);
  assert.equal(d.gastasteMenos, -20000);      // gasto 20.000 MAS que en julio
});

t('una categoria que no existia el mes pasado no cuenta como que subio', () => {
  // Sin esto, cualquier categoria nueva aparece como "lo que mas subio" con
  // todo su valor, y la comparacion no dice nada.
  const txs = [
    { id: 'a', fecha: '2026-07-05', tipo: 'gasto', monto: 10000, moneda: 'ARS', category_id: 'c1' },
    { id: 'b', fecha: '2026-08-05', tipo: 'gasto', monto: 12000, moneda: 'ARS', category_id: 'c1' },
    { id: 'c', fecha: '2026-08-06', tipo: 'gasto', monto: 500000, moneda: 'ARS', category_id: 'nueva' }
  ];
  const cats = [{ id: 'c1', nombre: 'Nafta' }, { id: 'nueva', nombre: 'Mudanza' }];
  const d = F.cierreDeMes({ txs, categorias: cats }, '2026-08', 'ARS', new Date(2026, 8, 1));
  assert.equal(d.subio.nombre, 'Nafta');
});

t('propone un tope redondo para lo que mas subio, y no si ya tiene', () => {
  const txs = [
    { id: 'a', fecha: '2026-07-05', tipo: 'gasto', monto: 137482, moneda: 'ARS', category_id: 'c1' },
    { id: 'b', fecha: '2026-08-05', tipo: 'gasto', monto: 190000, moneda: 'ARS', category_id: 'c1' }
  ];
  const cats = [{ id: 'c1', nombre: 'Combustible' }];
  const d = F.cierreDeMes({ txs, categorias: cats }, '2026-08', 'ARS', new Date(2026, 8, 1));
  assert.equal(d.proponer.tope, 140000);      // 137.482 no es un tope, 140.000 si

  const conTope = F.cierreDeMes({ txs, categorias: cats,
    budgets: [{ periodo: '2026-08', category_id: 'c1', monto: 150000 }] },
    '2026-08', 'ARS', new Date(2026, 8, 1));
  assert.equal(conTope.proponer, null);
});

t('lo que quedo es cuanto subio la plata libre, no ingresos menos gastos', () => {
  // El dia 1 el sueldo ya entro y los gastos todavia no salieron: "ingresos
  // menos gastos" da un superavit enorme que no existe.
  const cuentas = [{ id: 'gal', tipo: 'cuenta', moneda: 'ARS', saldo_inicial: 0, saldo_al: '2026-07-31' }];
  const txs = [
    { id: 'i', fecha: '2026-08-01', tipo: 'ingreso', monto: 3000000, moneda: 'ARS', account_id: 'gal' },
    { id: 'g', fecha: '2026-08-20', tipo: 'gasto', monto: 1000000, moneda: 'ARS', account_id: 'gal' }
  ];
  const d = F.cierreDeMes({ txs, cuentas }, '2026-08', 'ARS', new Date(2026, 8, 1));
  assert.equal(d.entro, 3000000);
  assert.equal(d.salio, 1000000);
  assert.equal(d.quedo, 2000000);             // la plata libre subio eso
  assert.equal(d.hasta - d.desde, 2000000);
});

// -------------------------------------------- aumentos que valen la pena
const FIJOS = [{ id: 'flow', nombre: 'Flow', activo: true },
               { id: 'luz', nombre: 'Edesur', activo: true },
               { id: 'gas', nombre: 'Metrogas', activo: true },
               { id: 'agua', nombre: 'Aysa', activo: true }];
const pg = (id, periodo, monto) => ({ recurring_id: id, periodo, monto,
                                      pagado_at: `${periodo}-05T00:00:00Z` });
const PAGOS = [
  pg('flow', '2026-06', 38000), pg('flow', '2026-09', 46400),
  pg('luz', '2026-06', 20000), pg('luz', '2026-09', 21200),
  pg('gas', '2026-06', 37000), pg('gas', '2026-09', 39220),
  pg('agua', '2026-06', 26000), pg('agua', '2026-09', 27560)
];

t('mide contra lo que subio EL RESTO, no contra cero', () => {
  const r = F.aumentosSospechosos(FIJOS, PAGOS, '2026-09');
  assert.equal(r.normal, 6);
  assert.equal(r.casos.length, 1);
  assert.equal(r.casos[0].nombre, 'Flow');
  assert.equal(Math.round(r.casos[0].demas), 6120);
  assert.equal(r.casos[0].queEs, 'internet');
});

t('si sube todo parejo no avisa nada', () => {
  // La prueba que decide si esto sirve: en Argentina sube todo todos los
  // meses, y una regla contra cero avisaria por los cuatro cada mes.
  const parejo = PAGOS.map(p => p.recurring_id === 'flow' && p.periodo === '2026-09'
    ? { ...p, monto: 40280 } : p);
  assert.equal(F.aumentosSospechosos(FIJOS, parejo, '2026-09').casos.length, 0);
});

t('un pago sin pagado_at no cuenta como historia', () => {
  // El monto_estimado se pisa cuando uno lo actualiza: no tiene historia, y
  // usarlo seria comparar el precio de hoy contra el precio de hoy.
  const sinPagar = PAGOS.map(p => p.periodo === '2026-06' ? { ...p, pagado_at: null } : p);
  assert.equal(F.aumentosSospechosos(FIJOS, sinPagar, '2026-09').comparados, 0);
});

t('ordena por la plata y no por el porcentaje', () => {
  const con = [...FIJOS, { id: 'spo', nombre: 'Spotify', activo: true }];
  const pagos = [...PAGOS, pg('spo', '2026-06', 9000), pg('spo', '2026-09', 12600)];
  const r = F.aumentosSospechosos(con, pagos, '2026-09');
  assert.equal(r.casos[0].nombre, 'Flow');    // Spotify subio 40 %, son $ 3.000
  assert.equal(r.casos[1].nombre, 'Spotify');
});

t('con menos de tres comparables no opina, salvo referencia a mano', () => {
  const dos = PAGOS.filter(p => ['flow', 'luz'].includes(p.recurring_id));
  assert.equal(F.aumentosSospechosos(FIJOS, dos, '2026-09').normal, null);
  const conRef = F.aumentosSospechosos(FIJOS, dos, '2026-09', { referencia: 6 });
  assert.equal(conRef.casos[0].nombre, 'Flow');
  assert.equal(conRef.mediaPropia, false);
});

t('sabe con quien se puede discutir y con quien no', () => {
  assert.equal(F.queServicio('Flow'), 'internet');
  assert.equal(F.queServicio('Personal Pay'), 'celular');
  assert.equal(F.queServicio('OSDE 210'), 'prepaga');
  assert.equal(F.queServicio('Colegio Juan Bautista'), null);
});

// ------------------------------------------- los meses que no llegaron
const TJ = { id: 'v', nombre: 'Visa', tipo: 'credito', activo: true, moneda: 'ARS',
             cierre_dia: 27, vencimiento_dia: 4 };
const INGRESOS = [
  { id: 'i1', fecha: '2026-08-01', tipo: 'ingreso', monto: 3000000, moneda: 'ARS' },
  { id: 'i2', fecha: '2026-07-01', tipo: 'ingreso', monto: 2900000, moneda: 'ARS' }
];

t('una compra en cuotas compromete meses que todavia no llegaron', () => {
  const txs = [...INGRESOS,
    { id: 'c', fecha: '2026-08-15', tipo: 'gasto', monto: 1200000, moneda: 'ARS',
      account_id: 'v', cuotas: 12 }];
  const p = F.proyeccionMeses({ cuentas: [TJ], txs, recurrings: [] },
                              { meses: 3 }, new Date(2026, 8, 3));
  assert.equal(p.length, 3);
  assert.ok(p.every(m => m.cuotas === 100000), 'cada mes lleva su cuota');
  assert.equal(p[0].entra, 2950000);           // mediana, no promedio
});

t('los fijos tambien tienen dueno todos los meses', () => {
  const rec = [{ id: 'r', nombre: 'Colegio', monto_estimado: 500000, moneda: 'ARS', activo: true }];
  const p = F.proyeccionMeses({ cuentas: [], txs: INGRESOS, recurrings: rec },
                              { meses: 2 }, new Date(2026, 8, 3));
  assert.equal(p[0].fijos, 500000);
  assert.equal(p[0].libre, 2450000);
});

t('simular una compra muestra el antes y el despues', () => {
  const datos = { cuentas: [TJ], txs: INGRESOS, recurrings: [] };
  const ref = new Date(2026, 8, 3);
  const sin = F.proyeccionMeses(datos, { meses: 6 }, ref);
  const con = F.proyeccionMeses(datos, { meses: 6, extra: { monto: 900000, cuotas: 6 } }, ref);
  assert.equal(sin[0].libre - con[0].libre, 150000);
  // La septima proyeccion ya no tiene cuota: seis cuotas son seis meses.
  const largo = F.proyeccionMeses(datos, { meses: 7, extra: { monto: 900000, cuotas: 6 } }, ref);
  assert.equal(largo[6].extra, 0);
});

t('solo avisa cuando un mes queda de verdad apretado', () => {
  // Avisar por cada compra en cuotas seria avisar por todo. Lo que importa es
  // el mes en que lo comprometido se come una parte grande de lo que entra.
  const datos = { cuentas: [TJ], txs: INGRESOS, recurrings: [] };
  const ref = new Date(2026, 8, 3);
  const chica = F.proyeccionMeses(datos, { meses: 6, extra: { monto: 300000, cuotas: 6 } }, ref);
  assert.equal(F.mesQueAprieta(chica), null);
  const grande = F.proyeccionMeses(datos, { meses: 6, extra: { monto: 15000000, cuotas: 6 } }, ref);
  const m = F.mesQueAprieta(grande);
  assert.ok(m && m.pct >= 70, 'con 2,5 millones por mes tiene que apretar');
});

t('sin ingresos cargados no se opina sobre el futuro', () => {
  const p = F.proyeccionMeses({ cuentas: [], txs: [], recurrings: [] },
                              { meses: 3 }, new Date(2026, 8, 3));
  assert.equal(p[0].entra, 0);
  assert.equal(p[0].pct, null);
  assert.equal(F.mesQueAprieta(p), null);
});

t('lo que suele entrar es la mediana, no el promedio', () => {
  // Un mes con aguinaldo levanta el promedio y hace parecer que entra mas de
  // lo que entra todos los meses.
  const txs = [
    { id: '1', fecha: '2026-08-01', tipo: 'ingreso', monto: 3000000, moneda: 'ARS' },
    { id: '2', fecha: '2026-07-01', tipo: 'ingreso', monto: 3000000, moneda: 'ARS' },
    { id: '3', fecha: '2026-06-01', tipo: 'ingreso', monto: 6000000, moneda: 'ARS' }
  ];
  assert.equal(F.ingresoTipico(txs, new Date(2026, 8, 3)), 3000000);
});


t('un gasto variable no arrastra saldo: la luz no se debe ni se tiene a favor', () => {
  // El alquiler vale 850 y pagar 900 deja 50 a favor. La luz no vale nada
  // fijo: lo que salio es lo que salio. Sin esto, una retencion de ingresos
  // brutos de $ 980 contra un estimado de $ 27.200 decia "$ 26.220 a favor".
  const r = { id: 'x', monto_estimado: 27200, variable: true };
  const pagos = [{ recurring_id: 'x', periodo: '2026-07', monto: 980, pagado_at: 'x' },
                 { recurring_id: 'x', periodo: '2026-08', monto: 1100, pagado_at: 'x' }];
  assert.equal(F.saldoRecurrente(r, pagos, '2026-09'), 0);
  assert.equal(F.aPagarRecurrente(r, pagos, '2026-09').sugerido, 27200);
});

t('pero uno de monto fijo sigue arrastrando', () => {
  const r = { id: 'a', monto_estimado: 850 };
  const pagos = [{ recurring_id: 'a', periodo: '2026-07', monto: 900, pagado_at: 'x' }];
  assert.equal(F.saldoRecurrente(r, pagos, '2026-09'), 50);
  assert.equal(F.aPagarRecurrente(r, pagos, '2026-09').sugerido, 800);
});


// ---------------------------------------------------------------------
// La plata quieta
// ---------------------------------------------------------------------
const HOY_R = new Date(2026, 8, 20);   // 20 de septiembre
const round2 = n => Math.round(n * 100) / 100;
const CTA = (id, nombre, tna, saldo, extra = {}) =>
  ({ id, nombre, tipo: 'billetera', moneda: 'ARS', tna,
     saldo_inicial: saldo, saldo_al: '2026-09-01', ...extra });

t('lo que rinde por día sale de la tasa anual sobre el saldo', () => {
  assert.equal(F.porDia(500000, 32), 438.36);
  assert.equal(F.porDia(500000, 0), 0);
  assert.equal(F.porDia(0, 32), 0);
  assert.equal(F.porDia(-1000, 32), 0, 'un saldo negativo no rinde');
});

t('el mes se calcula día por día, no sobre el saldo de hoy', () => {
  // Si el sueldo entró el 5 y se fue el 20, el saldo de hoy no dice nada de
  // lo que hubo adentro del mes.
  const c = CTA('mp', 'Mercado Pago', 32, 500000);
  const salio = [{ id: 'g', tipo: 'gasto', moneda: 'ARS', monto: 400000,
                   fecha: '2026-09-10', account_id: 'mp' }];
  const conMovimiento = F.rindioEnElMes(c, salio, '2026-09', HOY_R);
  const sinMovimiento = F.rindioEnElMes(c, [], '2026-09', HOY_R);
  assert.ok(conMovimiento < sinMovimiento, 'sacar plata tiene que rendir menos');
  // 9 días con 500.000 y 11 con 100.000.
  assert.equal(conMovimiento, round2(F.porDia(500000, 32) * 9 + F.porDia(100000, 32) * 11));
});

t('el mes en curso no rinde por adelantado', () => {
  const c = CTA('mp', 'Mercado Pago', 32, 500000);
  const hastaHoy = F.rindioEnElMes(c, [], '2026-09', HOY_R);
  assert.equal(hastaHoy, round2(F.porDia(500000, 32) * 20), 'veinte días, no treinta');
});

t('una cuenta sin tasa no rinde y no rompe', () => {
  assert.equal(F.rinde({ nombre: 'Efectivo' }), null);
  assert.equal(F.rinde({ tna: 0 }), null);
  assert.equal(F.rindioEnElMes({ id: 'e', tna: null }, [], '2026-09', HOY_R), 0);
});

t('lo acreditado de verdad se reconoce por el nombre', () => {
  const txs = [
    { tipo: 'ingreso', moneda: 'ARS', monto: 8000, fecha: '2026-09-15',
      account_id: 'mp', comercio: 'Rendimientos' },
    { tipo: 'ingreso', moneda: 'ARS', monto: 1200, fecha: '2026-09-16',
      account_id: 'mp', comercio: 'Intereses cuenta remunerada' },
    { tipo: 'ingreso', moneda: 'ARS', monto: 500000, fecha: '2026-09-05',
      account_id: 'mp', comercio: 'Transferencia recibida' }
  ];
  assert.equal(F.acreditadoEnElMes({ id: 'mp' }, txs, '2026-09'), 9200);
});

t('dice cuál rinde más y cuánto dejás de ganar', () => {
  const cuentas = [CTA('pp', 'Personal Pay', 35, 100000),
                   CTA('mp', 'Mercado Pago', 28, 400000),
                   CTA('gal', 'Galicia', null, 1000000, { tipo: 'cuenta' })];
  const r = F.dondeRinde(cuentas, [], { moneda: 'ARS' }, HOY_R);
  assert.equal(r.mejor.cuenta.id, 'pp', 'gana la de mayor tasa');
  assert.equal(r.mover.length, 2, 'la de menor tasa y la que no rinde');
  assert.ok(r.dejasDeGanar > 0);
  // Lo que ganaría esa plata al 35 %, menos lo que gana hoy.
  assert.equal(r.dejasDeGanar,
    round2(F.porDia(400000, 35) - F.porDia(400000, 28) + F.porDia(1000000, 35)));
});

t('el efectivo no entra en la recomendación', () => {
  // Uno tiene efectivo por razones que la app no ve. Decirle todos los días
  // que lo deposite es la clase de consejo que hace apagar la sección.
  const cuentas = [CTA('pp', 'Personal Pay', 35, 100000),
                   CTA('ef', 'Efectivo', null, 1500000, { tipo: 'efectivo' })];
  const r = F.dondeRinde(cuentas, [], { moneda: 'ARS' }, HOY_R);
  assert.equal(r.mover.length, 0);
  assert.equal(r.dejasDeGanar, 0);
});

t('no se mezclan monedas', () => {
  const cuentas = [CTA('pp', 'Personal Pay', 35, 100000),
                   { id: 'w', nombre: 'Wallbit', tipo: 'billetera', moneda: 'USD',
                     tna: 4, saldo_inicial: 5000, saldo_al: '2026-09-01' }];
  const r = F.dondeRinde(cuentas, [], { moneda: 'ARS' }, HOY_R);
  assert.equal(r.filas.length, 1);
});

t('una tasa vieja se avisa en vez de usarla callado', () => {
  // Cambian seguido: con una de hace tres meses el cálculo miente sin decirlo.
  assert.equal(F.tasaVieja({ tna: 32, tnaAl: '2026-09-01' }, HOY_R), false);
  assert.equal(F.tasaVieja({ tna: 32, tnaAl: '2026-05-01' }, HOY_R), true);
  assert.equal(F.tasaVieja({ tna: 32, tnaAl: null }, HOY_R), true);
  assert.equal(F.tasaVieja({ tna: null, tnaAl: null }, HOY_R), false, 'sin tasa no hay nada viejo');
});


// ---------------------------------------------------------------------
// Los topes no vencen el 31
// ---------------------------------------------------------------------
const TOPES = [
  { id: 'a1', periodo: '2026-08', category_id: 'c1', monto: 400000, clase: 'categoria' },
  { id: 'a2', periodo: '2026-08', category_id: 'c2', monto: 150000, clase: 'categoria' }
];

t('si el mes tiene sus propios topes, se usan esos', () => {
  const b = [...TOPES, { id: 's1', periodo: '2026-09', category_id: 'c1', monto: 500000 }];
  const r = F.topesDelMes(b, '2026-09');
  assert.equal(r.heredados, false);
  assert.equal(r.topes.length, 1);
  assert.equal(r.topes[0].monto, 500000);
});

t('y si no, se heredan del último mes que los tenga', () => {
  // Sin esto, el día 1 de cada mes la sección decía "sin topes cargados" y se
  // apagaban solas la detección de excedidos, el aviso y el color del hero.
  const r = F.topesDelMes(TOPES, '2026-09');
  assert.equal(r.heredados, true);
  assert.equal(r.de, '2026-08');
  assert.equal(r.topes.length, 2);
});

t('los heredados vienen con el período de ESTE mes', () => {
  // Tienen que poder usarse como si fueran de este mes: los consume el mismo
  // código que los propios.
  const r = F.topesDelMes(TOPES, '2026-09');
  assert.ok(r.topes.every(b => b.periodo === '2026-09'));
  assert.equal(r.topes[0].heredadoDe, '2026-08');
});

t('salta meses vacíos: agosto rige en noviembre si no hubo nada en el medio', () => {
  const r = F.topesDelMes(TOPES, '2026-11');
  assert.equal(r.heredados, true);
  assert.equal(r.de, '2026-08');
});

t('pero no hereda de hace un año', () => {
  // Un tope de hace ocho meses no dice nada de lo que gastás hoy.
  assert.deepEqual(F.topesDelMes(TOPES, '2027-06').topes, []);
});

t('sin ningún tope nunca, no inventa', () => {
  assert.deepEqual(F.topesDelMes([], '2026-09').topes, []);
  assert.equal(F.topesDelMes([], '2026-09').heredados, false);
});

t('heredar no toca el mes del que vino', () => {
  // El original tiene que quedar intacto: si guardar septiembre le cambiara
  // el período a la fila de agosto, revisar un mes borraría la historia del
  // anterior sin que nada lo diga.
  const copia = JSON.parse(JSON.stringify(TOPES));
  F.topesDelMes(TOPES, '2026-09');
  assert.deepEqual(TOPES, copia);
});

// =====================================================================
// TARJETAS: ESTE MES CONTRA EL MISMO TRAMO DEL PASADO
// =====================================================================
console.log('\nGASTO CON TARJETAS');

const VISA = { id: 'visa', tipo: 'credito' };
const MASTER = { id: 'master', tipo: 'credito' };
const COMPRAS = [
  { fecha: '2026-09-03', tipo: 'gasto', account_id: 'visa', monto: 100000, moneda: 'ARS' },
  { fecha: '2026-09-12', tipo: 'gasto', account_id: 'visa', monto: 386300, moneda: 'ARS', cuotas: 12 },
  { fecha: '2026-09-20', tipo: 'gasto', account_id: 'visa', monto: 999, moneda: 'ARS' },
  { fecha: '2026-08-05', tipo: 'gasto', account_id: 'visa', monto: 398100, moneda: 'ARS' },
  { fecha: '2026-08-25', tipo: 'gasto', account_id: 'visa', monto: 494300, moneda: 'ARS' },
  { fecha: '2026-09-10', tipo: 'gasto', account_id: 'caja', monto: 50000, moneda: 'ARS' },
  { fecha: '2026-09-10', tipo: 'ingreso', account_id: 'visa', monto: 700000, moneda: 'ARS' },
  { fecha: '2026-09-11', tipo: 'gasto', account_id: 'visa', monto: 300, moneda: 'USD' }
];

t('compara contra el MISMO TRAMO y no contra el mes entero', () => {
  // Es todo el punto: contra el mes pasado completo, el dia 5 siempre vas
  // barbaro y el 28 siempre vas mal. Lo unico que mide eso es que dia es hoy.
  const r = F.gastoDeTarjetas(COMPRAS, [VISA], new Date(2026, 8, 14));
  assert.equal(r.ahora.total, 486300);
  assert.equal(r.tramo.total, 398100);      // solo el 5 de agosto, no el 25
  assert.equal(r.completo.total, 892400);   // agosto entero, aparte
  assert.equal(r.dif, 88200);
});

t('lo que todavia no paso no cuenta', () => {
  const r = F.gastoDeTarjetas(COMPRAS, [VISA], new Date(2026, 8, 14));
  assert.equal(r.ahora.cuantos, 2);         // la compra del 20 queda afuera
});

t('una compra en cuotas cuenta entera el dia que se hizo', () => {
  // Es lo que decidiste ese dia. Lo que vas a pagar mes a mes es otra
  // pregunta y tiene su propia pantalla.
  const r = F.gastoDeTarjetas(COMPRAS, [VISA], new Date(2026, 8, 14));
  assert.equal(r.ahora.total, 100000 + 386300);
});

t('lo que no es de la tarjeta no entra, y un ingreso tampoco', () => {
  const r = F.gastoDeTarjetas(COMPRAS, [VISA], new Date(2026, 8, 14));
  // El gasto de 'caja', el ingreso y el consumo en dolares quedan afuera.
  assert.equal(r.ahora.cuantos, 2);
  const usd = F.gastoDeTarjetas(COMPRAS, [VISA], new Date(2026, 8, 14), 'USD');
  assert.equal(usd.ahora.total, 300);
});

t('suma varias tarjetas juntas', () => {
  const dos = [...COMPRAS,
    { fecha: '2026-09-08', tipo: 'gasto', account_id: 'master', monto: 25000, moneda: 'ARS' }];
  const r = F.gastoDeTarjetas(dos, [VISA, MASTER], new Date(2026, 8, 14));
  assert.equal(r.ahora.total, 511300);
});

t('el dia 30 contra febrero corta donde los dos meses llegan', () => {
  // Sin esto, el tramo de febrero se "cortaria" en un dia que no existe y la
  // comparacion seria de 30 dias contra 28: siempre a favor del mes corto.
  const txs = [
    { fecha: '2026-03-30', tipo: 'gasto', account_id: 'visa', monto: 10, moneda: 'ARS' },
    { fecha: '2026-02-28', tipo: 'gasto', account_id: 'visa', monto: 7, moneda: 'ARS' }
  ];
  const r = F.gastoDeTarjetas(txs, [VISA], new Date(2026, 2, 30));
  assert.equal(r.dia, 30);
  assert.equal(r.corte, 28);
  assert.equal(r.tramo.total, 7);
});

t('sin nada el mes pasado no inventa un porcentaje', () => {
  // "Infinito por ciento mas" no es un dato.
  const solo = [{ fecha: '2026-09-03', tipo: 'gasto', account_id: 'visa',
                  monto: 100000, moneda: 'ARS' }];
  const r = F.gastoDeTarjetas(solo, [VISA], new Date(2026, 8, 14));
  assert.equal(r.difPct, null);
  assert.equal(r.delTotalPrevio, null);
  assert.equal(r.ahora.total, 100000);
});

t('sin tarjetas no hay nada que comparar', () => {
  assert.equal(F.gastoDeTarjetas(COMPRAS, [], new Date(2026, 8, 14)), null);
});

// =====================================================================
// LO QUE DICE EL BANCO DE UN RESUMEN QUE NO CERRO
// =====================================================================
console.log('\nSALDO DECLARADO POR EL BANCO');

const MASTER_TJ = { id: 'master', tipo: 'credito', moneda: 'ARS',
             cierre_dia: 1, vencimiento_dia: 9 };
const CONSUMOS_TJ = [
  { fecha: '2026-09-03', tipo: 'gasto', account_id: 'master', monto: 60000, moneda: 'ARS' },
  { fecha: '2026-09-08', tipo: 'gasto', account_id: 'master', monto: 102326, moneda: 'ARS' }
];
const PER_TJ = F.periodo(F.proximoCiclo(MASTER_TJ, new Date(2026, 8, 14)).vence);

t('sin anotar nada, el total es lo cargado', () => {
  const b = F.brechaDeTarjeta(CONSUMOS_TJ, MASTER_TJ, PER_TJ, {}, 'ARS');
  assert.equal(b.app, 162326);
  assert.equal(b.banco, null);
  assert.equal(b.dif, 0);
  assert.equal(b.total, 162326);
});

t('anotado, manda el del banco y la diferencia queda con nombre', () => {
  // Es el caso real: la app dice 162.326 y el banco 265.000. Se paga el del
  // banco; los 102.674 que no se encuentran quedan escritos, no escondidos.
  const dec = { master: { [PER_TJ]: { monto: 265000, cuando: '2026-09-14' } } };
  const b = F.brechaDeTarjeta(CONSUMOS_TJ, MASTER_TJ, PER_TJ, dec, 'ARS');
  assert.equal(b.app, 162326);
  assert.equal(b.banco, 265000);
  assert.equal(b.dif, 102674);
  assert.equal(b.total, 265000);
});

t('si el banco dice MENOS, tambien se ve: algo esta cargado de mas', () => {
  // No se recorta a cero. Un total que sobra tambien es un error, y
  // silenciarlo lo deja adentro para siempre.
  const dec = { master: { [PER_TJ]: { monto: 100000 } } };
  const b = F.brechaDeTarjeta(CONSUMOS_TJ, MASTER_TJ, PER_TJ, dec, 'ARS');
  assert.equal(b.dif, -62326);
  assert.equal(b.total, 100000);
});

t('lo anotado para OTRO resumen no se aplica a este', () => {
  const dec = { master: { '2099-01': { monto: 999999 } } };
  assert.equal(F.brechaDeTarjeta(CONSUMOS_TJ, MASTER_TJ, PER_TJ, dec, 'ARS').banco, null);
});

t('un cero es un dato y un vacio no', () => {
  // Cero es "el banco dice que no debo nada", que es distinto de no haberlo
  // anotado. Un texto vacio o una letra no son ninguna de las dos cosas.
  assert.equal(F.saldoDeclarado({ m: { p: { monto: 0 } } }, 'm', 'p').monto, 0);
  assert.equal(F.saldoDeclarado({ m: { p: { monto: '' } } }, 'm', 'p'), null);
  assert.equal(F.saldoDeclarado({ m: { p: { monto: -5 } } }, 'm', 'p'), null);
  assert.equal(F.saldoDeclarado({}, 'm', 'p'), null);
  assert.equal(F.saldoDeclarado(null, 'm', 'p'), null);
});

t('la plata libre aparta lo que dice el banco, no lo que dice la app', () => {
  // Sin esto, anotar la diferencia seria decorativo: la pantalla mostraria
  // 265.000 y el "podes gastar" seguiria calculado con 162.326.
  const cuentas = [{ id: 'caja', tipo: 'caja', moneda: 'ARS',
                     saldo_inicial: 1000000, saldo_al: '2026-09-01', activo: true }, MASTER_TJ];
  const ref = new Date(2026, 8, 14);
  const sin = F.plataLibre(cuentas, CONSUMOS_TJ, [], [], ref, 'ARS', [], {});
  const con = F.plataLibre(cuentas, CONSUMOS_TJ, [], [], ref, 'ARS', [],
                           { master: { [PER_TJ]: { monto: 265000 } } });
  assert.equal(sin.proximo, 162326);
  assert.equal(con.proximo, 265000);
  assert.equal(con.libreEstricta, sin.libreEstricta - 102674);
});

console.log(`\n${ok} pruebas OK`);
