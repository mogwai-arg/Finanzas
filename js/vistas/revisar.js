// =====================================================================
// vistas/revisar.js — el mazo de lo que entro solo.
//
// Uno por vez, decision binaria, categoria ya elegida. El objetivo es seis
// movimientos en cuarenta segundos: si revisar cuesta mas que anotar, se
// vuelve a no anotar y la app muere.
//
// Las CUOTAS se confirman aparte del resto. Es el unico dato que, si entra
// mal, arrastra el error doce meses.
// =====================================================================
import { h, icono, iconoDe, aviso, hoja, confirmar } from '../ui.js';
import { state, guardar, guardarVarios, borrar } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, fechaRelativa, nombreDe, buscar, aFecha } from '../formato.js';
import { irA } from '../ruteo.js';

export function vistaRevisar(root) {
  const pend = state.transactions.filter(t => t.revisado === false)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  if (!pend.length) {
    root.append(h('div.vacio',
      h('div.ic', icono('check', 24)),
      h('h3', 'No queda nada para revisar'),
      h('p', 'Todo lo que entró solo ya está confirmado.'),
      h('button.btn.sec', { onclick: () => irA('/hoy') }, 'Volver a Hoy')));
    return;
  }

  const cont = h('div.flow');
  root.append(cont);
  pintar(cont, pend, 0);
}

/**
 * Salida de emergencia para un mazo largo. Revisar de a uno esta bien para lo
 * que entra por mail durante la semana; para un resumen entero importado de
 * golpe es una tarea de veinte minutos que nadie hace, y el mazo queda ahi
 * pesando para siempre.
 */
function confirmarTodo(pend, alTerminar) {
  return h('button.btn.sec', { onclick: async () => {
    if (!await confirmar(`¿Dar por buenos los ${pend.length} que quedan? ` +
      'Quedan cargados tal como están; siempre los podés editar después.',
      'Confirmar todos', { peligro: false })) return;
    await guardarVarios('transactions', pend.map(t => ({ ...t, revisado: true })));
    aviso(`${pend.length} confirmados`);
    alTerminar();
  } }, `Confirmar los ${pend.length} de una vez`);
}

function pintar(cont, pend, i) {
  cont.replaceChildren();
  if (i >= pend.length) {
    cont.append(h('div.vacio',
      h('div.ic', icono('check', 24)),
      h('h3', pend.length === 1 ? 'Listo' : `Listo, ${pend.length} revisados`),
      h('p', 'Vuelven a aparecer acá cuando entre algo nuevo.'),
      h('button.btn.sec', { onclick: () => irA('/hoy') }, 'Volver a Hoy')));
    return;
  }
  cont.append(tarjeta(pend[i], i, pend.length, () => pintar(cont, pend, i + 1)));
  // Solo cuando quedan varios: con dos o tres, revisarlos es mas rapido.
  const quedan = pend.slice(i);
  if (quedan.length >= 6) cont.append(confirmarTodo(quedan, () => irA('/hoy')));
}

function tarjeta(tx, i, total, siguiente) {
  const cuenta = buscar('accounts', tx.account_id);
  let cuotas = tx.cuotas || 1;
  let categoria = tx.category_id;

  const cont = h('div.grp.pad', { style: { boxShadow: 'var(--elev-1)' } });
  const { simbolo, numero } = plataPartida(tx.monto, tx.moneda);

  // ------- encabezado
  cont.append(
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '11px' } },
      h('div.av', { style: { width: '38px', height: '38px', borderRadius: '11px' } },
        icono(iconoDe(tx.comercio || tx.descripcion), 19)),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { style: { fontSize: '16px', fontWeight: '600', letterSpacing: '-.02em',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          tx.comercio || tx.descripcion),
        h('div.small.mut', { style: { marginTop: '1px' } },
          [cuenta?.nombre, cuenta?.ultimos4 && '·' + cuenta.ultimos4,
           fechaRelativa(tx.fecha)].filter(Boolean).join(' · '))),
      h('span.pill.bra', tx.fuente === 'gmail' ? 'Gmail' : tx.fuente || 'auto')),
    h('div.cifra', { style: { fontSize: '40px', marginTop: '16px' } }, h('em', simbolo), numero)
  );

  const nota = h('div.small.mut', { style: { marginTop: '5px' } });
  cont.append(nota);

  // ------- reintegro que la app detecto sola
  const promo = promoAplicable(tx);
  if (promo) {
    cont.append(h('div', {
      style: { marginTop: '14px', padding: '12px 13px', background: 'var(--pos-bg)',
               borderRadius: '13px', display: 'flex', gap: '9px', alignItems: 'flex-start' } },
      h('span', { style: { color: 'var(--pos)', display: 'grid', marginTop: '1px' } }, icono('check', 17)),
      h('div', { style: { fontSize: '13px', color: 'var(--pos)', lineHeight: '1.4' } },
        `Tenías ${promo.valor} % en ${promo.titulo}. Te sumo `,
        h('b', plata(promo.reintegro)), ' de reintegro',
        promo.tope ? ' — es lo que quedaba de tope.' : '.')));
  }

  // ------- CUOTAS: el dato que no se puede errar
  const rotulo = h('div.ghead', { style: { margin: '18px 4px 8px' } }, 'En cuántas cuotas');
  const chips = h('div.chips', { style: { flexWrap: 'wrap' } });
  const detalle = h('div');

  const opciones = [1, 3, 6, 12];
  if (!opciones.includes(cuotas)) opciones.push(cuotas);
  const pintarCuotas = () => {
    chips.replaceChildren();
    for (const n of opciones.sort((a, b) => a - b)) {
      chips.append(h('button.pill.mut', {
        'aria-pressed': String(n === cuotas),
        onclick: () => { cuotas = n; pintarCuotas(); pintarDetalle(); }
      }, n === 1 ? '1 pago' : String(n)));
    }
    chips.append(h('button.pill.mut', { onclick: otraCantidad }, 'Otra'));
  };
  const otraCantidad = () => {
    const campo = h('input', { type: 'number', min: '1', max: '60', value: String(cuotas),
                               inputmode: 'numeric' });
    const cerrar = hoja('¿Cuántas cuotas?', h('div',
      h('div.f', h('label', 'Cantidad'), campo),
      h('button.btn', { onclick: () => {
        const n = Math.max(1, Math.min(60, Number(campo.value) || 1));
        if (!opciones.includes(n)) opciones.push(n);
        cuotas = n; cerrar(); pintarCuotas(); pintarDetalle();
      } }, 'Usar esta cantidad')));
  };

  const pintarDetalle = () => {
    nota.textContent = cuotas > 1
      ? 'Es el total de la compra, no el de la cuota.'
      : `Leído del aviso de ${tx.fuente === 'gmail' ? 'consumo' : 'la cuenta'}.`;
    detalle.replaceChildren();
    if (cuotas <= 1 || !cuenta || cuenta.tipo !== 'credito') return;
    const cron = F.cronograma({ ...tx, cuotas }, cuenta);
    const fmt = d => `${d.getDate()} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()]} ${d.getFullYear()}`;
    detalle.append(h('div', {
      style: { marginTop: '14px', padding: '13px', background: 'var(--fill)', borderRadius: '13px' } },
      renglon('Cada cuota', plata(tx.monto / cuotas, tx.moneda), true),
      renglon('Primera', fmt(cron[0].vence)),
      renglon('Última', fmt(cron[cron.length - 1].vence))));
  };
  const renglon = (k, v, grande) => h('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
             marginTop: grande ? '0' : '6px' } },
    h('span.small.mut', k),
    h('b', { class: 'tabnum', style: { fontSize: grande ? '19px' : '13.5px',
                                       fontWeight: grande ? '700' : '600',
                                       letterSpacing: grande ? '-.03em' : '0' } }, v));

  pintarCuotas(); pintarDetalle();
  cont.append(rotulo, chips, detalle);

  // ------- categoria: ya elegida, un tap para cambiarla
  const cats = state.categories.filter(c => c.tipo === 'gasto');
  const sugeridas = [categoria, ...cats.filter(c => c.id !== categoria).slice(0, 2).map(c => c.id)]
    .filter(Boolean);
  const catChips = h('div.chips', { style: { flexWrap: 'wrap' } });
  const pintarCats = () => {
    catChips.replaceChildren();
    for (const cid of sugeridas) {
      catChips.append(h('button.pill.mut', {
        'aria-pressed': String(cid === categoria),
        onclick: () => { categoria = cid; pintarCats(); }
      }, nombreDe('categories', cid)));
    }
    catChips.append(h('button.pill.mut', { onclick: elegirCategoria }, '⋯'));
  };
  const elegirCategoria = () => {
    const cerrar = hoja('Categoría', h('div.grp', cats.map(c =>
      h('button.li', { onclick: () => { categoria = c.id;
        if (!sugeridas.includes(c.id)) sugeridas.unshift(c.id);
        cerrar(); pintarCats(); } },
        h('div.av', icono(iconoDe(c.nombre), 17)),
        h('div.m', h('div.t', c.nombre)),
        c.id === categoria && h('span', { style: { color: 'var(--brand)' } }, icono('check', 17))))));
  };
  pintarCats();
  cont.append(h('div.ghead', { style: { margin: '18px 4px 8px' } }, 'Categoría'), catChips);

  // ------- decision
  cont.append(
    h('div.fila', { style: { marginTop: '20px' } },
      h('button.btn.sec', { onclick: async () => {
        await borrar('transactions', tx.id);
        aviso('Borrado'); siguiente();
      } }, 'No era mío'),
      h('button.btn.ink', { onclick: async () => {
        await guardar('transactions', { ...tx, cuotas, category_id: categoria,
                                        revisado: true,
                                        reintegro: promo ? promo.reintegro : (tx.reintegro || 0) });
        if (promo) await sumarUso(promo);
        siguiente();
      } }, 'Está bien')),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: '16px', fontSize: '13px', color: 'var(--tx2)' } },
      h('button', { style: { background: 'none', border: '0', color: 'var(--tx2)', font: 'inherit',
                             cursor: 'pointer', padding: '4px 0' },
                    onclick: siguiente }, 'Después'),
      h('span.tabnum', `${i + 1} de ${total}`))
  );

  return cont;
}

/** Promo del dia que aplica a esta compra, con el tope ya descontado. */
function promoAplicable(tx) {
  if (tx.moneda !== 'ARS' || tx.tipo !== 'gasto') return null;
  const cuenta = buscar('accounts', tx.account_id);
  const d = aFecha(tx.fecha);
  const per = tx.fecha.slice(0, 7);
  for (const p of F.promosDelDia(state.promos, d)) {
    const nom = (tx.comercio || tx.descripcion || '').toLowerCase();
    if (!nom.includes((p.comercio || p.titulo).toLowerCase())) continue;
    if (p.medio_pago && cuenta && !p.medio_pago.toLowerCase().includes((cuenta.marca || cuenta.nombre).toLowerCase().split(' ')[0])) continue;
    const uso = (state.promo_usos || []).find(u => u.promo_id === p.id && u.periodo === per);
    const usado = uso ? Number(uso.usado) : 0;
    const libre = p.tope ? Math.max(0, Number(p.tope) - usado) : Infinity;
    const bruto = F.reintegroEstimado(tx.monto, p);
    const reintegro = Math.min(bruto, libre);
    if (reintegro <= 0) continue;
    return { ...p, reintegro, usado, libre };
  }
  return null;
}

async function sumarUso(promo) {
  const per = new Date().toISOString().slice(0, 7);
  const uso = (state.promo_usos || []).find(u => u.promo_id === promo.id && u.periodo === per);
  await guardar('promo_usos', uso
    ? { ...uso, usado: Number(uso.usado) + promo.reintegro }
    : { promo_id: promo.id, periodo: per, usado: promo.reintegro });
}
