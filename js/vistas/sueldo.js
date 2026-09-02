// =====================================================================
// vistas/sueldo.js — el sueldo: historia, proyeccion y paritarias.
//
// En Argentina se firma un acuerdo cada tres o cuatro meses. Si eso vive en
// el codigo, la proyeccion queda vieja y hay que tocar la app. Aca se carga.
// =====================================================================
import { h, icono, hoja, aviso, campo, confirmar } from '../ui.js';
import { state, guardar, borrar } from '../db.js';
import * as S from '../sueldo.js';
import { plata, periodoLargo, mesCorto, hoyISO } from '../formato.js';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
               'agosto','septiembre','octubre','noviembre','diciembre'];

/** Los recibos guardados, con los nombres que espera sueldo.js. */
const recibosDelEstado = () => (state.recibos || [])
  .map(r => ({ periodo: r.periodo, basico: Number(r.basico) || 0,
               remunerativo: Number(r.remunerativo) || 0,
               noRemunerativo: Number(r.no_remunerativo ?? r.noRemunerativo) || 0,
               deducciones: Number(r.deducciones) || 0, neto: Number(r.neto) || 0,
               sobre: Number(r.sobre) || 0, conceptos: r.conceptos || [] }))
  .sort((a, b) => a.periodo < b.periodo ? -1 : 1);

export function vistaSueldo(root) {
  const recibos = recibosDelEstado();
  const ult = recibos[recibos.length - 1];
  const proximo = ult ? S.sumarMeses(ult.periodo, 1) : hoyISO().slice(0, 7);
  const acuerdo = S.acuerdoVigente(state.paritarias, proximo);
  const sumas = S.sumasDeclaradas(state.sumas_nr);

  root.append(h('div.flow',
    proyeccion(recibos, acuerdo, sumas, ult),
    paritarias(proximo),
    sumasFijas(),
    historia(recibos)));
}

// ---------------------------------------------------------- proyeccion
function proyeccion(recibos, acuerdo, sumas, ult) {
  if (recibos.length < 2) {
    return h('div.vacio',
      h('div.ic', icono('recibo', 24)),
      h('h3', 'Cargá al menos dos recibos'),
      h('p', 'Con dos ya puedo calcular el ritmo de tus aumentos y proyectar el próximo cobro.'),
      h('button.btn.sec', { onclick: () => formRecibo() }, 'Cargar un recibo'));
  }
  const cobro = S.proximoCobro(recibos, {
    diaCobro: Number(state.settings?.dia_cobro) || 1,
    sobre: ult.sobre || Number(state.settings?.sobre_estimado) || 0,
    sobreDesde: ult.periodo, acuerdo, sumas
  });
  if (!cobro) return null;
  const baja = cobro.diferencia < 0;

  return h('section',
    h('div.ghead', `Cobro de ${periodoLargo(cobro.periodo)}`,
      h('span.pill.mut', { style: { textTransform: 'none', letterSpacing: '0' } },
        cobro.conAcuerdo ? 'con paritaria firmada' : 'estimado')),
    h('div.grp.pad',
      h('div', { style: { display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start', gap: '10px' } },
        h('div',
          h('div.cifra', { style: { fontSize: '30px' } }, plata(Math.round(cobro.total))),
          h('div.small.mut', { style: { marginTop: '4px' } },
            `entrarían el ${cobro.fecha.slice(8)}/${cobro.fecha.slice(5, 7)}`)),
        h('span', { class: `pill ${baja ? 'amb' : 'pos'}` },
          h('span', { style: { display: 'grid', transform: baja ? 'rotate(180deg)' : 'none' } },
            icono('sube', 11)),
          `${cobro.porcentaje > 0 ? '+' : ''}${cobro.porcentaje.toFixed(1)} %`)),
      h('div', { style: { display: 'flex', gap: '3px', marginTop: '14px', height: '7px' } },
        h('div', { style: { flex: String(Math.max(1, cobro.banco)), background: 'var(--tx)',
                            borderRadius: '99px 0 0 99px' } }),
        cobro.sobre > 0 && h('div', { style: { flex: String(cobro.sobre),
                                               background: 'var(--tx3)',
                                               borderRadius: '0 99px 99px 0' } })),
      h('div.legend', { style: { marginTop: '9px' } },
        h('span', 'banco ', h('b', plata(Math.round(cobro.banco)))),
        cobro.sobre > 0 && h('span', 'sobre ', h('b', plata(Math.round(cobro.sobre))))),
      cobro.porque.length ? h('div', {
        style: { marginTop: '13px', paddingTop: '13px', borderTop: '1px solid var(--line)',
                 fontSize: '13px', color: 'var(--tx2)', lineHeight: '1.45' } },
        cobro.porque.map(r => h('div', { style: { display: 'flex', gap: '7px', marginTop: '4px' } },
          h('span', { style: { color: r.tipo === 'suba' ? 'var(--pos)'
                                    : r.tipo === 'baja' ? 'var(--amb)' : 'var(--tx3)' } },
            r.tipo === 'suba' ? '+' : r.tipo === 'baja' ? '−' : '·'),
          h('span', r.conMonto ? `${r.texto} (${plata(Math.round(r.monto))})` : r.texto)))) : null));
}

// ---------------------------------------------------------- paritarias
function paritarias(proximo) {
  const lista = (state.paritarias || []).slice()
    .sort((a, b) => a.base < b.base ? 1 : -1);
  const vigente = S.acuerdoVigente(state.paritarias, proximo);

  return h('section',
    h('div.ghead', 'Paritarias',
      h('button', { onclick: () => formParitaria() }, 'Cargar')),
    lista.length
      ? h('div.grp', lista.map(a => {
          const esVigente = vigente && vigente.id === a.id && !S.fueraDeAcuerdo(a, proximo);
          const total = (a.tramos || []).reduce((s, t) => s + Number(t.pct || 0), 0);
          const ultimo = (a.tramos || []).map(t => t.periodo).sort().pop();
          return h('button.li', { onclick: () => formParitaria(a) },
            h('div', { class: 'av' + (esVigente ? ' pos' : '') }, icono('tendencia', 17)),
            h('div.m',
              h('div.t', a.nombre),
              h('div.s', [
                a.acumulativo ? 'acumulativo' : 'no acumulativo',
                `base ${mesCorto(a.base)}`,
                ultimo ? `hasta ${mesCorto(ultimo)}` : null,
                a.revision_en ? `revisión ${mesCorto(a.revision_en)}` : null
              ].filter(Boolean).join(' · '))),
            h('div.v', `+${total.toFixed(1)} %`,
              esVigente && h('small', { style: { color: 'var(--pos)' } }, 'vigente')));
        }))
      : h('div.grp.pad',
          h('div.small.mut', { style: { lineHeight: '1.5' } },
            'Todavía no cargaste ninguna. Sin acuerdo, la proyección usa el ritmo de tus ',
            'últimos recibos y queda marcada como estimada.'),
          h('button.btn.sec', { style: { marginTop: '14px' },
                                onclick: () => formParitaria() }, 'Cargar la primera')));
}

/**
 * Alta y edicion de un acuerdo. Lo importante es el interruptor de
 * acumulativo: "1,9 % en julio, agosto y septiembre" NO acumulativo da saltos
 * mensuales de 1,900 / 1,865 / 1,830 %. Componiendolos, la proyeccion se va
 * para arriba todos los meses.
 */
function formParitaria(a = null) {
  const nuevo = !a;
  let tramos = (a?.tramos || []).map(t => ({ ...t }));
  if (!tramos.length) tramos = [{ periodo: mesSiguiente(), pct: '' }];

  const cNombre = h('input', { type: 'text', value: a?.nombre || '',
                               placeholder: 'Acuerdo julio 2026' });
  const cConvenio = h('input', { type: 'text', value: a?.convenio || 'CCT 130/75' });
  const cBase = h('input', { type: 'month', value: a?.base || '' });
  const cRevision = h('input', { type: 'month', value: a?.revision_en || '' });
  const cUrl = h('input', { type: 'url', value: a?.url || '',
                            placeholder: 'https://…', inputmode: 'url' });
  const cAcum = h('input', { type: 'checkbox', checked: !!a?.acumulativo });

  const filas = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '9px' } });
  const resumen = h('div.small.mut', { style: { marginTop: '10px', lineHeight: '1.45' } });

  function pintarTramos() {
    filas.replaceChildren();
    tramos.forEach((t, i) => {
      const mes = h('input', { type: 'month', value: t.periodo || '',
                               onchange: e => { t.periodo = e.target.value; pintarResumen(); } });
      const pct = h('input', { type: 'text', inputmode: 'decimal', value: String(t.pct ?? ''),
                               placeholder: '1,9',
                               oninput: e => { t.pct = num(e.target.value); pintarResumen(); } });
      filas.append(h('div', { style: { display: 'flex', gap: '9px', alignItems: 'center' } },
        mes,
        h('div', { style: { position: 'relative', flex: '0 0 96px' } }, pct,
          h('span', { style: { position: 'absolute', right: '12px', top: '50%',
                               transform: 'translateY(-50%)', color: 'var(--tx3)',
                               pointerEvents: 'none' } }, '%')),
        h('button.iconbtn', { 'aria-label': 'Quitar tramo', style: { flex: '0 0 40px', width: '40px' },
          onclick: () => { tramos.splice(i, 1); if (!tramos.length) tramos.push({ periodo: '', pct: '' });
                           pintarTramos(); pintarResumen(); } }, icono('cerrar', 16))));
    });
  }
  function pintarResumen() {
    const validos = tramos.filter(t => t.periodo && Number(t.pct) > 0);
    if (!validos.length) { resumen.textContent = ''; return; }
    const total = cAcum.checked
      ? (validos.reduce((f, t) => f * (1 + Number(t.pct) / 100), 1) - 1) * 100
      : validos.reduce((s, t) => s + Number(t.pct), 0);
    const ult = validos.map(t => t.periodo).sort().pop();
    resumen.textContent = cAcum.checked
      ? `Acumulativo: los tramos se componen. Al ${periodoLargo(ult)} el básico sube ${total.toFixed(2)} % sobre la base.`
      : `No acumulativo: los tramos se suman sobre la base. Al ${periodoLargo(ult)} el básico sube ${total.toFixed(1)} % sobre la base, y el salto mensual va bajando.`;
  }
  cAcum.addEventListener('change', pintarResumen);
  pintarTramos(); pintarResumen();

  const cerrar = hoja(nuevo ? 'Cargar paritaria' : 'Editar paritaria', h('div',
    campo('Nombre', cNombre),
    campo('Convenio', cConvenio),
    campo('Sueldo base de qué mes', cBase),
    h('div.f',
      h('label', 'Tramos'),
      h('div.small.mut', { style: { marginTop: '-3px', marginBottom: '9px', lineHeight: '1.45' } },
        'Un tramo por mes, con el porcentaje tal como figura en el acuerdo.'),
      filas,
      h('button.btn.sec', { style: { marginTop: '10px' },
        onclick: () => { tramos.push({ periodo: mesSiguiente(tramos), pct: '' }); pintarTramos(); } },
        icono('mas', 16), 'Agregar mes')),
    h('div.f',
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } },
        cAcum, h('span', { style: { fontSize: '14.5px', color: 'var(--tx)' } }, 'Los tramos se acumulan')),
      resumen),
    campo('Próxima revisión', cRevision),
    campo('De dónde salió', cUrl),
    h('div.fila', { style: { marginTop: '4px' } },
      !nuevo && h('button.btn.dg', { onclick: async () => {
        if (await confirmar(`¿Borrar "${a.nombre}"?`)) { await borrar('paritarias', a.id); cerrar(); aviso('Borrada'); }
      } }, 'Borrar'),
      h('button.btn', { onclick: async () => {
        const validos = tramos.filter(t => t.periodo && Number(t.pct) > 0)
                              .map(t => ({ periodo: t.periodo, pct: Number(t.pct) }))
                              .sort((x, y) => x.periodo < y.periodo ? -1 : 1);
        if (!cBase.value) { cBase.focus(); aviso('Falta el mes del sueldo base'); return; }
        if (!validos.length) { aviso('Cargá al menos un tramo'); return; }
        await guardar('paritarias', { ...(a || {}),
          nombre: cNombre.value.trim() || `Acuerdo ${periodoLargo(validos[0].periodo)}`,
          convenio: cConvenio.value.trim() || null,
          base: cBase.value, acumulativo: cAcum.checked, tramos: validos,
          revision_en: cRevision.value || null, url: cUrl.value.trim() || null, activo: true });
        cerrar(); aviso(nuevo ? 'Paritaria cargada' : 'Actualizada');
      } }, nuevo ? 'Guardar' : 'Guardar cambios'))));
}

// -------------------------------------------------------- sumas fijas
function sumasFijas() {
  const lista = (state.sumas_nr || []).slice().sort((a, b) => (a.desde || '') < (b.desde || '') ? 1 : -1);
  return h('section',
    h('div.ghead', 'Sumas no remunerativas',
      h('button', { onclick: () => formSuma() }, 'Agregar')),
    lista.length
      ? h('div.grp', lista.map(s => h('button.li', { onclick: () => formSuma(s) },
          h('div.av', icono('billete', 17)),
          h('div.m', h('div.t', s.concepto),
            h('div.s', vigenciaTexto(s))),
          h('div.v', plata(Number(s.monto) || 0)))))
      : h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.5' } },
          'Las sumas fijas del acuerdo —la no remunerativa, la recomposición, un bono— ',
          'no acompañan al aumento: son montos fijos. Declarar hasta cuándo se pagan evita ',
          'que la proyección las siga sumando para siempre.')));
}

const vigenciaTexto = s => {
  if (s.desde && s.hasta) return s.desde === s.hasta
    ? `solo ${periodoLargo(s.desde)}`
    : `de ${periodoLargo(s.desde)} a ${periodoLargo(s.hasta)}`;
  if (s.hasta) return `hasta ${periodoLargo(s.hasta)}`;
  if (s.desde) return `desde ${periodoLargo(s.desde)}`;
  return 'sin límite';
};

function formSuma(s = null) {
  const nuevo = !s;
  const cConcepto = h('input', { type: 'text', value: s?.concepto || '',
                                 placeholder: 'Bono extraordinario' });
  const cMonto = h('input', { type: 'text', inputmode: 'decimal',
                              value: s ? String(s.monto) : '', placeholder: '25000' });
  const cDesde = h('input', { type: 'month', value: s?.desde || '' });
  const cHasta = h('input', { type: 'month', value: s?.hasta || '' });

  const cerrar = hoja(nuevo ? 'Nueva suma fija' : 'Editar suma', h('div',
    campo('Concepto', cConcepto),
    campo('Monto por mes', cMonto),
    campo('Desde', cDesde),
    h('div.f', h('label', 'Hasta'), cHasta,
      h('div.small.mut', { style: { marginTop: '6px', lineHeight: '1.45' } },
        'Dejalo vacío si no tiene fecha de corte. Un bono de dos cuotas se declara con ',
        'desde y hasta, si no la proyección lo sigue sumando todos los meses.')),
    h('div.fila', { style: { marginTop: '4px' } },
      !nuevo && h('button.btn.dg', { onclick: async () => {
        if (await confirmar(`¿Borrar "${s.concepto}"?`)) { await borrar('sumas_nr', s.id); cerrar(); aviso('Borrada'); }
      } }, 'Borrar'),
      h('button.btn', { onclick: async () => {
        const monto = num(cMonto.value);
        if (!cConcepto.value.trim()) { cConcepto.focus(); aviso('Falta el concepto'); return; }
        if (!monto) { cMonto.focus(); aviso('Falta el monto'); return; }
        await guardar('sumas_nr', { ...(s || {}), concepto: cConcepto.value.trim(), monto,
          desde: cDesde.value || null, hasta: cHasta.value || null, activo: true });
        cerrar(); aviso(nuevo ? 'Guardada' : 'Actualizada');
      } }, nuevo ? 'Guardar' : 'Guardar cambios'))));
}

// ------------------------------------------------------------ historia
function historia(recibos) {
  if (!recibos.length) return null;
  const vars = S.variacionesBasico(recibos);
  const ritmo = S.ritmoParitaria(recibos);
  return h('section',
    h('div.ghead', 'Recibos',
      h('button', { onclick: () => formRecibo() }, 'Cargar')),
    h('div.grp', recibos.slice().reverse().map(r => {
      const v = vars.find(x => x.hasta === r.periodo);
      return h('button.li', { onclick: () => formRecibo(
        (state.recibos || []).find(x => x.periodo === r.periodo)) },
        h('div', { class: 'av' + (S.esAtipico(r) ? ' amb' : '') }, icono('recibo', 17)),
        h('div.m', h('div.t', periodoLargo(r.periodo)),
          h('div.s', S.esAtipico(r) ? 'mes atípico: no cuenta para el promedio'
                                    : `básico ${plata(r.basico)}`)),
        h('div.v', plata(Math.round(r.neto)),
          v && h('small', { style: { color: v.variacion > 0 ? 'var(--pos)' : 'var(--tx2)' } },
            `${v.variacion > 0 ? '+' : ''}${(v.variacion * 100).toFixed(1)} %`)));
    })),
    recibos.length >= 2 && h('div.small.mut', { style: { padding: '0 4px', lineHeight: '1.45' } },
      `Tus últimos aumentos promedian ${(ritmo * 100).toFixed(1)} % por mes. `
      + 'Se usa solo cuando no hay paritaria cargada que cubra el período.'));
}

function formRecibo(r = null) {
  const nuevo = !r;
  const c = {
    periodo: h('input', { type: 'month', value: r?.periodo || '' }),
    basico: h('input', { type: 'text', inputmode: 'decimal', value: r ? String(r.basico) : '' }),
    rem: h('input', { type: 'text', inputmode: 'decimal', value: r ? String(r.remunerativo) : '' }),
    nr: h('input', { type: 'text', inputmode: 'decimal',
                     value: r ? String(r.no_remunerativo ?? r.noRemunerativo ?? '') : '' }),
    neto: h('input', { type: 'text', inputmode: 'decimal', value: r ? String(r.neto) : '' }),
    sobre: h('input', { type: 'text', inputmode: 'decimal', value: r ? String(r.sobre || '') : '' })
  };
  const cVac = h('input', { type: 'checkbox',
                            checked: /VACACION|AGUINALDO/i.test((r?.conceptos || []).join(' ')) });

  const cerrar = hoja(nuevo ? 'Cargar recibo' : 'Editar recibo', h('div',
    campo('Período', c.periodo),
    campo('Sueldo básico', c.basico),
    campo('Remunerativo', c.rem),
    campo('No remunerativo', c.nr),
    h('div.f', h('label', 'Neto'), c.neto,
      h('div.small.mut', { style: { marginTop: '6px', lineHeight: '1.45' } },
        'El que dice SUELDO NETO, no el bruto ni el costo del empleador. ',
        'Es lo que acredita el banco.')),
    campo('Sobre en efectivo', c.sobre),
    h('div.f', h('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } },
      cVac, h('span', { style: { fontSize: '14.5px', color: 'var(--tx)' } },
        'Tenía vacaciones o aguinaldo')),
      h('div.small.mut', { style: { lineHeight: '1.45' } },
        'Un mes con vacaciones se paga a un valor diario más alto e infla el promedio. ',
        'Marcado, queda fuera del cálculo del ritmo.')),
    h('div.fila', { style: { marginTop: '4px' } },
      !nuevo && h('button.btn.dg', { onclick: async () => {
        if (await confirmar(`¿Borrar el recibo de ${periodoLargo(r.periodo)}?`)) {
          await borrar('recibos', r.id); cerrar(); aviso('Borrado'); }
      } }, 'Borrar'),
      h('button.btn', { onclick: async () => {
        if (!c.periodo.value) { c.periodo.focus(); aviso('Falta el período'); return; }
        const rem = num(c.rem.value), nr = num(c.nr.value);
        const neto = num(c.neto.value) || (rem + nr) * 0.805;
        await guardar('recibos', { ...(r || {}), periodo: c.periodo.value,
          basico: num(c.basico.value), remunerativo: rem, no_remunerativo: nr,
          deducciones: Math.max(0, rem + nr - neto), neto, sobre: num(c.sobre.value),
          conceptos: cVac.checked ? ['SUELDO MENSUAL', 'VACACIONES'] : ['SUELDO MENSUAL'],
          concepto: 'mensual', estimado: false });
        cerrar(); aviso(nuevo ? 'Recibo cargado' : 'Actualizado');
      } }, nuevo ? 'Guardar' : 'Guardar cambios'))));
}

// ---------------------------------------------------------------------
const num = v => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;

/** El mes siguiente al ultimo tramo cargado, o el que viene. */
function mesSiguiente(tramos = []) {
  const ult = tramos.map(t => t.periodo).filter(Boolean).sort().pop();
  if (ult) return S.sumarMeses(ult, 1);
  return S.sumarMeses(hoyISO().slice(0, 7), 1);
}
