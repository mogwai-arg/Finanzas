// =====================================================================
// vistas/pago.js — "¿con qué pago?"
//
// El cruce que ninguna app de mercado hace, porque afuera no existen ni las
// cuotas ni los topes de reintegro. Una compra tiene DOS costos: cuanto sale
// y cuando lo pagas. Casi todas muestran solo el primero.
// =====================================================================
import { h, icono, iconoDe } from '../ui.js';
import { state } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, diasHasta, fechaISO } from '../formato.js';

const RUBROS = [
  { id: 'supermercado', nombre: 'Súper', icono: 'carro' },
  { id: 'combustible',  nombre: 'Nafta', icono: 'nafta' },
  { id: 'gastronomia',  nombre: 'Resto', icono: 'comida' },
  { id: 'salud',        nombre: 'Farmacia', icono: 'pastilla' },
  { id: 'otros',        nombre: 'Otro',  icono: 'varios' }
];

export function vistaPago(root) {
  let monto = 0;
  let rubro = RUBROS[0].id;

  const campo = h('input', {
    type: 'text', inputmode: 'decimal', placeholder: '0',
    'aria-label': 'Monto a gastar',
    style: { background: 'none', border: '0', padding: '0', minHeight: '0',
             fontFamily: 'var(--f-display)', fontSize: '36px', fontWeight: '800',
             letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums' },
    oninput: e => {
      monto = Number(String(e.target.value).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
      pintar();
    }
  });

  const chips = h('div.chips', { style: { flexWrap: 'wrap', marginTop: '14px' } });
  const salida = h('div');
  const nota = h('div.small.mut', { style: { padding: '0 4px', lineHeight: '1.45' } });

  const pintarChips = () => {
    chips.replaceChildren();
    for (const r of RUBROS) {
      chips.append(h('button.pill.mut', {
        'aria-pressed': String(r.id === rubro),
        onclick: () => { rubro = r.id; pintarChips(); pintar(); }
      }, icono(r.icono, 14), r.nombre));
    }
  };

  const pintar = () => {
    salida.replaceChildren();
    nota.textContent = '';
    if (!monto) {
      salida.append(h('div.vacio', { style: { padding: '32px 24px' } },
        h('div.ic', icono('tarjeta', 24)),
        h('h3', 'Poné cuánto vas a gastar'),
        h('p', 'Te digo con cuál te sale menos y con cuál lo pagás más tarde.')));
      return;
    }
    const ops = opciones(monto, rubro);
    salida.append(
      h('div.ghead', 'Lo que te sale de verdad'),
      h('div', ops.map((o, i) => fila(o, i === 0)))
    );
    const conTope = ops.find(o => o.promo && o.promo.usado > 0);
    if (conTope) {
      nota.textContent = `${conTope.promo.titulo} tiene ${conTope.promo.valor} %, pero ya usaste `
        + `${plata(conTope.promo.usado)} de los ${plata(conTope.promo.tope)} de tope del mes.`;
    }
  };

  pintarChips(); pintar();

  root.append(h('div.flow',
    h('div.grp.pad',
      h('div.ghead', { style: { margin: '0 0 6px' } }, 'Voy a gastar'),
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px' } },
        h('span', { style: { fontFamily: 'var(--f-display)', fontSize: '22px', fontWeight: '700',
                             color: 'var(--tx3)' } }, '$'),
        campo),
      chips),
    salida, nota));

  setTimeout(() => campo.focus(), 120);
}

// ---------------------------------------------------------------------

function opciones(monto, rubro) {
  const hoy = new Date();
  const iso = fechaISO(hoy);
  const per = iso.slice(0, 7);
  const promos = F.promosDelDia(state.promos, hoy).filter(p => p.rubro === rubro);

  // Tarjetas de credito, con sus dias de aire reales
  const out = F.financiacion(hoy, state.accounts).map(f => ({
    cuenta: f.tarjeta, vence: f.vence, dias: f.diasDeAire, declarado: f.declarado,
    ...conPromo(monto, promos, f.tarjeta, per)
  }));

  // Débito y billeteras: sale hoy, pero pueden tener promo
  for (const c of state.accounts.filter(a => ['debito', 'billetera', 'cuenta'].includes(a.tipo)
                                          && a.moneda === 'ARS' && a.activo !== false)) {
    const p = conPromo(monto, promos, c, per);
    if (!p.promo) continue;             // sin promo no aporta nada a la decision
    out.push({ cuenta: c, vence: hoy, dias: 0, declarado: true, ...p });
  }

  // Ordenado por lo que sale de verdad; a igual costo, gana el que da más aire.
  return out.sort((a, b) => (a.costo - b.costo) || (b.dias - a.dias));
}

function conPromo(monto, promos, cuenta, per) {
  for (const p of promos) {
    if (p.medio_pago) {
      const medio = p.medio_pago.toLowerCase();
      const nom = (cuenta.nombre || '').toLowerCase();
      const marca = (cuenta.marca || '').toLowerCase();
      if (!medio.includes(marca) && !nom.split(' ').some(w => w && medio.includes(w))) continue;
    }
    const uso = (state.promo_usos || []).find(u => u.promo_id === p.id && u.periodo === per);
    const usado = uso ? Number(uso.usado) : 0;
    const libre = p.tope ? Math.max(0, Number(p.tope) - usado) : Infinity;
    const bruto = F.reintegroEstimado(monto, p);
    const reintegro = Math.min(bruto, libre);
    if (reintegro <= 0) continue;
    return { costo: monto - reintegro, reintegro,
             promo: { ...p, usado, libre, topeApretado: bruto > libre } };
  }
  return { costo: monto, reintegro: 0, promo: null };
}

function fila(o, mejor) {
  const dias = o.dias;
  const cuando = dias <= 0 ? 'Sale hoy de la cuenta'
    : `Lo pagás el ${o.vence.getDate()}/${o.vence.getMonth() + 1}`;
  const { simbolo, numero } = plataPartida(o.costo);

  return h('div.grp.pad', {
    style: { marginTop: '9px', boxShadow: mejor ? '0 0 0 2px var(--brand-solid)' : 'none' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      h('div.av', icono(o.cuenta.tipo === 'credito' ? 'tarjeta' : iconoDe(o.cuenta.nombre), 17)),
      h('div', { style: { flex: '1', minWidth: '0', fontWeight: '600', fontSize: '15.5px',
                          letterSpacing: '-.015em', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
        o.cuenta.nombre, o.cuenta.ultimos4 ? ` ·${o.cuenta.ultimos4}` : ''),
      mejor && h('span.pill.pos', 'Mejor'),
      !mejor && dias >= 25 && h('span.pill.bra', 'Más aire')),

    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '9px',
                        marginTop: '11px', flexWrap: 'wrap' } },
      h('span', { class: 'cifra' + (o.reintegro ? ' pos' : ''),
                  style: { fontSize: '20px' } }, h('em', simbolo), numero),
      o.reintegro > 0 && h('span', { style: { color: 'var(--tx3)', textDecoration: 'line-through',
                                              fontSize: '13px', fontWeight: '500' } },
        plata(o.costo + o.reintegro)),
      o.promo && h('span', { class: `pill ${o.promo.topeApretado ? 'amb' : 'pos'}` },
        o.promo.topeApretado ? 'tope casi lleno' : `−${o.promo.valor} %`)),

    h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px',
                        marginTop: '9px', fontSize: '12.5px', color: 'var(--tx2)' } },
      h('span', cuando, dias > 0 && h('b', { style: { color: 'var(--tx)' } }, ` · en ${dias} días`)),
      o.promo && o.promo.libre !== Infinity
        ? h('span', 'tope libre ', h('b', { style: { color: 'var(--tx)' } }, plata(o.promo.libre)))
        : h('span', o.declarado ? '' : 'fecha estimada'))
  );
}
