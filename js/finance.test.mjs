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


console.log(`\n${ok} pruebas OK`);
