// =====================================================================
// vistas/tarjetas.js — ciclo, cuotas comprometidas y limite.
// El grafico muestra lo que YA debes, no lo que gastaste: las barras bajan
// solas a medida que se terminan las cuotas.
// =====================================================================
import { h, frag, icono, iconoDe, hoja, campo, aviso, confirmar, masOscuro } from '../ui.js';
import { state, guardar } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, diasHasta, fechaISO, mesCorto, periodoLargo, buscar,
         fechaRelativa, tituloTx, dondeTx, aNumero, hoyISO } from '../formato.js';
import { irA } from '../ruteo.js';
import { formCuenta } from './formularios.js';
import { formImportarResumen } from './importar.js';
import { formMovimiento } from './form-movimiento.js';
import { barrasHorizontales } from '../graficos.js';

const isoDe = d => fechaISO(d);

/**
 * Todo lo de las tarjetas, para poner adentro de Pagar.
 *
 * Era una pantalla aparte y no tenia por que serlo: Pagar ya traia una lista
 * de tarjetas con el mismo nombre y el mismo importe, y abajo un "Ver las
 * tarjetas" que llevaba a los mismos numeros con otra cara. Dos lugares para
 * lo mismo, y encima uno de los dos no sabia lo que dice el banco.
 *
 * Ahora es una sola cosa: la pila, y debajo lo que solo estaba alla.
 */
export function seccionTarjetas(hoy) {
  const tarjetas = state.accounts.filter(a => a.tipo === 'credito' && a.activo !== false);
  if (!tarjetas.length) {
    return h('section',
      h('div.ghead', 'Tarjetas'),
      h('div.vacio', { style: { padding: '28px 24px' } },
        h('div.ic', icono('tarjeta', 24)),
        h('h3', 'Todavía no hay tarjetas'),
        h('p', 'Cargá una con su cierre y su vencimiento para ver el cronograma de cuotas.'),
        h('button.btn.sec', { onclick: () => formCuenta() }, 'Cargar una tarjeta'),
        h('button.btn.sec', { style: { marginTop: '10px' }, onclick: () => formImportarResumen() },
          'o importar un resumen')));
  }
  return frag(
    h('section', h('div.ghead', 'Tarjetas'), pila(tarjetas, hoy)),
    comparativa(tarjetas, hoy, 'Gasto con las tarjetas'),
    deudaTotal(tarjetas, hoy));
}

export function vistaTarjeta(root, { id }) {
  const t = buscar('accounts', id);
  if (!t) { irA('/mes'); return; }
  const hoy = new Date();
  root.append(h('div.flow',
    plastico(t, hoy, false),
    faltaElCierre(t),
    limite(t, hoy),
    loQueDiceElBanco(t, hoy),
    consumosDelCiclo(t, hoy),
    consumosDelCiclo(t, hoy, (t.moneda || 'ARS') === 'USD' ? 'ARS' : 'USD'),
    comparativa([t], hoy, 'Contra el mes pasado'),
    debitosQueVienen(t, hoy),
    cuotasVivas(t, hoy),
    proximosResumenes(t, hoy),
    h('button.btn.sec', { onclick: () => formCuenta(t) }, icono('ajustes', 17), 'Editar tarjeta'),
    h('button.btn.sec', { onclick: () => formImportarResumen() }, icono('recibo', 17), 'Importar un resumen')));
}

/**
 * En qué está la tarjeta ahora mismo: qué resumen mira y cuánto de él falta.
 *
 * Lo usan las tres partes de la pantalla —el plástico, el límite y la lista
 * de consumos— y por eso vive en un solo lugar: cuando el resumen se paga,
 * las tres tienen que pasar al ciclo en curso a la vez o la pantalla se
 * contradice sola.
 */
function estadoTarjeta(t, hoy) {
  const moneda = t.moneda || 'ARS';
  const cerrado = F.resumenAPagar(t, hoy);
  const falta = cerrado ? F.faltaPagarDeResumen(state.transactions, t, cerrado, moneda) : 0;
  const pagado = cerrado ? F.pagadoDeResumen(state.transactions, t, cerrado, moneda) : 0;
  const aPagar = falta > 0 ? cerrado : null;
  const ciclo = aPagar || F.proximoCiclo(t, hoy);
  // Los débitos automáticos que todavía no llegaron: Netflix, la prepaga.
  // Son plata comprometida aunque el consumo no figure todavía, y se miran
  // siempre sobre el ciclo EN CURSO: el cerrado ya trae lo que trajo.
  const enCurso = F.proximoCiclo(t, hoy);
  const previstos = F.debitosPrevistos(state.recurrings, state.transactions, t,
    { ...enCurso, cierreAnterior: cerrado ? cerrado.cierre : null }, hoy);
  return { moneda, cerrado, falta, pagado, aPagar, ciclo, previstos,
           // El resumen nuevo no arranca en cero: arranca debiendo las cuotas
           // de compras de meses anteriores, y suma desde ahí.
           comprometido: F.comprometidoEnPeriodo(state.transactions, t,
                                                 F.periodo(ciclo.vence), moneda) };
}

// ---------------------------------------------------------------- cc
/**
 * Las tarjetas apiladas, como en la billetera.
 *
 * Tres plasticos enteros son setecientos pixeles y hay que hacer scroll para
 * ver el tercero. Apiladas entran las tres en media pantalla y se reconocen
 * por el color, que es exactamente como se las reconoce en la billetera de
 * verdad: no se lee el nombre, se ve que una es negra y la otra azul.
 *
 * Con una diferencia con la billetera de iOS, y es la que hace que esto sirva:
 * ALLA la tira tapada lleva solo el logo, porque el saldo no es asunto de esa
 * pantalla. ACA el saldo ES el motivo de la pantalla, asi que sobrevive al
 * colapso. Una pila de tres tiras sin numeros seria mas linda y contestaria
 * menos que la lista que reemplaza.
 *
 * Arranca abierta la que hay que pagar —un resumen cerrado que vence en tres
 * dias es lo unico que pide una decision hoy— y si no hay ninguna, la
 * primera. Tocar una tapada la trae adelante; tocar la de adelante entra.
 */
export function pila(tarjetas, hoy) {
  const caja = h('div.pila');
  // La que pide algo. Si ninguna pide nada, la primera.
  let abierta = Math.max(0, tarjetas.findIndex(t => montoDelPlastico(t, hoy).aPagar));

  const pintar = (mover = false) => {
    caja.replaceChildren(...tarjetas.map((t, i) => i === abierta
      ? plastico(t, hoy, true)
      : tira(t, hoy, () => { abierta = i; pintar(true); })));
    // El foco sigue a la tarjeta que se abrio. Sin esto, al tocar una tapada
    // se rehace la pila, el boton que se toco deja de existir y el foco se
    // va al principio de la pantalla: con lector de pantalla no hay forma de
    // saber que paso. Solo al tocar, no al pintar la primera vez.
    if (mover) caja.children[abierta]?.focus?.();
  };
  pintar();
  return caja;
}

/** Una tarjeta tapada: el mismo plastico, con lo que se debe y nada mas. */
function tira(t, hoy, alTocar) {
  const { moneda, total, etiqueta, corta } = montoDelPlastico(t, hoy);
  return h('button.cc.tira', {
    style: pinta(t), 'aria-expanded': 'false',
    'aria-label': `${t.nombre}: ${etiqueta.toLowerCase()} ${plata(Math.round(total), moneda)}`,
    onclick: alTocar
  },
    h('div.rowt',
      h('div', h('div.nm', t.nombre),
        t.ultimos4 && h('div.n4', '•••• ' + t.ultimos4)),
      h('div', { style: { textAlign: 'right' } },
        // El rotulo y no la marca: "Galicia Mastercard" ya dice cual es, y lo
        // que no se sabe mirando un numero suelto es si es lo que hay que
        // pagar o lo que se viene acumulando.
        h('div.amtl', corta),
        h('div', { class: 'tira-amt' + (state.ocultarMontos ? ' oculto' : '') },
          plata(Math.round(total), moneda)))));
}

/**
 * El numero grande de una tarjeta y como se llama.
 *
 * Lo primero es lo que hay que pagar. Un resumen ya cerrado que vence en tres
 * dias importa mucho mas que el que recien empezo a acumular.
 *
 * Pero un resumen PAGADO deja de ser lo primero: ahi la tarjeta vuelve a cero
 * y lo que importa es el ciclo en curso, que es lo que se esta gastando
 * ahora. Antes seguia mostrando la deuda y el "a pagar en 2 d" aunque el pago
 * estuviera anotado.
 *
 * Vive aparte porque lo usan las dos formas del plastico: la entera y la
 * tira de la pila. Si cada una lo calculara por su lado, la tira podria decir
 * un numero y la tarjeta abierta otro.
 */
export function montoDelPlastico(t, hoy) {
  const est = estadoTarjeta(t, hoy);
  const { moneda, falta, aPagar, pagado } = est;
  const c = F.proximoCiclo(t, hoy);
  const foco = aPagar || c;
  // Sin cierre cargado no hay resumen que mostrar: en vez de un cero que
  // parece un dato, se muestra todo lo que hay y se pide la fecha que falta.
  const sinCiclo = !F.tieneCiclo(t);
  // Lo que dice el banco de este resumen, si se anoto. Manda sobre lo cargado
  // porque es lo que se paga; la diferencia se escribe abajo y no se
  // disimula.
  const b = sinCiclo ? null
    : F.brechaDeTarjeta(state.transactions, t, F.periodo(foco.vence),
                        state.settings?.saldos_tarjeta, moneda);
  const total = sinCiclo
    ? todoLoQueDebe(t)
    : aPagar ? (b.banco != null ? Math.max(0, F.round2(falta + b.dif)) : falta)
             : b.total;
  const dv = diasHasta(isoDe(foco.vence), hoy);
  return { ...est, c, foco, sinCiclo, b, total, dv,
    etiqueta: sinCiclo ? 'En consumos'
      : aPagar ? (dv <= 0 ? 'Venció' : dv <= 3 ? `A pagar en ${dv} d` : 'A pagar')
      : pagado > 0 ? 'Resumen pagado · en curso'
      : 'Resumen en curso',
    // La de la tira, que va al lado del importe y en cuerpo chico: ahi
    // "Resumen en curso" es mas largo que el numero y le compite.
    corta: sinCiclo ? 'En consumos'
      : aPagar ? (dv <= 0 ? 'Venció' : 'A pagar')
      : pagado > 0 ? 'Pagado · en curso'
      : 'En curso' };
}

/** El estilo del plastico: el color de arriba y el de abajo, calculado. */
const pinta = t => ({ '--c1': t.color || '#2A2F52',
                      // El de abajo se calcula del de arriba: un degrade de dos
                      // colores elegidos a mano sale mal la mitad de las veces,
                      // y con un plastico negro el azul fijo de antes lo volvia
                      // gris azulado.
                      '--c2': masOscuro(t.color || '#2A2F52') });

function plastico(t, hoy, linkear) {
  const { moneda, cerrado, falta, pagado, aPagar, comprometido, previstos,
          c, foco, sinCiclo, b, total, dv, etiqueta } = montoDelPlastico(t, hoy);
  // El resumen de una tarjeta argentina trae DOS saldos, y el de dolares se
  // paga aparte. Sumarlo al de pesos seria contar 850 como 850.
  const otraMoneda = moneda === 'USD' ? 'ARS' : 'USD';
  const otra = sinCiclo ? 0
    : F.brechaDeTarjeta(state.transactions, t, F.periodo(foco.vence),
                        state.settings?.saldos_tarjeta, otraMoneda).total;
  const { simbolo, numero } = plataPartida(
    (t.moneda || 'ARS') === 'USD' ? total : Math.round(total), t.moneda || 'ARS');
  const dc = diasHasta(isoDe(c.cierre), hoy);
  const fmt = d => `${d.getDate()}/${d.getMonth() + 1}`;

  // Con `linkear` la tarjeta entera lleva a su ficha, asi que es un boton y
  // tiene que comportarse como uno: llegarle con el tabulador, abrirse con
  // Enter y anunciarse como boton. Era un div con onclick —invisible para el
  // teclado y para el lector de pantalla— y ademas por eso el foco no podia
  // seguir a la tarjeta que se abre en la pila.
  const abrir = linkear ? () => irA(`/tarjetas/${t.id}`) : null;
  const cc = h('div.cc', {
    style: { ...pinta(t), cursor: linkear ? 'pointer' : 'default' },
    ...(linkear ? {
      role: 'button', tabindex: '0',
      'aria-label': `${t.nombre}: ${etiqueta.toLowerCase()} ` +
                    `${plata(Math.round(total), moneda)}. Ver la tarjeta`,
      onkeydown: e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); abrir();
      }
    } : {}),
    onclick: abrir },
    h('div.rowt',
      h('div', h('div.nm', t.nombre),
        t.ultimos4 && h('div.n4', '•••• ' + t.ultimos4)),
      t.marca && h('span.marca', t.marca)),
    h('div.amtl', { style: { marginTop: '14px' } }, etiqueta),
    h('div', { class: 'amt' + (state.ocultarMontos ? ' oculto' : '') }, `${simbolo} ${numero}`),
    sinCiclo
      ? h('div.foot', h('div', h('span', 'Falta el cierre'),
          h('b', 'sin él no sé cuándo se paga')))
      : h('div.foot',
          h('div', h('span', aPagar ? 'Vence' : 'Cierra'),
            h('b', aPagar ? `${fmt(foco.vence)} · en ${dv} d` : `${fmt(c.cierre)} · en ${dc} d`)),
          h('div', h('span', aPagar ? 'Próximo cierre' : 'Vence'),
            h('b', aPagar ? `${fmt(c.cierre)} · en ${dc} d` : `${fmt(c.vence)} · en ${dv} d`)),
          !foco.declarado && h('div', h('span', 'estimado'))),
    // Que el pago figure, y que las cuotas ya comprometidas no parezcan gasto
    // nuevo: una tarjeta que vuelve a cero sin explicación se lee como un
    // error, y una que arranca en 180.000 sin decir por qué, también.
    !sinCiclo && !aPagar && (pagado > 0 || comprometido > 0) &&
      h('div.foot.apilado', { style: { marginTop: '8px' } },
        // Un total no se puede discutir; una lista sí. Tocarlo abre de qué
        // compras está hecho ese compromiso.
        comprometido > 0 ? h('button.foot-link', {
          onclick: e => { e.stopPropagation(); hojaCuotas(t, hoy); } },
          h('span', 'De eso, en cuotas'),
          h('b', plata(Math.round(comprometido), moneda), icono('chev', 12))) : null,
        // "de débitos" sobra cuando el rótulo dice "Faltan caer" y el importe
        // está enfrente: era lo que forzaba el segundo renglón.
        previstos.total > 0 ? h('div', h('span', 'Faltan caer'),
          h('b', plata(Math.round(previstos.total), moneda))) : null,
        pagado > 0 ? h('div', h('span', 'Pagaste'),
          h('b', `${plata(Math.round(pagado), moneda)} · del ${fmt(cerrado.cierre)}`)) : null),
    // El saldo en la OTRA moneda. En una tarjeta argentina el resumen trae dos
    // saldos que se pagan por separado, y hasta ahora la pantalla solo sabia
    // de uno: los consumos en dolares se sumaban al total en pesos, mil veces
    // mas chicos de lo que son, o no se veian en ningun lado.
    !sinCiclo && otra > 0 ? h('div.foot.apilado', { style: { marginTop: '5px' } },
      h('div', h('span', 'En dólares'),
        h('b', plata(otra, otraMoneda)))) : null,
    // Si el numero de arriba es el del banco, tiene que decirlo: un total que
    // no se puede sumar con la lista de abajo y no avisa se lee como un error
    // de la app.
    b && b.banco != null ? h('div.foot.apilado', { style: { marginTop: '5px' } },
      h('div', h('span', 'Lo dice el banco'),
        h('b', b.dif === 0 ? 'coincide con lo cargado'
          : b.dif > 0 ? `faltan ${plata(Math.round(b.dif), moneda)} por aparecer`
                      : `${plata(Math.round(-b.dif), moneda)} de más acá`))) : null);
  return cc;
}

/**
 * Todo lo pendiente de una tarjeta, sin repartir por resumen.
 *
 * Los pagos tambien cuentan: son transferencias que entran a la tarjeta, y
 * sin restarlas la deuda no baja nunca por mas que se pague.
 */
function todoLoQueDebe(t) {
  const moneda = t.moneda || 'ARS';
  let total = 0;
  for (const tx of state.transactions) {
    if ((tx.moneda || 'ARS') !== moneda) continue;
    if (tx.tipo === 'gasto' && tx.account_id === t.id) total += Number(tx.monto) || 0;
    else if (tx.tipo === 'transferencia' && tx.destino_account_id === t.id)
      total -= Math.abs(Number(tx.monto) || 0);
  }
  return Math.max(0, total);
}

/** Sin cierre no se puede armar el resumen: se pide la fecha que falta. */
function faltaElCierre(t) {
  if (F.tieneCiclo(t)) return null;
  return h('div.aviso.amb',
    h('div.av.amb', icono('rayo', 17)),
    h('div.txt',
      h('div.tt', 'Falta el cierre de esta tarjeta'),
      h('div.ds', 'Sin la fecha de cierre no sé a qué resumen va cada compra ni cuándo ' +
        'se paga. Cargá el día de cierre y el de vencimiento, o pegá un resumen y las ' +
        'saco de ahí.'),
      h('button.btn', { onclick: () => formCuenta(t) }, 'Cargar el cierre')));
}

// ------------------------------------------------------------ limite
function limite(t, hoy) {
  if (!t.limite) return null;
  const { moneda, pagado, aPagar } = estadoTarjeta(t, hoy);
  // Lo que el banco dice de mas tambien esta comiendo el limite: son consumos
  // que existen. Sin esto, la tarjeta decia "te quedan 5 millones" con cien
  // mil pesos consumidos que la app no habia visto.
  const foco = aPagar || F.proximoCiclo(t, hoy);
  const dif = F.tieneCiclo(t)
    ? F.brechaDeTarjeta(state.transactions, t, F.periodo(foco.vence),
                        state.settings?.saldos_tarjeta, moneda).dif : 0;
  const l = F.limiteDeTarjeta(t, state.transactions, hoy, moneda, pagado, dif);
  return h('section',
    h('div.ghead', 'Límite'),
    h('div.grp.pad',
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        h('div',
          h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : ''),
                     style: { fontSize: '26px' } }, plata(Math.round(l.disponible), t.moneda)),
          h('div.small.mut', { style: { marginTop: '2px' } }, 'disponible')),
        h('span', { class: `pill ${l.usado >= 80 ? 'amb' : 'mut'}` }, `${l.usado} % usado`)),
      h('div.mini', { style: { marginTop: '12px' } },
        h('b', { class: l.usado >= 80 ? 'al' : '', style: { flex: String(Math.max(1, l.consumido)) } }),
        h('span', { style: { flex: String(Math.max(1, l.disponible)) } })),
      h('div.small.mut', { style: { marginTop: '9px', lineHeight: '1.45' } },
        `Consumido ${plata(l.consumido, t.moneda)} de ${plata(l.limite, t.moneda)}. `
        + 'Incluye las cuotas que todavía no vencieron.')));
}

/**
 * De qué compras está hecho el compromiso en cuotas de este resumen.
 *
 * Es la pregunta que sigue a ver el número: "¿88.728 de qué?". Y la respuesta
 * útil no es solo el nombre, es cuál de cuántas y cuándo se termina de pagar:
 * con eso se decide si conviene adelantar o si mejor no comprar nada más en
 * cuotas por un rato.
 */
function hojaCuotas(t, hoy) {
  const { ciclo, moneda } = estadoTarjeta(t, hoy);
  const per = F.periodo(ciclo.vence);
  const cs = F.cuotasComprometidas(state.transactions, t, per, moneda);
  const total = cs.reduce((s, c) => s + c.monto, 0);

  hoja('En cuotas este resumen', h('div',
    h('div.grp.pad', { style: { marginBottom: '16px' } },
      h('div.cifra', { style: { fontSize: '30px' } }, plata(Math.round(total), moneda)),
      h('div.small.mut', { style: { marginTop: '4px' } },
        `${cs.length} ${cs.length === 1 ? 'compra' : 'compras'} de meses anteriores, ` +
        `en el resumen de ${periodoLargo(per)}`)),

    h('div.grp', cs.map(c => h('button.li', {
      onclick: () => formMovimiento(state.transactions.find(x => x.id === c.tx.id))
    },
      h('div.av', icono(iconoDe(c.tx.comercio || tituloTx(c.tx)), 17)),
      h('div.m',
        h('div.t', tituloTx(c.tx)),
        h('div.s', [`cuota ${c.nro} de ${c.total}`,
                    c.quedan === 0 ? 'la última' : `quedan ${c.quedan}`,
                    `termina en ${periodoLargo(c.ultimo)}`].join(' · '))),
      h('div.v', plata(Math.round(c.monto), moneda),
        h('small', `de ${plata(Math.round(c.tx.monto), moneda)}`))))),

    h('div.small.mut', { style: { padding: '12px 4px 0', lineHeight: '1.5' } },
      'Esto entra al resumen aunque no compres nada más: es plata ya gastada. ',
      'Tocá cualquiera para ver o corregir la compra.')));
}

/**
 * Los débitos automáticos que van a caer en este resumen y todavía no cayeron.
 *
 * Es lo que hace que el resumen no sorprenda: Netflix, la prepaga y el colegio
 * caen todos los meses. Verlos antes de que lleguen es la diferencia entre
 * prever y enterarse.
 */
function debitosQueVienen(t, hoy) {
  const { previstos, moneda } = estadoTarjeta(t, hoy);
  if (!previstos.items.length) return null;
  return h('section',
    h('div.ghead', 'Débitos que faltan caer',
      h('span.mut', plata(Math.round(previstos.total), moneda))),
    h('div.grp', previstos.items.map(r => h('div.li',
      h('div.av', icono(iconoDe(r.nombre), 17)),
      h('div.m', h('div.t', r.nombre),
        // La fecha concreta y no "día 28": en un resumen que se estiró caen
        // dos vueltas del mismo débito y así son dos renglones idénticos.
        h('div.s', r.cuando ? `${fechaRelativa(fechaISO(r.cuando), hoy)} · día ${r.dia_vencimiento}`
                            : `todos los meses · día ${r.dia_vencimiento}`)),
      h('div.v.mut', plata(Math.round(r.monto), moneda))))),
    h('div.small.mut', { style: { padding: '10px 4px 0', lineHeight: '1.5' } },
      'Cuando el consumo llegue de verdad —del resumen o cargado a mano— dejan de ',
      'figurar acá y pasan a sumar en el resumen.'));
}

// ------------------------------------------------------- cuotas vivas
function cuotasVivas(t, hoy) {
  const vivas = state.transactions
    .filter(tx => tx.account_id === t.id && tx.tipo === 'gasto' && (tx.cuotas || 1) > 1)
    .map(tx => {
      const cron = F.cronograma(tx, t, hoy);
      const pend = cron.filter(c => c.pendiente);
      const actual = cron.length - pend.length + 1;
      return { tx, cron, pend, actual: Math.min(actual, cron.length) };
    })
    .filter(x => x.pend.length);

  if (!vivas.length) return null;
  return h('section',
    h('div.ghead', 'En cuotas ahora'),
    h('div.grp', vivas.map(({ tx, cron, actual }) => h('div.li',
      h('div.av', icono('tarjeta', 17)),
      h('div.m',
        h('div.t', tituloTx(tx)),
        h('div.s', [dondeTx(tx), `cuota ${actual} de ${tx.cuotas}`,
                    actual === tx.cuotas ? 'última' : null].filter(Boolean).join(' · '))),
      h('div.v', plata(tx.monto / tx.cuotas, tx.moneda),
        h('small', `de ${plata(tx.monto, tx.moneda)}`))))));
}

/**
 * Los consumos del resumen que se esta mirando.
 *
 * Sin esto una tarjeta en cero no se puede explicar: puede ser que no haya
 * consumos, o que se hayan cargado en la cuenta del mismo banco en vez de en
 * la tarjeta. Viendo la lista, el error salta.
 */
const A_LA_VISTA = 12;

/**
 * Los consumos del resumen, DE UNA MONEDA.
 *
 * Antes no filtraba por moneda y los pintaba todos con la de la tarjeta: un
 * consumo de US$ 850 aparecia como "$ 850" en el medio de los pesos, mil
 * veces mas chico de lo que es y sumado a un total al que no pertenece. En
 * una tarjeta argentina el saldo en dolares es otro saldo: se paga aparte y
 * se cotiza aparte, asi que va en su propia lista con su propio total.
 */
function consumosDelCiclo(t, hoy, cual = null) {
  const { ciclo: c, aPagar, moneda: propia } = estadoTarjeta(t, hoy);
  const moneda = cual || propia;
  const per = F.periodo(c.vence);
  const sinCiclo = !F.tieneCiclo(t);

  const filas = [];
  for (const tx of state.transactions) {
    if (tx.account_id !== t.id || tx.tipo !== 'gasto') continue;
    if (F.monedaDe(tx) !== moneda) continue;
    for (const cu of F.cronograma(tx, t, hoy)) {
      if (!sinCiclo && cu.periodoVenc !== per) continue;
      filas.push({ tx, monto: cu.monto, nro: cu.nro, total: cu.total });
    }
  }
  filas.sort((a, b) => (a.tx.fecha < b.tx.fecha ? 1 : -1));

  // En la otra moneda el titulo es corto: va pegado abajo del de pesos, asi
  // que "Lo que va del resumen en dolares" ocupa dos renglones para decir lo
  // mismo que "En dolares".
  const titulo = moneda !== propia
    ? (moneda === 'USD' ? 'En dólares' : 'En pesos')
    : sinCiclo ? 'Consumos'
    : aPagar ? 'Lo que se paga' : 'Lo que va del resumen';
  // En la otra moneda, "todavía no hay" no es una ausencia que haya que
  // explicar: es lo normal. La sección directamente no está.
  if (!filas.length && moneda !== propia) return null;
  if (!filas.length) {
    return h('section',
      h('div.ghead', titulo),
      h('div.grp.pad',
        h('div.small.mut', { style: { lineHeight: '1.5' } },
          'Todavía no hay consumos en este resumen. Si cargaste alguno y no aparece acá, ',
          'fijate que lo hayas puesto en la tarjeta y no en la cuenta del mismo banco: ',
          'en el formulario dicen el tipo al lado del nombre.')));
  }
  const acumulado = F.round2(filas.reduce((s, f) => s + f.monto, 0));
  const fila = f => h('button.li', {
    onclick: () => formMovimiento(state.transactions.find(x => x.id === f.tx.id))
  },
    h('div.av', icono(iconoDe(f.tx.comercio || tituloTx(f.tx)), 17)),
    h('div.m',
      h('div.t', tituloTx(f.tx)),
      h('div.s', [dondeTx(f.tx), fechaRelativa(f.tx.fecha, hoy),
                  f.total > 1 ? `cuota ${f.nro} de ${f.total}` : null]
                   .filter(Boolean).join(' · '))),
    h('div.v', plata(moneda === 'USD' ? f.monto : Math.round(f.monto), moneda)));

  // El resto, detras de un boton. Antes decia "y 14 más" en un div pelado:
  // no se podia tocar. Y esta pantalla se abre justamente para controlar el
  // resumen consumo por consumo, asi que esconder catorce sin forma de verlos
  // es esconder justo lo que se vino a mirar.
  const cuantos = filas.length - A_LA_VISTA;
  const texto = h('div.t', { style: { color: 'var(--brand)' } },
                  `Ver los otros ${cuantos}`);
  // Escondidas de a una y no adentro de una caja: asi siguen siendo hermanas
  // de las de arriba y las lineas que separan cada fila caen donde tienen que
  // caer, abierto y cerrado.
  const guardadas = filas.slice(A_LA_VISTA).map(f => {
    const n = fila(f); n.hidden = true; return n;
  });
  const masMenos = guardadas.length ? h('button.li', {
    'aria-expanded': 'false',
    onclick: () => {
      const abrir = guardadas[0].hidden;
      for (const n of guardadas) n.hidden = !abrir;
      masMenos.setAttribute('aria-expanded', String(abrir));
      texto.textContent = abrir ? 'Ver menos' : `Ver los otros ${cuantos}`;
    }
  }, h('div.m', texto), h('span.chev', icono('chev', 15))) : null;

  return h('section',
    // Un numero suelto al lado del titulo no dice de que es.
    // El acumulado de la moneda al lado del titulo: es el dato que la pantalla
    // no daba en ningun lado para los dolares.
    h('div.ghead', titulo, h('span.mut', { style: { textTransform: 'none',
                                                    letterSpacing: '0' } },
      h('span.tabnum', plata(moneda === 'USD' ? acumulado : Math.round(acumulado), moneda)),
      ` · ${filas.length} ${filas.length === 1 ? 'consumo' : 'consumos'}`)),
    h('div.grp', filas.slice(0, A_LA_VISTA).map(fila), ...guardadas, masMenos));
}

// --------------------------------------------------- proximos resumenes
function proximosResumenes(t, hoy) {
  const deuda = F.deudaFutura(state.transactions, [t], t.moneda || 'ARS', hoy, 7);
  if (!deuda.length) return null;
  const max = Math.max(...deuda.map(d => d.monto));
  const total = deuda.reduce((s, d) => s + d.monto, 0);

  return h('section',
    h('div.ghead', 'Lo que ya está comprometido'),
    h('div.grp.pad',
      h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : ''),
                 style: { fontSize: '26px' } }, plata(Math.round(total), t.moneda)),
      h('div.small.mut', { style: { marginTop: '2px' } },
        `en ${deuda.length} resúmenes, hasta ${periodoLargo(deuda[deuda.length - 1].periodo)}`),
      h('div', { style: { display: 'flex', gap: '4px', alignItems: 'flex-end',
                          height: '56px', marginTop: '16px' } },
        deuda.map((d, i) => h('div', {
          title: `${periodoLargo(d.periodo)}: ${plata(d.monto, t.moneda)}`,
          style: { flex: '1', height: Math.max(6, (d.monto / max) * 100) + '%',
                   borderRadius: '4px 4px 0 0',
                   background: i === 0 ? 'var(--tx)' : i < 3 ? 'var(--tx2)' : 'var(--tx3)' } }))),
      h('div', { style: { display: 'flex', gap: '4px', marginTop: '6px', fontSize: '10.5px',
                          color: 'var(--tx3)', textAlign: 'center' } },
        deuda.map(d => h('span', { style: { flex: '1' } }, mesCorto(d.periodo))))));
}

// -------------------------------------------------------- deuda total
/**
 * Lo que va gastado este mes contra el mismo tramo del pasado.
 *
 * La comparacion que uno hace sola —"llevo 486.000, el mes pasado gaste
 * 892.000"— miente todos los meses: el dia 5 siempre vas barbaro y el 28
 * siempre vas mal, y lo unico que estas midiendo es que dia es hoy. Por eso
 * la barra del medio es el mes pasado A LA MISMA ALTURA, y el titular sale
 * de esa y no del mes entero.
 *
 * El mes pasado completo va igual, en gris: es a donde vas si seguis asi, y
 * sin eso el numero no se puede ubicar en ningun lado.
 */
/**
 * Anotar lo que dice el banco de un resumen que todavia no cerro.
 *
 * El resumen no se puede bajar hasta que cierra, pero el saldo en curso la
 * app del banco lo muestra desde el dia uno. Cuando no coinciden —un consumo
 * que no llego por correo, un ajuste, una compra vieja que cayo en este
 * ciclo— hay que guiarse por el del banco, que es el que se paga, y no hay
 * forma de encontrar a mano donde estan los cien mil que faltan.
 *
 * Se anota el numero del banco y ESE pasa a ser el total. Lo cargado no se
 * toca y no se le inventa una fila: una fila sin comprobante es plata que
 * despues aparece en el mes, en las estadisticas y en el presupuesto sin que
 * nadie la haya gastado. La diferencia queda escrita, con nombre, hasta que
 * llegue el resumen.
 */
function loQueDiceElBanco(t, hoy) {
  if (!F.tieneCiclo(t)) return null;
  const moneda = t.moneda || 'ARS';
  const otraMoneda = moneda === 'USD' ? 'ARS' : 'USD';
  const { aPagar } = estadoTarjeta(t, hoy);
  const foco = aPagar || F.proximoCiclo(t, hoy);
  const per = F.periodo(foco.vence);
  const saldos = state.settings?.saldos_tarjeta;
  const b = F.brechaDeTarjeta(state.transactions, t, per, saldos, moneda);
  // El otro saldo de la tarjeta. Una argentina tiene dos y el banco muestra
  // los dos: el de dolares se paga aparte y se cotiza aparte.
  const bo = F.brechaDeTarjeta(state.transactions, t, per, saldos, otraMoneda);
  const hayOtra = bo.app > 0 || bo.banco != null;

  const guardarSaldos = async (montoPropio, montoOtro) => {
    const todos = { ...(state.settings?.saldos_tarjeta || {}) };
    const dePer = { ...(todos[t.id] || {}) };
    const cual = { ...(dePer[per] || {}) };
    // La forma vieja colgaba el importe del periodo. Al escribir se pasa a la
    // nueva, para no dejar las dos conviviendo.
    delete cual.monto; delete cual.cuando;
    for (const [m, v] of [[moneda, montoPropio], [otraMoneda, montoOtro]]) {
      if (v == null) delete cual[m];
      else cual[m] = { monto: v, cuando: hoyISO() };
    }
    if (Object.keys(cual).length) dePer[per] = cual; else delete dePer[per];
    // Solo los tres ultimos resumenes: uno de hace un ano no sirve para nada
    // y hace crecer la fila para siempre.
    const vivos = Object.keys(dePer).sort().slice(-3);
    todos[t.id] = Object.fromEntries(vivos.map(k => [k, dePer[k]]));
    await guardar('settings', { ...(state.settings || {}), saldos_tarjeta: todos });
  };

  const abrir = () => {
    const campoDe = br => h('input', { type: 'text', inputmode: 'decimal',
                                       placeholder: '0',
                                       value: br.banco != null ? String(br.banco) : '' });
    const inp = campoDe(b);
    const inpOtra = hayOtra ? campoDe(bo) : null;
    const leer = (el, m) => {
      if (!el || !el.value.trim()) return { ok: true, valor: null };
      const n = aNumero(el.value);
      return n == null ? { ok: false, m } : { ok: true, valor: n };
    };
    const cerrar = hoja(`Lo que dice el banco · ${periodoLargo(per)}`, h('div.flow',
      h('div.small.mut', { style: { lineHeight: '1.55' } },
        'El saldo del resumen en curso, como lo muestra la app del banco. Pasa ',
        'a ser el total de la tarjeta: es el que vas a pagar.'),
      campo(hayOtra ? `Saldo en ${moneda === 'USD' ? 'dólares' : 'pesos'}`
                    : 'Saldo según el banco', inp),
      // Los dos saldos son dos numeros distintos y se pagan por separado:
      // con un campo solo, anotar el de dolares pisaba el de pesos.
      inpOtra ? campo(`Saldo en ${otraMoneda === 'USD' ? 'dólares' : 'pesos'}`, inpOtra) : null,
      h('div.small.mut', { style: { lineHeight: '1.55' } },
        'Acá tenés cargados ', h('b', plata(Math.round(b.app), moneda)),
        hayOtra ? frag(' y ', h('b', plata(bo.app, otraMoneda))) : '',
        '. No se toca ni se le agrega nada: una fila sin comprobante después ',
        'aparece en el mes y en las estadísticas sin que nadie la haya gastado. ',
        'La diferencia queda anotada hasta que subas el resumen, y ahí se cierra sola.'),
      h('button.btn', { onclick: async () => {
        const a = leer(inp, moneda), c = leer(inpOtra, otraMoneda);
        if (!a.ok || !c.ok) return aviso(`No entendí el saldo en ${(a.ok ? c : a).m === 'USD' ? 'dólares' : 'pesos'}`);
        await guardarSaldos(a.valor, c.valor);
        aviso('Guardado');
        cerrar(); irA(`/tarjetas/${t.id}`);
      } }, 'Guardar'),
      (b.banco != null || bo.banco != null) ? h('button.btn.sec', { onclick: async () => {
        if (!await confirmar('¿Borrar lo anotado y volver a lo cargado?', 'Borrar')) return;
        await guardarSaldos(null, null); aviso('Borrado');
        cerrar(); irA(`/tarjetas/${t.id}`);
      } }, 'Borrar lo anotado') : null));
  };

  if (b.banco == null && bo.banco == null) {
    return h('section',
      h('button.li', { style: { background: 'var(--card)',
                                borderRadius: 'var(--r-tarjeta)' }, onclick: abrir },
        h('div.av', icono('banco', 17)),
        h('div.m', h('div.t', '¿El banco dice otro número?'),
          h('div.s', 'Anotalo y mando ese, hasta que puedas bajar el resumen')),
        h('span.chev', icono('chev', 15))));
  }

  const redondo = (n, m) => m === 'USD' ? n : Math.round(n);
  const fila = (rot, valor, extra) => h('div',
    { style: { display: 'flex', justifyContent: 'space-between',
               alignItems: 'baseline', gap: '10px', ...(extra || {}) } },
    h('span.small.mut', rot), valor);

  // Un bloque por moneda: son dos saldos que se pagan por separado, y un
  // total de dolares al lado de uno de pesos no se puede ni sumar ni comparar.
  const bloque = (br, m, titulo, sep) => {
    if (br.banco == null) return null;
    const igual = br.dif === 0;
    // La raya separa DOS bloques: arriba del primero no separa nada y deja un
    // renglon vacio al principio de la tarjeta.
    return h('div', { style: { marginTop: sep ? '14px' : '0',
                               paddingTop: sep ? '12px' : '0',
                               borderTop: sep ? '1px solid var(--line)' : '' } },
      titulo ? h('div.ghead', { style: { margin: '0 0 8px' } }, titulo) : null,
      fila('El banco', h('span.tabnum', { style: { fontWeight: '700', fontSize: '17px' } },
        plata(redondo(br.banco, m), m))),
      fila('Cargado acá', h('span.tabnum', { style: { color: 'var(--tx2)' } },
        plata(redondo(br.app, m), m)), { marginTop: '6px' }),
      h('div', { style: { display: 'flex', justifyContent: 'space-between',
                          alignItems: 'baseline', gap: '10px', marginTop: '6px',
                          paddingTop: '8px', borderTop: '1px solid var(--line)' } },
        h('span.small', { style: { fontWeight: '600' } },
          igual ? 'Coincide' : br.dif > 0 ? 'Falta cargar' : 'Cargado de más'),
        h('span.tabnum', { style: { fontWeight: '700',
                                    color: igual ? 'var(--pos)' : 'var(--amb)' } },
          igual ? '—' : plata(redondo(Math.abs(br.dif), m), m))));
  };

  const cuando = b.cuando || bo.cuando;
  const algunaDif = (b.banco != null && b.dif !== 0) || (bo.banco != null && bo.dif !== 0);
  return h('section',
    h('div.ghead', 'Lo que dice el banco',
      h('span.mut', { style: { textTransform: 'none', letterSpacing: '0' } },
        cuando ? `anotado ${fechaRelativa(cuando, hoy)}` : '')),
    h('div.grp.pad',
      bloque(b, moneda, bo.banco != null
        ? (moneda === 'USD' ? 'En dólares' : 'En pesos') : null, false),
      bloque(bo, otraMoneda, b.banco != null
        ? (otraMoneda === 'USD' ? 'En dólares' : 'En pesos') : null,
        b.banco != null),

      h('div.small.mut', { style: { marginTop: '11px', lineHeight: '1.5' } },
        !algunaDif
          ? 'Lo cargado da exactamente lo que dice el banco. '
          : 'Lo que falta ya está contado en el total y en la plata libre, '
            + 'aunque no se sepa todavía de qué es. Si sobra, puede haber algo '
            + 'cargado dos veces o un pago que el banco no acreditó. ',
        'Cuando subas el resumen de ', periodoLargo(per),
        ', la app compara y lo cierra sola.'),

      h('button.btn.sec', { style: { marginTop: '12px' }, onclick: abrir },
        'Cambiar el número')));
}

const mayuscula = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);

export function comparativa(tarjetas, hoy, titulo) {
  const moneda = 'ARS';
  const r = F.gastoDeTarjetas(state.transactions, tarjetas, hoy, moneda);
  if (!r) return null;
  // Sin nada de un lado ni del otro no hay comparacion, hay una pantalla
  // vacia con dos ceros adentro.
  if (!r.ahora.total && !r.completo.total) return null;

  const dias = `${r.dia} ${r.dia === 1 ? 'día' : 'días'}`;
  const cuantas = n => `${n} ${n === 1 ? 'compra' : 'compras'}`;
  const sube = r.difPct != null && r.difPct > 0;
  // "más" y "menos" escritos, y no un signo. Un "-79 %" con guion se lee como
  // una raya tanto como como un menos, y es la linea que contesta la pregunta.
  const titular = r.difPct == null
    ? (r.completo.total > 0 ? 'El mes pasado, a esta altura, no habías cargado nada'
                            : 'Es el primer mes con movimientos de tarjeta')
    : `${Math.abs(Math.round(r.difPct * 100))} % ${sube ? 'más' : 'menos'} ` +
      'que a esta altura del mes pasado';

  return h('section',
    h('div.ghead', titulo,
      h('span.mut', { style: { textTransform: 'none', letterSpacing: '0' } },
        `a los ${dias}`)),
    h('div.grp.pad',
      h('div.cifra', ...(({ simbolo, numero }) => [h('em', simbolo), numero])(
        plataPartida(r.ahora.total, moneda))),
      h('div.small', { style: { marginTop: '4px', fontWeight: '600',
                                color: r.difPct == null ? 'var(--tx2)'
                                     : sube ? 'var(--amb)' : 'var(--pos)' } },
        titular),

      // Las dos barras son LA comparacion, y nada mas. El mes pasado entero
      // estuvo un rato de tercera barra y fue peor: al ser la mas grande fija
      // la escala, y las dos que hay que comparar quedaban aplastadas contra
      // la izquierda. Va escrito abajo, que es donde un dato de contexto no
      // le roba el grafico al dato principal.
      h('div', { style: { marginTop: '14px' } }, barrasHorizontales([
        { etiqueta: 'Este mes', monto: r.ahora.total,
          nota: cuantas(r.ahora.cuantos) },
        { etiqueta: 'El pasado, a la misma altura', monto: r.tramo.total,
          color: 'var(--cat-otras)',
          // Cuando los meses no miden lo mismo, el tramo se corta antes: hay
          // que decirlo o el numero parece mal calculado.
          nota: r.corte !== r.dia
            ? `${cuantas(r.tramo.cuantos)} · los primeros ${r.corte} días, hasta donde llega ese mes`
            : cuantas(r.tramo.cuantos) }
      ], { moneda })),

      r.completo.total > 0 ? h('div.small.mut',
        { style: { marginTop: '12px', lineHeight: '1.5' } },
        mayuscula(periodoLargo(r.previo)) + ' terminó en ',
        h('b', { style: { color: 'var(--tx)' } }, plata(Math.round(r.completo.total), moneda)),
        r.delTotalPrevio != null
          ? `: llevás el ${Math.round(r.delTotalPrevio * 100)} % de eso.` : '.') : null,

      h('div.small.mut', { style: { marginTop: '8px', lineHeight: '1.5' } },
        'Cuenta la compra el día que la hiciste, entera aunque sea en cuotas. ',
        'Lo que vas a pagar mes a mes son las cuotas comprometidas.')));
}

export function deudaTotal(tarjetas, hoy) {
  const deuda = F.deudaFutura(state.transactions, tarjetas, 'ARS', hoy, 12);
  if (!deuda.length) return null;
  const total = deuda.reduce((s, d) => s + d.monto, 0);
  const ingreso = ingresoMensual();
  const pct = ingreso > 0 ? Math.round((deuda[0].monto / ingreso) * 100) : null;
  const max = Math.max(...deuda.map(d => d.monto));

  return h('section',
    h('div.ghead', 'Cuotas ya comprometidas'),
    h('div.grp.pad',
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' } },
        h('div',
          h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : ''),
                     style: { fontSize: '26px' } }, plata(Math.round(deuda[0].monto))),
          h('div.small.mut', { style: { marginTop: '2px' } },
            `el mes que viene · ${plata(Math.round(total))} en total`)),
        pct != null && h('span', { class: `pill ${pct >= 30 ? 'amb' : 'mut'}` },
          `${pct} % de lo que entra`)),
      h('div', { style: { display: 'flex', gap: '4px', alignItems: 'flex-end',
                          height: '56px', marginTop: '16px' } },
        deuda.map((d, i) => h('div', {
          title: `${periodoLargo(d.periodo)}: ${plata(d.monto)}`,
          style: { flex: '1', height: Math.max(5, (d.monto / max) * 100) + '%',
                   borderRadius: '4px 4px 0 0',
                   background: i === 0 ? 'var(--tx)' : i < 3 ? 'var(--tx2)' : 'var(--tx3)' } }))),
      h('div', { style: { display: 'flex', gap: '4px', marginTop: '6px', fontSize: '10.5px',
                          color: 'var(--tx3)', textAlign: 'center' } },
        deuda.map(d => h('span', { style: { flex: '1' } }, mesCorto(d.periodo))))));
}

function ingresoMensual() {
  const r = (state.recibos || []).slice().sort((a, b) => a.periodo < b.periodo ? 1 : -1)[0];
  if (!r) return 0;
  return Number(r.neto || 0) + Number(r.sobre || 0);
}
