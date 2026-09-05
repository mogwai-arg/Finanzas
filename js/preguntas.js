// =====================================================================
// preguntas.js — lo que Bishu sabe contestar.
//
// El chat cargaba y corregía, pero no contestaba nada. Eso lo dejaba siendo
// una ventanita de carga con cara de asistente, que es peor que un formulario
// honesto: uno le escribe una pregunta, no la entiende, y no vuelve a
// intentarlo nunca más.
//
// No hay modelo de lenguaje acá tampoco, y no hace falta: las preguntas que
// una persona le hace a su app de gastos son siempre las mismas ocho, y las
// respuestas ya están todas calculadas en finance.js. Lo único que faltaba
// era reconocer la pregunta.
//
// La regla de siempre: si no está seguro, no inventa. Una respuesta inventada
// sobre plata es peor que un "eso no lo sé".
// =====================================================================
import * as F from './finance.js';
import { plata } from './texto.js';

const sinTildes = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Las preguntas, de la mas especifica a la mas general.
 *
 * El orden importa: "cuanto me queda para gastar" y "cuanto tengo" son
 * parecidas y contestan cosas distintas —lo que te queda del mes contra lo
 * que hay en las cuentas— asi que la mas especifica va primero.
 */
const PREGUNTAS = [
  { id: 'enQueSeFue',
    re: /en qu[eé] (se me? )?(fue|gast|va)|qu[eé] gast[eé] m[aá]s|categor[ií]as?\b.*\bgast|mis gastos por/i },
  { id: 'loQueViene',
    re: /qu[eé] (se )?viene|qu[eé] (me )?falta pagar|qu[eé] tengo que pagar|vencimientos?|pr[oó]ximos pagos/i },
  { id: 'plataLibre',
    re: /(cu[aá]nto|qu[eé]).{0,18}(me )?(queda|sobra)|plata libre|puedo gastar|me alcanza/i },
  { id: 'rinde',
    re: /rinde|rendimiento|remunerad|inter[eé]s|tasa/i },
  { id: 'tarjetas',
    re: /tarjetas?\b|resumen(es)?\b|visa|master|cu[aá]nto debo/i },
  { id: 'cuantoTengo',
    re: /cu[aá]nto (tengo|hay)|mi (plata|saldo)|saldos?\b|d[oó]nde est[aá]/i },
  { id: 'cuantoGaste',
    re: /cu[aá]nto (gast[eé]|sali[oó]|llevo)|gast[eé] este mes|mis gastos/i },
  { id: 'cuantoEntro',
    re: /cu[aá]nto (entr[oó]|cobr[eé]|ingres)|mis ingresos|sueldo/i }
];

/** Que pregunto, si pregunto algo. */
export function quePregunta(texto) {
  const t = sinTildes(String(texto || '').toLowerCase());
  if (!t.trim()) return null;
  // Sin verbo ni signo de pregunta, "nafta" no es una pregunta sobre la nafta.
  const parece = /\?|^(cu[aá]nt|qu[eé]|donde|d[oó]nde|cual|cu[aá]l|me alcanza|puedo)/.test(t) ||
                 /\b(cuanto|cuánto|que|qué)\b/.test(t);
  if (!parece) return null;
  for (const p of PREGUNTAS) if (p.re.test(t)) return p.id;
  return null;
}

/**
 * La respuesta, con el numero y con de donde sale.
 *
 * Devuelve { titulo, detalle, ir } — `ir` es la pantalla donde se ve entero,
 * porque una cifra sola invita a preguntar "¿de qué?" y la respuesta a eso ya
 * existe y es una pantalla, no otro renglon de chat.
 */
export function contestar(id, estado, hoy = new Date()) {
  const { accounts = [], transactions = [], recurrings = [],
          recurring_payments = [], categories = [], settings = {} } = estado || {};
  const per = F.periodo(hoy);
  const nombreCat = cid => (categories.find(c => c.id === cid) || {}).nombre || 'lo sin categoría';

  if (id === 'cuantoGaste') {
    const r = F.resumenMes(transactions, per, 'ARS');
    const antes = F.gastadoAlDia(transactions, F.mesAnterior(per), hoy.getDate());
    const dif = Math.round(r.gastos - antes);
    return {
      titulo: `Salieron ${plata(r.gastos)} este mes.`,
      detalle: antes > 0
        ? `A esta altura del mes pasado ibas ${plata(antes)}: ${dif === 0 ? 'lo mismo'
            : dif > 0 ? `${plata(Math.abs(dif))} más` : `${plata(Math.abs(dif))} menos`}.`
        : 'Todavía no hay un mes anterior con qué comparar.',
      ir: '/gastos'
    };
  }

  if (id === 'cuantoEntro') {
    const r = F.resumenMes(transactions, per, 'ARS');
    return {
      titulo: `Entraron ${plata(r.ingresos)} este mes.`,
      detalle: r.gastos > 0
        ? `Contra ${plata(r.gastos)} que salieron, la diferencia es ${plata(r.ingresos - r.gastos)}.`
        : '',
      ir: '/estadisticas'
    };
  }

  if (id === 'plataLibre') {
    const pl = F.plataLibre(accounts, transactions, recurrings, recurring_payments, hoy, 'ARS',
                            estado?.fondos || []);
    const dias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - hoy.getDate();
    return {
      titulo: `Te queda ${plata(pl.libre)}.`,
      detalle: `Es lo que hay en las cuentas menos los resúmenes y los gastos fijos que ` +
               `todavía no pagaste. Faltan ${dias} ${dias === 1 ? 'día' : 'días'} para fin de mes` +
               (dias > 0 ? `: ${plata(Math.max(0, pl.libre) / Math.max(1, dias))} por día.` : '.'),
      ir: '/hoy'
    };
  }

  if (id === 'cuantoTengo') {
    const enPesos = accounts.filter(a => a.activo !== false && a.tipo !== 'credito' &&
                                         (a.moneda || 'ARS') === 'ARS')
      .reduce((s, a) => s + F.saldoDeCuenta(a, transactions, hoy, a.saldo_inicial, a.saldo_al), 0);
    const enUsd = accounts.filter(a => a.activo !== false && a.tipo !== 'credito' &&
                                       a.moneda === 'USD')
      .reduce((s, a) => s + F.saldoDeCuenta(a, transactions, hoy, a.saldo_inicial, a.saldo_al), 0);
    const ref = Number(settings.usd_ref) || 0;
    return {
      titulo: `Tenés ${plata(enPesos)}` + (enUsd > 0 ? ` y ${plata(enUsd, 'USD')}.` : '.'),
      detalle: enUsd > 0 && ref > 0
        ? `Todo junto, ${plata(enPesos + enUsd * ref)} al MEP de ${plata(ref)}.`
        : enUsd > 0 ? 'Para sumarlos me falta la cotización del dólar, en Ajustes.'
        : 'Repartido entre tus cuentas.',
      ir: '/donde'
    };
  }

  if (id === 'enQueSeFue') {
    // { id, monto, parte }: el id es null cuando el gasto no tiene categoria.
    const cs = F.gastoPorCategoria(transactions, per, 'ARS').filter(c => c.monto > 0);
    if (!cs.length) return { titulo: 'Todavía no hay gastos este mes.', ir: '/gastos' };
    const top = cs.slice(0, 3);
    const sinCat = cs.find(c => !c.id);
    return {
      titulo: `Lo más grande fue ${nombreCat(top[0].id)}, ${plata(top[0].monto)}` +
              (top[0].parte > 0 ? ` — el ${Math.round(top[0].parte * 100)} % de lo que gastaste.` : '.'),
      detalle: (top.length > 1
        ? 'Después ' + top.slice(1).map(c => `${nombreCat(c.id)} ${plata(c.monto)}`).join(' y ') + '.'
        : '') +
        // Lo sin categoria se dice aparte: es lo que hace que el grafico
        // mienta, y es accionable —se arregla poniendole categoria—.
        (sinCat && sinCat.parte > 0.15
          ? ` Ojo que ${plata(sinCat.monto)} está sin categoría.` : ''),
      ir: '/estadisticas'
    };
  }

  if (id === 'loQueViene') {
    const rec = F.recurrentesDelMes(recurrings, recurring_payments, per)
      .filter(r => !r.pagado).sort((a, b) => (a.dia_vencimiento || 1) - (b.dia_vencimiento || 1));
    const total = rec.reduce((s, r) => s + Number(r.valor || 0), 0);
    if (!rec.length) return { titulo: 'No te queda nada por pagar este mes.', ir: '/mes' };
    const prox = rec[0];
    return {
      titulo: `Te falta pagar ${plata(total)} en ${rec.length} ${rec.length === 1 ? 'cosa' : 'cosas'}.`,
      detalle: `Lo primero es ${prox.nombre}, ${plata(prox.valor, prox.moneda)}, el ${prox.dia_vencimiento || 1}.`,
      ir: '/mes'
    };
  }

  if (id === 'tarjetas') {
    const tj = accounts.filter(a => a.tipo === 'credito' && a.activo !== false);
    if (!tj.length) return { titulo: 'No tenés tarjetas cargadas.', ir: '/mes' };
    const filas = tj.map(t => {
      const c = F.tieneCiclo(t) ? (F.resumenAPagar(t, hoy) || F.proximoCiclo(t, hoy)) : null;
      const monto = c ? F.totalTarjetaEnPeriodo(transactions, t, F.periodo(c.vence), t.moneda || 'ARS') : 0;
      return { nombre: t.nombre, monto, vence: c?.vence || null };
    }).filter(f => f.monto > 0).sort((a, b) => b.monto - a.monto);
    const total = filas.reduce((s, f) => s + f.monto, 0);
    if (!total) return { titulo: 'Tus resúmenes están en cero.', ir: '/mes' };
    const prim = filas[0];
    return {
      titulo: `Las tarjetas suman ${plata(total)}.`,
      detalle: `La más grande es ${prim.nombre}, ${plata(prim.monto)}` +
               (prim.vence ? `, que vence el ${prim.vence.getDate()}/${prim.vence.getMonth() + 1}.` : '.'),
      ir: '/mes'
    };
  }

  if (id === 'rinde') {
    const r = F.dondeRinde(accounts, transactions, { moneda: 'ARS' }, hoy);
    const conTasa = r.filas.filter(f => f.tna);
    if (!conTasa.length) {
      return { titulo: 'Todavía no cargaste la tasa de ninguna cuenta.',
               detalle: 'Con eso te digo cuánto está generando tu plata quieta y si conviene moverla.',
               ir: '/donde' };
    }
    return {
      titulo: `Tu plata quieta genera ${plata(r.porDia)} por día.`,
      detalle: `Van ${plata(r.estimado)} este mes. La que más rinde es ${r.mejor.cuenta.nombre}, ` +
               `al ${r.mejor.tna} % anual.` +
               (r.dejasDeGanar > 0
                 ? ` Moviendo lo que está en otras cuentas ganarías ${plata(r.dejasDeGanar * 30)} más por mes.`
                 : ''),
      ir: '/donde'
    };
  }

  return null;
}
