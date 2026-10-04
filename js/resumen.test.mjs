// =====================================================================
// Pruebas de resumen.js
// Los fixtures son resumenes reales de Galicia con los datos personales
// reemplazados: se conservan el formato y los importes, que es lo que hay
// que fijar. Correr con: node js/resumen.test.mjs
// =====================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseMonto, parseFecha, parsePeriodo, detectarEmisor, leerCiclo,
  parseResumen, aMovimientos
} from './resumen.js';

const aca = dirname(fileURLToPath(import.meta.url));
const leer = n => readFileSync(join(aca, 'fixtures', n), 'utf8');
const VISA = leer('resumen-visa.txt');
const MC   = leer('resumen-mastercard.txt');

let ok = 0, fallo = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n        ' + e.message); fallo++; } };
const igual = (a, b, m = '') => { if (a !== b) throw new Error(`${m} esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`); };
const cerca = (a, b, tol = 0.01) => { if (Math.abs(a - b) > tol) throw new Error(`esperaba ~${b}, dio ${a}`); };
const igualJSON = (a, b, m = '') => igual(JSON.stringify(a), JSON.stringify(b), m);
const distinto = (a, b, m = '') => { if (JSON.stringify(a) === JSON.stringify(b))
  throw new Error(`${m} esperaba que fueran distintos, los dos dieron ${JSON.stringify(a)}`); };
const cierto = (v, m = '') => { if (!v) throw new Error(m || 'esperaba algo cierto'); };
const coincide = (v, re, m = '') => { if (!re.test(String(v)))
  throw new Error(`${m} ${JSON.stringify(String(v))} no coincide con ${re}`); };

console.log('\nFORMATO ARGENTINO');
t('un millon con centavos', () => cerca(parseMonto('1.276.838,45'), 1276838.45));
t('un negativo', () => cerca(parseMonto('-1.214.615,20'), -1214615.20));
t('un importe chico en dolares', () => cerca(parseMonto('15,24'), 15.24));
t('espacios de sobra no molestan', () => cerca(parseMonto('   61081,68  '), 61081.68));
t('texto que no es numero da null', () => igual(parseMonto('OSDE'), null));

console.log('\nFECHAS: los dos formatos que usa el mismo banco');
t('lee el nombre comercial de la tarjeta', () => {
  igual(parseResumen(leer('resumen-visa.txt')).producto, 'VISA');
  igual(parseResumen(leer('resumen-mastercard.txt')).producto, 'MASTERCARD BLACK');
});

t('el resumen de Mastercard no trae los últimos cuatro', () =>
  igual(parseResumen(leer('resumen-mastercard.txt')).ultimos4, null));

t('el comercio no se queda con la referencia larga', () => {
  const r = parseResumen(leer('resumen-visa.txt'));
  const c = r.consumos.find(x => /CUOTA SOCIAL/.test(x.comercio));
  igual(c.comercio, 'CUOTA SOCIAL CAR');
});

t('Mastercard usa 30-Jul-26', () => igual(parseFecha('30-Jul-26'), '2026-07-30'));
t('Visa usa 06-06-26', () => igual(parseFecha('06-06-26'), '2026-06-06'));
t('el mes en castellano se entiende', () => igual(parseFecha('01-Ago-26'), '2026-08-01'));
t('diciembre tambien', () => igual(parseFecha('15-Dic-26'), '2026-12-15'));
t('un año de dos digitos nunca es 1926', () => igual(parseFecha('01-Oct-26').slice(0, 4), '2026'));
t('un mes 13 se rechaza', () => igual(parseFecha('01-13-26'), null));
t('un mes inventado se rechaza', () => igual(parseFecha('01-Xyz-26'), null));
t('"Setiembre/26" y "Septiembre-26" son el mismo mes', () => {
  igual(parsePeriodo('Setiembre/26'), '2026-09');
  igual(parsePeriodo('Septiembre-26'), '2026-09');
});

console.log('\nDETECCION');
t('reconoce la Visa', () => igual(detectarEmisor(VISA).marca, 'visa'));
t('reconoce la Mastercard', () => igual(detectarEmisor(MC).marca, 'mastercard'));
t('las dos son de Galicia', () => igual(detectarEmisor(VISA).emisor, 'galicia'));
t('un texto cualquiera no es un resumen', () => igual(detectarEmisor('hola que tal'), null));

console.log('\nCICLO — el hallazgo que rompe el modelo de dia fijo');
t('lee las seis fechas de la fila', () => {
  const c = leerCiclo(VISA);
  igual(c.cierreAnterior, '2026-07-30'); igual(c.vencimientoAnterior, '2026-08-07');
  igual(c.cierre, '2026-08-27');         igual(c.vencimiento, '2026-09-04');
  igual(c.cierreProximo, '2026-10-01');  igual(c.vencimientoProximo, '2026-10-09');
});
t('las dos tarjetas comparten el mismo ciclo', () => {
  igual(JSON.stringify(leerCiclo(VISA)), JSON.stringify(leerCiclo(MC)));
});
t('el cierre NO cae el mismo dia del mes', () => {
  const c = leerCiclo(VISA);
  const dias = [c.cierreAnterior, c.cierre, c.cierreProximo].map(d => Number(d.slice(8)));
  igual(dias.join(','), '30,27,1');
  if (new Set(dias).size === 1) throw new Error('si fueran iguales, cierre_dia alcanzaria');
});
t('del cierre al vencimiento siempre pasan 8 dias', () => {
  const c = leerCiclo(VISA);
  const d = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  igual(d(c.cierreAnterior, c.vencimientoAnterior), 8);
  igual(d(c.cierre, c.vencimiento), 8);
  igual(d(c.cierreProximo, c.vencimientoProximo), 8);
});
t('el resumen ya trae el ciclo que viene: no hay que calcularlo', () => {
  if (!leerCiclo(MC).cierreProximo) throw new Error('falta el proximo cierre');
});

console.log('\nVISA');
const v = parseResumen(VISA);
t('saca los ultimos cuatro digitos', () => igual(v.ultimos4, '9817'));
t('lee el total en pesos y en dolares', () => { cerca(v.total.ars, 1276838.45); cerca(v.total.usd, 15.24); });
t('lee el saldo anterior', () => { cerca(v.saldoAnterior.ars, 1232939.70); cerca(v.saldoAnterior.usd, 53.72); });
t('lee el pago minimo', () => cerca(v.pagoMinimo, 71070));
t('encuentra los 14 consumos', () => igual(v.consumos.length, 14));
t('los consumos suman el total de la tarjeta', () => {
  cerca(v.consumos.reduce((s, c) => s + (c.ars || 0), 0), 1270446.06, 0.02);
});
t('los consumos en dolares suman aparte', () => {
  cerca(v.consumos.reduce((s, c) => s + (c.usd || 0), 0), 15.24, 0.01);
});
t('consumos mas impuestos dan el total a pagar', () => {
  const imp = v.impuestos.filter(i => !i.devolucion).reduce((s, i) => s + i.monto, 0);
  cerca(v.consumos.reduce((s, c) => s + (c.ars || 0), 0) + imp, v.total.ars, 0.02);
});
t('separa una compra en cuotas', () => {
  const c = v.consumos.find(x => x.comercio.includes('Naked'));
  igual(c.cuota.nro, 3); igual(c.cuota.total, 3); cerca(c.ars, 76261);
});
t('la fecha de una cuota es la de la COMPRA, no la del resumen', () => {
  igual(v.consumos.find(x => x.comercio.includes('Naked')).fecha, '2026-06-06');
});
t('un consumo de un pago no inventa cuotas', () => {
  igual(v.consumos.find(x => x.comercio === 'OSDE').cuota, null);
});
t('un consumo en dolares no ensucia la columna de pesos', () => {
  const c = v.consumos.find(x => /Xbox/i.test(x.comercio));
  igual(c.ars, null); cerca(c.usd, 12.85);
});
t('detecta dolares aunque "USD" venga pegado al nombre del comercio', () => {
  // 'Microsoft*Xbox G MicrosoftUSD  12,85' y 'MMQH46GFWUSD  1,99'
  const c = v.consumos.find(x => /APPLE/i.test(x.comercio));
  igual(c.ars, null); cerca(c.usd, 1.99);
});
t('los tres consumos en dolares suman lo que dice la tarjeta', () => {
  const d = v.consumos.filter(c => c.usd != null);
  igual(d.length, 3); cerca(d.reduce((s, c) => s + c.usd, 0), 15.24);
});
t('guarda la marca * / K de la fila', () => {
  igual(v.consumos.find(x => x.comercio === 'OSDE').marca, '*');
});
t('los pagos no entran como consumos', () => {
  igual(v.consumos.some(c => /SU PAGO/i.test(c.comercio)), false);
  igual(v.pagos.length, 2);
});
t('lee las percepciones con su base y su alicuota', () => {
  const iva = v.impuestos.find(i => /IVA RG 4240/i.test(i.concepto));
  cerca(iva.alicuota, 21); cerca(iva.base, 23073.36); cerca(iva.monto, 4845.40);
});
t('una devolucion de impuesto queda en negativo y marcada', () => {
  const d = v.impuestos.find(i => i.devolucion);
  igual(d.monto < 0, true); cerca(d.monto, -18324.50);
});
t('lee las cuotas a vencer que publica el banco', () => {
  igual(v.cuotasAVencer.length, 6);
  igual(v.cuotasAVencer[0].periodo, '2026-09');
  cerca(v.cuotasAVencer[0].monto, 12466.66);
  cerca(v.cuotasAVencer[2].monto, 0);
});

console.log('\nMASTERCARD');
const mc = parseResumen(MC);
t('lee el total', () => cerca(mc.total.ars, 1120267.79));
t('lee el saldo anterior', () => cerca(mc.saldoAnterior.ars, 1436912.08));
t('encuentra los 38 consumos', () => igual(mc.consumos.length, 38));
t('los consumos suman el total a pagar', () => {
  cerca(mc.consumos.reduce((s, c) => s + (c.ars || 0), 0), 1120267.79, 0.02);
});
t('las cuatro cuotas salen de su seccion', () => {
  const cc = mc.consumos.filter(c => c.cuota);
  igual(cc.length, 4);
  cerca(cc.reduce((s, c) => s + c.ars, 0), 150483.34);
});
t('"MERPAGO*MELI 07/26" es un nombre, no la cuota 7 de 26', () => {
  const c = mc.consumos.find(x => x.comercio.includes('MELI'));
  igual(c.cuota, null, 'un mes en el nombre no puede leerse como cuota');
});
t('"CUOTA SOCIAL CA 10/18" tampoco es una cuota', () => {
  const c = mc.consumos.find(x => x.comercio.includes('CUOTA SOCIAL'));
  igual(c.cuota, null);
});
t('lo que el banco dice que se viene coincide con sus propias cuotas', () => {
  const set = mc.cuotasAVencer.find(x => x.periodo === '2026-09');
  cerca(set.monto, mc.consumos.filter(c => c.cuota).reduce((s, c) => s + c.ars, 0));
});
t('el pago del mes no entra como consumo', () => {
  igual(mc.pagos.length, 1); cerca(mc.pagos[0].ars, -1436912.08);
});

console.log('\nA MOVIMIENTOS');
t('una compra en cuotas guarda la cantidad de cuotas', () => {
  const m = aMovimientos(v).find(x => x.comercio.includes('Naked'));
  igual(m.cuotas, 3); igual(m.moneda, 'ARS');
});
t('un consumo en dolares queda en USD', () => {
  const m = aMovimientos(v).find(x => /Xbox/i.test(x.comercio));
  igual(m.moneda, 'USD'); cerca(m.monto, 12.85);
});
t('todo lo importado entra sin revisar', () => {
  igual(aMovimientos(v).every(m => m.revisado === false), true);
});
t('cada movimiento trae un id externo unico para no duplicar', () => {
  const ids = aMovimientos(v).map(m => m.externo_id);
  igual(new Set(ids).size, ids.length);
});
t('dos filas del mismo dia con comprobante repetido no colisionan', () => {
  // Galicia manda dos 'CUOTA SOCIAL CAR' el 31-07 con comprobante 000001
  const cs = aMovimientos(v).filter(m => m.comercio.includes('CUOTA SOCIAL'));
  igual(cs.length, 2);
  igual(cs[0].externo_id === cs[1].externo_id, false);
});
t('importar el mismo resumen dos veces da los mismos ids', () => {
  igual(aMovimientos(v).map(m => m.externo_id).join('|'),
        aMovimientos(parseResumen(VISA)).map(m => m.externo_id).join('|'));
});

// =====================================================================
// EL OTRO VISA: EL DE 2026
//
// El mismo banco manda dos formatos. Este llego con cero consumos leidos:
// no fallaba, devolvia una lista vacia, que es peor porque parece que el PDF
// no tiene nada adentro.
//
// Cambia casi todo lo que el parser daba por sentado: las fechas van con
// puntos (20.09.26), el comprobante va ADELANTE del comercio y con la marca
// pegada (284053*), la cuota trae la palabra (Cuota 03/03), el menos va
// ATRAS (1.275.752,92-), el total se llama SALDO ACTUAL y las seis fechas
// del ciclo no estan en una fila sino en seis casillas con etiqueta.
// =====================================================================
const VP = leer('resumen-visa-puntos.txt');

t('se reconoce el emisor y la tarjeta', () => {
  const r = parseResumen(VP);
  igual(r.emisor, 'galicia');
  igual(r.marca, 'visa');
  igual(r.ultimos4, '4321');
});

t('las seis fechas del ciclo salen de las casillas con etiqueta', () => {
  // Estan repartidas en tres pares de lineas y alineadas por columna. No se
  // leen por posicion: se juntan las seis del documento y se ordenan, que es
  // la misma suposicion que ya usaba el formato de una fila.
  igualJSON(leerCiclo(VP), {
    cierreAnterior: '2026-08-27', vencimientoAnterior: '2026-09-04',
    cierre: '2026-10-01', vencimiento: '2026-10-09',
    cierreProximo: '2026-10-29', vencimientoProximo: '2026-11-11' });
});

t('los consumos se leen y suman lo que dice el propio resumen', () => {
  const r = parseResumen(VP);
  igual(r.consumos.length, 10);
  const ars = r.consumos.filter(c => c.ars != null).reduce((a, c) => a + c.ars, 0);
  const usd = r.consumos.filter(c => c.usd != null).reduce((a, c) => a + c.usd, 0);
  igual(Math.round(ars * 100) / 100, 630484.72);
  igual(Math.round(usd * 100) / 100, 12.98);
});

t('el comprobante de adelante no se queda adentro del nombre', () => {
  // Decia '284053* EDITOR DE FOTOS'. Con el numero adentro, el comercio no
  // agrupa con nada y no coincide con lo que uno anoto a mano.
  const c = parseResumen(VP).consumos.find(x => x.comprobante === '284053');
  igual(c.comercio, 'EDITOR DE FOTOS');
  igual(c.marca, '*');
  igual(c.ars, 34727);
});

t('el pago en dolares no entra como un pago en pesos', () => {
  // 'SU PAGO EN USD 15,24-' no repite el importe detras del USD, asi que la
  // deteccion por importe no lo ve. Y sin el menos de atras, un pago de un
  // millon doscientos mil se leia como un consumo.
  const r = parseResumen(VP);
  igual(r.pagos.length, 2);
  igual(r.pagos[0].ars, -1275752.92);
  igual(r.pagos[0].usd, null);
  igual(r.pagos[1].usd, -15.24);
  igual(r.pagos[1].ars, null);
});

t('el total se llama SALDO ACTUAL y trae las dos monedas', () => {
  const r = parseResumen(VP);
  igualJSON(r.total, { ars: 680823.62, usd: 12.98 });
  igual(r.pagoMinimo, 67000);
  igualJSON(r.saldoAnterior, { ars: 1276838.45, usd: 15.24 });
});

t('el resumen cuadra: anterior + pagos + consumos + impuestos = total', () => {
  // Es la unica prueba que de verdad dice que se leyo todo. Si falta un
  // consumo o un impuesto, no cierra.
  const r = parseResumen(VP);
  const suma = (l, k) => l.reduce((a, x) => a + (x[k] || 0), 0);
  const ars = r.saldoAnterior.ars + suma(r.pagos, 'ars') + suma(r.consumos, 'ars')
            + r.impuestos.reduce((a, i) => a + i.monto, 0);
  igual(Math.round(ars * 100) / 100, r.total.ars);
  const usd = r.saldoAnterior.usd + suma(r.pagos, 'usd') + suma(r.consumos, 'usd');
  igual(Math.round(usd * 100) / 100, r.total.usd);
});

t('una devolucion de impuesto queda negativa aunque el menos vaya atras', () => {
  const dev = parseResumen(VP).impuestos.find(i => i.devolucion);
  igual(dev.monto, -1085.53);
});

// ---------------------------------------------------------------------
// UNA COMPRA EN CUOTAS ES UNA COMPRA, NO UNA CUOTA
// ---------------------------------------------------------------------
t('se guarda la compra entera, no el importe de la cuota', () => {
  // El resumen cobra una cuota de 32.556,66 de una compra en 3. Se guardaba
  // ese importe con `cuotas: 3`, y como la app divide monto por cuotas, la
  // compra pasaba a valer un tercio: la tarjeta contaba 10.852,22 de un
  // consumo de 32.556,66. Y por eso tampoco reconocia la compra anotada a
  // mano, que se compara por importe.
  const m = aMovimientos(parseResumen(VP), 'tj').filter(x => x.cuotas > 1);
  igual(m.length, 2);
  const uno = m.find(x => x.comercio === 'TIENDA ONLINE UNO');
  igual(uno.cuotas, 3);
  igual(uno.monto, 97669.98);              // 32.556,66 x 3
  igual(uno.fecha, '2026-06-20');          // la fecha de la COMPRA
  coincide(uno.notas, /3 cuotas de 32\.556,66/);
});

t('la misma compra en cuotas no se carga una vez por resumen', () => {
  // Aparece en todos los resumenes hasta que termina de pagarse. Con el
  // cierre adentro de la clave, cada resumen la cargaba de nuevo: una compra
  // en doce cuotas entraba doce veces.
  const r = parseResumen(VP);
  const a = aMovimientos(r, 'tj');
  const otroCierre = aMovimientos({ ...r, ciclo: { ...r.ciclo, cierre: '2026-10-29' } }, 'tj');
  const enCuotas = x => x.filter(y => y.cuotas > 1).map(y => y.externo_id).sort();
  igualJSON(enCuotas(a), enCuotas(otroCierre));
  // Y los de un solo pago SI llevan el cierre: ahi cada resumen trae los
  // suyos y la clave tiene que distinguirlos.
  const sueltos = x => x.filter(y => y.cuotas === 1).map(y => y.externo_id).sort();
  distinto(sueltos(a), sueltos(otroCierre));
});

t('el formato viejo sigue leyendose igual', () => {
  // Los dos conviven: el de Mastercard usa guiones, pone el comprobante al
  // final y el menos adelante.
  const r = parseResumen(leer('resumen-visa.txt'));
  cierto(r.consumos.length > 10, `leyo ${r.consumos.length}`);
  cierto(r.ciclo);
  const cuotas = r.consumos.find(c => c.cuota);
  cierto(cuotas, 'no encontro una compra en cuotas');
  igual(cuotas.comercio, 'DLO*Naked');
});

console.log(`\n${ok} pruebas OK${fallo ? `, ${fallo} FALLAN` : ''}\n`);
process.exit(fallo ? 1 : 0);
