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
    h('div.grp', lista.map(c => h('button.li', { onclick: () => formCuenta(c) },
      h('div.av', icono(iconoCuenta(c), 17)),
      h('div.m', h('div.t', c.nombre),
        h('div.s', c.saldo_al ? `actualizado ${fechaRelativa(c.saldo_al)}` : c.tipo)),
      h('div', { class: 'v' + (state.ocultarMontos ? ' oculto' : '') },
        plata(c.moneda === 'USD' ? c.saldo : Math.round(c.saldo), c.moneda),
        c.moneda === 'USD' && ref > 0 && h('small', plata(Math.round(c.saldo * ref))))))));

  const cierre = ref > 0 && totalUsd > 0
    ? h('div.small.mut', { style: { padding: '0 4px', lineHeight: '1.45' } },
        `El ${Math.round((totalUsd * ref) / (totalArs + totalUsd * ref) * 100)} % de tu plata está en dólares. `
        + `Todo junto, ${plata(Math.round(totalArs + totalUsd * ref))}.`)
    : null;

  root.append(h('div.flow',
    h('div.grid2', tot('En pesos', totalArs, 'ARS'), tot('En dólares', totalUsd, 'USD')),
    grupo('Pesos', ars), grupo('Dólares', usd),
    state.ocultarMontos
      ? h('div.small.mut', { style: { padding: '0 4px' } },
          'Los nombres y las fechas se siguen leyendo. Lo único tapado son los números.')
      : cierre,
    h('button.btn.sec', { onclick: () => formCuenta() }, icono('mas', 17), 'Agregar cuenta')));
}
