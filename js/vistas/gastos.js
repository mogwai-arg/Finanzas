// =====================================================================
// vistas/gastos.js — la lista, agrupada por mes y por dia, con buscador.
//
// Es la pestaña de "¿en qué se me fue?", así que tiene que decir cuánto: la
// banda de cada mes lleva el total, y antes no lo llevaba ninguna parte de
// la pantalla.
//
// El encabezado del día muestra lo que SALIÓ, no el neto. Con el neto, el día
// que cobrás el sueldo el día entero da positivo y se lee como un día en que
// no gastaste.
//
// Y en cada fila, la cuenta va debajo del monto y no en el renglón de abajo:
// ahí siempre quedaba cortada ("Coto · Supermercado · Merca…"), justo el dato
// que no está en ninguna otra parte de la fila.
//
// El reintegro se muestra DEBAJO del monto, no restado: se quiere ver lo
// que se pago y lo que van a devolver, separados.
// =====================================================================
import { h, icono, iconoDe, deslizable, confirmar, aviso } from '../ui.js';
import { state, borrar } from '../db.js';
import * as F from '../finance.js';
import { plata, nombreDe, buscar, tituloTx, dondeTx, aFecha } from '../formato.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
               'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
import { formMovimiento } from './form-movimiento.js';

export function vistaGastos(root) {
  let texto = '';
  let moneda = 'ARS';
  const lista = h('div.flow', { style: { gap: '16px' } });

  const buscador = h('div.search',
    icono('buscar', 17),
    h('input', { type: 'search', placeholder: 'Buscar comercio, monto o nota',
                 'aria-label': 'Buscar', oninput: e => { texto = e.target.value; pintar(); } }));

  const seg = h('div.seg', { role: 'tablist', style: { marginTop: '-6px' } },
    ...['ARS', 'USD'].map(m => h('button', {
      role: 'tab', 'aria-selected': String(m === moneda),
      onclick: () => { moneda = m; seg.querySelectorAll('button').forEach(b =>
        b.setAttribute('aria-selected', String(b.textContent === (m === 'ARS' ? 'Pesos' : 'Dólares')))); pintar(); }
    }, m === 'ARS' ? 'Pesos' : 'Dólares')));

  function pintar() {
    const q = texto.trim().toLowerCase();
    const txs = F.movimientosEnMoneda(state.transactions, moneda)
      .filter(({ tx: t }) => !q || [t.descripcion, t.comercio, t.notas, String(t.monto),
                          nombreDe('categories', t.category_id, '')]
                          .join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.tx.fecha < b.tx.fecha ? 1 : -1);

    lista.replaceChildren();
    if (!txs.length) {
      lista.append(h('div.vacio',
        h('div.ic', icono(q ? 'buscar' : 'lista', 24)),
        h('h3', q ? 'Nada con eso' : 'Todavía no hay movimientos'),
        h('p', q ? 'Probá con el nombre del comercio o con el monto.'
                 : 'Los consumos con tarjeta entran solos. A mano va el efectivo.'),
        !q && h('button.btn.sec', { onclick: () => formMovimiento() }, 'Cargar uno')));
      return;
    }

    // Dos niveles: la banda del mes y, adentro, cada día. Sin la banda, la
    // lista pasaba de septiembre a agosto sin aviso —"martes 1, lunes 31,
    // domingo 30, 22 ago"— y encima con dos formatos de fecha.
    const porMes = new Map();
    for (const it of txs) {
      const mes = String(it.tx.fecha).slice(0, 7);
      if (!porMes.has(mes)) porMes.set(mes, new Map());
      const dias = porMes.get(mes);
      if (!dias.has(it.tx.fecha)) dias.set(it.tx.fecha, []);
      dias.get(it.tx.fecha).push(it);
    }

    // Lo que salió: las movidas entre cuentas propias no cuentan, y los
    // ingresos tampoco. Es la única suma que contesta "¿cuánto gasté?".
    const salida = items => items.reduce((s, { tx: t, monto }) =>
      s + (t.tipo === 'gasto' ? monto : 0), 0);

    for (const [mes, dias] of porMes) {
      const todos = [...dias.values()].flat();
      const gastos = salida(todos);
      const entro = todos.reduce((s, { tx: t, monto, entrante }) =>
        s + (t.tipo === 'ingreso' || entrante ? monto : 0), 0);

      lista.append(h('div.ghead', { style: { margin: '10px 4px -4px' } },
        h('span', nombreDeMes(mes)),
        h('span', { style: { textTransform: 'none', letterSpacing: '0', fontWeight: '500',
                             textAlign: 'right', lineHeight: '1.35' } },
          gastos > 0 ? h('span.tabnum', `salieron ${plata(Math.round(gastos), moneda)}`) : null,
          entro > 0 ? h('div.tabnum', { style: { color: 'var(--tx3)', fontSize: '11.5px' } },
            `entraron ${plata(Math.round(entro), moneda)}`) : null)));

      // La cuenta remunerada acredita TODOS los dias: treinta filas de
      // doscientos pesos que tapan los cinco movimientos que uno vino a
      // buscar. Sumadas en una sola dicen mas —"rindio $ 6.150 en 30 dias"—
      // y siguen estando enteras abajo si se tocan.
      //
      // Se pliegan por mes y no por dia porque hay una por dia: plegar
      // adentro del dia no sacaria ninguna.
      const rinde = todos.filter(it => F.esRendimiento(it.tx));
      const plegar = rinde.length >= 3;

      for (const [fecha, items0] of dias) {
        const items = plegar ? items0.filter(it => !rinde.includes(it)) : items0;
        if (!items.length) continue;
        const gastoDelDia = salida(items);
        lista.append(h('section',
          h('div.ghead', { style: { margin: '0 4px 8px' } }, diaDeLaSemana(fecha),
            gastoDelDia > 0 ? h('span', { class: 'tabnum small',
                style: { fontWeight: '500', letterSpacing: '0', textTransform: 'none',
                         color: 'var(--tx3)' } },
              plata(Math.round(gastoDelDia), moneda)) : null),
          h('div.grp', items.map(it => deslizable(fila(it, moneda), {
            alEditar: () => formMovimiento(it.tx),
            alBorrar: async () => {
              if (!await confirmar(`¿Borrar "${tituloTx(it.tx)}"?`)) return;
              await borrar('transactions', it.tx.id);
              aviso('Borrado'); pintar();
            }
          })))));
      }

      if (plegar) lista.append(plegado(rinde, moneda));
    }
  }

  /** Los rendimientos del mes en una fila que se abre. */
  function plegado(rinde, moneda) {
    const total = rinde.reduce((s, it) => s + it.monto, 0);
    const dias = new Set(rinde.map(it => String(it.tx.fecha).slice(0, 10))).size;
    const adentro = h('div.grp', { hidden: true },
      ...rinde.map(it => fila(it, moneda)));
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
    return h('section', h('div.grp', cabeza), adentro);
  }

  function fila({ tx: t, entrante, monto }, moneda) {
    const cat = nombreDe('categories', t.category_id, t.tipo === 'transferencia' ? 'Movimiento' : 'Sin categoría');
    const cuenta = buscar('accounts', t.account_id);
    const destino = buscar('accounts', t.destino_account_id);
    const esIngreso = t.tipo === 'ingreso';
    const esTransf = t.tipo === 'transferencia';
    // Pagar la tarjeta no es gastar: lo que se compró ya contó el día que se
    // compró. Decirlo en la fila evita la pregunta de por qué un pago de
    // 939.000 no movió el total del mes.
    const esPagoTarjeta = esTransf && destino && destino.tipo === 'credito';
    // La pata que entra de una compra de dólares se lee al revés: no salió de
    // esta cuenta, llegó a ella.
    const donde = entrante
      ? `de ${cuenta ? cuenta.nombre : 'otra cuenta'}${destino ? ` · ${destino.nombre}` : ''}`
      : null;
    // El renglón de abajo tiene 176 px reales en un teléfono: entran dos
    // datos, no cuatro. El que no puede faltar es la CUENTA —es el único que
    // no está en ninguna otra parte de la fila— así que va primero y lo que
    // se corta, si algo se corta, es lo que viene después.
    //
    // Y el comercio se muestra solo si aporta algo: en la mayoría de las
    // filas el título YA es el comercio, y abajo aparecía otra vez con el
    // nombre limpio ("FRAVEGA SACIEI" arriba, "Frávega" abajo). Repetirlo
    // gastaba el ancho que le faltaba a la cuenta y terminaba mostrando "F.".
    const comercio = dondeTx(t);
    const conQue = cuenta && !entrante && !esTransf
      ? `${cuenta.nombre}${cuenta.ultimos4 ? ' ·' + cuenta.ultimos4 : ''}` : null;
    const medio = donde ? donde
      : esPagoTarjeta ? `a ${destino.nombre} · ya contó al comprar`
      : esTransf && destino ? `a ${destino.nombre}`
      : [conQue,
         comercio && !pareceIgual(comercio, tituloTx(t)) ? comercio : null,
         !conQue && !comercio ? cat : null,
         t.cuotas > 1 ? `${t.cuotas} cuotas` : null].filter(Boolean).join(' · ');

    const sinRevisar = t.revisado === false;
    return h('button.li', { class: 'li' + (sinRevisar ? ' nuevo' : ''),
                            onclick: () => formMovimiento(t) },
      h('div', { class: 'av' + (esIngreso ? ' pos' : '') },
        icono(esTransf ? 'sync' : iconoDe(t.comercio || t.descripcion || cat), 17)),
      h('div.m',
        // "Sin revisar" va en el renglón del título y no debajo del monto: en
        // la columna de la plata competía con la cifra, y en el renglón de
        // abajo se comía el ancho de la cuenta. Acá arriba sobra lugar —los
        // títulos son cortos— y queda al lado de la barra de la izquierda,
        // así la marca no depende solo del color.
        h('div.t', { style: { display: 'flex', alignItems: 'baseline', gap: '7px' } },
          h('span', { style: { minWidth: '0', overflow: 'hidden',
                               textOverflow: 'ellipsis' } }, tituloTx(t)),
          sinRevisar ? h('span', { style: { flex: 'none', fontSize: '11px', fontWeight: '600',
                                            color: 'var(--brand)', letterSpacing: '0' } },
            'sin revisar') : null),
        h('div.s', medio)),
      // La pata que entra va en verde igual que un ingreso: lo que decide el
      // color es si la plata sube o baja en la moneda que se está mirando,
      // no de qué tipo es el movimiento.
      // Una movida no suma ni resta del mes: en gris, para que no se lea como
      // un gasto que quedó sin contar.
      h('div', { class: 'v' + (esIngreso || entrante ? ' pos' : ''),
                 style: esTransf && !entrante ? { color: 'var(--tx3)' } : {} },
        esTransf ? plata(monto, moneda, { signo: entrante })
                 : plata(esIngreso ? monto : -monto, moneda, { signo: esIngreso }),
        t.reintegro > 0 && h('small', { style: { color: 'var(--pos)' } },
          `−${plata(t.reintegro, moneda)} reintegro`)));
  }

  /**
   * ¿"Frávega" y "FRAVEGA SACIEI" son el mismo comercio? Sí, y por eso uno de
   * los dos sobra. Con cinco letras alcanza para decidirlo sin inventar.
   */
  function pareceIgual(a, b) {
    const limpiar = t => String(t).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const x = limpiar(a), y = limpiar(b);
    if (!x || !y) return false;
    return x.includes(y.slice(0, 5)) || y.includes(x.slice(0, 5));
  }

  /** 'Septiembre' · 'Agosto 2025' — el año solo si no es el que corre. */
  function nombreDeMes(per) {
    const [y, m] = per.split('-').map(Number);
    return MESES[m - 1] + (y === new Date().getFullYear() ? '' : ` ${y}`);
  }

  /** 'hoy' · 'ayer' · 'martes 1' — sin el mes, que ya está en la banda. */
  function diaDeLaSemana(iso) {
    const d = aFecha(iso);
    const dias = Math.round((new Date(new Date().toDateString()) - d) / 86400000);
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'ayer';
    return `${DIAS[d.getDay()]} ${d.getDate()}`;
  }

  pintar();
  root.append(h('div.flow', buscador, seg, lista));
}
