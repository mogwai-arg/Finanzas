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

// ------------------------------------------------ el formato real de Galicia
//
// Reconstruido de un resumen de verdad, con los nombres y los importes
// cambiados. Es el que rompio la primera version, y esta es la razon de que
// exista este archivo: el formato que uno imagina nunca es el que llega.
const GALICIA_REAL = `Resumen de Caja de Ahorro en Pesos
NOMBRE APELLIDO                              CUIT del Responsable Impositivo : 20-00000000-0
Datos de la cuenta                   Período de movimientos           Saldos
Número de cuenta
N° 1234567-8 027-7
CBU                              31/07/2026               28/08/2026
0009999990001234567890
Movimientos
Fecha Descripción Origen Crédito Débito Saldo
03/08/26 CREDITO TRANSFERENCIA                              30.000,00 30.130,49
NOMBRE APELLIDO
20000000000
03/08/26 PAGO DE SERVICIOS                0001 -25.427,25 4.703,24
AYSA
000149501000
4425480009683734
04/08/26 ACREDITAMIENTO DE HABERES                        2.135.500,32 2.140.203,56
EMPRESA SRL
30700000000
04/08/26 PAGO DE SERVICIOS                0001 -26.171,40 2.114.032,16
NATURGY BAN
02636022
04/08/26 PAGO TARJETA VISA                              -1.214.615,20 899.416,96
OPERACION 4114724844
Resumen de Caja de Ahorro en Pesos                              Página 1 / 3
20260828046352231P
05/08/26 ING. BRUTOS S/ CRED                              -27.200,00 872.216,96
REG.RECAU.SIRCREB
05/08/26 TRANSF. CTAS PROPIAS                              -85.000,00 787.216,96
Nombre Apellido
20000000000
VARIOS
24/08/26 INTERES CAPITALIZADO                              0,43 787.217,39
Agosto 2026
$ 2.165.500,75 -$ 1.378.413,85 $ 787.217,39
Total `;

t('el formato de Galicia entra: el menos va ADELANTE del importe', () => {
  const r = E.parseExtracto(GALICIA_REAL);
  assert.ok(r, 'tiene que reconocerlo');
  assert.equal(r.movimientos.length, 8);
  // La PRIMERA fila no tiene saldo anterior con qué compararse, y sin el
  // signo escrito habría que adivinarla por el texto.
  assert.equal(r.movimientos[0].entra, true);
  assert.equal(r.movimientos[0].seguro, true);
  assert.equal(r.movimientos[1].entra, false);
});

t('el comercio sale de los renglones de abajo', () => {
  // "PAGO DE SERVICIOS" no dice nada: sin esto, Aysa y el gas son la misma
  // fila repetida y no hay forma de saber en qué se fue.
  const r = E.parseExtracto(GALICIA_REAL);
  const servicios = r.movimientos.filter(m => m.descripcion === 'PAGO DE SERVICIOS');
  assert.equal(servicios.length, 2);
  assert.deepEqual(servicios.map(m => m.comercio), ['AYSA', 'NATURGY BAN']);
});

t('el código del pie de página no se cuela como comercio', () => {
  const r = E.parseExtracto(GALICIA_REAL);
  const visa = r.movimientos.find(m => /TARJETA VISA/.test(m.descripcion));
  assert.equal(visa.comercio, null);
});

t('pagar la tarjeta y pasar plata a otra cuenta tuya NO son gasto', () => {
  // Importarlas como gasto sería contar 1,2 millones dos veces: lo que se
  // compró con la tarjeta ya contó el día de la compra.
  const r = E.parseExtracto(GALICIA_REAL);
  const tipos = E.aMovimientos(r, 'gal').reduce((a, m) => (a[m.tipo] = (a[m.tipo] || 0) + 1, a), {});
  assert.equal(tipos.transferencia, 2);
  assert.equal(E.queClase('PAGO TARJETA MASTER'), 'transferencia');
  assert.equal(E.queClase('Compra venta de dolares'), 'transferencia');
  assert.equal(E.queClase('PAGO DE SERVICIOS'), null);
});

t('cuadra contra los totales que imprime el banco, no contra sí mismo', () => {
  // Los saldos se deducen de las mismas filas que se están comprobando: si se
  // comprobara contra ellos, cuadraría siempre y no comprobaría nada.
  const r = E.parseExtracto(GALICIA_REAL);
  assert.equal(r.cuadra, true);
  assert.equal(r.saldoInicial, 130.49);
  assert.equal(r.saldoFinal, 787217.39);

  const faltaUna = GALICIA_REAL.split('\n')
    .filter(l => !/^05\/08\/26 TRANSF/.test(l)).join('\n');
  assert.equal(E.parseExtracto(faltaUna).cuadra, false);
});

t('saca el período aunque las dos fechas vengan sueltas', () => {
  const r = E.parseExtracto(GALICIA_REAL);
  assert.equal(r.periodo.desde, '2026-07-31');
  assert.equal(r.periodo.hasta, '2026-08-28');
});

t('encuentra la retención de ingresos brutos, que es lo que cobra el banco', () => {
  const r = E.parseExtracto(GALICIA_REAL);
  const c = E.cargosDelBanco(r.movimientos);
  assert.equal(c.total, 27200);
  assert.equal(c.conceptos[0].nombre, 'Retención de ingresos brutos');
});

// ------------------------------------- el mismo resumen, copiado del visor
//
// Es el MISMO documento leido de otra forma. El lector de la app rearma las
// columnas por posicion y deja fecha, importe y saldo en un renglon; copiar
// y pegar desde un visor de PDF respeta el orden del archivo y no las
// columnas, asi que los importes caen DESPUES del comercio, en otra linea.
//
// Leyendo linea por linea, este texto no tiene ningun renglon con fecha e
// importes juntos, y la app contestaba "esto parece el resumen de la
// tarjeta" sobre un extracto de cuenta perfectamente valido.
const COPIADO_DEL_VISOR = `Resumen de Caja de Ahorro en Pesos
CBU
0009999990001234567890
28/08/2026 31/07/2026
Período de movimientos
$868,85
$130,49
Saldos
Movimientos
Fecha   Descripción   Origen   Crédito   Débito   Saldo
03/08/26   CREDITO TRANSFERENCIA
NOMBRE APELLIDO
20000000000
30.000,00   30.130,49
03/08/26   PAGO DE SERVICIOS
AYSA
000149501000
0001   -25.427,25   4.703,24
05/08/26   ING. BRUTOS S/ CRED
REG.RECAU.SIRCREB
-27.200,00   -22.496,76
Los depósitos en pesos cuentan con la garantía de hasta $25.000.000. Ley 24.485, Decreto N' 540/95
y sus modificatorias y complementarias.`;

t('el mismo resumen copiado del visor da lo mismo', () => {
  const r = E.parseExtracto(COPIADO_DEL_VISOR);
  assert.ok(r, 'tiene que reconocerlo');
  assert.equal(r.movimientos.length, 3);
  assert.equal(r.movimientos[0].entra, true);
  assert.equal(r.movimientos[1].entra, false);
  assert.equal(r.movimientos[1].comercio, 'AYSA');
  assert.equal(r.movimientos[1].importe, 25427.25);
});

t('el párrafo legal del pie no le cambia el saldo al último movimiento', () => {
  // "Ley 24.485, Decreto N' 540/95" son dos números en una línea, y colgaban
  // del último movimiento como si fueran su importe y su saldo.
  const r = E.parseExtracto(COPIADO_DEL_VISOR);
  const ultimo = r.movimientos[r.movimientos.length - 1];
  assert.equal(ultimo.importe, 27200);
  assert.equal(ultimo.saldo, -22496.76);
});

t('encuentra la retención también en el texto copiado', () => {
  const c = E.cargosDelBanco(E.parseExtracto(COPIADO_DEL_VISOR).movimientos);
  assert.equal(c.total, 27200);
});


// ---------------------------------------------------------------------
// Conciliar: el banco contra lo anotado a mano
// ---------------------------------------------------------------------
console.log('\nCONCILIAR');

const CON_TARJETA = `BANCO GALICIA - RESUMEN DE CUENTA
Caja de ahorro en pesos  Cuenta 4001234-5 001-9
Periodo 01/09/2026 al 30/09/2026
SALDO ANTERIOR                                       1.000.000,00
02/09  DEBITO AUTOMATICO EDESUR              20.581,06     979.418,94
05/09  ACREDITAMIENTO DE HABERES          2.026.665,38   3.005.960,83
08/09  PAGO TARJETA VISA                    300.000,00   2.705.960,83
12/09  COMPRA COTO ABASTO                    47.310,00   2.658.650,83
20/09  COMISION MANTENIMIENTO PAQUETE        18.500,00   2.640.150,83
SALDO FINAL                                          2.640.150,83`;

const CUENTA = 'gal';
const ext = E.parseExtracto(CON_TARJETA);

t('el pago de tarjeta del banco matchea la transferencia de la app, no un gasto', () => {
  // La trampa: en el banco es plata que sale, pero en la app pagar el resumen
  // es una movida a la tarjeta. Si se compara contra gastos, el pago aparece
  // como "falta cargarlo" y ademas la movida aparece como "sobra".
  const c = E.conciliar(ext, [
    { id: 't', fecha: '2026-09-08', tipo: 'transferencia', monto: 300000,
      account_id: CUENTA, destino_account_id: 'visa', descripcion: 'Pago Visa' }
  ], CUENTA);
  assert.equal(c.coinciden, 1);
  assert.equal(c.sobran.length, 0);
  assert.ok(!c.faltan.some(f => /PAGO TARJETA/.test(f.descripcion)));
});

t('la transferencia que ENTRA a la cuenta tambien cuenta', () => {
  const soloEntrada = E.parseExtracto(`BANCO GALICIA - RESUMEN DE CUENTA
Cuenta 4001234-5 001-9
Periodo 01/09/2026 al 30/09/2026
SALDO ANTERIOR                                         100.000,00
03/09  TRANSF. CTAS. PROPIAS                 50.000,00     150.000,00
SALDO FINAL                                            150.000,00`);
  const c = E.conciliar(soloEntrada, [
    { id: 'm', fecha: '2026-09-03', tipo: 'transferencia', monto: 50000,
      account_id: 'efvo', destino_account_id: CUENTA }
  ], CUENTA);
  assert.equal(c.coinciden, 1);
});

t('lo que esta en el banco y no en la app queda en faltan', () => {
  const c = E.conciliar(ext, [], CUENTA);
  assert.equal(c.total, 5);
  assert.equal(c.coinciden, 0);
  assert.equal(c.faltan.length, 5);
});

t('lo que esta en la app y no en el banco queda en sobran', () => {
  const c = E.conciliar(ext, [
    { id: 'x', fecha: '2026-09-14', tipo: 'gasto', monto: 9999,
      account_id: CUENTA, comercio: 'No existe' }
  ], CUENTA);
  assert.equal(c.sobran.length, 1);
  assert.equal(c.sobran[0].tx.id, 'x');
});

t('mismo dia y tipo con otro importe no se da por bueno: se marca', () => {
  const c = E.conciliar(ext, [
    { id: 'c', fecha: '2026-09-12', tipo: 'gasto', monto: 47000,
      account_id: CUENTA, comercio: 'Coto' }
  ], CUENTA);
  assert.equal(c.difieren.length, 1);
  assert.equal(c.difieren[0].banco.importe, 47310);
  assert.equal(c.difieren[0].app.importe, 47000);
  assert.equal(c.sobran.length, 0);
});

t('una diferencia grande no es el mismo movimiento', () => {
  const c = E.conciliar(ext, [
    { id: 'c', fecha: '2026-09-12', tipo: 'gasto', monto: 5000, account_id: CUENTA }
  ], CUENTA);
  assert.equal(c.difieren.length, 0);
  assert.equal(c.sobran.length, 1);
});

t('la fecha puede correrse unos dias: el banco imputa cuando quiere', () => {
  const c = E.conciliar(ext, [
    { id: 'c', fecha: '2026-09-14', tipo: 'gasto', monto: 47310, account_id: CUENTA }
  ], CUENTA);
  assert.equal(c.coinciden, 1);
});

t('pero no un mes despues', () => {
  const c = E.conciliar(ext, [
    { id: 'c', fecha: '2026-09-25', tipo: 'gasto', monto: 47310, account_id: CUENTA }
  ], CUENTA);
  assert.equal(c.coinciden, 0);
});

t('lo de otra cuenta no entra en la comparacion', () => {
  const c = E.conciliar(ext, [
    { id: 'o', fecha: '2026-09-12', tipo: 'gasto', monto: 47310, account_id: 'efvo' }
  ], CUENTA);
  assert.equal(c.coinciden, 0);
  assert.equal(c.sobran.length, 0);
});

t('lo de fuera del periodo tampoco', () => {
  const c = E.conciliar(ext, [
    { id: 'v', fecha: '2026-08-12', tipo: 'gasto', monto: 47310, account_id: CUENTA }
  ], CUENTA);
  assert.equal(c.sobran.length, 0);
});

t('un movimiento del banco no se empareja dos veces', () => {
  // Si el mismo gasto se cargo dos veces, uno matchea y el otro sobra. Es
  // justamente lo que hay que ver.
  const c = E.conciliar(ext, [
    { id: 'a', fecha: '2026-09-12', tipo: 'gasto', monto: 47310, account_id: CUENTA },
    { id: 'b', fecha: '2026-09-12', tipo: 'gasto', monto: 47310, account_id: CUENTA }
  ], CUENTA);
  assert.equal(c.coinciden, 1);
  assert.equal(c.sobran.length, 1);
});

t('y el duplicado se nombra como duplicado', () => {
  const c = E.conciliar(ext, [
    { id: 'a', fecha: '2026-09-12', tipo: 'gasto', monto: 47310, account_id: CUENTA },
    { id: 'b', fecha: '2026-09-12', tipo: 'gasto', monto: 47310, account_id: CUENTA },
    { id: 'z', fecha: '2026-09-12', tipo: 'gasto', monto: 47310, account_id: CUENTA }
  ], CUENTA);
  assert.equal(c.repetidosEnApp.length, 1);
  assert.equal(c.repetidosEnApp[0].length, 2);
});

t('el ingreso del sueldo matchea el ingreso, no un gasto del mismo monto', () => {
  const c = E.conciliar(ext, [
    { id: 's', fecha: '2026-09-05', tipo: 'gasto', monto: 2026665.38, account_id: CUENTA }
  ], CUENTA);
  assert.equal(c.coinciden, 0);
  assert.equal(c.sobran.length, 1);
});

t('los cargos del banco salen marcados para poder saltearlos', () => {
  const c = E.conciliar(ext, [], CUENTA);
  const com = c.faltan.find(f => /MANTENIMIENTO/.test(f.descripcion));
  assert.ok(com.cargo, 'la comision tiene que venir reconocida como cargo del banco');
  const coto = c.faltan.find(f => /COTO/.test(f.descripcion));
  assert.equal(coto.cargo, null);
});

t('un extracto sin periodo no descarta nada por fecha', () => {
  const c = E.conciliar({ movimientos: ext.movimientos }, [
    { id: 'c', fecha: '2026-09-12', tipo: 'gasto', monto: 47310, account_id: CUENTA }
  ], CUENTA);
  assert.equal(c.coinciden, 1);
});


// ---------------------------------------------------------------------
// Los cargos que se repiten: candidatos a gasto fijo
// ---------------------------------------------------------------------
console.log('\nCARGOS REPETIDOS');

const REF = new Date(2026, 7, 20); // agosto 2026
const conCargos = (...filas) => filas.map(([fecha, comercio, monto]) =>
  ({ tipo: 'gasto', moneda: 'ARS', fecha, comercio, monto }));

const TRES_MESES = conCargos(
  ['2026-06-05', 'COMISION MANTENIMIENTO PAQUETE', 17000],
  ['2026-07-05', 'COM.MANTEN.PAQUETE', 17400],
  ['2026-08-05', 'COMISION MANTENIMIENTO PAQUETE', 18500],
  ['2026-06-10', 'SEGURO BOLSO PROTEGIDO', 4000],
  ['2026-07-10', 'SEGURO BOLSO PROTEGIDO', 4100],
  ['2026-08-10', 'SEGURO BOLSO PROTEGIDO', 4200],
  ['2026-08-12', 'SELLADO UNICO', 900]);

t('agrupa por concepto y no por como lo escribio el banco', () => {
  // "COMISION MANTENIMIENTO PAQUETE" y "COM.MANTEN.PAQUETE" son el mismo
  // cargo. Como texto son dos cosas distintas y saldrian dos gastos fijos.
  const r = E.cargosRepetidos(TRES_MESES, { ref: REF });
  const man = r.find(c => c.id === 'mantenimiento');
  assert.equal(man.meses.length, 3);
});

t('lo que aparecio una sola vez no es un gasto fijo', () => {
  const r = E.cargosRepetidos(TRES_MESES, { ref: REF });
  assert.ok(!r.some(c => c.id === 'sellado'));
});

t('ordena por lo que cuesta hoy, no por cuantas veces aparece', () => {
  const r = E.cargosRepetidos(TRES_MESES, { ref: REF });
  assert.equal(r[0].id, 'mantenimiento');
  assert.equal(r[0].ultimo.monto, 18500);
});

t('el numero para discutir el paquete es lo que sale por ano', () => {
  const r = E.cargosRepetidos(TRES_MESES, { ref: REF });
  assert.equal(r[0].alAno, 222000);
});

t('el dia es el tipico, no el promedio', () => {
  const r = E.cargosRepetidos(conCargos(
    ['2026-06-05', 'SEGURO BOLSO PROTEGIDO', 4000],
    ['2026-07-05', 'SEGURO BOLSO PROTEGIDO', 4100],
    ['2026-08-28', 'SEGURO BOLSO PROTEGIDO', 4200]), { ref: REF });
  assert.equal(r[0].dia, 5);
});

t('cada mes trae la transaccion mas cara, que es la que representa el mes', () => {
  const r = E.cargosRepetidos(conCargos(
    ['2026-07-05', 'SEGURO BOLSO PROTEGIDO', 4100],
    ['2026-08-05', 'SEGURO BOLSO PROTEGIDO', 4200],
    ['2026-08-06', 'SEGURO BOLSO PROTEGIDO', 300]), { ref: REF });
  assert.equal(r[0].ultimo.monto, 4500);
  assert.equal(r[0].ultimo.tx.monto, 4200);
});

t('un gasto normal no es un cargo del banco', () => {
  const r = E.cargosRepetidos(conCargos(
    ['2026-07-05', 'COTO ABASTO', 47000],
    ['2026-08-05', 'COTO ABASTO', 51000]), { ref: REF });
  assert.equal(r.length, 0);
});

t('los ingresos no cuentan aunque digan comision', () => {
  const r = E.cargosRepetidos([
    { tipo: 'ingreso', moneda: 'ARS', fecha: '2026-07-05', comercio: 'DEVOLUCION COMISION', monto: 900 },
    { tipo: 'ingreso', moneda: 'ARS', fecha: '2026-08-05', comercio: 'DEVOLUCION COMISION', monto: 900 }
  ], { ref: REF });
  assert.equal(r.length, 0);
});

t('lo viejo queda afuera de la ventana', () => {
  const r = E.cargosRepetidos(conCargos(
    ['2025-01-05', 'SEGURO BOLSO PROTEGIDO', 4000],
    ['2025-02-05', 'SEGURO BOLSO PROTEGIDO', 4100]), { ref: REF });
  assert.equal(r.length, 0);
});


t('en una tarjeta, lo que entra es el pago del resumen y no un ingreso', () => {
  // Nadie te deposita en la Visa. Buscarlo entre los ingresos diria que falta
  // un pago que esta perfectamente anotado, y ademas que la movida sobra.
  const tj = E.parseExtracto(`BANCO GALICIA
Cuenta 4001234-5 001-9
Periodo 01/09/2026 al 30/09/2026
SALDO ANTERIOR                                        -500.000,00
04/09  SU PAGO EN PESOS                     500.000,00          0,00
SALDO FINAL                                                  0,00`);
  const pago = [{ id: 'p', fecha: '2026-09-04', tipo: 'transferencia', monto: 500000,
                  account_id: 'gal', destino_account_id: 'visa' }];
  assert.equal(E.conciliar(tj, pago, 'visa', { tarjeta: true }).coinciden, 1);
  // Y tambien sin la opcion: el emparejado por DIRECCION no necesita saber
  // que es una tarjeta. Lo que entra a la Visa lo pone una transferencia que
  // TERMINA en la Visa, y eso es lo mismo con o sin la bandera.
  assert.equal(E.conciliar(tj, pago, 'visa').coinciden, 1);
  assert.equal(E.conciliar(tj, pago, 'visa').sobran.length, 0);
});

t('un ingreso del banco matchea la transferencia que ENTRA, no queda como falta', () => {
  // El caso que rompia: la plata que uno se pasa de otro banco llega como
  // "Transferencia recibida NOMBRE APELLIDO", que no dice en ningun lado que
  // sea entre cuentas propias. Leida como ingreso y buscada entre los
  // ingresos no aparecia, y UN movimiento bien cargado daba DOS errores: uno
  // que falta en la app y otro que sobra.
  const ext = E.parseExtracto(`RESUMEN DE CUENTA EN PESOS
Saldo inicial: $ 21.742,61          Saldo final: $ 394.553,77
01-09-2026 Rendimientos 1749231444758 $ 11,16 $ 21.753,77
Transferencia recibida NOMBRE
01-09-2026                   175732015451 $ 372.800,00 $ 394.553,77
APELLIDO`);
  assert.equal(ext.movimientos.length, 2);
  assert.equal(ext.movimientos[1].descripcion, 'Transferencia recibida NOMBRE APELLIDO');

  const txs = [
    { id: 'r', fecha: '2026-09-01', tipo: 'ingreso', monto: 11.16, account_id: 'mp' },
    { id: 't', fecha: '2026-09-01', tipo: 'transferencia', monto: 372800,
      account_id: 'gal', destino_account_id: 'mp' }
  ];
  const c = E.conciliar(ext, txs, 'mp');
  assert.equal(c.coinciden, 2);
  assert.equal(c.faltan.length, 0);
  assert.equal(c.sobran.length, 0);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
