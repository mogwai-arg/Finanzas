// =====================================================================
// vistas/extracto.js — subir el resumen de CUENTA del banco.
//
// El de tarjeta trae lo que compraste. Este trae lo que se movió en la
// cuenta, y ahí adentro están los gastos hormiga que no manda ningún aviso:
// mantenimiento, seguros que se renuevan solos, el impuesto al débito y al
// crédito, retenciones. Cada uno chico, todos los meses, y ninguno aparece en
// una lista de gastos porque nadie los carga a mano.
//
// El banco avisa por mail que el resumen está, pero no lo adjunta: hay que
// bajarlo de su app. Así que acá no se puede automatizar el paso del medio —
// se avisa, y cuando el archivo está, la app hace el resto.
// =====================================================================
import { h, frag, icono, hoja, aviso, campo, select } from '../ui.js';
import { state, guardar, guardarVarios } from '../db.js';
import { parseExtracto, revisarExtracto, aMovimientos, cargosDelBanco,
         queCargo, conciliar, cargosRepetidos } from '../extracto.js';
import { plata } from '../formato.js';
import { parseLista, revisarLista, aMovimientos as listaAMovimientos,
         pagosDeResumen } from '../lista.js';

// El formulario se pide recién cuando se toca la fila. Cargarlo arriba deja
// dos módulos esperándose entre sí y la pantalla queda en blanco.
const abrirMovimiento = tx => import('./form-movimiento.js').then(m => m.formMovimiento(tx));

export function formImportarExtracto(yaBajado = null) {
  const texto = h('textarea', {
    rows: '7', placeholder: 'Pegá acá el texto del resumen de cuenta…',
    style: { width: '100%', fontSize: '16px', lineHeight: '1.45',
             fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
             padding: '11px 12px', resize: 'vertical' }
  });
  const salida = h('div');
  const pie = h('div.fila', { style: { marginTop: '4px' } });
  const estado = h('div.small.mut', { style: { marginTop: '10px', lineHeight: '1.45' } });
  const archivo = h('input', { type: 'file',
                               accept: 'application/pdf,.pdf,.txt,image/*',
                               style: { display: 'none' },
                               onchange: e => leerArchivo(e.target.files[0]) });

  const CLAVE_KEY = 'bishusha.clavePdf';
  const claveGuardada = () => { try { return localStorage.getItem(CLAVE_KEY) || ''; }
                                catch { return ''; } };

  async function leerArchivo(f, { clave } = {}) {
    if (!f) return;
    salida.replaceChildren(); pie.replaceChildren();
    if (f.name && /\.txt$/i.test(f.name)) {
      texto.value = await f.text(); leer(); return;
    }
    // Una captura. Leerla acá sería meter un motor de OCR de varios megas en
    // la app para hacer peor lo que el teléfono ya hace muy bien: iOS y
    // Android leen el texto de una imagen desde la galería, y de ahí sale
    // perfecto y sin inventar un cero. Así que se explica el camino corto en
    // vez de bajar el camino largo.
    if (/^image\//.test(f.type || '') || /\.(png|jpe?g|heic|webp)$/i.test(f.name || '')) {
      estado.replaceChildren(
        h('div', { style: { lineHeight: '1.55' } },
          h('b', 'Es una captura.'), ' Tu teléfono la lee mejor que la app:'),
        h('div', { style: { marginTop: '8px', lineHeight: '1.7' } },
          h('div', '1. Abrila en Fotos.'),
          h('div', '2. Mantené el dedo sobre el texto y elegí "Seleccionar todo".'),
          h('div', '3. Copiá y pegá acá abajo.')),
        h('div', { style: { marginTop: '8px' } },
          'Sale exacto y sin inventar ningún número, que con plata es lo que importa.'));
      return;
    }
    estado.textContent = 'Abriendo el PDF…';
    try {
      const { textoDePDF } = await import('../pdf.js');
      texto.value = await textoDePDF(f, {
        clave: clave ?? claveGuardada(),
        alAvanzar: (n, total) => { estado.textContent = `Leyendo página ${n} de ${total}…`; }
      });
      if (clave) { try { localStorage.setItem(CLAVE_KEY, clave); } catch { /* modo privado */ } }
      if (texto.value.replace(/\s/g, '').length < 40) {
        // El PDF abrió pero no tiene letras: es una imagen. Es común cuando
        // se baja desde la app del banco en vez de la web.
        estado.textContent = 'Ese PDF no tiene texto adentro: es una imagen. ' +
          'Probá bajarlo desde la web del banco, que suele darlo con texto.';
        return;
      }
      estado.textContent = `${f.name || 'El resumen'} · ${texto.value.split('\n').length} líneas`;
      leer();
    } catch (e) {
      if (e?.name === 'PideClave') { pedirClave(f); return; }
      // El error de verdad, no "no pude": puede ser el archivo, puede ser el
      // navegador, y desde afuera se ven igual. Sin decirlo no hay forma de
      // arreglarlo, ni de que me lo cuenten.
      estado.replaceChildren(
        h('div', 'No pude abrir el PDF. Podés abrirlo vos, copiar el texto y pegarlo acá.'),
        h('div', { style: { marginTop: '7px', fontFamily: 'ui-monospace, monospace',
                            fontSize: '11px', color: 'var(--tx3)', lineHeight: '1.5',
                            wordBreak: 'break-word' } },
          `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 160)}`,
          // La primera línea del stack dice en qué archivo y en qué función
          // pasó. Sin eso, "undefined is not a function" puede ser cualquier
          // cosa de un archivo de medio megabyte.
          e?.stack ? h('div', { style: { marginTop: '5px', opacity: '.75' } },
            String(e.stack).split('\n').slice(0, 3).join(' ⏎ ').slice(0, 260)) : null));
      console.warn('pdf', e);
    }
  }

  function pedirClave(f) {
    const inp = h('input', { type: 'password', inputmode: 'numeric',
                             placeholder: 'Suele ser tu DNI, sin puntos',
                             value: claveGuardada() });
    const btn = h('button.btn', { style: { marginTop: '14px' } }, 'Abrir el resumen');
    btn.onclick = () => { cerrarClave(); leerArchivo(f, { clave: inp.value.trim() }); };
    const cerrarClave = hoja('El resumen tiene clave', h('div',
      h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '14px' } },
        'Casi siempre es el DNI sin puntos. Queda en este teléfono nada más.'),
      campo('Contraseña del PDF', inp), btn));
    estado.textContent = 'El PDF tiene contraseña.';
  }

  const cerrar = hoja('Traer movimientos del banco', h('div',
    h('div.small.mut', { style: { lineHeight: '1.5', marginBottom: '12px' } },
      'El resumen de la CUENTA en PDF —ahí están las comisiones y los seguros ',
      'que no avisa nadie— o la lista de movimientos de la app del banco, que ',
      'está al día y sirve igual para la cuenta y para la tarjeta.'),
    h('button.btn', { onclick: () => archivo.click() },
      icono('banco', 17), 'Elegir el PDF del resumen'),
    archivo, estado,
    h('div.small.mut', { style: { margin: '18px 0 8px', textAlign: 'center' } }, 'o pegá el texto'),
    texto,
    // Cómo sacar el texto de una captura sin escribirlo a mano. Es lo que
    // convierte "sacale una foto a la pantalla" en algo que funciona hoy.
    h('div.small.mut', { style: { margin: '9px 2px 0', lineHeight: '1.5' } },
      'De una captura: abrila en Fotos, mantené el dedo sobre el texto, ',
      '"Seleccionar todo" y copiá. El teléfono lo lee mejor que cualquier cosa ',
      'que pueda hacer la app.'),
    h('button.btn.sec', { style: { marginTop: '10px' }, onclick: () => leer() },
      icono('buscar', 16), 'Leer lo pegado'),
    salida, pie));

  if (yaBajado) setTimeout(() => leerArchivo(yaBajado), 0);

  function leer() {
    salida.replaceChildren(); pie.replaceChildren();
    // El resumen primero porque trae más —saldos con qué verificar, número de
    // cuenta, período impreso—. La lista es el plan B y no le pide nada al
    // formato: nombre, fecha e importe.
    const r = parseExtracto(texto.value);
    if (r && r.movimientos.length) { previsualizar(r); return; }

    const l = parseLista(texto.value);
    if (l) { previsualizar(l, { lista: true }); return; }

    if (r) {
      salida.append(nota('Lo reconocí pero no encontré movimientos. Suele pasar cuando se ' +
        'copia solo la primera hoja.'));
      return;
    }
    salida.append(porQueNo(texto.value));
  }

  function previsualizar(r, { lista = false } = {}) {
    // La lista de la app del banco sirve igual para la tarjeta: se ve casi
    // idéntica. El resumen de cuenta, no —es de una cuenta y punto—.
    const cuentas = state.accounts.filter(a =>
      a.activo !== false && (lista || a.tipo !== 'credito'));
    // Se propone la que coincide por número de cuenta, y si no, la primera en
    // pesos: es casi siempre la del banco que manda el resumen.
    const propuesta = cuentas.find(a => r.cuenta && a.ultimos4 &&
                                        r.cuenta.includes(a.ultimos4)) ||
                      cuentas.find(a => a.tipo !== 'credito' && (a.moneda || 'ARS') === 'ARS');
    const cual = select(cuentas.map(a => ({ value: a.id, label: a.nombre })),
                        { value: propuesta?.id || cuentas[0]?.id || '' });

    // Cambiar de cuenta cambia TODO, no solo el cotejo: si es una tarjeta, la
    // plata que entra es el pago del resumen y no un ingreso, y los pagos
    // dejan de cargarse. Dibujar una vez y actualizar un pedazo dejaba media
    // pantalla contando otra cosa.
    cual.addEventListener('change', () => pintarTodo());
    pintarTodo();

    function pintarTodo() {
    salida.replaceChildren(); pie.replaceChildren();
    const esTarjeta = (state.accounts.find(a => a.id === cual.value) || {}).tipo === 'credito';
    const conTarjeta = lista && esTarjeta;
    const todos = lista ? listaAMovimientos(r, null, { tarjeta: conTarjeta })
                        : aMovimientos(r, null);
    const yaEstan = new Set(state.transactions.map(t => t.externo_id).filter(Boolean));
    const nuevos = todos.filter(m => !yaEstan.has(m.externo_id));
    const cargos = cargosDelBanco(r.movimientos);

    // Lo que ya está cargado por otro lado: mismo día y mismo importe. No se
    // vuelve a cargar, y decirlo es lo que hace que uno confíe en el número.
    const yaCargados = nuevos.filter(m => state.transactions.some(t =>
      String(t.fecha).slice(0, 10) === m.fecha &&
      Math.abs(Number(t.monto) - m.monto) < 0.05 && t.tipo === m.tipo));
    const aCargar = nuevos.filter(m => !yaCargados.includes(m));

    // El caso normal del RESUMEN: lo de todos los días ya entró por los avisos
    // del banco, y lo que de verdad falta cargar son las comisiones. En una
    // LISTA es al revés —se pega justamente para traer lo que no está— así que
    // ahí viene destildado.
    const soloBanco = h('input', { type: 'checkbox', checked: !lista,
                                   onchange: () => pintarBoton() });

    // El cotejo se rehace al cambiar de cuenta: comparar contra otra cuenta
    // da otro resultado, y dejarlo viejo sería peor que no mostrarlo. Se
    // declara acá y no abajo porque el append de más abajo ya lo usa.
    const cotejo = h('div');
    const cuantos = () => soloBanco.checked ? aCargar.filter(m => m.cargoBanco).length
                                            : aCargar.length;

    // append() de un null escribe la palabra "null" en la pantalla: no es h(),
    // que los saltea. Se filtran antes.
    salida.append(...[
      h('div.grp', { style: { marginTop: '14px' } },
        dato(lista ? 'De dónde' : 'Cuenta',
             lista ? 'Lista de la app del banco' : (r.cuenta || r.banco || '—')),
        r.periodo.desde ? dato('Período',
          `${dia(r.periodo.desde)} al ${dia(r.periodo.hasta)}`) : null,
        dato('Movimientos', String(r.movimientos.length)),
        cargos.total ? dato('Te cobró el banco', `${plata(Math.round(cargos.total))} · ` +
          `${cargos.conceptos.length} ${cargos.conceptos.length === 1 ? 'concepto' : 'conceptos'}`) : null,
        yaCargados.length ? dato('Ya estaban cargados', `${yaCargados.length}, no se repiten`) : null,
        conTarjeta && pagosDeResumen(r).length
          ? dato('Pagos del resumen',
                 `${pagosDeResumen(r).length}, no se cargan`) : null,
        r.cuadra === false ? dato('Ojo', 'los saldos no cierran: puede faltar una hoja') : null),

      cargos.conceptos.length ? h('div', { style: { marginTop: '16px' } },
        h('div.ghead', 'Lo que te cobró el banco este mes'),
        h('div.grp', cargos.conceptos.map(c => h('div.li',
          h('div.av.amb', icono('banco', 15)),
          h('div.m', h('div.t', c.nombre),
            h('div.s', `${c.cuantos} ${c.cuantos === 1 ? 'cargo' : 'cargos'}`)),
          h('div.v', plata(Math.round(c.monto))))))) : null,

      h('div', { style: { marginTop: '16px' } }, campo('Cargar en', cual)),
      cotejo,
      conTarjeta && pagosDeResumen(r).length
        ? h('div.small.mut', { style: { padding: '10px 4px 0', lineHeight: '1.5' } },
            'El pago del resumen no se carga desde acá: la lista no dice de qué ',
            'cuenta salió, y anotarlo dos veces es peor que no anotarlo. Se anota ',
            'del lado de la cuenta. Abajo se ve si el que anotaste coincide.')
        : null,

      cargos.conceptos.length ? h('label.li', { style: { padding: '11px 0' } },
        h('div.m', h('div.t', 'Solo lo que cobra el banco'),
          h('div.s', { style: { whiteSpace: 'normal', lineHeight: '1.4' } },
            'Los gastos de todos los días ya entran por los avisos del banco. ' +
            'Lo que no entra por ningún lado son las comisiones.')),
        soloBanco) : null
    ].filter(Boolean));

    cotejo.replaceChildren(
      cual.value ? conciliacion(r, cual.value, { lista, tarjeta: conTarjeta }) : null);

    const btn = h('button.btn');
    const pintarBoton = () => {
      const n = cuantos();
      btn.textContent = n ? `Cargar ${n} ${n === 1 ? 'movimiento' : 'movimientos'}`
                          : 'No hay nada nuevo para cargar';
      btn.disabled = !n;
    };
    btn.onclick = () => importar(r, cual.value,
      soloBanco.checked ? aCargar.filter(m => m.cargoBanco) : aCargar);
    pintarBoton();
    pie.append(btn);
    }
  }

  async function importar(r, destino, filas) {
    if (!destino) { aviso('Elegí en qué cuenta'); return; }
    // Los cargos del banco van todos a la misma categoría: separados del
    // supermercado se pueden mirar juntos, y juntos es como se discuten.
    const cat = await categoriaBancarios();
    const listas = filas.map(m => ({
      ...m, account_id: destino,
      category_id: m.cargoBanco ? cat.id : null,
      // Un cargo del banco no es una adivinanza: ya te lo cobraron.
      revisado: true, cargoBanco: undefined
    }));
    await guardarVarios('transactions', listas);
    cerrar();
    aviso(`${listas.length} ${listas.length === 1 ? 'movimiento cargado' : 'movimientos cargados'}`);
    proponerFijos(destino, cat);
  }

  async function categoriaBancarios() {
    const hay = (state.categories || []).find(c => /banc/i.test(c.nombre || ''));
    if (hay) return hay;
    return guardar('categories', { nombre: 'Bancarios', tipo: 'gasto', icono: 'banco',
                                   color: '#5C6272', orden: 99 });
  }

  /**
   * El banco contra lo que anotaste.
   *
   * "Ya estaban cargados 12" es la mitad fácil. La otra mitad es la que da
   * tranquilidad: lo que está en la app y NO en el banco. Ahí aparece el
   * gasto anotado dos veces, el que quedó con el importe equivocado y el que
   * se cargó en la cuenta que no era. El extracto es la única verdad
   * disponible para encontrarlos.
   */
  function conciliacion(r, cuentaId, { lista = false, tarjeta = false } = {}) {
    const c = conciliar(r, state.transactions, cuentaId, { tarjeta });
    const nombre = (state.accounts.find(a => a.id === cuentaId) || {}).nombre || 'la cuenta';
    const todoBien = !c.faltan.length && !c.sobran.length && !c.difieren.length;

    // El numero del encabezado es el total, no las filas que entran en
    // pantalla: decir 12 cuando son 19 es peor que no decir nada.
    const bloque = (rot, filas, color, ayuda, total = filas.length) =>
      !filas.length ? null : h('div',
      { style: { marginTop: '16px' } },
      h('div.ghead', rot, h('span', { style: { textTransform: 'none', letterSpacing: '0',
                                               fontWeight: '500', color } },
        String(total))),
      h('div.grp', filas),
      ayuda ? h('div.small.mut', { style: { padding: '9px 4px 0', lineHeight: '1.5' } },
        ayuda) : null);

    return h('div', { style: { marginTop: '18px' } },
      h('div.grp.pad',
        h('div', { style: { fontSize: '15px', lineHeight: '1.5' } },
          todoBien
            ? frag('De los ', h('b', String(c.total)), ' movimientos del banco, ',
                h('b', { style: { color: 'var(--pos)' } }, 'coinciden todos'),
                ` con lo que tenés en ${nombre}.`)
            : frag('De los ', h('b', String(c.total)), ' movimientos del banco, ',
                h('b', String(c.coinciden)), ' coinciden con ', nombre, '. ',
                'Lo demás está abajo.'))),

      bloque('Falta cargarlos', c.faltan.slice(0, 12).map(f => h('div.li',
        h('div.av.amb', icono('mas', 15)),
        h('div.m', h('div.t', f.comercio || f.descripcion),
          h('div.s', `${dia(f.fecha)} · ${f.tipo}`)),
        h('div.v', plata(Math.round(f.importe))))), 'var(--amb)',
        (c.faltan.length > 12 ? `Y ${c.faltan.length - 12} más. ` : '') +
        (lista ? 'Están en el banco y no en la app. Los carga el botón de abajo.'
               : 'Están en el banco y no en la app. Se cargan con el botón de abajo si ' +
                 'destildás "solo lo que cobra el banco".'), c.faltan.length),

      bloque('Sobran en la app', c.sobran.slice(0, 8).map(a => h('button.li', {
        onclick: () => abrirMovimiento(a.tx) },
        h('div.av.neg', icono('cerrar', 15)),
        h('div.m', h('div.t', a.tx.comercio || a.tx.descripcion || 'Sin nombre'),
          h('div.s', `${dia(a.fecha)} · ${a.tipo}`)),
        h('div.v', plata(Math.round(a.importe))),
        h('span.chev', icono('chev', 15)))), 'var(--neg)',
        (c.sobran.length > 8 ? `Y ${c.sobran.length - 8} más. ` : '') +
        'Están cargados y el banco no los tiene. Suele ser un gasto anotado ' +
        'dos veces, o uno que va en otra cuenta. Tocá para abrirlo.', c.sobran.length),

      c.repetidosEnApp.length ? h('div.small', {
        style: { padding: '9px 4px 0', lineHeight: '1.5', color: 'var(--amb)',
                 fontWeight: '600' } },
        `De esos, ${c.repetidosEnApp.length} ` +
        `${c.repetidosEnApp.length === 1 ? 'está' : 'están'} dos veces el mismo día ` +
        'y por el mismo importe.') : null,

      bloque('No coincide el importe', c.difieren.map(d => h('button.li', {
        onclick: () => abrirMovimiento(d.app.tx) },
        h('div.av.amb', icono('sube', 15)),
        h('div.m', h('div.t', d.banco.comercio || d.banco.descripcion),
          h('div.s', `${dia(d.banco.fecha)} · anotaste ${plata(Math.round(d.app.importe))}`)),
        h('div.v', plata(Math.round(d.banco.importe)), h('small', 'el banco')),
        h('span.chev', icono('chev', 15)))), 'var(--amb)',
        'Mismo día y tipo, distinto importe. Manda el banco: tocá para corregirlo.'));
  }

  /**
   * Por qué no lo pudo leer, con lo que sí vio.
   *
   * "No lo reconozco" a secas es un callejón sin salida: no se sabe si el
   * problema es el formato, si copiaste media hoja o si el PDF vino
   * escaneado. Con esto se sabe en qué paso falló, y de paso alcanza para
   * mandarlo y que le arreglemos el formato.
   */
  function porQueNo(txt) {
    const v = revisarExtracto(txt);
    const lst = revisarLista(txt);
    // Si vino una lista a medias —fechas sin importes, o al revés— el
    // problema no es el resumen y decir "no parece un resumen" manda a
    // arreglar lo que no está roto.
    if (lst.fechas >= 2 || lst.importes >= 2) {
      return h('div', { style: { marginTop: '14px' } },
        h('div.grp.pad', h('div', { style: { lineHeight: '1.55' } },
          'Parece la lista de movimientos de la app del banco, pero quedó ',
          'incompleta: encontré ', h('b', `${lst.fechas} fechas`), ', ',
          h('b', `${lst.importes} importes`), ' y ', h('b', `${lst.nombres} nombres`),
          '. Hacen falta los tres de cada movimiento.',
          h('div', { style: { marginTop: '9px', color: 'var(--tx2)' } },
            'Suele pasar cuando se selecciona solo una columna. Probá de nuevo ',
            'con "Seleccionar todo".'))));
    }
    const linea = (ok, t) => h('div.li',
      h('div', { class: 'av ' + (ok ? 'pos' : 'amb') }, icono(ok ? 'check' : 'cerrar', 15)),
      h('div.m', h('div.t', t)));

    const motivo = v.lineas < 3
      ? 'Llegó casi nada de texto. Si el PDF es una foto o un escaneo no tiene ' +
        'letras adentro, y ahí no hay nada que leer: probá bajarlo de nuevo desde ' +
        'la web del banco en vez de la app.'
      : v.pareceTarjeta && v.conSaldo === 0
      ? 'Esto parece el resumen de la TARJETA, no el de la cuenta. El de tarjeta ' +
        'se sube desde Tarjetas → Importar un resumen.'
      : v.conFecha === 0
      ? 'No encontré ninguna línea que empiece con una fecha. Puede ser que el ' +
        'PDF haya salido con las columnas mezcladas.'
      : v.conSaldo === 0
      ? 'Las líneas traen un solo importe. Un extracto de cuenta lleva el saldo ' +
        'al lado de cada movimiento, y es de ahí de donde saco si entró o salió.'
      : 'Leí las líneas pero no pude armarlo. Mandame el texto de abajo y lo ajusto.';

    return h('div', { style: { marginTop: '14px' } },
      h('div.grp.pad', h('div.small', { style: { lineHeight: '1.55' } }, motivo)),
      h('div.ghead', { style: { marginTop: '16px' } }, 'Qué vi'),
      h('div.grp',
        linea(v.lineas >= 3, `${v.lineas} ${v.lineas === 1 ? 'línea' : 'líneas'} de texto`),
        linea(v.conFecha > 0, `${v.conFecha} empiezan con una fecha`),
        linea(v.conSaldo > 0, `${v.conSaldo} traen importe y saldo`),
        linea(v.nombraSaldo, v.nombraSaldo ? 'Nombra el saldo' : 'No dice "saldo" en ningún lado')),
      v.muestra.length ? h('div', { style: { marginTop: '16px' } },
        h('div.ghead', 'Así vienen las filas'),
        h('div.grp.pad', v.muestra.map(m =>
          h('div', { style: { fontFamily: 'ui-monospace, monospace', fontSize: '11.5px',
                              lineHeight: '1.6', wordBreak: 'break-all',
                              color: 'var(--tx2)' } }, m)))) : null);
  }

  const dato = (k, v) => h('div.li', h('div.m', h('div.t', k)), h('div.v', v));
  const dia = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—';
  const nota = txt => h('div.grp.pad', { style: { marginTop: '14px' } },
    h('div.small.mut', { style: { lineHeight: '1.5' } }, txt));

  return cerrar;
}

/**
 * "Esto se repite todos los meses, ¿lo hago gasto fijo?"
 *
 * El seguro de cuenta y el mantenimiento se cobran siempre, con nombre y
 * todo. Como gastos sueltos quedan afuera de la detección de aumentos, que es
 * justo donde más valen: un seguro que sube 40 % cuando el resto sube 6 % es
 * una llamada al banco.
 *
 * Lo que hace que esto sirva desde el primer día no es crear el gasto fijo
 * —eso es una fila vacía— sino traerle la historia: cada mes que el cargo
 * aparece en el extracto se guarda como un pago hecho. Sin eso, la detección
 * de aumentos no tiene con qué comparar y habría que esperar tres meses.
 *
 * Van como débito automático, que es lo que son: nadie los paga, caen. Así no
 * ensucian "lo que se viene" con cosas que no hay que hacer.
 */
function proponerFijos(cuentaId, categoria) {
  const repes = cargosRepetidos(state.transactions);
  // Los que ya son gasto fijo no se vuelven a proponer.
  const yaEs = n => (state.recurrings || []).some(r =>
    r.activo !== false && (r.nombre || '').toLowerCase() === n.toLowerCase());
  const nuevos = repes.filter(c => !yaEs(c.nombre));
  if (!nuevos.length) return;

  const tildes = new Map(nuevos.map(c => [c.id, h('input', { type: 'checkbox', checked: true })]));

  const fila = c => h('label.li', { style: { alignItems: 'flex-start' } },
    h('div.av.amb', { style: { marginTop: '2px' } }, icono('banco', 15)),
    h('div.m',
      h('div.t', c.nombre),
      h('div.s', { style: { whiteSpace: 'normal', lineHeight: '1.45' } },
        `${c.meses.length} meses seguidos · último ${plata(Math.round(c.ultimo.monto))} · `,
        h('b', plata(c.alAno)), ' por año')),
    tildes.get(c.id));

  const cerrarProp = hoja('Esto se repite todos los meses', h('div',
    h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '14px' } },
      'Como gastos sueltos no se pueden vigilar. Como gastos fijos entran en ',
      'la detección de aumentos: cuando uno sube más que el resto, la app te ',
      'avisa. Los meses que ya están en el extracto se guardan como historia, ',
      'así sirve desde hoy y no dentro de tres meses.'),
    h('div.grp', nuevos.map(fila)),
    h('button.btn', { style: { marginTop: '16px' }, onclick: async () => {
      const elegidos = nuevos.filter(c => tildes.get(c.id).checked);
      if (!elegidos.length) { cerrarProp(); return; }
      for (const c of elegidos) {
        const r = await guardar('recurrings', {
          nombre: c.nombre, monto_estimado: Math.round(c.ultimo.monto), moneda: 'ARS',
          dia_vencimiento: c.dia, category_id: categoria?.id || null,
          account_id: cuentaId || null,
          // Nadie los paga: caen. Como débito automático no aparecen en "lo
          // que se viene", que es una lista de cosas para hacer.
          debito_automatico: true,
          // El monto cambia todos los meses —la retención de ingresos brutos
          // no se parece a la del mes pasado— y marcarlo fijo mentiría.
          variable: true,
          activo: true, orden: (state.recurrings.length || 0) + 1
        });
        // La historia. Sin esto el gasto fijo nace sin nada con qué comparar.
        await guardarVarios('recurring_payments', c.meses.map(m => ({
          recurring_id: r.id, periodo: m.periodo, monto: Math.round(m.monto),
          transaction_id: m.tx?.id || null,
          pagado_at: new Date(`${m.tx?.fecha || m.periodo + '-01'}T12:00:00`).toISOString()
        })));
      }
      cerrarProp();
      aviso(`${elegidos.length} ${elegidos.length === 1 ? 'gasto fijo creado' : 'gastos fijos creados'}`);
    } }, 'Hacerlos gastos fijos'),
    h('button.btn.sec', { style: { marginTop: '9px' }, onclick: () => cerrarProp() },
      'Ahora no')));
}
