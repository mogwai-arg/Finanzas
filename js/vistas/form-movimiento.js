// =====================================================================
// vistas/form-movimiento.js — cargar o corregir un movimiento.
//
// Son tres cosas distintas y por eso son tres pantallas distintas, aunque
// entren por el mismo boton:
//
//   Gasto    sale plata: interesa donde, que compraste y con que pagaste.
//   Ingreso  entra plata: interesa de quien viene y en que cuenta cae.
//   Movida   la plata no cambia de dueño, cambia de lugar: interesa de que
//            cuenta a que cuenta, y si cruza de moneda, a cuanto.
//
// Antes las tres mostraban los mismos campos con otro titulo, y cargar una
// movida obligaba a adivinar cual de los dos selects era el destino.
// =====================================================================
import { h, icono, iconoDe, hoja, aviso, campo, select, confirmar } from '../ui.js';
import { state, guardar, borrar } from '../db.js';
import { opcionesCategoria, pintarCategorias, conectarCategoria } from './formularios.js';
import { plata, hoyISO, nombreDe, etiquetaCuenta, tituloTx, aNumero } from '../formato.js';

const TIPOS = [['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transferencia', 'Movida']];
const TITULO = {
  gasto:          { nuevo: 'Nuevo gasto',   editar: 'Editar gasto' },
  ingreso:        { nuevo: 'Nuevo ingreso', editar: 'Editar ingreso' },
  transferencia:  { nuevo: 'Nueva movida',  editar: 'Editar movida' }
};

export function formMovimiento(tx = null) {
  const nuevo = !tx;
  const d = {
    moneda: tx?.moneda || 'ARS',
    tipo: tx?.tipo || 'gasto',
    category_id: tx?.category_id || ''
  };

  const cuentas = state.accounts.filter(a => a.activo !== false);
  const opcCuentas = cuentas.map(a => ({ value: a.id, label: etiquetaCuenta(a) }));
  const monedaDe = id => (cuentas.find(a => a.id === id) || {}).moneda || 'ARS';

  // ------------------------------------------------------------- campos
  const cMonto = h('input', { type: 'text', inputmode: 'decimal',
                              value: tx?.monto != null ? String(tx.monto) : '',
                              placeholder: '0', 'aria-label': 'Monto' });
  const cMoneda = select([{ value: 'ARS', label: '$' }, { value: 'USD', label: 'US$' }],
                         { value: d.moneda, style: { flex: '0 0 84px' },
                           onchange: e => { d.moneda = e.target.value; actualizar(); } });
  const cComercio = h('input', { type: 'text', value: tx?.comercio || '',
                                 placeholder: 'Coto, Shell, Dexter…', 'aria-label': 'Dónde' });
  // Que compraste va aparte de donde: 'zapatillas' en Dexter, 'super de la
  // semana' en Coto. Sin esto, dentro de un mes la lista dice diez veces
  // 'Coto' y no hay forma de acordarse de cual fue cual.
  const cQue = h('input', { type: 'text',
                            value: (tx?.descripcion && tx.descripcion !== tx.comercio) ? tx.descripcion : '',
                            placeholder: 'Opcional', 'aria-label': 'Detalle' });
  const cFecha = h('input', { type: 'date', value: tx?.fecha || hoyISO() });
  const cCuenta = select(opcCuentas, { value: tx?.account_id || cuentaPorDefecto(),
                                       onchange: () => actualizar() });
  const cDestino = select([{ value: '', label: 'Elegí una' }, ...opcCuentas],
                          { value: tx?.destino_account_id || '', onchange: () => actualizar() });
  // La categoria elegida se guarda al vuelo: la lista se vuelve a armar cada
  // vez que cambia el tipo o la cuenta, y sin esto se perdia la eleccion. La
  // lista incluye "crear una", porque la categoria que falta se descubre
  // justo acá, cargando el gasto, y mandar a Ajustes es perderlo a medio
  // cargar.
  const cCat = select(opcionesCategoria('gasto'), {});
  conectarCategoria(cCat, () => d.tipo === 'ingreso' ? 'ingreso' : 'gasto',
                    v => d.category_id = v);
  const cCuotas = h('input', { type: 'number', min: '1', max: '60',
                               value: String(tx?.cuotas || 1), inputmode: 'numeric' });
  // El tipo de cambio se escribe siempre igual: cuantos pesos vale un dolar.
  // Preguntarlo al reves segun la direccion de la movida es la mejor forma de
  // cargar mal una compra de dolares.
  const cTC = h('input', { type: 'text', inputmode: 'decimal',
                           value: tcGuardado(tx), placeholder: '1450',
                           'aria-label': 'Tipo de cambio' });
  cTC.addEventListener('input', () => pintarCambio());
  cMonto.addEventListener('input', () => pintarCambio());

  const bloqueMoneda = h('div', { style: { display: 'flex', gap: '9px' } }, cMonto, cMoneda);
  const bloqueMonto = campo('Monto', bloqueMoneda);
  const bloqueDonde = campo('Dónde', cComercio);
  const bloqueQue = campo('Qué', cQue);
  const bloqueCuenta = campo('Cuenta', cCuenta);
  const bloqueDestino = campo('A qué cuenta entra', cDestino);
  const bloqueCat = campo('Categoría', cCat);
  const bloqueCuotas = campo('Cuotas', cCuotas);
  const cambio = h('div.small.mut', { style: { lineHeight: '1.5', marginTop: '-6px' } });
  const bloqueTC = h('div', campo('Tipo de cambio', cTC), cambio);

  // ------------------------------------------------------- que se ve de cada
  const segTipo = h('div.seg', { role: 'tablist', style: { marginBottom: '18px' } },
    ...TIPOS.map(([v, txt]) => h('button', {
      role: 'tab', 'aria-selected': String(v === d.tipo),
      onclick: () => {
        d.tipo = v;
        segTipo.querySelectorAll('button').forEach((b, i) =>
          b.setAttribute('aria-selected', String(TIPOS[i][0] === v)));
        actualizar();
      }
    }, txt)));

  function actualizar() {
    const esMovida = d.tipo === 'transferencia';
    const esIngreso = d.tipo === 'ingreso';

    // En una movida la moneda no se elige: es la de la cuenta de donde sale.
    if (esMovida) { d.moneda = monedaDe(cCuenta.value); cMoneda.value = d.moneda; }
    cMoneda.disabled = esMovida;
    cMoneda.style.opacity = esMovida ? '.55' : '';

    // En una movida la plata no se gasta ni entra: cambia de lugar. "Cuánto
    // sale" hacía pensar en un gasto.
    bloqueMonto.querySelector('label').textContent =
      esMovida ? 'Importe' : esIngreso ? 'Cuánto entró' : 'Cuánto gastaste';
    bloqueDonde.hidden = esMovida;
    bloqueDonde.querySelector('label').textContent = esIngreso ? 'De quién' : 'Dónde';
    cComercio.placeholder = esIngreso ? 'Sueldo, cliente, venta…' : 'Coto, Shell, Dexter…';
    bloqueQue.querySelector('label').textContent =
      esIngreso ? 'Detalle' : esMovida ? 'Detalle (opcional)' : 'Qué';
    cQue.placeholder = esMovida ? 'Ahorro, pago de tarjeta…' : 'Opcional';
    bloqueCuenta.querySelector('label').textContent =
      esMovida ? 'De qué cuenta sale' : esIngreso ? 'En qué cuenta entró' : 'Con qué pagaste';
    bloqueDestino.hidden = !esMovida;
    bloqueCat.hidden = esMovida;

    const cuenta = cuentas.find(a => a.id === cCuenta.value);
    bloqueCuotas.hidden = d.tipo !== 'gasto' || !cuenta || cuenta.tipo !== 'credito';

    // El destino nunca puede ser la cuenta de origen: es la equivocacion mas
    // facil de cometer y la que deja el saldo intacto y la movida invisible.
    if (esMovida) {
      const antes = cDestino.value;
      cDestino.replaceChildren(...[{ value: '', label: 'Elegí una' },
        ...opcCuentas.filter(o => o.value !== cCuenta.value)]
        .map(o => h('option', { value: o.value, selected: o.value === antes }, o.label)));
    }
    bloqueTC.hidden = !esMovida || !cDestino.value ||
                      monedaDe(cDestino.value) === monedaDe(cCuenta.value);
    pintarCambio();

    pintarCategorias(cCat, esIngreso ? 'ingreso' : 'gasto', d.category_id);

    atajos.hidden = !nuevo || esMovida;
    if (!atajos.hidden) pintarAtajos();

    const t = caja()?.querySelector('.hoja-tope h2');
    if (t) t.textContent = TITULO[d.tipo][nuevo ? 'nuevo' : 'editar'];
  }

  /** Cuanto llega del otro lado con el cambio que se escribio. */
  function pintarCambio() {
    if (bloqueTC.hidden) { cambio.textContent = ''; return; }
    const monto = aNumero(cMonto.value), tc = aNumero(cTC.value);
    const destino = convertir(monto, tc, monedaDe(cCuenta.value), monedaDe(cDestino.value));
    cambio.textContent = destino
      ? `Entran ${plata(destino, monedaDe(cDestino.value))} a ${nombreDe('accounts', cDestino.value)}.`
      : 'Cuántos pesos vale un dólar. Con eso calculo cuánto entra del otro lado.';
  }

  const caja = () => cMonto.closest('.hoja');

  // Atajos: lo mas usado, para que cargar a mano no cueste
  const atajos = h('div.chips', { style: { flexWrap: 'wrap', marginBottom: '18px' } });
  function pintarAtajos() {
    atajos.replaceChildren();
    for (const c of frecuentes(d.tipo)) {
      atajos.append(h('button.pill.mut', { onclick: () => {
        cComercio.value = c.comercio;
        if (c.category_id) { d.category_id = c.category_id; }
        actualizar();
        cMonto.focus();
      } }, icono(iconoDe(c.comercio), 14), c.comercio));
    }
  }

  const cerrar = hoja(nuevo ? 'Nuevo gasto' : 'Editar', h('div',
    segTipo,
    atajos,
    bloqueMonto,
    bloqueDonde,
    bloqueQue,
    campo('Fecha', cFecha),
    bloqueCuenta,
    bloqueDestino, bloqueTC, bloqueCat, bloqueCuotas,
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
    const esMovida = d.tipo === 'transferencia';

    let monto_destino = null, moneda_destino = null;
    if (esMovida) {
      if (!cDestino.value) { cDestino.focus(); aviso('Falta a qué cuenta va'); return; }
      const mOrigen = monedaDe(cCuenta.value), mDestino = monedaDe(cDestino.value);
      if (mOrigen !== mDestino) {
        const convertido = convertir(monto, aNumero(cTC.value), mOrigen, mDestino);
        if (!convertido) { cTC.focus(); aviso('Falta el tipo de cambio'); return; }
        monto_destino = convertido;
        moneda_destino = mDestino;
      }
      d.moneda = mOrigen;
    }

    await guardar('transactions', {
      ...(tx || {}),
      fecha: cFecha.value || hoyISO(),
      descripcion: que || comercio ||
        (esMovida ? `De ${nombreDe('accounts', cCuenta.value)} a ${nombreDe('accounts', cDestino.value)}`
                  : d.tipo === 'ingreso' ? 'Ingreso' : 'Movimiento'),
      comercio: esMovida ? null : (comercio || null),
      monto, moneda: d.moneda, tipo: d.tipo,
      account_id: cCuenta.value,
      destino_account_id: esMovida ? cDestino.value : null,
      monto_destino, moneda_destino,
      category_id: esMovida ? null : (d.category_id || cCat.value || null),
      cuotas: bloqueCuotas.hidden ? 1 : Math.max(1, Number(cCuotas.value) || 1),
      fuente: tx?.fuente || 'manual',
      revisado: true
    });
    cerrar();
    aviso(nuevo ? 'Guardado' : 'Actualizado');
  }

  setTimeout(() => cMonto.focus(), 120);
}

/**
 * Cuanto llega del otro lado. El tipo de cambio siempre son pesos por dolar,
 * asi que la direccion la decide la moneda de cada cuenta y no quien carga.
 */
function convertir(monto, tc, de, a) {
  if (!monto || !tc || de === a) return null;
  const v = de === 'ARS' ? monto / tc : monto * tc;
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}

/** El cambio con el que se cargo la movida, para poder corregirla. */
function tcGuardado(tx) {
  if (!tx || !tx.monto_destino || !tx.moneda_destino || tx.moneda_destino === tx.moneda) return '';
  const [a, b] = [Number(tx.monto), Number(tx.monto_destino)];
  if (!a || !b) return '';
  return String(Math.round((tx.moneda === 'ARS' ? a / b : b / a) * 100) / 100);
}

const cuentaPorDefecto = () => {
  const efe = state.accounts.find(a => a.tipo === 'efectivo' && a.moneda === 'ARS');
  return (efe || state.accounts[0] || {}).id || '';
};

/** Los cinco lugares que mas repetis para ese tipo, para cargar de dos taps. */
function frecuentes(tipo) {
  const cuenta = new Map();
  for (const t of state.transactions) {
    if (t.tipo !== tipo) continue;
    const k = t.comercio || (tipo === 'ingreso' ? t.descripcion : null);
    if (!k) continue;
    const v = cuenta.get(k) || { comercio: k, n: 0, category_id: t.category_id };
    v.n++; cuenta.set(k, v);
  }
  return [...cuenta.values()].sort((a, b) => b.n - a.n).slice(0, 5);
}
