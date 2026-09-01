// =====================================================================
// app.js — router y vistas
// =====================================================================
import * as DB from './db.js';
import * as F from './finance.js';
import * as G from './geo.js';
import { h, frag, $, sheet, toast, confirmar, campo, input, select, fechaHoyISO, icono } from './ui.js';

const app = $('#app'), nav = $('#nav');
const money = F.money;
let periodoActual = F.periodo(new Date());
let ubicacion = null;

// ------------------------------------------------------------------ arranque
async function iniciar() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (!window.CONFIG || (!window.CONFIG.DEMO && String(window.CONFIG.SUPABASE_URL).includes('TU-PROYECTO'))) {
    return app.replaceChildren(h('div.card', { style: { marginTop: '18vh' } },
      h('h3', 'Falta configurar'),
      h('p.mut', 'Copiá config.example.js como config.js y completá la URL y la anon key de Supabase. Para probar la app sin backend, poné DEMO: true en config.js.')));
  }
  const user = await DB.sesion();
  DB.sb.auth.onAuthStateChange((_e, s) => {
    const nuevo = s?.user || null;
    if (nuevo?.id !== DB.state.user?.id) { DB.state.user = nuevo; arrancarSesion(); }
  });
  if (!user) return pantallaLogin();
  arrancarSesion();
}

async function arrancarSesion() {
  if (!DB.state.user) return pantallaLogin();
  app.classList.remove('cargando');
  nav.hidden = false;
  DB.cargarCache();
  DB.onChange(() => render());
  window.addEventListener('hashchange', render);
  render();
  await DB.sincronizar();
  chequeosAutomaticos();
}

function pantallaLogin() {
  nav.hidden = true;
  app.classList.remove('cargando');
  const mail = input({ type: 'email', placeholder: 'tu@mail.com', autocomplete: 'email' });
  const btn = h('button.btn', 'Enviarme el link de acceso');
  btn.onclick = async () => {
    if (!mail.value.includes('@')) return toast('Escribí un mail válido');
    btn.disabled = true; btn.textContent = 'Enviando...';
    const { error } = await DB.enviarMagicLink(mail.value.trim());
    btn.disabled = false; btn.textContent = 'Enviarme el link de acceso';
    if (error) return toast('No se pudo: ' + error.message);
    app.replaceChildren(h('div.card', { style: { marginTop: '18vh' } },
      h('h3', 'Revisá tu mail'),
      h('p.mut', `Te mandamos un link a ${mail.value}. Abrilo desde este mismo dispositivo y quedás adentro.`)));
  };
  app.replaceChildren(h('div', { style: { marginTop: '14vh' } },
    h('h1', { style: { fontSize: '28px', margin: '0 0 6px', letterSpacing: '-.03em' } }, 'Finanzas'),
    h('p.mut', { style: { marginTop: 0, marginBottom: '26px' } },
      'Tus gastos, tus tarjetas y las promos que te sirven, en un solo lugar.'),
    h('div.card', campo('Mail', mail), btn,
      h('p.mut.small', { style: { marginTop: '12px', marginBottom: 0 } },
        'Sin contraseña: entrás con un link de un solo uso.'))));
}

// ------------------------------------------------------------------ router
const RUTAS = { hoy: vistaHoy, movimientos: vistaMovimientos, tarjetas: vistaTarjetas,
                mes: vistaMes, promos: vistaPromos, ajustes: vistaAjustes };

function render() {
  const r = (location.hash.replace('#/', '') || 'hoy').split('?')[0];
  const vista = RUTAS[r] || vistaHoy;
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.v === r));
  app.replaceChildren();
  vista(app);
  document.querySelectorAll('.fab').forEach(f => f.remove());
  if (['hoy', 'movimientos'].includes(r)) {
    const fab = h('button.fab', { title: 'Cargar gasto', onclick: () => formMovimiento() }, '+');
    document.body.append(fab);
  }
}
const ir = r => { location.hash = '#/' + r; };

// ------------------------------------------------------------------ helpers
const cuentas = () => DB.state.accounts.filter(a => a.activo !== false);
const tarjetas = () => cuentas().filter(a => a.tipo === 'credito');
const cuentaDe = id => DB.state.accounts.find(a => a.id === id);
const catDe = id => DB.state.categories.find(c => c.id === id);
const alertPct = () => DB.state.settings?.alert_pct || 80;

function cabecera(titulo, sub, extra) {
  return h('header.top',
    h('div', h('h1', titulo), sub && h('div.sub', sub)),
    extra || h('div', { style: { display: 'flex', gap: '8px' } },
      DB.pendientes() > 0 && h('span.chip.warn', `${DB.pendientes()} sin subir`),
      h('button.btn.sec.sm', { onclick: () => ir('ajustes') }, 'Ajustes')));
}

function selectorPeriodo() {
  const cont = h('div.chips');
  for (let i = -3; i <= 1; i++) {
    const p = F.periodoSuma(F.periodo(new Date()), i);
    cont.append(h('button.chip' + (p === periodoActual ? '.on' : ''),
      { onclick: () => { periodoActual = p; render(); } }, F.periodoLabel(p)));
  }
  return cont;
}

// =====================================================================
// VISTA: HOY
// =====================================================================
function vistaHoy(root) {
  const per = F.periodo(new Date());
  const rArs = F.resumenMes(DB.state.transactions, per, 'ARS');
  const rUsd = F.resumenMes(DB.state.transactions, per, 'USD');
  const recs = F.recurrentesDelMes(DB.state.recurrings, DB.state.recurring_payments, per);
  const pendientes = recs.filter(r => !r.pagado);
  const faltaPagar = pendientes.reduce((a, r) => a + (r.moneda === 'ARS' ? r.monto : 0), 0);
  const tjs = tarjetas();
  const aPagarTarjetas = tjs.reduce((a, t) =>
    a + F.totalTarjetaEnPeriodo(DB.state.transactions, t, per), 0);
  const noLeidas = DB.state.notificaciones ? [] : [];
  const autoNuevos = DB.state.transactions.filter(t => t.revisado === false);

  root.append(cabecera('Hoy', new Date().toLocaleDateString('es-AR',
    { weekday: 'long', day: 'numeric', month: 'long' })));

  // ---- avisos de carga automatica
  if (autoNuevos.length) {
    root.append(h('div.aviso',
      h('b', `${autoNuevos.length} ${autoNuevos.length === 1 ? 'gasto cargado' : 'gastos cargados'} solo`),
      h('div.small.mut', { style: { marginTop: '3px' } },
        autoNuevos.slice(0, 3).map(t => `${t.comercio || t.descripcion} ${money(t.monto, t.moneda)}`).join(' · ')),
      h('button.btn.gh.sm', { style: { marginTop: '10px' },
        onclick: () => { location.hash = '#/movimientos?rev=1'; } }, 'Revisar')));
  }

  // ---- KPIs
  root.append(h('section',
    h('div.grid2',
      h('div.kpi', h('div.lbl', 'Gastado este mes'),
        h('div.val', money(rArs.gastos)),
        h('div.foot', rArs.reintegros > 0 ? `${money(rArs.reintegros)} de reintegros` : 'sin reintegros aún')),
      h('div.kpi', h('div.lbl', 'Balance'),
        h('div.val' + (rArs.balance >= 0 ? '.pos' : '.neg'), money(rArs.balance)),
        h('div.foot', `${money(rArs.ingresos)} de ingresos`))),
    (rUsd.gastos || rUsd.ingresos) ? h('div.kpi', { style: { marginTop: '10px' } },
      h('div.lbl', 'En dólares'),
      h('div.val.sm', `${money(rUsd.gastos, 'USD')} gastados`),
      h('div.foot', `${money(rUsd.ingresos, 'USD')} ingresados`)) : null));

  // ---- falta pagar
  root.append(h('section',
    h('h2.sec', 'Falta pagar este mes', h('a', { href: '#/mes' }, 'ver todo')),
    h('div.card',
      h('div.row',
        h('div.main', h('div.t', 'Resúmenes de tarjeta'),
          h('div.s', `${tjs.length} ${tjs.length === 1 ? 'tarjeta' : 'tarjetas'}`)),
        h('div.amt', money(aPagarTarjetas))),
      h('div.row',
        h('div.main', h('div.t', 'Gastos fijos pendientes'),
          h('div.s', pendientes.length ? pendientes.map(r => r.nombre).join(', ') : 'todo al día')),
        h('div.amt' + (pendientes.some(r => r.vencido) ? '.neg' : ''), money(faltaPagar))),
      h('div.row', { style: { borderTop: '1px solid var(--line)', paddingTop: '12px' } },
        h('div.main', h('div.t', 'Total comprometido')),
        h('div.amt', money(aPagarTarjetas + faltaPagar))))));

  // ---- vencimientos proximos
  const proximos = [];
  for (const t of tjs) {
    const c = F.proximoCiclo(t);
    proximos.push({ t: `${t.nombre} cierra`, d: c.cierre, dias: c.diasACierre, tipo: 'cierre' });
    proximos.push({ t: `${t.nombre} vence`, d: c.vence, dias: c.diasAVencimiento, tipo: 'vence' });
  }
  for (const r of pendientes) proximos.push({ t: r.nombre, d: r.vence, dias: r.diasRestantes, tipo: 'fijo' });
  proximos.sort((a, b) => a.d - b.d);
  const cercanos = proximos.filter(p => p.dias >= -10 && p.dias <= 20).slice(0, 6);
  if (cercanos.length) {
    root.append(h('section', h('h2.sec', 'Próximos vencimientos'),
      h('div.card', cercanos.map(p => h('div.row',
        h('span.dot', { style: { background: p.dias < 0 ? 'var(--bad)' : p.dias <= 3 ? 'var(--warn)' : 'var(--ok)' } }),
        h('div.main', h('div.t', p.t),
          h('div.s', p.d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }))),
        h('div.amt.small' + (p.dias < 0 ? '.neg' : p.dias <= 3 ? '.wrn' : ''),
          p.dias < 0 ? `hace ${-p.dias} d` : p.dias === 0 ? 'hoy' : `en ${p.dias} d`))))));
  }

  // ---- promos de hoy
  const pHoy = F.promosDelDia(DB.state.promos);
  root.append(h('section',
    h('h2.sec', 'Promos de hoy', h('a', { href: '#/promos' }, 'ver cerca')),
    pHoy.length
      ? h('div.card', pHoy.slice(0, 4).map(p => filaPromo(p)))
      : h('div.card', h('div.vacio', 'Todavía no cargaste promos. Andá a Promos para agregarlas.'))));

  // ---- ultimos movimientos
  const ultimos = [...DB.state.transactions]
    .sort((a, b) => (b.fecha + b.created_at).localeCompare(a.fecha + a.created_at)).slice(0, 6);
  if (ultimos.length) {
    root.append(h('section', h('h2.sec', 'Últimos movimientos', h('a', { href: '#/movimientos' }, 'ver todos')),
      h('div.card', ultimos.map(filaMovimiento))));
  }
}

// =====================================================================
// COMPONENTES compartidos
// =====================================================================
function filaMovimiento(tx) {
  const c = catDe(tx.category_id), a = cuentaDe(tx.account_id);
  const partes = [a?.nombre, tx.cuotas > 1 ? `${tx.cuotas} cuotas` : null, c?.nombre].filter(Boolean);
  return h('div.row', { onclick: () => formMovimiento(tx) },
    h('span.dot', { style: { background: c?.color || 'var(--tx3)' } }),
    h('div.main',
      h('div.t', tx.comercio || tx.descripcion,
        tx.revisado === false ? h('span.chip', { style: { marginLeft: '7px' } }, 'nuevo') : null),
      h('div.s', [F.parseFecha(tx.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
        ...partes].join(' · '))),
    h('div.amt' + (tx.tipo === 'ingreso' ? '.pos' : ''),
      (tx.tipo === 'ingreso' ? '+' : '') + money(tx.monto, tx.moneda)));
}

function filaPromo(p, extra) {
  const val = p.tipo === 'cuotas' ? `${p.valor} cuotas` : `${p.valor}%`;
  return h('div.row', { onclick: () => formPromo(p) },
    h('div.main',
      h('div.t', p.comercio || p.titulo),
      h('div.s', [p.emisor === 'galicia' ? 'Galicia' : p.emisor === 'modo' ? 'MODO' : p.emisor,
        p.tope ? `tope ${money(p.tope)}` : null,
        p.canal === 'online' ? 'solo online' : null,
        extra].filter(Boolean).join(' · '))),
    h('div.amt.pos', val));
}

const COLOR_TARJETA = { visa: ['#1a3fa8', '#3b6fd4'], mastercard: ['#a83c1a', '#e0603b'],
  amex: ['#0d6b6b', '#1fa8a8'], default: ['#3a2f8f', '#7a5cf0'] };

// =====================================================================
// VISTA: MOVIMIENTOS
// =====================================================================
let filtroMov = { cuenta: '', categoria: '', texto: '', soloNuevos: false };

function vistaMovimientos(root) {
  if (location.hash.includes('rev=1')) { filtroMov.soloNuevos = true; location.hash = '#/movimientos'; return; }
  root.append(cabecera('Gastos', 'Todo lo que entra y sale'));
  root.append(selectorPeriodo());

  const buscar = input({ placeholder: 'Buscar comercio o descripción', value: filtroMov.texto,
    oninput: e => { filtroMov.texto = e.target.value; pintar(); } });
  root.append(h('div.f', buscar));

  const chips = h('div.chips',
    h('button.chip' + (filtroMov.soloNuevos ? '.on' : ''),
      { onclick: () => { filtroMov.soloNuevos = !filtroMov.soloNuevos; render(); } }, 'Cargados solos'),
    h('button.chip' + (!filtroMov.cuenta ? '.on' : ''),
      { onclick: () => { filtroMov.cuenta = ''; render(); } }, 'Todas'),
    cuentas().map(a => h('button.chip' + (filtroMov.cuenta === a.id ? '.on' : ''),
      { onclick: () => { filtroMov.cuenta = a.id; render(); } }, a.nombre)));
  root.append(chips);

  const lista = h('div.card');
  const totales = h('div.grid2', { style: { marginBottom: '14px' } });
  root.append(totales, lista);

  function pintar() {
    const t = filtroMov.texto.toLowerCase();
    const filas = DB.state.transactions.filter(tx => {
      if (F.periodo(F.parseFecha(tx.fecha)) !== periodoActual) return false;
      if (filtroMov.cuenta && tx.account_id !== filtroMov.cuenta) return false;
      if (filtroMov.soloNuevos && tx.revisado !== false) return false;
      if (t && !((tx.comercio || '') + tx.descripcion).toLowerCase().includes(t)) return false;
      return true;
    }).sort((a, b) => b.fecha.localeCompare(a.fecha));

    const g = filas.filter(x => x.tipo === 'gasto' && x.moneda === 'ARS')
      .reduce((a, x) => a + Number(x.monto), 0);
    const i = filas.filter(x => x.tipo === 'ingreso' && x.moneda === 'ARS')
      .reduce((a, x) => a + Number(x.monto), 0);
    totales.replaceChildren(
      h('div.kpi', h('div.lbl', 'Gastos'), h('div.val.sm', money(g))),
      h('div.kpi', h('div.lbl', 'Ingresos'), h('div.val.sm.pos', money(i))));

    lista.replaceChildren(filas.length
      ? frag(filas.map(filaMovimiento))
      : h('div.vacio', 'No hay movimientos con estos filtros.'));
  }
  pintar();
}

// =====================================================================
// VISTA: TARJETAS
// =====================================================================
function vistaTarjetas(root) {
  root.append(cabecera('Tarjetas', 'Cierre, vencimiento y cuotas',
    h('button.btn.sec.sm', { onclick: () => formCuenta() }, 'Agregar')));

  const tjs = tarjetas();
  if (!tjs.length) {
    root.append(h('div.card', h('div.vacio',
      'Todavía no cargaste ninguna tarjeta. Agregá tu Visa o Mastercard de Galicia con su día de cierre y de vencimiento.'),
      h('button.btn', { onclick: () => formCuenta() }, 'Agregar tarjeta')));
  }

  for (const t of tjs) {
    const ciclo = F.proximoCiclo(t);
    const perVenc = F.periodo(ciclo.vence);
    const total = F.totalTarjetaEnPeriodo(DB.state.transactions, t, perVenc);
    const totalUsd = F.totalTarjetaEnPeriodo(DB.state.transactions, t, perVenc, 'USD');
    const [c1, c2] = t.color?.startsWith('#')
      ? [t.color, t.color] : (COLOR_TARJETA[t.marca] || COLOR_TARJETA.default);

    root.append(h('section',
      h('div.tc', { style: { '--c1': (COLOR_TARJETA[t.marca] || COLOR_TARJETA.default)[0],
                             '--c2': (COLOR_TARJETA[t.marca] || COLOR_TARJETA.default)[1] },
                    onclick: () => formCuenta(t) },
        h('div.nm', `${t.nombre}${t.banco ? ' · ' + t.banco : ''}`),
        t.ultimos4 && h('div.n4', '···· ' + t.ultimos4),
        h('div.lbl', { style: { marginTop: '14px' } }, `A pagar en ${F.periodoLabel(perVenc)}`),
        h('div.big', money(total)),
        totalUsd > 0 && h('div.lbl', money(totalUsd, 'USD')),
        h('div.fechas',
          h('div', 'Cierra', h('b', ciclo.cierre.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }))),
          h('div', 'Vence', h('b', ciclo.vence.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }))),
          t.limite > 0 && h('div', 'Límite', h('b', money(t.limite))))),
      cuotasDeTarjeta(t)));
  }

  // deuda futura consolidada
  const df = F.deudaFutura(DB.state.transactions, tjs);
  if (df.length) {
    const max = Math.max(...df.map(x => x.monto));
    root.append(h('section', h('h2.sec', 'Lo que ya está comprometido'),
      h('div.card', df.map(x => h('div',
        h('div.row', { style: { borderBottom: 0, paddingBottom: '4px' } },
          h('div.main', h('div.t', F.periodoLabel(x.periodo))),
          h('div.amt', money(x.monto))),
        h('div.bar', { style: { marginBottom: '10px' } },
          h('i', { style: { width: (x.monto / max * 100) + '%' } })))))));
  }

  const otras = cuentas().filter(a => a.tipo !== 'credito');
  if (otras.length) {
    root.append(h('section', h('h2.sec', 'Otras cuentas y billeteras'),
      h('div.card', otras.map(a => h('div.row', { onclick: () => formCuenta(a) },
        h('div.main', h('div.t', a.nombre), h('div.s', a.tipo)),
        h('div.amt.small.mut', a.moneda))))));
  }
}

function cuotasDeTarjeta(t) {
  const activas = DB.state.transactions
    .filter(tx => tx.account_id === t.id && tx.cuotas > 1 && tx.tipo === 'gasto')
    .map(tx => ({ tx, cr: F.cronograma(tx, t) }))
    .filter(x => x.cr.some(c => c.pendiente))
    .sort((a, b) => b.tx.fecha.localeCompare(a.tx.fecha));
  if (!activas.length) return null;
  return h('div.card', { style: { marginTop: '10px' } },
    h('h2.sec', 'Cuotas en curso'),
    activas.slice(0, 8).map(({ tx, cr }) => {
      const pagadas = cr.filter(c => !c.pendiente).length;
      return h('div',
        h('div.row', { style: { borderBottom: 0, paddingBottom: '4px' }, onclick: () => formMovimiento(tx) },
          h('div.main', h('div.t', tx.comercio || tx.descripcion),
            h('div.s', `cuota ${pagadas + 1} de ${tx.cuotas} · ${money(cr[0].monto, tx.moneda)} por mes`)),
          h('div.amt.small.mut', money((tx.cuotas - pagadas) * cr[0].monto, tx.moneda) + ' resta')),
        h('div.bar', { style: { marginBottom: '10px' } },
          h('i', { style: { width: (pagadas / tx.cuotas * 100) + '%' } })));
    }));
}

// =====================================================================
// VISTA: MES (gastos fijos + presupuesto)
// =====================================================================
function vistaMes(root) {
  root.append(cabecera('Mes', 'Gastos fijos y presupuesto'));
  root.append(selectorPeriodo());

  const recs = F.recurrentesDelMes(DB.state.recurrings, DB.state.recurring_payments, periodoActual);
  const pend = recs.filter(r => !r.pagado);
  const pagado = recs.filter(r => r.pagado).reduce((a, r) => a + r.monto, 0);
  const falta = pend.reduce((a, r) => a + r.monto, 0);

  root.append(h('section',
    h('h2.sec', 'Gastos fijos', h('button', { onclick: () => formRecurrente() }, 'agregar')),
    h('div.grid2', { style: { marginBottom: '10px' } },
      h('div.kpi', h('div.lbl', 'Falta pagar'), h('div.val.sm' + (pend.some(r => r.vencido) ? '.neg' : ''), money(falta)),
        h('div.foot', `${pend.length} de ${recs.length} pendientes`)),
      h('div.kpi', h('div.lbl', 'Ya pagaste'), h('div.val.sm.pos', money(pagado)))),
    h('div.card', recs.length ? recs.map(filaRecurrente) : h('div.vacio',
      'Cargá acá el colegio, la luz, el gas, el alquiler y las suscripciones. La app te va a avisar qué te falta pagar cada mes.'))));

  // presupuesto
  const res = F.resumenMes(DB.state.transactions, periodoActual);
  const budgets = DB.state.budgets.filter(b => b.periodo === periodoActual);
  const conTope = budgets.length ? budgets
    : DB.state.categories.filter(c => c.presupuesto > 0)
        .map(c => ({ category_id: c.id, monto: c.presupuesto, periodo: periodoActual }));
  const estado = F.estadoPresupuesto(conTope, res, alertPct());

  root.append(h('section',
    h('h2.sec', 'Presupuesto', h('button', { onclick: () => formPresupuesto() }, 'editar')),
    estado.length
      ? h('div.card', estado.sort((a, b) => b.pct - a.pct).map(b => {
          const c = catDe(b.category_id);
          return h('div',
            h('div.row', { style: { borderBottom: 0, paddingBottom: '4px' } },
              h('span.dot', { style: { background: c?.color || 'var(--tx3)' } }),
              h('div.main', h('div.t', c?.nombre || 'Sin categoría'),
                h('div.s', b.estado === 'excedido' ? `te pasaste ${money(-b.restante)}`
                  : `te quedan ${money(b.restante)}`)),
              h('div.amt.small' + (b.estado === 'excedido' ? '.neg' : b.estado === 'alerta' ? '.wrn' : ''),
                `${money(b.gastado)} / ${money(b.tope)}`)),
            h('div.bar', { style: { marginBottom: '10px' } },
              h('i' + (b.estado === 'excedido' ? '.bad' : b.estado === 'alerta' ? '.warn' : ''),
                { style: { width: Math.min(100, b.pct) + '%' } })));
        }))
      : h('div.card', h('div.vacio', 'Poné un tope por categoría y te aviso cuando estés cerca.'),
          h('button.btn.sec', { onclick: () => formPresupuesto() }, 'Definir presupuesto'))));

  // por categoria
  const cats = Object.entries(res.porCategoria).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    const total = cats.reduce((a, x) => a + x[1], 0);
    root.append(h('section', h('h2.sec', 'En qué se te fue'),
      h('div.card', cats.map(([id, m]) => {
        const c = catDe(id);
        return h('div',
          h('div.row', { style: { borderBottom: 0, paddingBottom: '4px' } },
            h('span.dot', { style: { background: c?.color || 'var(--tx3)' } }),
            h('div.main', h('div.t', c?.nombre || 'Sin categoría'),
              h('div.s', Math.round(m / total * 100) + '% del mes')),
            h('div.amt', money(m))),
          h('div.bar', { style: { marginBottom: '10px' } },
            h('i', { style: { width: (m / total * 100) + '%', background: c?.color || 'var(--tx3)' } })));
      }))));
  }
}

function filaRecurrente(r) {
  return h('div.row',
    h('button.chip' + (r.pagado ? '.on' : ''), {
      style: { width: '30px', height: '30px', padding: 0, justifyContent: 'center', flex: 'none' },
      onclick: async e => { e.stopPropagation(); await togglePago(r); }
    }, r.pagado ? icono('check', 15) : ''),
    h('div.main', { onclick: () => formRecurrente(r) },
      h('div.t', r.nombre),
      h('div.s', r.pagado ? 'pagado'
        : r.vencido ? `venció el ${r.vence.getDate()}`
        : `vence el ${r.vence.getDate()} · en ${r.diasRestantes} días`)),
    h('div.amt' + (r.vencido ? '.neg' : r.pagado ? '.mut' : ''),
      money(r.monto, r.moneda), r.variable ? h('div.s', { style: { textAlign: 'right' } }, 'estimado') : null));
}

async function togglePago(r) {
  if (r.pagado) {
    await DB.guardar('recurring_payments', { ...r.pago, pagado_at: null });
    return toast(`${r.nombre} marcado como impago`);
  }
  if (r.variable) return formPagoVariable(r);
  await DB.guardar('recurring_payments', {
    ...(r.pago || {}), recurring_id: r.id, periodo: periodoActual,
    monto: r.monto_estimado, pagado_at: new Date().toISOString()
  });
  toast(`${r.nombre} pagado`);
}

function formPagoVariable(r) {
  const monto = input({ type: 'number', inputmode: 'decimal', step: '0.01',
    value: r.monto_estimado, placeholder: '0' });
  const cerrar = sheet(`Pagar ${r.nombre}`, h('div',
    campo('¿Cuánto vino este mes?', monto),
    h('button.btn', { onclick: async () => {
      await DB.guardar('recurring_payments', {
        ...(r.pago || {}), recurring_id: r.id, periodo: periodoActual,
        monto: Number(monto.value || 0), pagado_at: new Date().toISOString() });
      cerrar(); toast(`${r.nombre} pagado`);
    } }, 'Marcar como pagado')));
}

// =====================================================================
// VISTA: PROMOS (con GPS)
// =====================================================================
const RUBROS = [
  { value: 'supermercado', label: 'Súper', osm: 'shop=supermarket' },
  { value: 'farmacia', label: 'Farmacia', osm: 'amenity=pharmacy' },
  { value: 'combustible', label: 'Nafta', osm: 'amenity=fuel' },
  { value: 'gastronomia', label: 'Comida', osm: 'amenity=restaurant' },
  { value: 'indumentaria', label: 'Ropa', osm: 'shop=clothes' },
  { value: 'hogar', label: 'Hogar', osm: 'shop=furniture' },
  { value: 'electro', label: 'Electro', osm: 'shop=electronics' },
  { value: 'otros', label: 'Otros', osm: '' }
];
let filtroRubro = '';

function vistaPromos(root) {
  root.append(cabecera('Promos', 'Lo que te conviene, cerca tuyo',
    h('button.btn.sec.sm', { onclick: () => formPromo() }, 'Agregar')));

  const estado = h('div');
  root.append(estado);

  root.append(h('div.chips',
    h('button.chip' + (!filtroRubro ? '.on' : ''),
      { onclick: () => { filtroRubro = ''; render(); } }, 'Todas'),
    RUBROS.map(r => h('button.chip' + (filtroRubro === r.value ? '.on' : ''),
      { onclick: () => { filtroRubro = r.value; render(); } }, r.label))));

  const hoyChip = h('div.chips',
    h('button.chip.on', { onclick: () => pintar(true) }, 'Vigentes hoy'),
    h('button.chip', { onclick: () => pintar(false) }, 'Todas las vigentes'));
  root.append(hoyChip);

  const lista = h('div');
  root.append(lista);

  let soloHoy = true;
  function base() {
    let ps = soloHoy ? F.promosDelDia(DB.state.promos) : DB.state.promos.filter(p => p.activa);
    if (filtroRubro) ps = ps.filter(p => p.rubro === filtroRubro);
    return ps;
  }

  function pintar(hoy = soloHoy) {
    soloHoy = hoy;
    hoyChip.children[0].className = 'chip' + (hoy ? ' on' : '');
    hoyChip.children[1].className = 'chip' + (!hoy ? ' on' : '');
    const ps = base();
    lista.replaceChildren(ps.length
      ? h('div.card', ps.map(p => filaPromo(p, p.dias?.length ? diasTexto(p.dias) : 'todos los días')))
      : h('div.card', h('div.vacio',
          DB.state.promos.length ? 'No hay promos con ese filtro.'
            : 'Todavía no hay promos cargadas. Agregá las que uses y la app te las va a recordar el día que sirven.')));
  }
  pintar();

  // ---- boton de cercania
  const btnGeo = h('button.btn', { onclick: buscarCerca },
    icono('pin'), ubicacion ? 'Actualizar lo que tengo cerca' : 'Ver lo que tengo cerca ahora');
  estado.replaceChildren(h('div', { style: { marginBottom: '14px' } }, btnGeo));

  async function buscarCerca() {
    btnGeo.disabled = true; btnGeo.textContent = 'Buscando tu ubicación...';
    try {
      ubicacion = await G.posicion();
    } catch (e) {
      btnGeo.disabled = false; btnGeo.replaceChildren(icono('pin'), 'Ver lo que tengo cerca ahora');
      return toast(e.message, 4200);
    }
    btnGeo.textContent = 'Buscando sucursales...';
    const ps = base().filter(p => p.canal !== 'online');
    const resultados = [];
    for (const p of ps) {
      const filtro = p.osm_filtro || RUBROS.find(r => r.value === p.rubro)?.osm;
      const fijas = DB.state.promo_sucursales?.filter(s => s.promo_id === p.id) || [];
      let sucs = fijas.map(s => ({ ...s, metros: G.distancia(ubicacion, s) }));
      if (filtro) {
        try { sucs = sucs.concat(await G.sucursalesCerca({ ...p, osm_filtro: filtro }, ubicacion)); }
        catch { /* sin red: seguimos con las fijas */ }
      }
      sucs.sort((a, b) => a.metros - b.metros);
      if (sucs.length) resultados.push({ promo: p, sucursales: sucs.slice(0, 4) });
    }
    resultados.sort((a, b) => a.sucursales[0].metros - b.sucursales[0].metros);

    btnGeo.disabled = false; btnGeo.replaceChildren(icono('pin'), 'Actualizar lo que tengo cerca');
    if (!resultados.length) {
      return estado.append(h('div.aviso.warn',
        'No encontré sucursales cerca para las promos cargadas. Probá ampliando el rubro o agregá la dirección a mano en la promo.'));
    }
    lista.replaceChildren(h('div',
      h('h2.sec', `Cerca tuyo · ${resultados.length} ${resultados.length === 1 ? 'promo' : 'promos'}`),
      resultados.map(({ promo, sucursales }) => h('div.card',
        h('div.row', { style: { borderBottom: '1px solid var(--line)' } },
          h('div.main', h('div.t', promo.comercio || promo.titulo),
            h('div.s', [promo.emisor === 'modo' ? 'MODO' : 'Galicia',
              promo.tope ? `tope ${money(promo.tope)}` : null,
              promo.medio_pago].filter(Boolean).join(' · '))),
          h('div.amt.pos', promo.tipo === 'cuotas' ? `${promo.valor} c` : `${promo.valor}%`)),
        sucursales.map(s => h('a.row', { href: G.mapsUrl(s), target: '_blank', rel: 'noopener' },
          h('div.main', h('div.t', s.nombre),
            h('div.s', [s.direccion, s.abre].filter(Boolean).join(' · ') || 'ver en el mapa')),
          h('div.amt.small.mut', G.distanciaTexto(s.metros))))))));
    toast(`Lo más cerca: ${resultados[0].sucursales[0].nombre} a ${G.distanciaTexto(resultados[0].sucursales[0].metros)}`, 4000);
  }
}

const DIAS_CORTO = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const diasTexto = ds => ds.map(d => DIAS_CORTO[d]).join(' ');

// =====================================================================
// FORMULARIOS
// =====================================================================
function formMovimiento(tx = null) {
  const esNuevo = !tx;
  const t = tx || { fecha: fechaHoyISO(), tipo: 'gasto', moneda: 'ARS', cuotas: 1, monto: '' };

  const monto = input({ type: 'number', inputmode: 'decimal', step: '0.01', value: t.monto, placeholder: '0' });
  const comercio = input({ value: t.comercio || t.descripcion || '', placeholder: 'Coto, Shell, Netflix...' });
  const fecha = input({ type: 'date', value: t.fecha });
  const cuenta = select([{ value: '', label: 'Efectivo / sin cuenta' },
    ...cuentas().map(a => ({ value: a.id, label: a.nombre }))], { value: t.account_id || '' });
  const categoria = select([{ value: '', label: 'Sin categoría' },
    ...DB.state.categories.filter(c => c.tipo === (t.tipo || 'gasto')).map(c => ({ value: c.id, label: c.nombre }))],
    { value: t.category_id || '' });
  const cuotas = select([1, 2, 3, 6, 9, 12, 18, 24].map(n => ({ value: n, label: n === 1 ? 'Un pago' : `${n} cuotas` })),
    { value: t.cuotas || 1 });
  const moneda = select([{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }], { value: t.moneda });
  const tipo = select([{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }], { value: t.tipo });
  const reintegro = input({ type: 'number', inputmode: 'decimal', step: '0.01',
    value: t.reintegro || '', placeholder: '0' });

  const infoCuotas = h('div.small.mut');
  const recalcular = () => {
    const tj = cuentaDe(cuenta.value);
    const n = Number(cuotas.value);
    if (tj?.tipo === 'credito' && Number(monto.value) > 0) {
      const cr = F.cronograma({ fecha: fecha.value, monto: Number(monto.value), cuotas: n }, tj);
      infoCuotas.textContent = n > 1
        ? `${n} cuotas de ${money(cr[0].monto, moneda.value)} · primera en el resumen de ${F.periodoLabel(cr[0].periodoVenc)}, última en ${F.periodoLabel(cr[n - 1].periodoVenc)}`
        : `Entra en el resumen que vence en ${F.periodoLabel(cr[0].periodoVenc)}`;
    } else infoCuotas.textContent = '';
  };
  [monto, cuenta, cuotas, fecha, moneda].forEach(e => e.addEventListener('change', recalcular));
  monto.addEventListener('input', recalcular);
  tipo.addEventListener('change', () => {
    categoria.replaceChildren();
    for (const c of DB.state.categories.filter(c => c.tipo === tipo.value))
      categoria.append(h('option', { value: c.id }, c.nombre));
  });
  setTimeout(recalcular, 0);

  const cerrar = sheet(esNuevo ? 'Nuevo movimiento' : 'Editar movimiento', h('div',
    tx?.revisado === false && h('div.aviso', 'Este movimiento lo cargó la app sola desde tus mails. Revisá la categoría y confirmalo.'),
    h('div.fila', campo('Monto', monto), campo('Moneda', moneda)),
    campo('Comercio o detalle', comercio),
    h('div.fila', campo('Fecha', fecha), campo('Tipo', tipo)),
    campo('Cuenta o tarjeta', cuenta),
    h('div.fila', campo('Cuotas', cuotas), campo('Reintegro', reintegro)),
    infoCuotas,
    campo('Categoría', categoria),
    h('button.btn', { style: { marginTop: '6px' }, onclick: guardar },
      esNuevo ? 'Guardar' : tx.revisado === false ? 'Confirmar' : 'Guardar cambios'),
    !esNuevo && h('button.btn.dg', { style: { marginTop: '9px' }, onclick: async () => {
      if (await confirmar(`¿Borrar "${tx.comercio || tx.descripcion}"?`)) { await DB.borrar('transactions', tx.id); cerrar(); toast('Borrado'); }
    } }, 'Borrar')));

  async function guardar() {
    if (!(Number(monto.value) > 0)) return toast('Poné un monto');
    await DB.guardar('transactions', {
      ...(tx || {}),
      fecha: fecha.value, monto: Number(monto.value), moneda: moneda.value,
      tipo: tipo.value, comercio: comercio.value.trim(),
      descripcion: comercio.value.trim() || 'Movimiento',
      account_id: cuenta.value || null, category_id: categoria.value || null,
      cuotas: Number(cuotas.value), reintegro: Number(reintegro.value || 0),
      revisado: true, fuente: tx?.fuente || 'manual'
    });
    cerrar(); toast(esNuevo ? 'Cargado' : 'Guardado');
  }
}

function formCuenta(a = null) {
  const c = a || { tipo: 'credito', moneda: 'ARS', cierre_dia: 20, vencimiento_dia: 30, activo: true };
  const nombre = input({ value: c.nombre || '', placeholder: 'Visa Galicia' });
  const tipo = select([{ value: 'credito', label: 'Tarjeta de crédito' }, { value: 'debito', label: 'Tarjeta de débito' },
    { value: 'cuenta', label: 'Cuenta bancaria' }, { value: 'billetera', label: 'Billetera virtual' },
    { value: 'efectivo', label: 'Efectivo' }], { value: c.tipo });
  const banco = input({ value: c.banco || '', placeholder: 'Galicia' });
  const marca = select([{ value: '', label: '—' }, { value: 'visa', label: 'Visa' },
    { value: 'mastercard', label: 'Mastercard' }, { value: 'amex', label: 'Amex' }], { value: c.marca || '' });
  const u4 = input({ value: c.ultimos4 || '', maxlength: 4, inputmode: 'numeric', placeholder: '1234' });
  const cierre = input({ type: 'number', min: 1, max: 31, value: c.cierre_dia });
  const venc = input({ type: 'number', min: 1, max: 31, value: c.vencimiento_dia });
  const limite = input({ type: 'number', step: '0.01', value: c.limite || '', placeholder: 'opcional' });
  const moneda = select([{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }], { value: c.moneda });

  const soloCredito = h('div',
    h('div.fila', campo('Día de cierre', cierre), campo('Día de vencimiento', venc)),
    campo('Límite', limite),
    h('div.small.mut', 'El día de cierre y el de vencimiento están en el resumen del banco. Con eso la app calcula sola en qué mes cae cada cuota.'));
  const actualizarVis = () => { soloCredito.style.display = tipo.value === 'credito' ? '' : 'none'; };
  tipo.addEventListener('change', actualizarVis); setTimeout(actualizarVis, 0);

  const cerrar = sheet(a ? 'Editar cuenta' : 'Nueva cuenta', h('div',
    campo('Nombre', nombre), campo('Tipo', tipo),
    h('div.fila', campo('Banco', banco), campo('Moneda', moneda)),
    h('div.fila', campo('Marca', marca), campo('Últimos 4 dígitos', u4)),
    h('div.small.mut', { style: { marginTop: '-8px', marginBottom: '12px' } },
      'Los últimos 4 dígitos sirven para que la app reconozca la tarjeta en los avisos del banco. No guardes el número completo.'),
    soloCredito,
    h('button.btn', { style: { marginTop: '6px' }, onclick: async () => {
      if (!nombre.value.trim()) return toast('Ponele un nombre');
      await DB.guardar('accounts', { ...(a || {}), nombre: nombre.value.trim(), tipo: tipo.value,
        banco: banco.value.trim() || null, marca: marca.value || null,
        ultimos4: u4.value.replace(/\D/g, '').slice(-4) || null, moneda: moneda.value,
        cierre_dia: tipo.value === 'credito' ? Number(cierre.value) : null,
        vencimiento_dia: tipo.value === 'credito' ? Number(venc.value) : null,
        limite: limite.value ? Number(limite.value) : null, activo: true });
      cerrar(); toast('Guardado');
    } }, 'Guardar'),
    a && h('button.btn.dg', { style: { marginTop: '9px' }, onclick: async () => {
      if (await confirmar(`¿Borrar ${a.nombre}? Los movimientos quedan sin cuenta asignada.`)) {
        await DB.borrar('accounts', a.id); cerrar();
      }
    } }, 'Borrar')));
}

function formRecurrente(r = null) {
  const c = r || { dia_vencimiento: 10, moneda: 'ARS', variable: false, activo: true, monto_estimado: '' };
  const nombre = input({ value: c.nombre || '', placeholder: 'Colegio, luz, gas...' });
  const monto = input({ type: 'number', step: '0.01', value: c.monto_estimado, placeholder: '0' });
  const dia = input({ type: 'number', min: 1, max: 31, value: c.dia_vencimiento });
  const moneda = select([{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }], { value: c.moneda });
  const variable = h('input', { type: 'checkbox', checked: !!c.variable });
  const categoria = select([{ value: '', label: 'Sin categoría' },
    ...DB.state.categories.filter(x => x.tipo === 'gasto').map(x => ({ value: x.id, label: x.nombre }))],
    { value: c.category_id || '' });

  const cerrar = sheet(r ? 'Editar gasto fijo' : 'Nuevo gasto fijo', h('div',
    campo('Nombre', nombre),
    h('div.fila', campo('Monto', monto), campo('Moneda', moneda)),
    campo('Día que vence', dia),
    campo('Categoría', categoria),
    h('label', { style: { display: 'flex', gap: '9px', alignItems: 'center', marginBottom: '14px' } },
      variable, 'El monto cambia todos los meses (luz, gas, tarjeta)'),
    h('button.btn', { onclick: async () => {
      if (!nombre.value.trim()) return toast('Ponele un nombre');
      await DB.guardar('recurrings', { ...(r || {}), nombre: nombre.value.trim(),
        monto_estimado: Number(monto.value || 0), moneda: moneda.value,
        dia_vencimiento: Number(dia.value), category_id: categoria.value || null,
        variable: variable.checked, activo: true });
      cerrar(); toast('Guardado');
    } }, 'Guardar'),
    r && h('button.btn.dg', { style: { marginTop: '9px' }, onclick: async () => {
      if (await confirmar(`¿Borrar ${r.nombre}?`)) { await DB.borrar('recurrings', r.id); cerrar(); }
    } }, 'Borrar')));
}

function formPresupuesto() {
  const cont = h('div');
  const inputs = {};
  for (const c of DB.state.categories.filter(x => x.tipo === 'gasto')) {
    const b = DB.state.budgets.find(x => x.periodo === periodoActual && x.category_id === c.id);
    inputs[c.id] = input({ type: 'number', step: '0.01', value: b?.monto ?? c.presupuesto ?? '', placeholder: '0' });
    cont.append(campo(c.nombre, inputs[c.id]));
  }
  const cerrar = sheet(`Presupuesto de ${F.periodoLabel(periodoActual)}`, h('div',
    h('p.small.mut', { style: { marginTop: '-8px' } }, `Te aviso cuando llegues al ${alertPct()}% de cada tope.`),
    cont,
    h('button.btn', { onclick: async () => {
      for (const [cid, el] of Object.entries(inputs)) {
        const monto = Number(el.value || 0);
        const b = DB.state.budgets.find(x => x.periodo === periodoActual && x.category_id === cid);
        if (!monto && !b) continue;
        await DB.guardar('budgets', { ...(b || {}), periodo: periodoActual, category_id: cid, monto, moneda: 'ARS' });
      }
      cerrar(); toast('Presupuesto guardado');
    } }, 'Guardar')));
}

function formPromo(p = null) {
  const c = p || { emisor: 'galicia', tipo: 'reintegro', rubro: 'supermercado', canal: 'ambos',
                   activa: true, dias: [], valor: '', marcas: [] };
  const titulo = input({ value: c.titulo || '', placeholder: '20% de reintegro los martes' });
  const comercio = input({ value: c.comercio || '', placeholder: 'Coto' });
  const marcas = input({ value: (c.marcas || []).join(', '), placeholder: 'Coto, Coto Digital' });
  const emisor = select([{ value: 'galicia', label: 'Banco Galicia' }, { value: 'modo', label: 'MODO' },
    { value: 'mercadopago', label: 'Mercado Pago' }, { value: 'otro', label: 'Otro' }], { value: c.emisor });
  const tipo = select([{ value: 'reintegro', label: 'Reintegro' }, { value: 'descuento', label: 'Descuento' },
    { value: 'cuotas', label: 'Cuotas sin interés' }], { value: c.tipo });
  const rubro = select(RUBROS.map(r => ({ value: r.value, label: r.label })), { value: c.rubro });
  const valor = input({ type: 'number', step: '1', value: c.valor, placeholder: '20' });
  const tope = input({ type: 'number', step: '0.01', value: c.tope || '', placeholder: 'sin tope' });
  const canal = select([{ value: 'ambos', label: 'Presencial y online' }, { value: 'presencial', label: 'Solo presencial' },
    { value: 'online', label: 'Solo online' }], { value: c.canal });
  const desde = input({ type: 'date', value: c.vigencia_desde || '' });
  const hasta = input({ type: 'date', value: c.vigencia_hasta || '' });
  const medio = input({ value: c.medio_pago || '', placeholder: 'Tarjeta Galicia Visa' });

  const diasSel = new Set(c.dias || []);
  const chipsDias = h('div.chips', ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d, i) => {
    const b = h('button.chip' + (diasSel.has(i) ? '.on' : ''), { onclick: () => {
      diasSel.has(i) ? diasSel.delete(i) : diasSel.add(i);
      b.className = 'chip' + (diasSel.has(i) ? ' on' : '');
    } }, d);
    return b;
  }));

  const cerrar = sheet(p ? 'Editar promo' : 'Nueva promo', h('div',
    campo('Título', titulo),
    h('div.fila', campo('Emisor', emisor), campo('Tipo', tipo)),
    h('div.fila', campo('Valor (% o cuotas)', valor), campo('Tope de reintegro', tope)),
    campo('Comercio', comercio),
    campo('Rubro', rubro),
    campo('Nombres a buscar en el mapa', marcas),
    h('div.small.mut', { style: { marginTop: '-8px', marginBottom: '12px' } },
      'Separados por coma. Con esto la app encuentra la sucursal más cercana cuando usás el GPS. Dejalo vacío para buscar todo el rubro.'),
    h('div.f', h('label', 'Días que aplica (vacío = todos)'), chipsDias),
    campo('Medio de pago', medio),
    campo('Canal', canal),
    h('div.fila', campo('Desde', desde), campo('Hasta', hasta)),
    h('button.btn', { onclick: async () => {
      if (!titulo.value.trim() && !comercio.value.trim()) return toast('Ponele un título o comercio');
      await DB.guardar('promos', { ...(p || {}),
        titulo: titulo.value.trim() || comercio.value.trim(), comercio: comercio.value.trim() || null,
        emisor: emisor.value, tipo: tipo.value, rubro: rubro.value,
        valor: Number(valor.value || 0), tope: tope.value ? Number(tope.value) : null,
        canal: canal.value, dias: [...diasSel].sort(),
        marcas: marcas.value.split(',').map(s => s.trim()).filter(Boolean),
        osm_filtro: RUBROS.find(r => r.value === rubro.value)?.osm || null,
        medio_pago: medio.value.trim() || null,
        vigencia_desde: desde.value || null, vigencia_hasta: hasta.value || null,
        activa: true, updated_at: new Date().toISOString() });
      cerrar(); toast('Promo guardada');
    } }, 'Guardar'),
    p && h('button.btn.dg', { style: { marginTop: '9px' }, onclick: async () => {
      if (await confirmar('¿Borrar esta promo?')) { await DB.borrar('promos', p.id); cerrar(); }
    } }, 'Borrar')));
}

// =====================================================================
// VISTA: AJUSTES
// =====================================================================
function vistaAjustes(root) {
  if (DB.DEMO) root.append(h('div.aviso.warn',
    'Estás en modo demo: los datos son de ejemplo y viven solo en este navegador. Poné DEMO: false en config.js y cargá tus datos de Supabase para usarla en serio.'));
  root.append(cabecera('Ajustes', DB.state.user?.email,
    h('button.btn.sec.sm', { onclick: () => ir('hoy') }, 'Volver')));

  const inte = p => DB.state.integrations?.find(x => x.proveedor === p);

  root.append(h('section', h('h2.sec', 'Carga automática'),
    h('div.card',
      filaIntegracion('gmail', 'Mail del banco', 'Lee los avisos de compra de Galicia, MODO y Mercado Pago y carga los gastos solos.', inte('gmail')),
      filaIntegracion('mercadopago', 'Mercado Pago', 'Baja tus movimientos directo de la API oficial.', inte('mercadopago')),
      h('div.row',
        h('div.main', h('div.t', 'Avisos en el celular'),
          h('div.s', Notification?.permission === 'granted' ? 'activados' : 'te aviso cada vez que cargue algo')),
        h('button.btn.sec.sm', { onclick: pedirPush },
          Notification?.permission === 'granted' ? 'Activados' : 'Activar')))));

  root.append(h('section', h('h2.sec', 'Cuentas y tarjetas',
      h('button', { onclick: () => formCuenta() }, 'agregar')),
    h('div.card', DB.state.accounts.length
      ? DB.state.accounts.map(a => h('div.row', { onclick: () => formCuenta(a) },
          h('div.main', h('div.t', a.nombre),
            h('div.s', [a.tipo, a.banco, a.ultimos4 && '···· ' + a.ultimos4].filter(Boolean).join(' · '))),
          h('div.amt.small.mut', a.tipo === 'credito' ? `cierra ${a.cierre_dia}` : a.moneda)))
      : h('div.vacio', 'Sin cuentas cargadas'))));

  root.append(h('section', h('h2.sec', 'Categorías', h('button', { onclick: () => formCategoria() }, 'agregar')),
    h('div.card', DB.state.categories.map(c => h('div.row', { onclick: () => formCategoria(c) },
      h('span.dot', { style: { background: c.color } }),
      h('div.main', h('div.t', c.nombre), h('div.s', c.tipo)))))));

  const s = DB.state.settings || {};
  const usd = input({ type: 'number', step: '0.01', value: s.usd_ref || '', placeholder: '0' });
  const pct = input({ type: 'number', min: 10, max: 100, value: s.alert_pct || 80 });
  root.append(h('section', h('h2.sec', 'Preferencias'),
    h('div.card',
      campo('Cotización del dólar de referencia', usd),
      campo('Avisarme al llegar a este % del presupuesto', pct),
      h('button.btn.sec', { onclick: async () => {
        await DB.guardar('settings', { ...s, user_id: DB.state.user.id,
          usd_ref: Number(usd.value || 0), alert_pct: Number(pct.value || 80) });
        toast('Guardado');
      } }, 'Guardar'))));

  root.append(h('section', h('h2.sec', 'Datos'),
    h('div.card',
      h('div.row',
        h('div.main', h('div.t', 'Sincronización'),
          h('div.s', DB.state.ultimaSync
            ? 'última: ' + new Date(DB.state.ultimaSync).toLocaleString('es-AR')
            : 'nunca')),
        h('button.btn.sec.sm', { onclick: async () => {
          await pedirIngesta(); await DB.sincronizar(); toast('Sincronizado'); } }, 'Sincronizar')),
      h('div.row',
        h('div.main', h('div.t', 'Exportar backup'), h('div.s', 'Todos tus datos en un JSON')),
        h('button.btn.sec.sm', { onclick: exportar }, 'Bajar')),
      h('div.row',
        h('div.main', h('div.t', 'Importar backup'), h('div.s', 'Restaurar desde un JSON')),
        h('button.btn.sec.sm', { onclick: importar }, 'Subir')),
      h('div.row',
        h('div.main', h('div.t', 'Cerrar sesión'), h('div.s', DB.state.user?.email)),
        h('button.btn.dg.sm', { onclick: async () => { await DB.salir(); location.reload(); } }, 'Salir')))));

  root.append(h('p.small.mut', { style: { textAlign: 'center', padding: '10px 0 30px' } },
    DB.state.online ? 'Conectado' : 'Sin conexión — los cambios se suben cuando vuelva'));
}

function filaIntegracion(prov, titulo, desc, act) {
  const conectado = act && act.activo;
  return h('div.row',
    h('span.dot', { style: { background: conectado ? 'var(--ok)' : 'var(--tx3)' } }),
    h('div.main', h('div.t', titulo),
      h('div.s', conectado
        ? `${act.cuenta || 'conectado'}${act.ultima_sync ? ' · última lectura ' + new Date(act.ultima_sync).toLocaleDateString('es-AR') : ''}`
        : desc)),
    h('button.btn.sec.sm', { onclick: () => conectarIntegracion(prov, act) },
      conectado ? 'Ver' : 'Conectar'));
}

async function urlOAuth(prov) {
  const { data } = await DB.sb.auth.getSession();
  const jwt = data.session?.access_token || '';
  return `${window.CONFIG.FUNCTIONS_URL || ''}/oauth-start?proveedor=${prov}&t=${encodeURIComponent(jwt)}`;
}

function conectarIntegracion(prov, act) {
  const nombre = prov === 'gmail' ? 'Gmail' : 'Mercado Pago';
  sheet(`Conectar ${nombre}`, cerrar => h('div',
    h('p.mut', { style: { marginTop: '-6px' } }, prov === 'gmail'
      ? 'Le vas a dar permiso de SOLO LECTURA a tu casilla. La app busca únicamente los avisos de compra de Galicia, MODO y Mercado Pago; no lee ni guarda el resto de tus mails.'
      : 'Mercado Pago te va a pedir autorizar la lectura de tus movimientos. Se conecta una vez y después baja todo solo.'),
    act?.ultimo_error && h('div.aviso.warn', 'Último error: ' + act.ultimo_error),
    !window.CONFIG.FUNCTIONS_URL
      ? h('div.aviso.warn', 'Falta configurar FUNCTIONS_URL en config.js con la URL de tus Edge Functions de Supabase.')
      : h('button.btn', { onclick: async e => {
          e.target.disabled = true;
          window.location.href = await urlOAuth(prov);
        } }, `Autorizar ${nombre}`),
    act && h('button.btn.dg', { style: { marginTop: '9px' }, onclick: async () => {
      if (await confirmar(`¿Desconectar ${nombre}?`, 'Desconectar')) {
        await DB.borrar('integrations', act.id); cerrar(); toast('Desconectado');
      }
    } }, 'Desconectar')));
}

function formCategoria(c = null) {
  const x = c || { tipo: 'gasto', color: '#8a8f98' };
  const nombre = input({ value: x.nombre || '' });
  const tipo = select([{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }], { value: x.tipo });
  const color = input({ type: 'color', value: x.color });
  const presu = input({ type: 'number', step: '0.01', value: x.presupuesto || '', placeholder: 'sin tope' });
  const cerrar = sheet(c ? 'Editar categoría' : 'Nueva categoría', h('div',
    campo('Nombre', nombre), campo('Tipo', tipo), campo('Color', color),
    campo('Tope mensual sugerido', presu),
    h('button.btn', { onclick: async () => {
      if (!nombre.value.trim()) return toast('Ponele un nombre');
      await DB.guardar('categories', { ...(c || {}), nombre: nombre.value.trim(), tipo: tipo.value,
        color: color.value, presupuesto: presu.value ? Number(presu.value) : null });
      cerrar();
    } }, 'Guardar'),
    c && h('button.btn.dg', { style: { marginTop: '9px' }, onclick: async () => {
      if (await confirmar(`¿Borrar ${c.nombre}?`)) { await DB.borrar('categories', c.id); cerrar(); }
    } }, 'Borrar')));
}

function exportar() {
  const blob = new Blob([DB.exportarJSON()], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob),
    download: `finanzas-${fechaHoyISO()}.json` });
  document.body.append(a); a.click(); a.remove();
}
function importar() {
  const f = h('input', { type: 'file', accept: '.json', style: { display: 'none' } });
  f.onchange = async () => {
    const txt = await f.files[0].text();
    try { const n = await DB.importarJSON(txt); toast(`${n} registros importados`); }
    catch (e) { toast('Archivo inválido'); }
    f.remove();
  };
  document.body.append(f); f.click();
}

// ------------------------------------------------------------------ push
async function pedirPush() {
  if (!('Notification' in window)) return toast('Este navegador no soporta avisos');
  const p = await Notification.requestPermission();
  if (p !== 'granted') return toast('Permiso denegado');
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!window.CONFIG.VAPID_PUBLIC) { toast('Avisos activados en este dispositivo'); return render(); }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true,
      applicationServerKey: b64ToU8(window.CONFIG.VAPID_PUBLIC) });
    const j = sub.toJSON();
    await DB.guardar('push_subscriptions', { endpoint: j.endpoint,
      p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent });
    toast('Avisos activados');
  } catch (e) { toast('No se pudo activar: ' + e.message); }
  render();
}
function b64ToU8(b64) {
  const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

/** Pide a las Edge Functions que lean los mails y MP ahora mismo. */
async function pedirIngesta() {
  const base = window.CONFIG.FUNCTIONS_URL;
  if (!base || !DB.state.integrations?.length) return;
  const { data } = await DB.sb.auth.getSession();
  const jwt = data.session?.access_token;
  await Promise.all(['gmail-sync', 'mp-sync'].map(f =>
    fetch(`${base}/${f}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ user_id: DB.state.user.id }) }).catch(() => {})));
}

// ------------------------------------------------------------------ avisos locales
function chequeosAutomaticos() {
  const per = F.periodo(new Date());
  const recs = F.recurrentesDelMes(DB.state.recurrings, DB.state.recurring_payments, per);
  const porVencer = recs.filter(r => !r.pagado && r.diasRestantes >= 0 && r.diasRestantes <= 2);
  const vencidos = recs.filter(r => r.vencido);
  if (vencidos.length) toast(`Tenés ${vencidos.length} ${vencidos.length === 1 ? 'gasto fijo vencido' : 'gastos fijos vencidos'}`, 4000);
  else if (porVencer.length) toast(`${porVencer[0].nombre} vence en ${porVencer[0].diasRestantes} días`, 4000);
}

iniciar();
