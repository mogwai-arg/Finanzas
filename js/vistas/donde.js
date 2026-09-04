// =====================================================================
// vistas/donde.js — donde esta la plata.
// Con seis lugares distintos, el total general no te dice si podes pagar
// algo mañana: los pesos de Mercado Pago estan a un tap, el billete no.
// =====================================================================
import { h, icono, iconoDe } from '../ui.js';
import { state } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, fechaRelativa } from '../formato.js';
import { formCuenta } from './formularios.js';
import { irA } from '../ruteo.js';

/** 'A, B y C'. Con join(' y ') salía "Efectivo y Galicia y Mercado Pago". */
const enCastellano = xs => xs.length < 2 ? (xs[0] || '')
  : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;

/** El icono sale del tipo de cuenta, no del nombre: 'Wallbit' no dice nada. */
const iconoCuenta = c => ({ cuenta: 'banco', billetera: 'qr', efectivo: 'billete',
                            debito: 'tarjeta', credito: 'tarjeta' })[c.tipo] || 'banco';

export function vistaDonde(root) {
  const hoy = new Date();
  const cuentas = state.accounts
    .filter(a => a.tipo !== 'credito' && a.activo !== false)
    .map(a => ({ ...a, saldo: F.saldoDeCuenta(a, state.transactions, hoy, a.saldo_inicial || 0, a.saldo_al) }))
    .sort((a, b) => b.saldo - a.saldo);

  const ars = cuentas.filter(c => c.moneda === 'ARS');
  const usd = cuentas.filter(c => c.moneda === 'USD');
  const totalArs = ars.reduce((s, c) => s + c.saldo, 0);
  const totalUsd = usd.reduce((s, c) => s + c.saldo, 0);
  const ref = Number(state.settings?.usd_ref) || 0;

  const tot = (rot, monto, moneda) => {
    const { simbolo, numero } = plataPartida(moneda === 'USD' ? monto : Math.round(monto), moneda);
    return h('div.grp.pad',
      h('div.ghead', { style: { margin: '0' } }, rot),
      h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : ''),
                 style: { fontSize: '23px', marginTop: '5px' } }, h('em', simbolo), numero));
  };

  const grupo = (rot, lista) => !lista.length ? null : h('section',
    h('div.ghead', rot),
    // Tocar una cuenta abre su extracto, no el formulario para editarla: lo
    // que uno quiere saber es de dónde salió lo que tiene adentro, no cómo se
    // llama. Editarla es un botón adentro.
    h('div.grp', lista.map(c => h('button.li', { onclick: () => irA(`/cuenta/${c.id}`) },
      h('div.av', icono(iconoCuenta(c), 17)),
      h('div.m', h('div.t', c.nombre),
        h('div.s', c.saldo < 0 ? 'falta de dónde salió esta plata'
          // Lo que rinde va antes que cuándo se actualizó: es lo que hace que
          // uno mire este renglón y decida algo.
          : F.rinde(c) && c.saldo > 0
            ? `${F.rinde(c)} % anual · ${plata(Math.round(F.porDia(c.saldo, F.rinde(c))))} por día`
          : c.saldo_al ? `actualizado ${fechaRelativa(c.saldo_al)}` : c.tipo)),
      h('div', { class: 'v' + (state.ocultarMontos ? ' oculto' : '') +
                        (c.saldo < 0 ? ' neg' : '') },
        plata(c.moneda === 'USD' ? c.saldo : Math.round(c.saldo), c.moneda),
        c.moneda === 'USD' && ref > 0 && h('small', plata(Math.round(c.saldo * ref)))),
      h('span.chev', icono('chev', 15))))));

  const cierre = ref > 0 && totalUsd > 0
    ? h('div.small.mut', { style: { padding: '0 4px', lineHeight: '1.45' } },
        `El ${Math.round((totalUsd * ref) / (totalArs + totalUsd * ref) * 100)} % de tu plata está en dólares. `
        + `Todo junto, ${plata(Math.round(totalArs + totalUsd * ref))}.`)
    : null;

  // Las tarjetas no tienen saldo sino deuda, asi que no van con las cuentas.
  // Pero tienen que estar: esta es la pantalla de "todo lo que tengo", y si
  // faltan uno las busca donde no estan.
  const tarjetas = state.accounts.filter(a => a.tipo === 'credito' && a.activo !== false);
  const grupoTarjetas = !tarjetas.length ? null : h('section',
    h('div.ghead', 'Tarjetas'),
    h('div.grp', tarjetas.map(t => {
      const c = F.tieneCiclo(t) ? (F.resumenAPagar(t, hoy) || F.proximoCiclo(t, hoy)) : null;
      const monto = c ? F.totalTarjetaEnPeriodo(state.transactions, t, F.periodo(c.vence), t.moneda || 'ARS') : 0;
      return h('button.li', { onclick: () => irA(`/tarjetas/${t.id}`) },
        h('div.av', icono('tarjeta', 17)),
        h('div.m', h('div.t', t.nombre),
          h('div.s', !c ? 'falta el cierre'
            : `${t.ultimos4 ? '•••• ' + t.ultimos4 + ' · ' : ''}vence ${c.vence.getDate()}/${c.vence.getMonth() + 1}`)),
        h('div', { class: 'v' + (state.ocultarMontos ? ' oculto' : '') },
          plata(Math.round(monto), t.moneda || 'ARS')),
        h('span.chev', icono('chev', 15)));
    })));

  root.append(h('div.flow',
    h('div.grid2', tot('En pesos', totalArs, 'ARS'), tot('En dólares', totalUsd, 'USD')),
    grupo('Pesos', ars), grupo('Dólares', usd), grupoTarjetas,
    loQueRinde(hoy),
    state.ocultarMontos
      ? h('div.small.mut', { style: { padding: '0 4px' } },
          'Los nombres y las fechas se siguen leyendo. Lo único tapado son los números.')
      : cierre,
    h('button.btn.sec', { onclick: () => formCuenta() }, icono('mas', 17), 'Agregar cuenta')));
}

/**
 * Lo que rinde la plata quieta, y dónde está mal puesta.
 *
 * Cuánto rindió el mes pasado te lo dice el banco. Lo que el banco no te dice
 * nunca es que la misma plata, en la cuenta de al lado, rendiría el doble.
 * Esa es la única pregunta de todo esto que se puede contestar con una acción.
 *
 * No inventa movimientos: estima y lo dice. Devengarlo como transacciones
 * haría subir el saldo solo, con plata calculada a partir de una tasa que uno
 * escribió a mano y que cambia cada semana. El rendimiento de verdad entra
 * como todo lo demás, por el resumen o por el aviso del banco, y acá al lado
 * se ve si coincide.
 */
function loQueRinde(hoy) {
  const r = F.dondeRinde(state.accounts, state.transactions, { moneda: 'ARS' }, hoy);
  const conTasa = r.filas.filter(f => f.tna);
  if (!conTasa.length) {
    // Sin ninguna tasa cargada no se puede calcular nada, pero tampoco hay que
    // callarse: es plata que se está perdiendo por no configurar un número.
    const candidata = r.filas.find(f => f.saldo > 50000 &&
      /mercado ?pago|personal ?pay|ual[aá]|brubank|naranja|prex/i.test(f.cuenta.nombre || ''));
    if (!candidata) return null;
    return h('section',
      h('div.ghead', 'Tu plata quieta'),
      h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.55' } },
        'Tenés ', h('b', plata(Math.round(candidata.saldo))), ' en ', candidata.cuenta.nombre,
        ', que paga un rendimiento diario. Cargale la tasa en la ficha de la cuenta ',
        'y te digo cuánto está generando y si conviene moverla.')));
  }

  const dif = r.acreditado > 0 ? r.acreditado - r.estimado : null;
  const vieja = conTasa.filter(f => F.tasaVieja(f, hoy));

  return h('section',
    h('div.ghead', 'Tu plata quieta',
      h('span', { style: { textTransform: 'none', letterSpacing: '0', fontWeight: '500' } },
        `${plata(Math.round(r.porDia))} por día`)),

    h('div.grp', conTasa.map(f => h('button.li', {
      onclick: () => formCuenta(f.cuenta) },
      h('div.av.pos', icono('tendencia', 15)),
      h('div.m', h('div.t', f.cuenta.nombre),
        h('div.s', `${f.tna} % anual · ${plata(Math.round(f.estimado))} este mes`)),
      h('div.v', plata(Math.round(f.porDia)), h('small', 'por día')),
      h('span.chev', icono('chev', 15))))),

    // La comparación contra lo que de verdad te acreditaron. Si la tasa que
    // cargaste está vieja, la diferencia lo grita sola.
    dif != null && Math.abs(dif) > Math.max(200, r.estimado * 0.1)
      ? h('div.small.mut', { style: { padding: '10px 4px 0', lineHeight: '1.5' } },
          'Este mes te acreditaron ', h('b', plata(Math.round(r.acreditado))),
          ' y yo calculaba ', h('b', plata(Math.round(r.estimado))), '. ',
          dif < 0 ? 'La tasa que tenés cargada es más alta que la real.'
                  : 'La tasa que tenés cargada quedó corta.')
      : null,

    vieja.length ? h('div.small.mut', { style: { padding: '10px 4px 0', lineHeight: '1.5',
                                                 color: 'var(--amb)' } },
      `La tasa de ${enCastellano(vieja.map(f => f.cuenta.nombre))} es de hace más de dos meses. `,
      'Cambian seguido: con una vieja el cálculo miente sin avisar.') : null,

    // Lo accionable, y por eso va con botón: mover la plata.
    r.dejasDeGanar > 0 && r.mover.length
      ? h('div', { style: { marginTop: '14px' } },
          h('div.grp.pad',
            h('div', { style: { fontSize: '15px', lineHeight: '1.5' } },
              'Tenés ', h('b', plata(Math.round(r.mover.reduce((s, f) => s + f.saldo, 0)))),
              ' en ', enCastellano(r.mover.map(f => f.cuenta.nombre)),
              r.mover.some(f => f.tna) ? ', que rinde menos' : ', que no rinde',
              '. En ', h('b', r.mejor.cuenta.nombre), ' ganarías ',
              h('b', { style: { color: 'var(--pos)' } },
                plata(Math.round(r.dejasDeGanar * 30))), ' más por mes.'),
            h('div.small.mut', { style: { marginTop: '7px', lineHeight: '1.45' } },
              'Contando solo la plata que ya tenés quieta, sin poner nada nuevo.')))
      : null);
}
