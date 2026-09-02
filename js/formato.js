// =====================================================================
// formato.js — como se muestran los numeros y las fechas. Un solo lugar.
// =====================================================================
import { state } from './db.js';

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
               'agosto','septiembre','octubre','noviembre','diciembre'];

/** $ 612.400 · US$ 4.820. Sin centavos cuando el monto es redondo. */
export function plata(n, moneda = 'ARS', { signo = false } = {}) {
  const v = Number(n) || 0;
  const dec = Math.abs(v % 1) > 0.004 ? 2 : 0;
  const num = new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec,
                                               maximumFractionDigits: dec }).format(Math.abs(v));
  const sim = moneda === 'USD' ? 'US$' : '$';
  const sg = signo ? (v < 0 ? '−' : '+') + ' ' : (v < 0 ? '−' : '');
  return `${sg}${sim} ${num}`;
}

/** Separa el simbolo para poder mostrarlo mas chico que la cifra. */
export function plataPartida(n, moneda = 'ARS') {
  const t = plata(n, moneda);
  const i = t.indexOf(' ');
  return { simbolo: t.slice(0, i), numero: t.slice(i + 1) };
}

export const fechaISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hoyISO = () => fechaISO(new Date());
export const aFecha = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

/** 'sábado 12 de septiembre' */
export function fechaLarga(d) {
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}
/** 'septiembre 2026' */
export function periodoLargo(p) {
  const [y, m] = p.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}
export const mesCorto = p => MESES[Number(p.split('-')[1]) - 1].slice(0, 3);

/** 'hoy' · 'ayer' · 'viernes 11' · '3 sep' */
export function fechaRelativa(iso, ref = new Date()) {
  const d = aFecha(iso);
  const dias = Math.round((new Date(ref.toDateString()) - d) / 86400000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias > 1 && dias < 7) return `${DIAS[d.getDay()]} ${d.getDate()}`;
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

/** 'en 3 días' · 'hoy' · 'venció hace 2 días' */
export function cuandoVence(iso, ref = new Date()) {
  const d = Math.round((aFecha(iso) - new Date(ref.toDateString())) / 86400000);
  if (d === 0) return 'vence hoy';
  if (d === 1) return 'vence mañana';
  if (d > 1) return `en ${d} días`;
  if (d === -1) return 'venció ayer';
  return `venció hace ${-d} días`;
}
export const diasHasta = (iso, ref = new Date()) =>
  Math.round((aFecha(iso) - new Date(ref.toDateString())) / 86400000);

/** Busca en el estado por id, sin explotar si no esta. */
const TIPO_CUENTA = { credito: 'tarjeta', debito: 'débito', cuenta: 'banco',
                      billetera: 'billetera', efectivo: 'efectivo' };

/**
 * 'Mercado Pago · billetera'. La billetera y la tarjeta de credito de un mismo
 * emisor se llaman casi igual, y elegir la equivocada manda el gasto a la
 * cuenta y deja la tarjeta en cero sin que nada lo diga.
 */
export const etiquetaCuenta = a =>
  `${a.nombre}${TIPO_CUENTA[a.tipo] ? ' · ' + TIPO_CUENTA[a.tipo] : ''}` +
  (a.moneda === 'USD' ? ' (US$)' : '');

export { tituloTx, dondeTx, aNumero } from './texto.js';

export const buscar = (tabla, id) => (state[tabla] || []).find(x => x.id === id) || null;
export const nombreDe = (tabla, id, porDefecto = '—') => (buscar(tabla, id) || {}).nombre || porDefecto;
