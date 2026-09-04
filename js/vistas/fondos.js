// =====================================================================
// vistas/fondos.js — lo que no cae todos los meses, y lo que se debe.
//
// El seguro del auto, la patente, la matrícula, las vacaciones. Se saben desde
// enero y aparecen como una sorpresa igual, porque no hay ningún lugar donde
// la plata esté esperándolos. Es lo único que pedían las cuatro apps que
// miramos y que acá no existía.
//
// El número que importa no es cuánto llevás sino CUÁNTO POR MES. "Faltan
// 400.000 y siete meses" no se puede decidir; "57.000 por mes" sí.
//
// Y no inventa nada: lo guardado son los aportes que anotaste. La app no mueve
// plata sola —sigue en tu cuenta— lo que hace es decir que ya tiene dueño, y
// por eso se descuenta de la plata libre. Un fondo que no descuenta es una
// planilla que no cambia ninguna decisión.
// =====================================================================
import { h, icono, iconoDe, hoja, aviso, campo, select, confirmar } from '../ui.js';
import { state, guardar, borrar } from '../db.js';
import * as F from '../finance.js';
import { plata, hoyISO, aNumero } from '../formato.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cuando = iso => {
  const [y, m] = String(iso).split('-').map(Number);
  return `${MESES[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};

export function vistaFondos(root) {
  const hoy = new Date();
  const fondos = (state.fondos || []).filter(f => f.activo !== false)
    .map(f => F.estadoFondo(f, hoy))
    .sort((a, b) => (a.fondo.fecha_objetivo || '9999') < (b.fondo.fecha_objetivo || '9999') ? -1 : 1);
  const d = F.estadoDeudas(state.deudas, 'ARS', hoy);

  const porMes = fondos.filter(e => e.porMes > 0 && !e.listo)
    .reduce((s, e) => s + e.porMes, 0);

  root.replaceChildren(h('div.flow',
    fondos.length ? h('div.grp.pad',
      h('div.ghead', { style: { margin: '0 0 5px' } }, 'Habría que apartar'),
      h('div.cifra', h('em', '$'), new Intl.NumberFormat('es-AR').format(Math.round(porMes))),
      h('div.small.mut', { style: { marginTop: '5px' } }, 'por mes, para llegar a todo'),
      h('div.small.mut', { style: { marginTop: '11px', paddingTop: '11px',
                                    borderTop: '1px solid var(--line)', lineHeight: '1.5' } },
        'Ya tenés apartados ', h('b', { style: { color: 'var(--tx)' } },
          plata(Math.round(fondos.reduce((s, e) => s + e.guardado, 0)))),
        '. Esa plata sigue en tus cuentas, pero no cuenta como libre.')) : null,

    h('section', { style: { marginTop: fondos.length ? '16px' : '0' } },
      h('div.ghead', 'Fondos'),
      fondos.length
        ? h('div.grp', fondos.map(filaFondo))
        : h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.55' } },
            'Nada apartado todavía. Un fondo es algo que sabés que viene y que no ',
            'cae todos los meses: la patente, el seguro, la matrícula, las ',
            'vacaciones. Poné cuánto y para cuándo, y te digo cuánto guardar por mes.')),
      h('button.btn.sec', { style: { marginTop: '12px' }, onclick: () => formFondo() },
        icono('mas', 16), 'Nuevo fondo')),

    h('section', { style: { marginTop: '20px' } },
      h('div.ghead', 'Deudas',
        d.neto !== 0 ? h('span', { style: { textTransform: 'none', letterSpacing: '0',
                                            fontWeight: '500',
                                            color: d.neto < 0 ? 'var(--neg)' : 'var(--pos)' } },
          d.neto < 0 ? `debés ${plata(Math.abs(d.neto))} netos`
                     : `te deben ${plata(d.neto)} netos`) : null),
      d.lista.length
        ? h('div.grp', d.lista.map(filaDeuda))
        : h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.55' } },
            'Nada anotado. Sirve para lo que le debés a alguien y para lo que te ',
            'deben: plata que existe y que no está en ninguna cuenta.')),
      h('button.btn.sec', { style: { marginTop: '12px' }, onclick: () => formDeuda() },
        icono('mas', 16), 'Anotar una deuda'))));

  function filaFondo(e) {
    const f = e.fondo;
    return h('button.li', { style: { alignItems: 'flex-start' },
                            onclick: () => hojaFondo(e) },
      h('div', { class: 'av' + (e.listo ? ' pos' : e.vencido ? ' neg' : e.atraso ? ' amb' : ''),
                 style: { marginTop: '2px' } },
        // La alcancía como respaldo: iconoDe() no conoce "patente" ni
        // "vacaciones", y el icono de "varios" no dice nada.
        icono(f.icono || iconoConocido(f.nombre) || 'hucha', 17)),
      h('div.m',
        h('div.t', f.nombre),
        h('div.s', { style: { whiteSpace: 'normal', lineHeight: '1.45' } },
          e.listo ? '¡Completo!'
          : e.vencido ? `Se pasó la fecha y faltan ${plata(Math.round(e.falta))}`
          : e.porMes != null
            ? `${plata(Math.round(e.porMes))} por mes hasta ${cuando(f.fecha_objetivo)}`
            : `Faltan ${plata(Math.round(e.falta))}`,
          // La barra dentro del renglón: es lo único que se lee de un vistazo.
          h('div.mini', { style: { marginTop: '6px' } },
            h('b', { style: { flex: String(Math.max(1, e.pct)),
                              background: e.listo ? 'var(--pos)' : undefined } }),
            h('span', { style: { flex: String(Math.max(1, 100 - e.pct)) } })),
          e.atraso > 0 && !e.listo
            ? h('div', { style: { marginTop: '4px', color: 'var(--amb)' } },
                `Vas ${plata(Math.round(e.atraso))} atrasado`) : null)),
      h('div.v', plata(Math.round(e.guardado), f.moneda),
        h('small', `de ${plata(Math.round(e.objetivo), f.moneda)}`)));
  }

  function filaDeuda(x) {
    const debo = x.direccion !== 'medeben';
    const vencida = x.vence && x.vence < hoyISO();
    return h('button.li', { onclick: () => formDeuda(x) },
      h('div', { class: 'av ' + (debo ? 'neg' : 'pos') },
        icono(debo ? 'baja' : 'sube', 15)),
      h('div.m', h('div.t', x.nombre),
        h('div.s', [debo ? 'le debés' : 'te debe',
                    x.vence ? (vencida ? `venció el ${dia(x.vence)}` : `para el ${dia(x.vence)}`) : null]
          .filter(Boolean).join(' · '))),
      h('div', { class: 'v ' + (debo ? 'neg' : 'pos') }, plata(Math.round(x.monto), x.moneda)),
      h('span.chev', icono('chev', 15)));
  }

  /** Apartar plata, o corregir el fondo. */
  function hojaFondo(e) {
    const f = e.fondo;
    const monto = h('input', { type: 'text', inputmode: 'decimal',
                               placeholder: String(Math.round(e.porMes || 0) || ''),
                               'aria-label': 'Cuánto apartás' });
    const fecha = h('input', { type: 'date', value: hoyISO() });
    const aportes = Array.isArray(f.aportes) ? f.aportes : [];

    const cerrar = hoja(f.nombre, h('div',
      h('div.grp.pad', { style: { marginBottom: '16px' } },
        h('div', { style: { fontSize: '15px', lineHeight: '1.5' } },
          e.listo ? frag('Ya juntaste los ', h('b', plata(Math.round(e.objetivo), f.moneda)), '.')
          : e.porMes != null
            ? frag('Faltan ', h('b', plata(Math.round(e.falta), f.moneda)), ' y ',
                   h('b', `${e.meses} ${e.meses === 1 ? 'mes' : 'meses'}`), ': ',
                   h('b', { style: { color: 'var(--brand)' } },
                     plata(Math.round(e.porMes), f.moneda)), ' por mes.')
            : frag('Faltan ', h('b', plata(Math.round(e.falta), f.moneda)),
                   '. Poné una fecha y te digo cuánto por mes.'))),

      campo('Cuánto apartás ahora', monto),
      campo('Cuándo', fecha),
      h('button.btn', { onclick: async () => {
        const n = aNumero(monto.value);
        if (!n) { monto.focus(); aviso('Falta el monto'); return; }
        await guardar('fondos', { ...f,
          aportes: [...aportes, { fecha: fecha.value || hoyISO(), monto: n }] });
        cerrar(); aviso(`${plata(n, f.moneda)} apartados en ${f.nombre}`);
      } }, 'Apartar'),

      aportes.length ? h('div', { style: { marginTop: '18px' } },
        h('div.ghead', `Lo que fuiste apartando · ${aportes.length}`),
        h('div.grp', [...aportes].reverse().slice(0, 8).map((a, i) => h('div.li',
          h('div.m', h('div.t', plata(Math.round(a.monto), f.moneda)),
            h('div.s', dia(a.fecha))),
          h('button.iconbtn', { 'aria-label': 'Quitar este aporte', onclick: async () => {
            const k = aportes.length - 1 - i;
            await guardar('fondos', { ...f, aportes: aportes.filter((_, j) => j !== k) });
            cerrar(); aviso('Aporte quitado');
          } }, icono('cerrar', 16))))) ) : null,

      h('div.fila', { style: { marginTop: '18px' } },
        h('button.btn.sec', { onclick: () => { cerrar(); formFondo(f); } }, 'Editar'),
        h('button.btn.dg', { onclick: async () => {
          if (!await confirmar(`¿Borrar el fondo "${f.nombre}"?`)) return;
          await borrar('fondos', f.id); cerrar(); aviso('Borrado');
        } }, 'Borrar'))));
  }
}

/** Un icono solo si de verdad reconoce el nombre; si no, la alcancía. */
const iconoConocido = nombre => {
  const ic = iconoDe(nombre);
  return ic && ic !== 'varios' ? ic : null;
};

const dia = iso => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d}/${m}${y !== new Date().getFullYear() ? `/${String(y).slice(2)}` : ''}`;
};
const frag = (...k) => { const f = document.createDocumentFragment(); f.append(...k.filter(x => x != null)); return f; };

/** Alta y edición de un fondo. */
export function formFondo(f = null) {
  const nuevo = !f;
  const cuentas = (state.accounts || []).filter(a => a.activo !== false && a.tipo !== 'credito');
  const c = {
    nombre: h('input', { type: 'text', value: f?.nombre || '', placeholder: 'Patente del auto' }),
    objetivo: h('input', { type: 'text', inputmode: 'decimal',
                           value: f?.objetivo ? String(f.objetivo) : '', placeholder: '480000' }),
    moneda: select([{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }],
                   { value: f?.moneda || 'ARS' }),
    fecha: h('input', { type: 'date', value: f?.fecha_objetivo || '' }),
    cuenta: select([{ value: '', label: '—' },
                    ...cuentas.map(a => ({ value: a.id, label: a.nombre }))],
                   { value: f?.account_id || '' })
  };

  const cerrar = hoja(nuevo ? 'Nuevo fondo' : 'Editar fondo', h('div',
    campo('Para qué', c.nombre),
    h('div.fila', campo('Cuánto necesitás', c.objetivo), campo('Moneda', c.moneda)),
    h('div.f', h('label', 'Para cuándo'), c.fecha,
      h('div.small.mut', { style: { marginTop: '6px', lineHeight: '1.45' } },
        'Con la fecha puedo decirte cuánto apartar por mes, que es el número ',
        'con el que se decide. Sin ella solo puedo decir cuánto falta.')),
    h('div.f', h('label', 'Dónde va a estar'), c.cuenta,
      h('div.small.mut', { style: { marginTop: '6px', lineHeight: '1.45' } },
        'La plata no se mueve: esto es para saber si está en la cuenta que rinde.')),
    h('div.fila', { style: { marginTop: '4px' } },
      !nuevo && h('button.btn.dg', { onclick: async () => {
        if (!await confirmar(`¿Borrar "${f.nombre}"?`)) return;
        await borrar('fondos', f.id); cerrar(); aviso('Borrado');
      } }, 'Borrar'),
      h('button.btn', { onclick: async () => {
        if (!c.nombre.value.trim()) { c.nombre.focus(); aviso('Falta el nombre'); return; }
        await guardar('fondos', { ...(f || {}),
          nombre: c.nombre.value.trim(), objetivo: aNumero(c.objetivo.value) || 0,
          moneda: c.moneda.value, fecha_objetivo: c.fecha.value || null,
          account_id: c.cuenta.value || null,
          aportes: f?.aportes || [], activo: true,
          orden: f?.orden ?? ((state.fondos || []).length + 1) });
        cerrar(); aviso(nuevo ? 'Fondo creado' : 'Actualizado');
      } }, nuevo ? 'Crear' : 'Guardar'))));
}

/** Alta y edición de una deuda, en las dos direcciones. */
export function formDeuda(x = null) {
  const nuevo = !x;
  const c = {
    nombre: h('input', { type: 'text', value: x?.nombre || '', placeholder: 'A mi vieja' }),
    monto: h('input', { type: 'text', inputmode: 'decimal',
                        value: x?.monto ? String(x.monto) : '' }),
    moneda: select([{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }],
                   { value: x?.moneda || 'ARS' }),
    dir: select([{ value: 'debo', label: 'Yo debo' }, { value: 'medeben', label: 'Me deben' }],
                { value: x?.direccion || 'debo' }),
    vence: h('input', { type: 'date', value: x?.vence || '' }),
    notas: h('input', { type: 'text', value: x?.notas || '', placeholder: 'Opcional' })
  };

  const cerrar = hoja(nuevo ? 'Anotar una deuda' : 'Editar deuda', h('div',
    h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '14px' } },
      'Plata que existe y que no está en ninguna cuenta. Solo deudas: los bienes ',
      'quedan afuera porque un auto tasado a mano envejece mal y termina ',
      'inflando un patrimonio que nadie puede gastar.'),
    campo('Quién', c.nombre),
    h('div.fila', campo('Cuánto', c.monto), campo('Moneda', c.moneda)),
    campo('Para qué lado', c.dir),
    campo('Para cuándo', c.vence),
    campo('Nota', c.notas),
    h('div.fila', { style: { marginTop: '4px' } },
      !nuevo && h('button.btn.dg', { onclick: async () => {
        if (!await confirmar(`¿Borrar "${x.nombre}"?`)) return;
        await borrar('deudas', x.id); cerrar(); aviso('Borrada');
      } }, 'Borrar'),
      !nuevo && h('button.btn.sec', { onclick: async () => {
        await guardar('deudas', { ...x, saldada: true });
        cerrar(); aviso('Saldada');
      } }, 'Saldada'),
      h('button.btn', { onclick: async () => {
        if (!c.nombre.value.trim()) { c.nombre.focus(); aviso('Falta el nombre'); return; }
        await guardar('deudas', { ...(x || {}),
          nombre: c.nombre.value.trim(), monto: aNumero(c.monto.value) || 0,
          moneda: c.moneda.value, direccion: c.dir.value,
          vence: c.vence.value || null, notas: c.notas.value.trim() || null,
          saldada: false, orden: x?.orden ?? ((state.deudas || []).length + 1) });
        cerrar(); aviso(nuevo ? 'Anotada' : 'Actualizada');
      } }, nuevo ? 'Anotar' : 'Guardar'))));
}
