// =====================================================================
// vistas/cuenta.js — el extracto de una cuenta.
//
// Antes, tocar una cuenta en "Dónde está la plata" abría el formulario para
// editarla. Pero lo que uno quiere saber al tocarla no es cómo se llama: es
// de dónde salió lo que tiene adentro.
//
// Y hay una pregunta que solo se contesta acá. Una movida entre cuentas
// propias no es un ingreso —la plata cambia de bolsillo, no entra— así que
// no figura en lo que entró en el mes. Entonces, si movés un millón y medio
// de efectivo al banco, ese millón y medio no aparece en ningún lado como
// entrada, y con razón: entró antes. Acá se ve cuándo.
// =====================================================================
import { h, icono, iconoDe, deslizable, confirmar, aviso } from '../ui.js';
import { state, borrar } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, nombreDe, buscar, tituloTx, aFecha } from '../formato.js';
import { formCuenta } from './formularios.js';
import { formMovimiento } from './form-movimiento.js';
import { irA } from '../ruteo.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
               'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function vistaCuenta(root, params) {
  const c = buscar('accounts', params.id);
  if (!c) { irA('/donde'); return; }
  const hoy = new Date();
  const moneda = c.moneda || 'ARS';
  const e = F.extractoDeCuenta(c, state.transactions, hoy);
  const { simbolo, numero } = plataPartida(moneda === 'USD' ? e.saldo : Math.round(e.saldo), moneda);

  root.append(h('div.flow',

    // Plata que la app no sabe de dónde salió. Va arriba de todo porque es lo
    // que hace que los demás números no cierren.
    e.faltaOrigen ? h('div.aviso.amb',
      h('div.av.amb', icono('sube', 17)),
      h('div.txt',
        h('div.tt', 'Falta de dónde salió esta plata'),
        h('div.ds', 'La cuenta quedó en negativo: salió más de lo que la app sabe que ',
          'entró. O falta cargar el saldo con el que arrancó, o falta un ingreso.'),
        h('button.btn', { onclick: () => formCuenta(c) }, 'Poner el saldo inicial'))) : null,

    h('div.grp.pad',
      h('div.ghead', { style: { margin: '0 0 5px' } }, 'Tiene ahora'),
      h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : '') +
                        (e.saldo < 0 ? ' neg' : '') }, h('em', simbolo), numero),

      // La cuenta que se puede seguir con el dedo. Es lo mismo que hace la
      // hoja de "de dónde sale" con el mes: un total que no se puede
      // verificar es un total al que hay que creerle.
      h('div', { style: { marginTop: '13px', paddingTop: '13px',
                          borderTop: '1px solid var(--line)' } },
        // El saldo inicial no es un movimiento: va sin signo. Los otros dos sí.
        renglon('Arrancó con', e.inicial, moneda, false,
          e.desde ? `al ${e.desde.slice(8, 10)}/${e.desde.slice(5, 7)}`
                  : 'sin fecha de corte: se cuenta todo lo cargado'),
        renglon('Entró', e.entradas, moneda, true, 'ingresos y movidas de otras cuentas'),
        renglon('Salió', -e.salidas, moneda, true, 'gastos y movidas hacia otras cuentas'))),

    e.filas.length
      ? movimientos(e.filas, moneda, c)
      : h('div.vacio', { style: { padding: '32px 24px' } },
          h('div.ic', icono('lista', 24)),
          h('h3', 'Sin movimientos'),
          h('p', 'Todavía no hay nada cargado en esta cuenta.')),

    h('button.btn.sec', { onclick: () => formCuenta(c) }, icono('lapiz', 17), 'Editar la cuenta')));
}

function renglon(rot, monto, moneda, signo, apoyo) {
  return h('div', { style: { marginTop: '9px' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', gap: '10px' } },
      h('span.small.mut', rot),
      h('span', { class: 'tabnum' + (state.ocultarMontos ? ' oculto' : ''),
                  style: { fontWeight: '600', fontSize: '15px',
                           color: monto < 0 ? 'var(--tx2)' : 'var(--tx)' } },
        plata(moneda === 'USD' ? monto : Math.round(monto), moneda, { signo }))),
    apoyo ? h('div.small.mut', { style: { color: 'var(--tx3)', marginTop: '1px' } }, apoyo) : null);
}

function movimientos(filas, moneda, cuenta) {
  const porMes = new Map();
  for (const f of filas) {
    const mes = String(f.tx.fecha).slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(f);
  }

  return h('div', [...porMes].map(([mes, items]) => {
    const [y, m] = mes.split('-').map(Number);
    const entro = items.filter(f => f.entra).reduce((s, f) => s + f.monto, 0);
    const salio = items.filter(f => !f.entra).reduce((s, f) => s + f.monto, 0);
    return h('section', { style: { marginTop: '16px' } },
      h('div.ghead', MESES[m - 1] + (y === new Date().getFullYear() ? '' : ` ${y}`),
        h('span', { class: 'tabnum', style: { textTransform: 'none', letterSpacing: '0',
                                              fontWeight: '500' } },
          [entro ? plata(Math.round(entro), moneda, { signo: true }) : null,
           salio ? plata(Math.round(-salio), moneda, { signo: true }) : null]
            .filter(Boolean).join(' · '))),
      h('div.grp', items.map(({ tx, entra, monto }) => deslizable(
        fila(tx, entra, monto, moneda, cuenta), {
          alEditar: () => formMovimiento(tx),
          alBorrar: async () => {
            if (!await confirmar(`¿Borrar "${tituloTx(tx)}"?`)) return;
            await borrar('transactions', tx.id);
            aviso('Borrado'); irA(`/cuenta/${cuenta.id}`);
          }
        }))));
  }));
}

function fila(tx, entra, monto, moneda, cuenta) {
  const otra = tx.tipo === 'transferencia'
    ? buscar('accounts', entra ? tx.account_id : tx.destino_account_id) : null;
  const d = aFecha(tx.fecha);
  return h('button.li', { onclick: () => formMovimiento(tx) },
    h('div', { class: 'av' + (entra ? ' pos' : '') },
      icono(tx.tipo === 'transferencia' ? 'sync'
        : iconoDe(tx.comercio || tx.descripcion || ''), 17)),
    h('div.m',
      h('div.t', tituloTx(tx)),
      h('div.s', `${DIAS[d.getDay()]} ${d.getDate()}`,
        otra ? ` · ${entra ? 'de' : 'a'} ${otra.nombre}` : '',
        tx.category_id ? ` · ${nombreDe('categories', tx.category_id, '')}` : '')),
    h('div', { class: 'v' + (entra ? ' pos' : '') },
      plata(moneda === 'USD' ? (entra ? monto : -monto) : Math.round(entra ? monto : -monto),
            moneda, { signo: entra })));
}
