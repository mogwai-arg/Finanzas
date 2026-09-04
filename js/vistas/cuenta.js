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
import { h, frag, icono, iconoDe, deslizable, confirmar, aviso, hoja, campo } from '../ui.js';
import { state, borrar, guardar } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, nombreDe, buscar, tituloTx, aFecha, hoyISO,
         aNumero as num } from '../formato.js';
import { formCuenta, pintarCategorias, conectarCategoria } from './formularios.js';
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

    // "¿Me faltaba algo de agosto?" se pregunta acá, mirando los movimientos
    // de esta cuenta, y no en la pantalla de importar. El cotejo vive del otro
    // lado; lo que faltaba era el camino desde donde nace la duda.
    ultimoCotejo(c),

    c.tipo !== 'credito' ? h('button.btn.sec', { style: { marginTop: '16px' },
                                                 // Se pide al tocar: arriba
                                                 // deja dos módulos
                                                 // esperándose entre sí.
                                                 onclick: () => import('./extracto.js')
                                                   .then(m => m.formImportarExtracto()) },
      icono('buscar', 16), 'Cotejar con el resumen del banco') : null,

    // Saldo inicial e ingreso se parecen y no son lo mismo, y la diferencia
    // no se ve hasta que un mes no cierra: el saldo inicial es la plata que ya
    // estaba cuando empezaste a usar la app, y no entró en ningún mes. Un
    // sueldo en efectivo cargado ahí queda fuera de "lo que entró" para
    // siempre. Pasarlo de un lado al otro tiene que costar un toque, no
    // rehacer la cuenta a mano.
    e.inicial > 0 ? h('section',
      h('div.grp',
        h('button.li', { onclick: () => hojaAIngreso(c, e) },
          h('div.av', icono('billete', 17)),
          h('div.m', h('div.t', '¿Ese saldo inicial fue plata que entró?'),
            h('div.s', { style: { whiteSpace: 'normal', lineHeight: '1.4' } },
              'Pasalo a ingreso y va a contar en el mes en que entró. El saldo ',
              'de la cuenta no cambia.')),
          h('span.chev', icono('chev', 15))))) : null,

    h('button.btn.sec', { onclick: () => formCuenta(c) }, icono('lapiz', 17), 'Editar la cuenta')));
}

/**
 * Pasar el saldo inicial a un ingreso, sin que cambie el saldo.
 *
 * El saldo sale igual por los dos caminos —arranca en 1.532.000, o arranca en
 * cero y entra un ingreso de 1.532.000 el mismo día— pero solo uno de los dos
 * cuenta como plata que entró en el mes. Por eso el ingreso se fecha en el
 * día del saldo declarado: mueve el mes, no el saldo.
 */
function hojaAIngreso(c, e) {
  const moneda = c.moneda || 'ARS';
  const fecha = e.desde || hoyISO();
  const cMonto = h('input', { type: 'text', inputmode: 'decimal',
                              value: String(Math.round(e.inicial)), 'aria-label': 'Importe' });
  const cDetalle = h('input', { type: 'text', value: '',
                                placeholder: `Plata que había en ${c.nombre}` });
  const cFecha = h('input', { type: 'date', value: fecha });
  const cCat = h('select');
  pintarCategorias(cCat, 'ingreso', '');
  conectarCategoria(cCat, () => 'ingreso');

  const cerrar = hoja('Pasarlo a ingreso', h('div',
    h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '16px' } },
      'Queda como un ingreso en esta cuenta y el saldo inicial pasa a cero. ',
      h('b', { style: { color: 'var(--tx)' } },
        `${c.nombre} va a seguir teniendo ${plata(moneda === 'USD' ? e.saldo : Math.round(e.saldo), moneda)}`),
      ': lo que cambia es que ahora esta plata cuenta como algo que entró, y ',
      'aparece en Números y en el mes que le pongas.'),
    campo('Importe', cMonto),
    campo('Detalle (opcional)', cDetalle),
    campo('Cuándo entró', cFecha),
    campo('Categoría', cCat),
    h('button.btn', { style: { marginTop: '16px' }, onclick: async () => {
      const monto = num(cMonto.value);
      if (!monto) { cMonto.focus(); aviso('Falta el importe'); return; }
      await guardar('transactions', {
        fecha: cFecha.value || fecha,
        descripcion: cDetalle.value.trim() || `Plata que había en ${c.nombre}`,
        comercio: null, monto, moneda, tipo: 'ingreso',
        account_id: c.id, category_id: cCat.value || null,
        cuotas: 1, fuente: 'manual', origen: 'manual', revisado: true
      });
      // El saldo declarado se pone en cero PERO se conserva la fecha de
      // corte: sin ella volverían a contar los movimientos anteriores, que ya
      // estaban adentro de ese número, y el saldo se movería.
      await guardar('accounts', { ...c, saldo_inicial: 0 });
      cerrar();
      aviso('Listo, ahora cuenta como plata que entró');
      irA(`/cuenta/${c.id}`);
    } }, 'Pasarlo a ingreso')));
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

/**
 * Cómo quedó la última vez que se cotejó esta cuenta con el banco.
 *
 * "¿Me faltaba algo de agosto?" tiene respuesta sin volver a pegar nada. Y si
 * el cotejo es de hace mucho, eso también es una respuesta.
 */
const dia = iso => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d}/${m}`;
};

function ultimoCotejo(c) {
  const x = state.settings?.cotejos?.[c.id];
  if (!x) return null;
  const dias = Math.floor((Date.now() - new Date(x.cuando)) / 86400000);
  const limpio = !x.faltan && !x.sobran && !x.difieren;
  const pendiente = (x.faltan || 0) + (x.sobran || 0) + (x.difieren || 0);

  return h('div', { style: { marginTop: '16px' } },
    h('div.ghead', 'Último cotejo con el banco'),
    h('div.grp.pad',
      h('div', { style: { fontSize: '14.5px', lineHeight: '1.5' } },
        dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `Hace ${dias} días`,
        x.hasta ? `, sobre el resumen hasta el ${dia(x.hasta)}` : '', '. ',
        limpio
          ? h('b', { style: { color: 'var(--pos)' } }, 'Coincidía todo.')
          : frag('Coincidían ', h('b', `${x.coinciden} de ${x.total}`), ' y quedaban ',
                 h('b', { style: { color: 'var(--amb)' } }, String(pendiente)),
                 ' por mirar.')),
      dias > 45 ? h('div.small.mut', { style: { marginTop: '7px', lineHeight: '1.45' } },
        'Ya pasó más de un mes: convendría cotejar de nuevo.') : null));
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
      h('div.grp', ...agrupados(items, moneda, cuenta)));
  }));
}

/**
 * Las filas del mes, con los rendimientos plegados en una sola.
 *
 * La cuenta remunerada acredita todos los días: son treinta filas de
 * doscientos pesos que tapan los cinco movimientos que uno vino a buscar.
 * Sumados en una sola dicen más —"rindió $ 6.150 en 30 días"— y siguen
 * estando enteros abajo si se tocan.
 *
 * Se pliegan solo si son varios: dos rendimientos sueltos se leen mejor
 * sueltos que escondidos atrás de un desplegable.
 */
function agrupados(items, moneda, cuenta) {
  const rinde = items.filter(f => f.entra && F.esRendimiento(f.tx));
  const resto = items.filter(f => !rinde.includes(f));
  const solo = f => deslizable(fila(f.tx, f.entra, f.monto, moneda, cuenta), {
    alEditar: () => formMovimiento(f.tx),
    alBorrar: async () => {
      if (!await confirmar(`¿Borrar "${tituloTx(f.tx)}"?`)) return;
      await borrar('transactions', f.tx.id);
      aviso('Borrado'); irA(`/cuenta/${cuenta.id}`);
    }
  });

  if (rinde.length < 3) return items.map(solo);

  const total = rinde.reduce((s, f) => s + f.monto, 0);
  const dias = new Set(rinde.map(f => String(f.tx.fecha).slice(0, 10))).size;
  const adentro = h('div', { hidden: true }, ...rinde.map(solo));
  const cabeza = h('button.li', {
    'aria-expanded': 'false',
    onclick: () => {
      adentro.hidden = !adentro.hidden;
      cabeza.setAttribute('aria-expanded', String(!adentro.hidden));
    }
  },
    h('div.av.pos', icono('tendencia', 17)),
    h('div.m', h('div.t', 'Rendimientos'),
      h('div.s', `${dias} ${dias === 1 ? 'día' : 'días'} · tocá para verlos`)),
    h('div.v.pos', plata(Math.round(total), moneda, { signo: true })),
    h('span.chev', icono('chev', 15)));

  return [...resto.map(solo), cabeza, adentro];
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
