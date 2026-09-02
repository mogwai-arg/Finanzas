// =====================================================================
// vistas/formularios.js — alta y edicion de todo lo que no es un movimiento:
// cuentas y tarjetas, gastos fijos, presupuestos, promos y categorias.
// =====================================================================
import { h, icono, iconoDe, hoja, aviso, campo, select, confirmar, selectorDeDia } from '../ui.js';
import { state, guardar, borrar } from '../db.js';
import * as F from '../finance.js';
import { plata, periodoLargo, hoyISO, nombreDe, etiquetaCuenta } from '../formato.js';

const num = v => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;

const DIAS = [['1','lun'],['2','mar'],['3','mié'],['4','jue'],['5','vie'],['6','sáb'],['0','dom']];

// =====================================================================
// CUENTAS Y TARJETAS
// =====================================================================
const TIPOS = [
  { value: 'credito',   label: 'Tarjeta de crédito' },
  { value: 'debito',    label: 'Tarjeta de débito' },
  { value: 'cuenta',    label: 'Cuenta bancaria' },
  { value: 'billetera', label: 'Billetera virtual' },
  { value: 'efectivo',  label: 'Efectivo' }
];

export function formCuenta(a = null) {
  const nuevo = !a;
  let ciclos = (a?.ciclos || []).map(c => ({ ...c }));

  const c = {
    nombre: h('input', { type: 'text', value: a?.nombre || '', placeholder: 'Galicia Visa' }),
    tipo: select(TIPOS, { value: a?.tipo || 'credito' }),
    moneda: select([{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }],
                   { value: a?.moneda || 'ARS' }),
    banco: h('input', { type: 'text', value: a?.banco || '', placeholder: 'Galicia' }),
    marca: select([{ value: '', label: '—' }, { value: 'visa', label: 'Visa' },
                   { value: 'mastercard', label: 'Mastercard' }, { value: 'amex', label: 'Amex' }],
                  { value: a?.marca || '' }),
    ultimos4: h('input', { type: 'text', inputmode: 'numeric', maxlength: '4',
                           value: a?.ultimos4 || '', placeholder: '9817' }),
    limite: h('input', { type: 'text', inputmode: 'decimal',
                         value: a?.limite ? String(a.limite) : '' }),
    cierre: selectorDeDia(a?.cierre_dia, { titulo: '¿Qué día cierra?' }),
    venc: selectorDeDia(a?.vencimiento_dia, { titulo: '¿Qué día vence?' }),
    saldo: h('input', { type: 'text', inputmode: 'decimal',
                        value: a?.saldo_inicial ? String(a.saldo_inicial) : '' }),
    saldoAl: h('input', { type: 'date', value: a?.saldo_al || hoyISO() })
  };

  // ---- ciclos leidos del resumen
  const filas = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '9px' } });
  function pintarCiclos() {
    filas.replaceChildren();
    ciclos.sort((x, y) => (x.cierre || '') < (y.cierre || '') ? -1 : 1);
    if (!ciclos.length) {
      filas.append(h('div.small.mut', { style: { padding: '2px 0' } },
        'Ninguno cargado. Sin esto se calcula con el día fijo de arriba.'));
    }
    ciclos.forEach((ci, i) => {
      filas.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        h('input', { type: 'date', value: ci.cierre || '', 'aria-label': 'Cierre',
                     onchange: e => { ci.cierre = e.target.value; } }),
        h('span.small.mut', { style: { flex: 'none' } }, '→'),
        h('input', { type: 'date', value: ci.vence || '', 'aria-label': 'Vencimiento',
                     onchange: e => { ci.vence = e.target.value; } }),
        h('button.iconbtn', { 'aria-label': 'Quitar', style: { flex: '0 0 40px', width: '40px' },
          onclick: () => { ciclos.splice(i, 1); pintarCiclos(); } }, icono('cerrar', 16))));
    });
  }
  pintarCiclos();

  const bloqueCredito = h('div');
  const bloqueSaldo = h('div');

  function actualizar() {
    const esCredito = c.tipo.value === 'credito';
    bloqueCredito.hidden = !esCredito;
    // El saldo inicial no aplica a una tarjeta de crédito: lo que hay ahí es
    // deuda, y sale del cronograma de cuotas, no de un número cargado a mano.
    bloqueSaldo.hidden = esCredito;
  }
  c.tipo.addEventListener('change', actualizar);

  bloqueCredito.append(
    h('div.fila', campo('Marca', c.marca), campo('Últimos 4', c.ultimos4)),
    campo('Límite', c.limite),
    h('div.fila', campo('Día de cierre', c.cierre), campo('Día de vencimiento', c.venc)),
    h('div.small.mut', { style: { marginTop: '-12px', marginBottom: '16px', lineHeight: '1.45' } },
      'El día del mes en que cierra el resumen y el día en que se paga.'),
    h('div.f',
      h('label', 'Fechas del resumen'),
      h('div.small.mut', { style: { marginTop: '-3px', marginBottom: '10px', lineHeight: '1.45' } },
        'En Galicia el cierre no cae un día fijo: en agosto de 2026 fueron 30-jul, 27-ago y ',
        '1-oct. Cada resumen publica seis fechas, incluido el ciclo que viene. Cargalas acá y ',
        'mandan sobre el día fijo.'),
      filas,
      h('button.btn.sec', { style: { marginTop: '10px' },
        onclick: () => { ciclos.push({ cierre: '', vence: '' }); pintarCiclos(); } },
        icono('mas', 16), 'Agregar un ciclo'))
  );

  bloqueSaldo.append(h('div.f',
    h('label', 'Saldo de hoy'), c.saldo,
    h('div.small.mut', { style: { marginTop: '6px', lineHeight: '1.45' } },
      'El que ves ahora en el banco o en la billetera. Los movimientos anteriores a la fecha ',
      'de abajo no se vuelven a sumar: ya están adentro de este número.')),
    campo('Ese saldo es del', c.saldoAl));

  actualizar();

  const cerrar = hoja(nuevo ? 'Nueva cuenta' : 'Editar cuenta', h('div',
    campo('Nombre', c.nombre),
    h('div.fila', campo('Tipo', c.tipo), campo('Moneda', c.moneda)),
    campo('Banco o emisor', c.banco),
    bloqueCredito, bloqueSaldo,
    h('div.fila', { style: { marginTop: '4px' } },
      !nuevo && h('button.btn.dg', { onclick: async () => {
        if (await confirmar(`¿Borrar "${a.nombre}"? Los movimientos quedan sin cuenta.`)) {
          await borrar('accounts', a.id); cerrar(); aviso('Borrada');
        }
      } }, 'Borrar'),
      h('button.btn', { onclick: async () => {
        if (!c.nombre.value.trim()) { c.nombre.focus(); aviso('Falta el nombre'); return; }
        const esCredito = c.tipo.value === 'credito';
        if (esCredito) {
          const conCiclos = ciclos.some(x => x.cierre && x.vence);
          // Sin cierre no hay con que armar el resumen, y la tarjeta termina
          // mostrando cero aunque tenga consumos.
          if (!conCiclos && !c.cierre.value.trim()) {
            c.cierre.focus(); aviso('Falta el día de cierre, o las fechas del resumen'); return;
          }
          for (const [campoDia, rot] of [[c.cierre, 'cierre'], [c.venc, 'vencimiento']]) {
            if (!campoDia.value.trim()) continue;
            if (!F.diaDelMes(campoDia.value)) {
              campoDia.focus();
              aviso(`El día de ${rot} va del 1 al 31, no ${campoDia.value}`);
              return;
            }
          }
        }
        await guardar('accounts', { ...(a || {}),
          nombre: c.nombre.value.trim(), tipo: c.tipo.value, moneda: c.moneda.value,
          banco: c.banco.value.trim() || null,
          marca: esCredito ? (c.marca.value || null) : null,
          ultimos4: esCredito ? (c.ultimos4.value.trim() || null) : null,
          limite: esCredito ? (num(c.limite.value) || null) : null,
          cierre_dia: esCredito ? (Number(c.cierre.value) || null) : null,
          vencimiento_dia: esCredito ? (Number(c.venc.value) || null) : null,
          ciclos: esCredito ? ciclos.filter(x => x.cierre && x.vence) : [],
          saldo_inicial: esCredito ? 0 : num(c.saldo.value),
          saldo_al: esCredito ? null : (c.saldoAl.value || hoyISO()),
          activo: true, orden: a?.orden ?? (state.accounts.length + 1) });
        cerrar(); aviso(nuevo ? 'Cuenta creada' : 'Actualizada');
      } }, nuevo ? 'Guardar' : 'Guardar cambios'))));
}

// =====================================================================
// GASTOS FIJOS
// =====================================================================
export function formRecurrente(r = null) {
  const nuevo = !r;
  const cuentas = state.accounts.filter(x => x.activo !== false);
  const c = {
    nombre: h('input', { type: 'text', value: r?.nombre || '', placeholder: 'Colegio' }),
    monto: h('input', { type: 'text', inputmode: 'decimal',
                        value: r?.monto_estimado ? String(r.monto_estimado) : '' }),
    moneda: select([{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }],
                   { value: r?.moneda || 'ARS' }),
    dia: selectorDeDia(r?.dia_vencimiento || 10, { titulo: '¿Qué día vence?' }),
    cat: select([{ value: '', label: 'Sin categoría' },
      ...state.categories.filter(x => x.tipo === 'gasto').map(x => ({ value: x.id, label: x.nombre }))],
      { value: r?.category_id || '' }),
    cuenta: select([{ value: '', label: '—' }, ...cuentas.map(x => ({ value: x.id, label: etiquetaCuenta(x) }))],
                   { value: r?.account_id || '' })
  };
  const cVar = h('input', { type: 'checkbox', checked: !!r?.variable });

  const cerrar = hoja(nuevo ? 'Nuevo gasto fijo' : 'Editar gasto fijo', h('div',
    campo('Nombre', c.nombre),
    h('div.fila', campo('Monto', c.monto), campo('Moneda', c.moneda)),
    campo('Vence el día', c.dia),
    campo('Categoría', c.cat),
    campo('Se paga con', c.cuenta),
    h('div.f', h('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } },
      cVar, h('span', { style: { fontSize: '14.5px', color: 'var(--tx)' } }, 'El monto cambia cada mes')),
      h('div.small.mut', { style: { lineHeight: '1.45' } },
        'La luz, el gas, el agua. Marcado, al pagarlo te pregunta cuánto fue.')),
    h('div.fila', { style: { marginTop: '4px' } },
      !nuevo && h('button.btn.dg', { onclick: async () => {
        if (await confirmar(`¿Borrar "${r.nombre}"?`)) { await borrar('recurrings', r.id); cerrar(); aviso('Borrado'); }
      } }, 'Borrar'),
      h('button.btn', { onclick: async () => {
        if (!c.nombre.value.trim()) { c.nombre.focus(); aviso('Falta el nombre'); return; }
        await guardar('recurrings', { ...(r || {}),
          nombre: c.nombre.value.trim(), monto_estimado: num(c.monto.value),
          moneda: c.moneda.value, dia_vencimiento: Number(c.dia.value) || 10,
          category_id: c.cat.value || null, account_id: c.cuenta.value || null,
          variable: cVar.checked, activo: true, orden: r?.orden ?? (state.recurrings.length + 1) });
        cerrar(); aviso(nuevo ? 'Gasto fijo creado' : 'Actualizado');
      } }, nuevo ? 'Guardar' : 'Guardar cambios'))));
}

// =====================================================================
// PRESUPUESTO
// =====================================================================
export function formPresupuesto(periodo = hoyISO().slice(0, 7)) {
  const cats = state.categories.filter(c => c.tipo === 'gasto');
  const actuales = new Map(state.budgets.filter(b => b.periodo === periodo)
                                        .map(b => [b.category_id, b]));
  const campos = new Map();

  const cuerpo = h('div',
    h('div.small.mut', { style: { marginBottom: '18px', lineHeight: '1.5' } },
      `Topes de ${periodoLargo(periodo)}. Dejá en blanco las categorías que no querés seguir: `,
      'un presupuesto con diez renglones que no mirás es peor que uno con tres.'),
    ...cats.map(cat => {
      const b = actuales.get(cat.id);
      const inp = h('input', { type: 'text', inputmode: 'decimal',
                               value: b ? String(b.monto) : '', placeholder: '0' });
      campos.set(cat.id, inp);
      return h('div.f', { style: { marginBottom: '13px' } },
        h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          icono(iconoDe(cat.nombre), 15), cat.nombre), inp);
    }),
    h('button.btn', { style: { marginTop: '4px' }, onclick: async () => {
      let n = 0;
      for (const [catId, inp] of campos) {
        const monto = num(inp.value);
        const b = actuales.get(catId);
        if (monto > 0) { await guardar('budgets', { ...(b || {}), periodo, category_id: catId,
                                                    monto, moneda: 'ARS' }); n++; }
        else if (b) await borrar('budgets', b.id);
      }
      cerrar(); aviso(n ? `${n} topes guardados` : 'Presupuesto vacío');
    } }, 'Guardar'));

  const cerrar = hoja('Presupuesto', cuerpo);
}

// =====================================================================
// PROMOS
// =====================================================================
export function formPromo(p = null) {
  const nuevo = !p;
  let dias = (p?.dias || []).map(String);

  const c = {
    titulo: h('input', { type: 'text', value: p?.titulo || '', placeholder: 'Súper los martes' }),
    comercio: h('input', { type: 'text', value: p?.comercio || '', placeholder: 'Coto' }),
    // Reintegro y descuento no son lo mismo y la app los ordena distinto:
    // el reintegro vuelve a la cuenta, el descuento solo baja esa compra.
    tipo: select([{ value: 'reintegro', label: 'Reintegro' },
                  { value: 'descuento', label: 'Descuento' },
                  { value: 'cuotas', label: 'Cuotas sin interés' }],
                 { value: p?.tipo || 'reintegro' }),
    emisor: select([{ value: 'galicia', label: 'Galicia' }, { value: 'modo', label: 'MODO' },
                    { value: 'mercadopago', label: 'Mercado Pago' },
                    { value: 'personalpay', label: 'Personal Pay' },
                    { value: 'otro', label: 'Otro' }],
                   { value: p?.emisor || 'galicia' }),
    valor: h('input', { type: 'text', inputmode: 'decimal', value: p ? String(p.valor) : '',
                        placeholder: '25' }),
    tope: h('input', { type: 'text', inputmode: 'decimal', value: p?.tope ? String(p.tope) : '',
                       placeholder: '20000' }),
    medio: h('input', { type: 'text', value: p?.medio_pago || '', placeholder: 'Galicia Visa' }),
    rubro: select([['supermercado','Supermercado'],['combustible','Combustible'],
                   ['gastronomia','Gastronomía'],['salud','Farmacia y salud'],
                   ['indumentaria','Indumentaria'],['hogar','Hogar'],['otros','Otros']]
                  .map(([value, label]) => ({ value, label })), { value: p?.rubro || 'supermercado' }),
    osm: select([{ value: '', label: 'No buscar sucursales' },
                 { value: 'shop=supermarket', label: 'Supermercados' },
                 { value: 'amenity=fuel', label: 'Estaciones de servicio' },
                 { value: 'amenity=pharmacy', label: 'Farmacias' },
                 { value: 'amenity=restaurant', label: 'Restaurantes' }],
                { value: p?.osm_filtro || '' }),
    hasta: h('input', { type: 'date', value: p?.vigencia_hasta || '' }),
    url: h('input', { type: 'url', value: p?.url || '', placeholder: 'https://…' }),
    notas: h('input', { type: 'text', value: p?.notas || '',
                        placeholder: 'Solo Eminent, tope por cuenta' })
  };
  const cFavorita = h('input', { type: 'checkbox', checked: !!p?.favorita });

  const chips = h('div.chips', { style: { flexWrap: 'wrap' } });
  const pintarDias = () => {
    chips.replaceChildren();
    for (const [v, txt] of DIAS) {
      chips.append(h('button.pill.mut', { 'aria-pressed': String(dias.includes(v)),
        onclick: () => { dias = dias.includes(v) ? dias.filter(x => x !== v) : [...dias, v];
                         pintarDias(); } }, txt));
    }
  };
  pintarDias();

  const cerrar = hoja(nuevo ? 'Nueva promo' : 'Editar promo', h('div',
    campo('Nombre', c.titulo),
    campo('Comercio', c.comercio),
    h('div.fila', campo('Tipo', c.tipo), campo('Quién la da', c.emisor)),
    h('div.fila', campo('Porcentaje', c.valor), campo('Tope por mes', c.tope)),
    h('div.f', h('label', 'Con qué se paga'), c.medio,
      h('div.small.mut', { style: { marginTop: '6px', lineHeight: '1.45' } },
        'Tal como figura en la promo: "Galicia Visa", "MODO". Con esto la app sabe cuál de tus ',
        'tarjetas aplica cuando comparás en "¿Con qué pago?".')),
    h('div.f', h('label', 'Días que aplica'),
      h('div.small.mut', { style: { marginTop: '-3px', marginBottom: '9px' } },
        'Ninguno marcado = todos los días.'), chips),
    campo('Rubro', c.rubro),
    campo('Buscar sucursales cerca', c.osm),
    campo('Vence el', c.hasta),
    campo('Link a la promo', c.url),
    campo('Notas', c.notas),
    h('label.li', { style: { padding: '11px 0' } },
      h('div.m', h('div.t', 'Marcarla como preferida'),
        h('div.s', 'Va primero en la lista y en "¿Con qué pago?"')),
      cFavorita),

    h('div.fila', { style: { marginTop: '4px' } },
      !nuevo && h('button.btn.dg', { onclick: async () => {
        if (await confirmar(`¿Borrar "${p.titulo}"?`)) { await borrar('promos', p.id); cerrar(); aviso('Borrada'); }
      } }, 'Borrar'),
      h('button.btn', { onclick: async () => {
        if (!c.titulo.value.trim()) { c.titulo.focus(); aviso('Falta el nombre'); return; }
        const comercio = c.comercio.value.trim() || c.titulo.value.trim();
        await guardar('promos', { ...(p || {}),
          titulo: c.titulo.value.trim(), comercio,
          valor: num(c.valor.value), tope: num(c.tope.value) || null,
          tope_periodo: 'mensual', medio_pago: c.medio.value.trim() || null,
          rubro: c.rubro.value, tipo: c.tipo.value, emisor: c.emisor.value, canal: 'ambos',
          dias: dias.map(Number).sort(), osm_filtro: c.osm.value || null,
          marcas: [comercio], vigencia_hasta: c.hasta.value || null,
          url: c.url.value.trim() || null, notas: c.notas.value.trim() || null,
          activa: true, favorita: cFavorita.checked });
        cerrar(); aviso(nuevo ? 'Promo creada' : 'Actualizada');
      } }, nuevo ? 'Guardar' : 'Guardar cambios'))));
}

// =====================================================================
// CATEGORIAS
// =====================================================================
export function formCategorias() {
  const lista = h('div.grp');
  const pintar = () => {
    lista.replaceChildren(...state.categories
      .slice().sort((a, b) => (a.tipo === b.tipo ? (a.orden || 0) - (b.orden || 0)
                                                 : a.tipo === 'gasto' ? -1 : 1))
      .map(c => h('button.li', { onclick: () => editar(c) },
        h('div.av', icono(iconoDe(c.nombre), 17)),
        h('div.m', h('div.t', c.nombre),
          h('div.s', c.tipo === 'ingreso' ? 'ingreso' : 'gasto')),
        h('span.chev', icono('chev', 15)))));
  };
  const editar = (cat = null) => {
    const nom = h('input', { type: 'text', value: cat?.nombre || '', placeholder: 'Mascotas' });
    const tipo = select([{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }],
                        { value: cat?.tipo || 'gasto' });
    const cerrar2 = hoja(cat ? 'Editar categoría' : 'Nueva categoría', h('div',
      campo('Nombre', nom), campo('Tipo', tipo),
      h('div.fila', { style: { marginTop: '4px' } },
        cat && h('button.btn.dg', { onclick: async () => {
          if (await confirmar(`¿Borrar "${cat.nombre}"? Los movimientos quedan sin categoría.`)) {
            await borrar('categories', cat.id); cerrar2(); pintar();
          }
        } }, 'Borrar'),
        h('button.btn', { onclick: async () => {
          if (!nom.value.trim()) { nom.focus(); return; }
          await guardar('categories', { ...(cat || {}), nombre: nom.value.trim(),
            tipo: tipo.value, orden: cat?.orden ?? (state.categories.length + 1) });
          cerrar2(); pintar(); aviso('Guardada');
        } }, 'Guardar'))));
  };
  pintar();
  hoja('Categorías', h('div', lista,
    h('button.btn.sec', { style: { marginTop: '14px' }, onclick: () => editar() },
      icono('mas', 16), 'Nueva categoría')));
}
