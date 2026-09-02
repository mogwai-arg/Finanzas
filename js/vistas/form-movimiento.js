// =====================================================================
// vistas/form-movimiento.js — cargar o corregir un movimiento.
// El efectivo es lo unico que va a mano, o sea lo que mas se olvida:
// por eso arranca con los montos y comercios que mas usas.
// =====================================================================
import { h, icono, iconoDe, hoja, aviso, campo, select, confirmar } from '../ui.js';
import { state, guardar, borrar } from '../db.js';
import { plata, hoyISO, nombreDe, etiquetaCuenta, tituloTx, aNumero } from '../formato.js';

export function formMovimiento(tx = null) {
  const nuevo = !tx;
  const d = {
    fecha: tx?.fecha || hoyISO(),
    descripcion: tx?.descripcion || '',
    comercio: tx?.comercio || '',
    monto: tx?.monto ?? '',
    moneda: tx?.moneda || 'ARS',
    tipo: tx?.tipo || 'gasto',
    account_id: tx?.account_id || cuentaPorDefecto(),
    destino_account_id: tx?.destino_account_id || '',
    category_id: tx?.category_id || '',
    cuotas: tx?.cuotas || 1,
    notas: tx?.notas || ''
  };

  const cuentas = state.accounts.filter(a => a.activo !== false);
  const opcCuentas = cuentas.map(a => ({ value: a.id, label: etiquetaCuenta(a) }));

  const cMonto = h('input', { type: 'text', inputmode: 'decimal', value: String(d.monto),
                              placeholder: '0', 'aria-label': 'Monto' });
  const cComercio = h('input', { type: 'text', value: d.comercio || '',
                                 placeholder: 'Coto, Shell, Dexter…', 'aria-label': 'Comercio' });
  // Que compraste va aparte de donde: 'zapatillas' en Dexter, 'super de la
  // semana' en Coto. Sin esto, dentro de un mes la lista dice diez veces
  // 'Coto' y no hay forma de acordarse de cual fue cual.
  const cQue = h('input', { type: 'text',
                            value: (d.descripcion && d.descripcion !== d.comercio) ? d.descripcion : '',
                            placeholder: 'Opcional', 'aria-label': 'Qué compraste' });
  const cFecha = h('input', { type: 'date', value: d.fecha });
  const cCuenta = select(opcCuentas, { value: d.account_id });
  const cDestino = select([{ value: '', label: '—' }, ...opcCuentas], { value: d.destino_account_id });
  const cCat = select([{ value: '', label: 'Sin categoría' },
    ...state.categories.filter(c => c.tipo === (d.tipo === 'ingreso' ? 'ingreso' : 'gasto'))
      .map(c => ({ value: c.id, label: c.nombre }))], { value: d.category_id });
  const cCuotas = h('input', { type: 'number', min: '1', max: '60', value: String(d.cuotas),
                               inputmode: 'numeric' });

  const bloqueQue = campo('Qué', cQue);
  const bloqueDestino = campo('A qué cuenta', cDestino);
  const bloqueCat = campo('Categoría', cCat);
  const bloqueCuotas = campo('Cuotas', cCuotas);

  const segTipo = h('div.seg', { role: 'tablist', style: { marginBottom: '18px' } },
    ...[['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transferencia', 'Movida']].map(([v, txt]) =>
      h('button', { role: 'tab', 'aria-selected': String(v === d.tipo), onclick: () => {
        d.tipo = v;
        segTipo.querySelectorAll('button').forEach((b, i) =>
          b.setAttribute('aria-selected', String(['gasto', 'ingreso', 'transferencia'][i] === v)));
        actualizar();
      } }, txt)));

  function actualizar() {
    bloqueQue.querySelector('label').textContent =
      d.tipo === 'ingreso' ? 'De qué' : d.tipo === 'transferencia' ? 'Por qué' : 'Qué';
    bloqueDestino.hidden = d.tipo !== 'transferencia';
    bloqueCat.hidden = d.tipo === 'transferencia';
    const cuenta = state.accounts.find(a => a.id === cCuenta.value);
    bloqueCuotas.hidden = d.tipo !== 'gasto' || !cuenta || cuenta.tipo !== 'credito';
    cCat.replaceChildren(...[{ value: '', label: 'Sin categoría' },
      ...state.categories.filter(c => c.tipo === (d.tipo === 'ingreso' ? 'ingreso' : 'gasto'))
        .map(c => ({ value: c.id, label: c.nombre }))]
      .map(o => h('option', { value: o.value, selected: o.value === d.category_id }, o.label)));
  }
  cCuenta.addEventListener('change', actualizar);

  // Atajos: lo mas usado, para que cargar efectivo no cueste
  const atajos = h('div.chips', { style: { flexWrap: 'wrap', marginBottom: '18px' } });
  if (nuevo) {
    for (const c of comerciosFrecuentes()) {
      atajos.append(h('button.pill.mut', { onclick: () => {
        cComercio.value = c.comercio;
        if (c.category_id) { d.category_id = c.category_id; actualizar(); }
        if (c.monto) cMonto.value = String(c.monto);
        cMonto.focus();
      } }, icono(iconoDe(c.comercio), 14), c.comercio));
    }
  }

  const cerrar = hoja(nuevo ? 'Nuevo movimiento' : 'Editar', h('div',
    segTipo,
    nuevo && atajos.children.length ? atajos : null,
    campo('Monto', h('div', { style: { display: 'flex', gap: '9px' } },
      cMonto,
      select([{ value: 'ARS', label: '$' }, { value: 'USD', label: 'US$' }],
             { value: d.moneda, style: { flex: '0 0 84px' },
               onchange: e => d.moneda = e.target.value }))),
    campo('Dónde', cComercio),
    bloqueQue,
    campo('Fecha', cFecha),
    campo('Cuenta', cCuenta),
    bloqueDestino, bloqueCat, bloqueCuotas,
    h('div.fila', { style: { marginTop: '4px' } },
      !nuevo && h('button.btn.dg', { onclick: async () => {
        if (await confirmar(`¿Borrar "${tituloTx(tx)}"?`)) {
          await borrar('transactions', tx.id); cerrar(); aviso('Borrado');
        }
      } }, 'Borrar'),
      h('button.btn', { onclick: guardarlo }, nuevo ? 'Guardar' : 'Guardar cambios'))
  ));
  actualizar();

  async function guardarlo() {
    const monto = aNumero(cMonto.value);
    if (!monto) { cMonto.focus(); aviso('Falta el monto'); return; }
    const comercio = cComercio.value.trim();
    const que = cQue.value.trim();
    if (d.tipo === 'transferencia' && !cDestino.value) { aviso('Falta a qué cuenta va'); return; }

    await guardar('transactions', {
      ...(tx || {}),
      fecha: cFecha.value || hoyISO(),
      descripcion: que || comercio ||
        (d.tipo === 'transferencia' ? 'Movida entre cuentas' : 'Movimiento'),
      comercio: comercio || null,
      monto, moneda: d.moneda, tipo: d.tipo,
      account_id: cCuenta.value,
      destino_account_id: d.tipo === 'transferencia' ? cDestino.value : null,
      category_id: d.tipo === 'transferencia' ? null : (cCat.value || null),
      cuotas: bloqueCuotas.hidden ? 1 : Math.max(1, Number(cCuotas.value) || 1),
      fuente: tx?.fuente || 'manual',
      revisado: true
    });
    cerrar();
    aviso(nuevo ? 'Guardado' : 'Actualizado');
  }

  setTimeout(() => cMonto.focus(), 120);
}

const cuentaPorDefecto = () => {
  const efe = state.accounts.find(a => a.tipo === 'efectivo' && a.moneda === 'ARS');
  return (efe || state.accounts[0] || {}).id || '';
};

/** Los cinco comercios que mas repetis, para cargar de dos taps. */
function comerciosFrecuentes() {
  const cuenta = new Map();
  for (const t of state.transactions) {
    if (!t.comercio || t.tipo !== 'gasto') continue;
    const k = t.comercio;
    const v = cuenta.get(k) || { comercio: k, n: 0, category_id: t.category_id, monto: null };
    v.n++; cuenta.set(k, v);
  }
  return [...cuenta.values()].sort((a, b) => b.n - a.n).slice(0, 5);
}
