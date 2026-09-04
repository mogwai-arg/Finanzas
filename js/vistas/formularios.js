// =====================================================================
// vistas/formularios.js — alta y edicion de todo lo que no es un movimiento:
// cuentas y tarjetas, gastos fijos, presupuestos, promos y categorias.
// =====================================================================
import { h, icono, iconoDe, iconoDeCategoria, selectorDeIcono, hoja, aviso, campo,
         select, confirmar, selectorDeDia } from '../ui.js';
import { state, guardar, borrar } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, periodoLargo, hoyISO, nombreDe, etiquetaCuenta,
         aNumero as num } from '../formato.js';


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
    saldoAl: h('input', { type: 'date', value: a?.saldo_al || hoyISO() }),
    tna: h('input', { type: 'text', inputmode: 'decimal', placeholder: '32',
                      value: a?.tna != null ? String(a.tna) : '' })
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
    campo('Ese saldo es del', c.saldoAl),
    h('div.f',
      h('label', 'Rinde al año (%)'), c.tna,
      h('div.small.mut', { style: { marginTop: '6px', lineHeight: '1.45' } },
        'Mercado Pago, Personal Pay y el FIMA de Galicia pagan todos los días sobre el ',
        'saldo. Poné la tasa nominal anual: 32 quiere decir 32 %. Vacío = no rinde.',
        a?.tna_al ? h('div', { style: { marginTop: '5px' } },
          `Cargada el ${a.tna_al}. Cambian seguido: si está vieja, el cálculo miente.`) : null)));

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
          tna: esCredito ? null : (num(c.tna.value) || null),
          // La fecha se pone sola y solo cuando la tasa cambia: es lo que
          // permite avisar que está vieja en vez de seguir calculando con un
          // número de hace tres meses como si fuera de hoy.
          tna_al: esCredito ? null
                : (num(c.tna.value) || null) == null ? null
                : (num(c.tna.value) === Number(a?.tna) ? (a?.tna_al || hoyISO()) : hoyISO()),
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
    cat: select(opcionesCategoria('gasto'), { value: r?.category_id || '' }),
    cuenta: select([{ value: '', label: '—' }, ...cuentas.map(x => ({ value: x.id, label: etiquetaCuenta(x) }))],
                   { value: r?.account_id || '' })
  };
  conectarCategoria(c.cat, () => 'gasto');
  const cVar = h('input', { type: 'checkbox', checked: !!r?.variable });
  // Débito automático o pago a mano: no es lo mismo y la app hace cosas
  // distintas con cada uno.
  const cAuto = h('input', { type: 'checkbox', checked: !!r?.debito_automatico,
                             onchange: () => pintarNota() });
  const notaAuto = h('div.small.mut', { style: { lineHeight: '1.5', marginTop: '9px' } });
  const pintarNota = () => {
    const cta = cuentas.find(x => x.id === c.cuenta.value);
    const enTarjeta = cta && cta.tipo === 'credito';
    notaAuto.textContent = !cAuto.checked
      ? 'Lo pagás vos: aparece en "Lo que se viene" hasta que lo tildes, y con qué lo pagás lo elegís ese día.'
      : enTarjeta
        ? `Cae solo en ${cta.nombre}: no aparece como algo a pagar, se prevé en el resumen de esa tarjeta y sale cuando pagás el resumen.`
        : 'Cae solo el día que vence: no hay nada que hacer, pero la plata tiene que estar.';
  };
  c.cuenta.addEventListener('change', pintarNota);
  pintarNota();

  const cerrar = hoja(nuevo ? 'Nuevo gasto fijo' : 'Editar gasto fijo', h('div',
    campo('Nombre', c.nombre),
    h('div.fila', campo('Monto', c.monto), campo('Moneda', c.moneda)),
    campo('Vence el día', c.dia),
    campo('Categoría', c.cat),
    campo('Se paga con', c.cuenta),
    h('div.f', h('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } },
      cAuto, h('span', { style: { fontSize: '14.5px', color: 'var(--tx)' } }, 'Se debita solo')),
      notaAuto),
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
          debito_automatico: cAuto.checked,
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

  // Con cuánto se cuenta: lo que entró este mes, y si todavía no entró nada,
  // lo del mes pasado, avisando que es una referencia y no un dato.
  const entro = F.resumenMes(state.transactions, periodo, 'ARS').ingresos;
  const antes = F.resumenMes(state.transactions, F.mesAnterior(periodo), 'ARS').ingresos;
  const cuento = entro > 0 ? entro : antes;
  const estimado = entro <= 0 && antes > 0;

  const fijos = F.recurrentesDelMes(state.recurrings, state.recurring_payments, periodo)
    .filter(r => r.moneda !== 'USD')
    .reduce((s, r) => s + Number(r.valor || 0), 0);

  const { simbolo, numero } = plataPartida(Math.round(cuento), 'ARS');
  const repartido = h('span', { class: 'tabnum' }, plata(0));
  const sinRepartir = h('span', { class: 'tabnum' }, plata(0));
  // El rótulo cambia con el signo: "sin repartir $1.900.000" cuando en
  // realidad te pasaste por esa plata se lee al revés de lo que pasa.
  const rotulo = h('span.small.mut', 'Sin repartir');
  const nota = h('div.small.mut', { style: { lineHeight: '1.5', marginTop: '9px' } });

  /** Lo repartido y lo que queda, mientras se escribe: repartir es restar. */
  const recalcular = () => {
    let suma = 0;
    for (const inp of campos.values()) suma += num(inp.value) || 0;
    const queda = Math.round(cuento - suma);
    repartido.textContent = plata(Math.round(suma));
    sinRepartir.textContent = plata(Math.abs(queda));
    sinRepartir.style.color = queda < 0 ? 'var(--amb)' : 'var(--tx)';
    rotulo.textContent = queda < 0 ? 'De más' : 'Sin repartir';
    nota.replaceChildren(queda < 0
      ? `Estás repartiendo ${plata(Math.abs(queda))} más de lo que entra.`
      : cuento > 0 ? `Te queda ${plata(queda)} sin asignar.` : '');
  };

  const cabecera = h('div.grp.pad', { style: { marginBottom: '18px' } },
    h('div.cifra', h('em', simbolo), numero),
    h('div.small.mut', { style: { marginTop: '5px' } },
      cuento <= 0 ? 'todavía no hay ingresos cargados'
      : estimado ? `entraron en ${periodoLargo(F.mesAnterior(periodo))} · sirve de referencia`
                 : `entraron en ${periodoLargo(periodo)}`),

    cuento > 0 && h('div', { style: { marginTop: '13px', paddingTop: '13px',
                                      borderTop: '1px solid var(--line)', fontSize: '13.5px' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
        h('span.small.mut', 'Repartido en topes'), repartido),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px',
                          marginTop: '5px' } },
        rotulo, sinRepartir),
      nota),

    fijos > 0 && h('div.small.mut', { style: { marginTop: '11px', lineHeight: '1.5',
                                               color: 'var(--tx3)' } },
      `Ojo que tus gastos fijos de este mes suman ${plata(Math.round(fijos))}. `,
      'Los que tengan categoría entran acá adentro, no aparte.'));

  // Un tope por cuenta contesta otra pregunta: no "cuánto puedo gastar en
  // comida" sino "cuánto quiero que me venga la Visa". Con las tarjetas es la
  // forma en que uno se pone el límite de verdad.
  const cuentas = state.accounts.filter(a => a.activo !== false && a.tipo === 'credito');
  const porCuenta = new Map(state.budgets.filter(b => b.periodo === periodo && b.account_id)
                                         .map(b => [b.account_id, b]));
  const camposCuenta = new Map();
  const ahorros = new Map(state.budgets.filter(b => b.periodo === periodo && b.clase === 'ahorro')
                                       .map(b => [b.moneda || 'ARS', b]));
  const camposAhorro = new Map();

  const campo1 = (etiqueta, ic, inp) => h('div.f', { style: { marginBottom: '13px' } },
    h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      ic ? icono(ic, 15) : null, etiqueta), inp);

  const cuerpo = h('div',
    cabecera,
    h('div.small.mut', { style: { marginBottom: '18px', lineHeight: '1.5' } },
      `Topes de ${periodoLargo(periodo)}. Dejá en blanco lo que no quieras seguir: `,
      'un presupuesto con diez renglones que no mirás es peor que uno con tres.'),

    h('div.ghead', { style: { margin: '0 0 11px' } }, 'Por categoría'),
    ...cats.map(cat => {
      const b = actuales.get(cat.id);
      const inp = h('input', { type: 'text', inputmode: 'decimal',
                               value: b ? String(b.monto) : '', placeholder: '0',
                               oninput: recalcular });
      campos.set(cat.id, inp);
      return campo1(cat.nombre, iconoDeCategoria(cat), inp);
    }),

    cuentas.length ? h('div', h('div.ghead', { style: { margin: '18px 0 4px' } }, 'Tope por tarjeta'),
      h('div.small.mut', { style: { marginBottom: '11px', lineHeight: '1.5' } },
        'Cuánto querés que venga cada resumen. No se suma a lo de arriba: es la ',
        'misma plata mirada por otro lado.'),
      ...cuentas.map(a => {
        const b = porCuenta.get(a.id);
        const inp = h('input', { type: 'text', inputmode: 'decimal',
                                 value: b ? String(b.monto) : '', placeholder: '0' });
        camposCuenta.set(a.id, inp);
        return campo1(etiquetaCuenta(a), 'tarjeta', inp);
      })) : null,

    h('div', h('div.ghead', { style: { margin: '18px 0 4px' } }, 'Ideal de ahorro'),
      h('div.small.mut', { style: { marginBottom: '11px', lineHeight: '1.5' } },
        'Lo que te gustaría que sobre a fin de mes. Ahorrado es lo que entró ',
        'menos lo que salió: no hace falta moverlo a otra cuenta para que cuente.'),
      ...['ARS', 'USD'].map(m => {
        const b = ahorros.get(m);
        const inp = h('input', { type: 'text', inputmode: 'decimal',
                                 value: b ? String(b.monto) : '', placeholder: '0' });
        camposAhorro.set(m, inp);
        return campo1(m === 'ARS' ? 'En pesos' : 'En dólares',
                      m === 'ARS' ? 'billete' : 'monedas', inp);
      })),

    h('button.btn', { style: { marginTop: '4px' }, onclick: async () => {
      let n = 0;
      const poner = async (viejo, fila) => {
        if (fila.monto > 0) { await guardar('budgets', { ...(viejo || {}), periodo, ...fila }); n++; }
        else if (viejo) await borrar('budgets', viejo.id);
      };
      for (const [catId, inp] of campos)
        await poner(actuales.get(catId), { category_id: catId, account_id: null,
                                           clase: 'categoria', monto: num(inp.value), moneda: 'ARS' });
      for (const [cuentaId, inp] of camposCuenta) {
        const cta = cuentas.find(a => a.id === cuentaId);
        await poner(porCuenta.get(cuentaId), { account_id: cuentaId, category_id: null,
          clase: 'cuenta', monto: num(inp.value), moneda: cta?.moneda || 'ARS' });
      }
      for (const [moneda, inp] of camposAhorro)
        await poner(ahorros.get(moneda), { category_id: null, account_id: null,
                                           clase: 'ahorro', monto: num(inp.value), moneda });
      cerrar(); aviso(n ? `${n} topes guardados` : 'Presupuesto vacío');
    } }, 'Guardar'));

  recalcular();
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
    desde: h('input', { type: 'date', value: p?.vigencia_desde || '' }),
    hasta: h('input', { type: 'date', value: p?.vigencia_hasta || '' }),
    url: h('input', { type: 'url', value: p?.url || '', placeholder: 'https://…' }),
    notas: h('input', { type: 'text', value: p?.notas || '',
                        placeholder: 'Solo Eminent, tope por cuenta' })
  };
  const cFavorita = h('input', { type: 'checkbox', checked: !!p?.favorita });
  const cRecordar = h('input', { type: 'checkbox', checked: !!p?.recordar });

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
    h('div.f', h('label', 'Desde y hasta'),
      h('div.small.mut', { style: { marginTop: '-3px', marginBottom: '9px', lineHeight: '1.45' } },
        'Si la promo es de un solo día —las de combustible suelen serlo— poné la misma ',
        'fecha en las dos. Vacío = siempre.'),
      h('div.fila', c.desde, c.hasta)),
    campo('Link a la promo', c.url),
    campo('Notas', c.notas),
    h('label.li', { style: { padding: '11px 0' } },
      h('div.m', h('div.t', 'Marcarla como preferida'),
        h('div.s', 'Va primero en la lista y en "¿Con qué pago?"')),
      cFavorita),
    h('label.li', { style: { padding: '11px 0' } },
      h('div.m', h('div.t', 'Recordármela'),
        h('div.s', 'Aparece en Hoy desde unos días antes y el día que cae')),
      cRecordar),

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
          dias: dias.map(Number).sort(),
          marcas: [comercio],
          vigencia_desde: c.desde.value || null, vigencia_hasta: c.hasta.value || null,
          url: c.url.value.trim() || null, notas: c.notas.value.trim() || null,
          activa: true, favorita: cFavorita.checked, recordar: cRecordar.checked });
        cerrar(); aviso(nuevo ? 'Promo creada' : 'Actualizada');
      } }, nuevo ? 'Guardar' : 'Guardar cambios'))));
}

// =====================================================================
// CATEGORIAS
// =====================================================================

/**
 * Crear una categoría sin salir de donde estabas.
 *
 * Cargando un gasto uno descubre que le falta "Mascotas", y mandarlo a
 * Ajustes es perder el gasto a medio cargar. Devuelve la categoría creada, o
 * null si cerró sin guardar.
 */
export function nuevaCategoriaRapida(tipo = 'gasto') {
  return new Promise(resolve => {
    let hecha = null, ic = null;
    const nom = h('input', { type: 'text', placeholder: 'Mascotas' });
    const cerrar = hoja('Nueva categoría', h('div',
      campo('Nombre', nom),
      h('div.f', h('label', 'Ícono'),
        h('div.small.mut', { style: { marginTop: '-3px', marginBottom: '9px' } },
          'El primero lo elige solo, según el nombre.'),
        selectorDeIcono(null, { alElegir: v => ic = v })),
      h('button.btn', { style: { marginTop: '4px' }, onclick: async () => {
        const nombre = nom.value.trim();
        if (!nombre) { nom.focus(); aviso('Falta el nombre'); return; }
        hecha = await guardar('categories', {
          nombre, tipo, icono: ic, orden: state.categories.length + 1 });
        cerrar();
        aviso('Categoría creada');
      } }, 'Crear')), { onClose: () => resolve(hecha) });
    setTimeout(() => nom.focus(), 120);
  });
}

const NUEVA = '__nueva__';

/** Las categorías de ese tipo, más la opción de crear una ahí mismo. */
export const opcionesCategoria = tipo => [
  { value: '', label: 'Sin categoría' },
  ...state.categories.filter(c => c.tipo === tipo).map(c => ({ value: c.id, label: c.nombre })),
  { value: NUEVA, label: '+ Crear una categoría…' }
];

/** Vuelve a armar las opciones de un select de categoría, dejando `valor` elegido. */
export function pintarCategorias(sel, tipo, valor) {
  sel.replaceChildren(...opcionesCategoria(tipo).map(o =>
    h('option', { value: o.value }, o.label)));
  sel.value = valor || '';
}

/**
 * Deja que un select de categoría cree una nueva cuando se elige esa opción.
 * `alCambiar` recibe el id elegido, incluido el de la recién creada.
 */
export function conectarCategoria(sel, tipoDe = () => 'gasto', alCambiar = () => {}) {
  let previo = sel.value;
  sel.addEventListener('change', async () => {
    if (sel.value !== NUEVA) { previo = sel.value; alCambiar(sel.value); return; }
    const cat = await nuevaCategoriaRapida(tipoDe());
    pintarCategorias(sel, tipoDe(), cat ? cat.id : previo);
    previo = sel.value;
    alCambiar(sel.value);
  });
}
// Las que casi siempre faltan y uno termina metiendo en "Otros", que es donde
// van a morir los gastos que despues no se pueden explicar.
const SUGERIDAS = [
  ['Libros y cómics', 'lista'], ['Juegos de mesa', 'play'], ['Salidas', 'comida'],
  ['Almuerzos', 'comida'], ['Cenas', 'comida'], ['Regalos', 'sobre'],
  ['Indumentaria', 'varios'], ['Mascotas', 'varios']
];

export function formCategorias() {
  const lista = h('div.grp');
  const sugeridas = h('div.chips', { style: { flexWrap: 'wrap', marginBottom: '16px' } });
  const pintarSugeridas = () => {
    const tengo = new Set(state.categories.map(c => c.nombre.toLowerCase()));
    const faltan = SUGERIDAS.filter(([n]) => !tengo.has(n.toLowerCase()));
    sugeridas.replaceChildren(...faltan.map(([nombre, ic]) =>
      h('button.pill.mut', { onclick: async e => {
        e.currentTarget.disabled = true;
        await guardar('categories', { nombre, tipo: 'gasto', icono: ic,
                                      orden: state.categories.length + 1 });
        pintar(); pintarSugeridas(); aviso(`${nombre} agregada`);
      } }, icono('mas', 13), nombre)));
    sugeridas.hidden = !faltan.length;
  };

  const pintar = () => {
    lista.replaceChildren(...state.categories
      .slice().sort((a, b) => (a.tipo === b.tipo ? (a.orden || 0) - (b.orden || 0)
                                                 : a.tipo === 'gasto' ? -1 : 1))
      .map(c => h('button.li', { onclick: () => editar(c) },
        h('div.av', icono(iconoDeCategoria(c), 17)),
        h('div.m', h('div.t', c.nombre),
          h('div.s', c.tipo === 'ingreso' ? 'ingreso' : 'gasto')),
        h('span.chev', icono('chev', 15)))));
  };
  const editar = (cat = null) => {
    const nom = h('input', { type: 'text', value: cat?.nombre || '', placeholder: 'Mascotas' });
    const tipo = select([{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }],
                        { value: cat?.tipo || 'gasto' });
    // Vacío = se adivina del nombre, que es lo que hacía siempre. Elegirlo es
    // para las que el nombre no alcanza: "Mascotas", "Regalos", "Gastronomía".
    let ic = cat?.icono || null;
    const iconos = selectorDeIcono(ic, { alElegir: v => ic = v });

    const cerrar2 = hoja(cat ? 'Editar categoría' : 'Nueva categoría', h('div',
      campo('Nombre', nom), campo('Tipo', tipo),
      h('div.f', h('label', 'Ícono'),
        h('div.small.mut', { style: { marginTop: '-3px', marginBottom: '9px' } },
          'El primero lo elige solo, según el nombre.'),
        iconos),
      h('div.fila', { style: { marginTop: '4px' } },
        cat && h('button.btn.dg', { onclick: async () => {
          if (await confirmar(`¿Borrar "${cat.nombre}"? Los movimientos quedan sin categoría.`)) {
            await borrar('categories', cat.id); cerrar2(); pintar();
          }
        } }, 'Borrar'),
        h('button.btn', { onclick: async () => {
          if (!nom.value.trim()) { nom.focus(); return; }
          await guardar('categories', { ...(cat || {}), nombre: nom.value.trim(),
            tipo: tipo.value, icono: ic,
            orden: cat?.orden ?? (state.categories.length + 1) });
          cerrar2(); pintar(); aviso('Guardada');
        } }, 'Guardar'))));
  };
  pintar(); pintarSugeridas();
  hoja('Categorías', h('div', lista,
    h('div', { style: { marginTop: '16px' } },
      h('div.ghead', { style: { margin: '0 0 9px' } }, 'Sugeridas'),
      h('div.small.mut', { style: { marginBottom: '11px', lineHeight: '1.5' } },
        'Las que casi siempre faltan y terminan cayendo en "Otros". Tocá y se crean.'),
      sugeridas),
    h('button.btn.sec', { style: { marginTop: '14px' }, onclick: () => editar() },
      icono('mas', 16), 'Nueva categoría')));
}
