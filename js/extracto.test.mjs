// node js/extracto.test.mjs
import assert from 'node:assert/strict';
import * as E from './extracto.js';

let ok = 0, mal = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nEXTRACTO DE CUENTA');

const GALICIA = `BANCO GALICIA - RESUMEN DE CUENTA
Caja de ahorro en pesos  Cuenta 4001234-5 001-9
Periodo 01/09/2026 al 30/09/2026
SALDO ANTERIOR                                       1.000.000,00
02/09  DEBITO AUTOMATICO EDESUR              20.581,06     979.418,94
02/09  IMP LEY 25413 DEBITOS                    123,49     979.295,45
05/09  ACREDITAMIENTO DE HABERES          2.026.665,38   3.005.960,83
05/09  COMISION MANTENIMIENTO PAQUETE       18.500,00   2.987.460,83
06/09  SIRCREB RETENCION IIBB                  980,15   2.986.480,68
10/09  SEGURO BOLSO PROTEGIDO                4.200,00   2.982.280,68
30/09  TRANSFERENCIA A MERCADO PAGO        652.800,00   2.329.480,68
SALDO FINAL                                          2.329.480,68`;

t('el signo sale del saldo, no de la columna', () => {
  // Es todo el truco: el PDF pierde las columnas y no se sabe cual numero es
  // debito y cual credito. La diferencia contra el saldo anterior lo dice sin
  // ambiguedad, y ademas se sabe que es un hecho y no una interpretacion.
  const r = E.parseExtracto(GALICIA);
  const haberes = r.movimientos.find(m => /HABERES/.test(m.descripcion));
  const luz = r.movimientos.find(m => /EDESUR/.test(m.descripcion));
  assert.equal(haberes.entra, true);
  assert.equal(luz.entra, false);
  assert.equal(haberes.seguro, true);
  assert.equal(luz.seguro, true);
});

t('avisa si el extracto cuadra de punta a punta', () => {
  // Sin esto, faltar una hoja se ve igual que un mes barato.
  assert.equal(E.parseExtracto(GALICIA).cuadra, true);
});

t('si falta una hoja, no cuadra', () => {
  const roto = GALICIA.split('\n').filter(l => !/SEGURO BOLSO/.test(l)).join('\n');
  assert.equal(E.parseExtracto(roto).cuadra, false);
});

t('lee el periodo, la cuenta y los saldos', () => {
  const r = E.parseExtracto(GALICIA);
  assert.equal(r.banco, 'galicia');
  assert.equal(r.cuenta, '4001234-5');
  assert.equal(r.periodo.desde, '2026-09-01');
  assert.equal(r.saldoInicial, 1000000);
  assert.equal(r.saldoFinal, 2329480.68);
});

t('un resumen de TARJETA no se lee como extracto', () => {
  // Los dos traen fechas e importes: confundirlos cargaria los consumos dos
  // veces, una por cada documento.
  const tarjeta = `RESUMEN VISA\nCierre 27-08-26\n01-08-26 COTO CICSA 48.200,00`;
  assert.equal(E.parseExtracto(tarjeta), null);
});

t('separa lo que cobra el banco de lo que gastaste vos', () => {
  const r = E.parseExtracto(GALICIA);
  const c = E.cargosDelBanco(r.movimientos);
  assert.equal(c.total, 23803.64);
  assert.equal(c.conceptos[0].nombre, 'Mantenimiento de cuenta');
  assert.equal(c.conceptos.length, 4);
  // La transferencia y la luz NO son cargos del banco.
  assert.equal(E.queCargo('TRANSFERENCIA A MERCADO PAGO'), null);
  assert.equal(E.queCargo('DEBITO AUTOMATICO EDESUR'), null);
});

t('reconoce los cargos con los nombres que usan los bancos', () => {
  assert.equal(E.queCargo('IMP. LEY 25.413 CREDITOS'), 'ley25413');
  assert.equal(E.queCargo('COSTO MANTENIMIENTO CUENTA'), 'mantenimiento');
  assert.equal(E.queCargo('PERCEPCION RG 4815'), 'iva');
  assert.equal(E.queCargo('COMISION TRANSFERENCIA'), 'comision');
  assert.equal(E.queCargo('RENOVACION TARJETA DEBITO'), 'tarjeta');
});

t('cada fila lleva una clave distinta aunque se repita', () => {
  // Dos cargos iguales el mismo dia existen, y sin esto el segundo se
  // perderia al importar por parecer el mismo.
  const ext = { movimientos: [
    { fecha: '2026-09-02', descripcion: 'COMISION', importe: 500, entra: false },
    { fecha: '2026-09-02', descripcion: 'COMISION', importe: 500, entra: false }
  ] };
  const m = E.aMovimientos(ext, 'gal');
  assert.notEqual(m[0].externo_id, m[1].externo_id);
});

t('se puede importar solo lo que cobra el banco', () => {
  const r = E.parseExtracto(GALICIA);
  const solo = E.aMovimientos(r, 'gal', { soloCargos: true });
  assert.equal(solo.length, 4);
  assert.ok(solo.every(m => m.cargoBanco));
});

t('los cargos se siguen mes a mes desde lo ya cargado', () => {
  const txs = [
    { fecha: '2026-08-05', tipo: 'gasto', monto: 17000, moneda: 'ARS', comercio: 'COMISION MANTENIMIENTO' },
    { fecha: '2026-09-05', tipo: 'gasto', monto: 18500, moneda: 'ARS', comercio: 'COMISION MANTENIMIENTO' },
    { fecha: '2026-09-06', tipo: 'gasto', monto: 980, moneda: 'ARS', comercio: 'SIRCREB' },
    { fecha: '2026-09-07', tipo: 'gasto', monto: 154136, moneda: 'ARS', comercio: 'COTO' }
  ];
  const serie = E.cargosPorMes(txs, 2, new Date(2026, 8, 15));
  assert.equal(serie[0].total, 17000);
  assert.equal(serie[1].total, 19480);
  assert.equal(serie[1].cuantos, 2);      // el supermercado no cuenta
});

t('sin año en la fila usa el del período', () => {
  const r = E.parseExtracto(GALICIA);
  assert.ok(r.movimientos.every(m => m.fecha.startsWith('2026-09')));
});

// ---------------------------------- formatos que el primero real rompio
t('lo reconoce por la FORMA aunque el encabezado no diga las palabras', () => {
  // La primera version decidia por palabras del encabezado y eso es fragil:
  // cada banco titula distinto. La senal que no depende del vocabulario es
  // que cada fila lleve el saldo corriendo al lado del importe.
  const sinPalabras = `MI BANCO
Movimientos
02/09  PAGO SERVICIOS               20.581,06     979.418,94
05/09  ACREDITACION                2.026.665,38  3.005.960,83
06/09  COMISION                        980,15    3.004.980,68`;
  const r = E.parseExtracto(sinPalabras);
  assert.ok(r, 'tiene que reconocerlo por la forma');
  assert.equal(r.movimientos.length, 3);
});

t('lee importes sin centavos', () => {
  const sinCentavos = `RESUMEN DE CUENTA
02/09  DEBITO EDESUR        20.581     979.418
05/09  COMISION MANTENIMIENTO   18.500     960.918`;
  const r = E.parseExtracto(sinCentavos);
  assert.equal(r.movimientos.length, 2);
  assert.equal(r.movimientos[0].importe, 20581);
});

t('la fecha valor no se cuela en el nombre del comercio', () => {
  const conValor = `RESUMEN DE CUENTA
SALDO ANTERIOR                                 1.000.000,00
02/09  02/09  DEBITO AUTOMATICO EDESUR   20.581,06   979.418,94`;
  const r = E.parseExtracto(conValor);
  assert.equal(r.movimientos[0].descripcion, 'DEBITO AUTOMATICO EDESUR');
});

t('un resumen de tarjeta con la palabra saldo sigue sin colarse', () => {
  const tarjeta = `RESUMEN VISA
Saldo anterior 0,00   Pago minimo 45.000,00   Limite de compra 3.000.000,00
01-08-26 COTO CICSA        48.200,00
03-08-26 YPF FULL          52.000,00
05-08-26 SPOTIFY            8.999,00`;
  assert.equal(E.parseExtracto(tarjeta), null);
});

t('reconoce el saldo aunque el banco lo titule distinto', () => {
  const otro = `RESUMEN DE CUENTA
SALDO ULTIMO EXTRACTO                          1.000.000,00
02/09  DEBITO EDESUR        20.581,06     979.418,94
SALDO ACTUAL                                     979.418,94`;
  const r = E.parseExtracto(otro);
  assert.equal(r.saldoInicial, 1000000);
  assert.equal(r.cuadra, true);
});

t('cuando no puede, dice QUE vio', () => {
  // Un "no lo reconozco" a secas es un callejon sin salida: no se sabe si el
  // problema es el formato, media hoja copiada o un PDF escaneado.
  const rev = E.revisarExtracto('cualquier cosa\nsin fechas ni importes');
  assert.equal(rev.lineas, 2);
  assert.equal(rev.conFecha, 0);
  assert.equal(rev.nombraSaldo, false);

  const conAlgo = E.revisarExtracto(`RESUMEN
02/09  ALGO   1.000,00   2.000,00`);
  assert.equal(conAlgo.conFecha, 1);
  assert.equal(conAlgo.conSaldo, 1);
  assert.equal(conAlgo.muestra.length, 1);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
