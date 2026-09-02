// =====================================================================
// sueldo.js — modelo de recibo argentino y proyeccion de paritarias.
// Logica pura: sin DOM, sin red. Testeable.
//
// Por que existe: en Argentina el sueldo cambia todos los meses. Pedirle
// al usuario que cargue "cuanto gano" da un numero que queda viejo en
// treinta dias. La app lo deduce de los recibos que ya cobro.
// =====================================================================

/**
 * Aportes del trabajador. Verificado contra recibos reales del CCT 130/75:
 * el calculo da exacto al centavo en meses sin vacaciones.
 *
 *   jubilacion 11 % + ley 19032 3 % + obra social 3 %  -> sobre el REMUNERATIVO
 *   sindicato   2 % + FAECYS      0,5 %                -> sobre el TOTAL
 *
 * La distincion importa: las sumas no remunerativas no pagan jubilacion
 * ni obra social, pero si pagan cuota sindical.
 */
export const APORTES = {
  sobreRemunerativo: 0.17,
  sobreTotal: 0.025
};

/**
 * Los tres numeros del recibo, que es facil confundir porque estan uno debajo
 * del otro en la misma hoja:
 *
 *   remunerativo + no remunerativo          = BRUTO
 *   bruto - aportes del trabajador          = NETO      <- lo que entra al banco
 *   bruto + contribuciones patronales       = COSTO EMPLEADOR   <- no lo cobra nadie
 *
 * Usar el bruto como "lo que entra" sobreestima el ingreso en el 18 % largo.
 */
export const brutoDeRecibo = r => redondear(Number(r.remunerativo || 0) + Number(r.noRemunerativo || 0));
export const netoDeclarado = r => redondear(brutoDeRecibo(r) - Number(r.deducciones || 0));

/** Meses en los que se cobra el aguinaldo (SAC). */
export const MESES_SAC = [6, 12];

// ---------------------------------------------------------------------
// UN RECIBO
// ---------------------------------------------------------------------

/**
 * Reconstruye deducciones y neto a partir del bruto.
 * Sirve para proyectar y para detectar un recibo mal cargado.
 */
export function netoDeRecibo({ remunerativo = 0, noRemunerativo = 0 }) {
  const rem = Number(remunerativo), nr = Number(noRemunerativo);
  const deducciones = redondear(APORTES.sobreRemunerativo * rem +
                                APORTES.sobreTotal * (rem + nr));
  return { remunerativo: rem, noRemunerativo: nr, deducciones,
           neto: redondear(rem + nr - deducciones) };
}

/**
 * Un recibo es atipico cuando trae conceptos que no se repiten todos los
 * meses — vacaciones, aguinaldo, un retroactivo. Esos meses no sirven para
 * aprender la relacion entre el basico y el bruto: la inflan.
 */
export function esAtipico(recibo) {
  if (recibo.atipico != null) return !!recibo.atipico;
  const texto = (recibo.conceptos || []).join(' ').toUpperCase();
  // Ojo con SAC: "DIFERENCIA SAC" es un ajuste de centavos que aparece en
  // meses normales. Solo el aguinaldo de verdad hace atipico al mes.
  return /VACACION|AGUINALDO|RETROACT/.test(texto);
}

// ---------------------------------------------------------------------
// APRENDER DE LA HISTORIA
// ---------------------------------------------------------------------

/** Recibos ordenados por periodo 'YYYY-MM', del mas viejo al mas nuevo. */
const porPeriodo = recibos => [...recibos].sort((a, b) => a.periodo < b.periodo ? -1 : 1);

/** Variacion del basico entre recibos consecutivos, en tanto por uno. */
export function variacionesBasico(recibos) {
  const rs = porPeriodo(recibos).filter(r => r.basico > 0);
  const out = [];
  for (let i = 1; i < rs.length; i++) {
    out.push({ desde: rs[i - 1].periodo, hasta: rs[i].periodo,
               variacion: rs[i].basico / rs[i - 1].basico - 1 });
  }
  return out;
}

/**
 * Ritmo mensual de la paritaria: promedio geometrico de los saltos del
 * basico. Geometrico y no aritmetico porque los aumentos se componen.
 * Devuelve 0 si no hay con que calcularlo.
 */
export function ritmoParitaria(recibos) {
  const rs = porPeriodo(recibos).filter(r => r.basico > 0);
  if (rs.length < 2) return 0;
  const saltos = rs.length - 1;
  return Math.pow(rs[saltos].basico / rs[0].basico, 1 / saltos) - 1;
}

/**
 * Cuantas veces el basico entra en el bruto remunerativo. Junta adicionales,
 * antiguedad y presentismo en un solo numero. Solo mira meses tipicos.
 */
export function factorRemunerativo(recibos) {
  const sirve = r => r.basico > 0 && r.remunerativo > 0;
  const tipicos = porPeriodo(recibos).filter(r => !esAtipico(r) && sirve(r));
  // Sin ningun mes tipico se aprende igual de los atipicos. Un mes con
  // vacaciones infla la relacion y da un numero un poco alto; cero la
  // destruye y deja el sueldo proyectado en las sumas fijas y nada mas, que
  // es como decirle a alguien que va a cobrar 141.000 en vez de 2.000.000.
  const base = tipicos.length ? tipicos : porPeriodo(recibos).filter(sirve);
  if (!base.length) return 0;
  return base.reduce((s, r) => s + r.remunerativo / r.basico, 0) / base.length;
}

/**
 * Las sumas no remunerativas del acuerdo son MONTOS FIJOS: no acompañan al
 * basico. Se separan en la parte fija y la parte que si escala, para que la
 * proyeccion no las infle. Ignorar esto sobreestima el neto todos los meses.
 */
export function componerNoRemunerativo(recibos, sumasFijas = 0, sumas = null) {
  const tipicos = porPeriodo(recibos).filter(r => !esAtipico(r) && r.basico > 0);
  // Misma razon que en factorRemunerativo: mejor aprender de un mes atipico
  // que no aprender nada.
  const rs = tipicos.length ? tipicos : porPeriodo(recibos).filter(r => r.basico > 0);
  if (!rs.length) return { fijo: sumasFijas, escala: 0, basicoBase: 0 };
  const ult = rs[rs.length - 1];
  // Con sumas declaradas, la parte fija es la que estaba vigente EN ESE MES.
  // Usar otro numero deja el resto como "escala" y lo suma dos veces.
  const fijo = sumas ? sumasVigentes(sumas, ult.periodo) : sumasFijas;
  return { fijo,
           escala: Math.max(0, (ult.noRemunerativo || 0) - fijo),
           basicoBase: ult.basico };
}


// ---------------------------------------------------------------------
// ACUERDOS PARITARIOS
// ---------------------------------------------------------------------

/**
 * Un acuerdo paritario argentino casi nunca es "X % por mes". Suele ser
 * "X % en julio, X % en agosto y X % en septiembre, NO ACUMULATIVO, sobre la
 * base de junio". La diferencia no es teorica:
 *
 *   acumulativo:      1,90 % · 1,90 % · 1,90 %   (compone)
 *   no acumulativo:   1,90 % · 1,865 % · 1,830 % (el salto mensual BAJA)
 *
 * Proyectar componiendo sobreestima el sueldo mes a mes. Y cuando el acuerdo
 * se termina no hay que seguir extrapolando: hay una revision, y hasta que se
 * firme lo que venga es una suposicion, no un dato.
 *
 * Forma:
 *   { base:'2026-06', acumulativo:false, revisionEn:'2026-10',
 *     tramos:[{periodo:'2026-07', pct:1.9}, ...] }
 */

/** Acuerdo vigente del CCT 130/75 (comercio), julio-septiembre 2026. */
export const ACUERDO_COMERCIO_JUL_SEP_2026 = {
  nombre: 'CCT 130/75 · acuerdo julio 2026',
  base: '2026-06',
  acumulativo: false,
  revisionEn: '2026-10',
  tramos: [
    { periodo: '2026-07', pct: 1.9 },
    { periodo: '2026-08', pct: 1.9 },
    { periodo: '2026-09', pct: 1.9 }
  ]
};

/**
 * Sumas no remunerativas con vigencia. El bono extraordinario del acuerdo
 * ($50.000 en dos cuotas) se paga solo en julio y agosto: si no se declara la
 * vigencia, la proyeccion lo sigue sumando para siempre.
 */
export const SUMAS_COMERCIO_2026 = [
  { concepto: 'Suma fija no remunerativa', monto: 100000, desde: '2026-01' },
  { concepto: 'Recomposición',             monto:  20000, desde: '2026-01' },
  { concepto: 'Bono extraordinario',       monto:  25000, desde: '2026-07', hasta: '2026-08' }
];


/**
 * El acuerdo que corresponde a un periodo, de los que haya cargados.
 *
 * Se prefiere el que efectivamente cubre el periodo con alguno de sus tramos.
 * Si ninguno lo cubre, se devuelve el mas reciente que ya empezo: sirve para
 * saber cuando fue la ultima revision y avisar que lo proyectado es
 * suposicion. Devuelve null solo si no hay nada cargado.
 */
export function acuerdoVigente(paritarias, periodo) {
  const activos = (paritarias || [])
    .filter(a => a && a.activo !== false && Array.isArray(a.tramos) && a.tramos.length)
    .map(a => ({ ...a, tramos: [...a.tramos].sort((x, y) => x.periodo < y.periodo ? -1 : 1) }))
    .sort((a, b) => a.base < b.base ? 1 : -1);          // el mas nuevo primero
  if (!activos.length) return null;
  return activos.find(a => a.base <= periodo && !fueraDeAcuerdo(a, periodo))
      || activos.find(a => a.base <= periodo)
      || null;
}

/** Sumas cargadas normalizadas: acepta `no_remunerativo` o el nombre corto. */
export function sumasDeclaradas(filas) {
  return (filas || [])
    .filter(x => x && x.activo !== false)
    .map(x => ({ concepto: x.concepto, monto: Number(x.monto) || 0,
                 desde: x.desde || null, hasta: x.hasta || null }));
}

/** Porcentaje total acumulado sobre la base, al periodo dado. */
export function pctAcumulado(acuerdo, periodo) {
  if (!acuerdo || !acuerdo.tramos) return null;
  const vigentes = acuerdo.tramos.filter(t => t.periodo <= periodo);
  if (!vigentes.length) return periodo >= acuerdo.base ? 0 : null;
  if (acuerdo.acumulativo) {
    return (vigentes.reduce((f, t) => f * (1 + t.pct / 100), 1) - 1) * 100;
  }
  return vigentes.reduce((s, t) => s + t.pct, 0);
}

/** Basico de un periodo segun el acuerdo. null si el acuerdo no lo cubre. */
export function basicoSegunAcuerdo(basicoBase, acuerdo, periodo) {
  const pct = pctAcumulado(acuerdo, periodo);
  if (pct == null) return null;
  return redondear(Number(basicoBase) * (1 + pct / 100));
}

/** El acuerdo ya no dice nada de este periodo: lo que siga es suposicion. */
export function fueraDeAcuerdo(acuerdo, periodo) {
  if (!acuerdo || !acuerdo.tramos || !acuerdo.tramos.length) return true;
  return periodo > acuerdo.tramos[acuerdo.tramos.length - 1].periodo;
}

/** Suma de las no remunerativas vigentes en un periodo. */
export function sumasVigentes(sumas, periodo) {
  return (sumas || [])
    .filter(x => (!x.desde || x.desde <= periodo) && (!x.hasta || x.hasta >= periodo))
    .reduce((s, x) => s + Number(x.monto || 0), 0);
}

// ---------------------------------------------------------------------
// PROYECTAR
// ---------------------------------------------------------------------

/**
 * Proyecta los proximos meses de sueldo.
 *
 * @param recibos    historia cargada
 * @param meses      cuantos meses proyectar
 * @param ritmo      variacion mensual del basico; por defecto la aprendida
 * @param sumasFijas parte no remunerativa que NO escala con la paritaria
 */
export function proyectarSueldo(recibos, { meses = 6, ritmo = null, sumasFijas = 0,
                                            acuerdo = null, sumas = null } = {}) {
  const rs = porPeriodo(recibos).filter(r => r.basico > 0);
  if (!rs.length) return [];

  const paso = ritmo == null ? ritmoParitaria(recibos) : ritmo;
  const k = factorRemunerativo(recibos);
  const nr = componerNoRemunerativo(recibos, sumasFijas, sumas);
  const ult = rs[rs.length - 1];
  const base = acuerdo ? (rs.find(r => r.periodo === acuerdo.base) || {}).basico : null;

  const out = [];
  let basico = ult.basico;
  for (let i = 1; i <= meses; i++) {
    const periodo = sumarMeses(ult.periodo, i);

    // Si hay acuerdo y cubre el periodo, manda el acuerdo. Cuando se acaba,
    // se sigue con el ritmo aprendido pero marcando que ya es suposicion.
    const porAcuerdo = base ? basicoSegunAcuerdo(base, acuerdo, periodo) : null;
    const conAcuerdo = porAcuerdo != null && !fueraDeAcuerdo(acuerdo, periodo);
    basico = conAcuerdo ? porAcuerdo : basico * (1 + paso);

    const remunerativo = basico * k;
    // Con sumas declaradas se respeta su vigencia; si no, se usa la parte fija
    // aprendida del ultimo recibo. Lo primero es mucho mas exacto: un bono que
    // vencio en agosto no puede seguir sumando en septiembre.
    const noRemunerativo = sumas
      ? sumasVigentes(sumas, periodo) + (nr.basicoBase ? nr.escala * (basico / nr.basicoBase) : 0)
      : nr.fijo + (nr.basicoBase ? nr.escala * (basico / nr.basicoBase) : 0);

    // Sin la relacion basico/bruto no se puede reconstruir el neto de sus
    // partes: se escala el ultimo neto conocido con el mismo aumento. Es
    // grueso, pero es del orden correcto, y se marca para poder decirlo.
    const cuentas = k > 0
      ? netoDeRecibo({ remunerativo, noRemunerativo })
      : { remunerativo: 0, noRemunerativo, deducciones: 0,
          neto: redondear((Number(ult.neto) || 0) * (basico / ult.basico)) };

    out.push({
      periodo, basico: redondear(basico), ...cuentas,
      estimado: true, conAcuerdo, sinBruto: !(k > 0)
    });
  }
  return out;
}

/**
 * Aguinaldo: la mitad del mejor bruto remunerativo del semestre, con los
 * mismos aportes. Se cobra aparte del sueldo, no sumado.
 * `semestre` es 1 (enero-junio) o 2 (julio-diciembre).
 */
export function aguinaldo(recibos, anio, semestre) {
  const desde = semestre === 1 ? 1 : 7, hasta = semestre === 1 ? 6 : 12;
  const delSemestre = recibos.filter(r => {
    const [y, m] = r.periodo.split('-').map(Number);
    return y === anio && m >= desde && m <= hasta && r.remunerativo > 0;
  });
  if (!delSemestre.length) return null;
  const mejor = Math.max(...delSemestre.map(r => r.remunerativo));
  return {
    periodo: `${anio}-${String(hasta).padStart(2, '0')}`,
    ...netoDeRecibo({ remunerativo: mejor / 2, noRemunerativo: 0 }),
    estimado: true, concepto: 'aguinaldo'
  };
}

/**
 * Lo que va a entrar en los proximos meses: sueldo, aguinaldo si toca, y el
 * sobre en efectivo si esta declarado. Ordenado por fecha de cobro.
 *
 * `diaCobro` es el dia del mes SIGUIENTE al periodo en que acredita.
 */
export function calendarioDeIngresos(recibos, { meses = 6, diaCobro = 1,
                                                sobre = 0, sobreDesde = null,
                                                ritmo = null, sumasFijas = 0,
                                                acuerdo = null, sumas = null,
                                                habil = true, feriados = [],
                                                juntos = false } = {}) {
  const proy = proyectarSueldo(recibos, { meses, ritmo, sumasFijas, acuerdo, sumas });
  const rs = porPeriodo(recibos).filter(r => r.basico > 0);
  // El sobre sube con el mismo aumento que el banco, asi que se escala con el
  // basico. `sobreDesde` es el periodo del que se conoce el importe.
  const refSobre = sobreDesde
    ? (rs.find(r => r.periodo === sobreDesde) || {}).basico
    : (rs.length ? rs[rs.length - 1].basico : null);

  const out = [];
  for (const p of proy) {
    const fecha = cobroDe(p.periodo, diaCobro, { habil, feriados });
    const enSobre = sobre > 0
      ? (refSobre ? redondear(Number(sobre) * (p.basico / refSobre)) : Number(sobre))
      : 0;

    if (juntos && enSobre > 0) {
      // Banco y sobre entran el mismo dia y de una sola vez.
      out.push({ fecha, concepto: 'Sueldo', monto: redondear(p.neto + enSobre),
                 via: 'mixto', banco: p.neto, efectivo: enSobre,
                 periodo: p.periodo, estimado: true, conAcuerdo: p.conAcuerdo });
    } else {
      out.push({ fecha, concepto: 'Sueldo', monto: p.neto, via: 'banco',
                 periodo: p.periodo, estimado: true, conAcuerdo: p.conAcuerdo });
      if (enSobre > 0) {
        out.push({ fecha, concepto: 'Sobre', monto: enSobre, via: 'efectivo',
                   periodo: p.periodo, estimado: true, conAcuerdo: p.conAcuerdo });
      }
    }
    const [y, m] = p.periodo.split('-').map(Number);
    if (MESES_SAC.includes(m)) {
      const sac = aguinaldo([...recibos, ...proy], y, m === 6 ? 1 : 2);
      if (sac) out.push({ fecha: `${y}-${String(m).padStart(2, '0')}-25`,
                          concepto: 'Aguinaldo', monto: sac.neto, via: 'banco',
                          periodo: p.periodo, estimado: true });
    }
  }
  return out.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
}


// ---------------------------------------------------------------------
// EL PROXIMO COBRO
// ---------------------------------------------------------------------

/**
 * Que se cobra la proxima vez, separado en banco y sobre, y POR QUE cambia
 * contra el cobro anterior.
 *
 * El "por que" no es adorno. Un sueldo puede bajar aun con aumento: en agosto
 * de 2026 el basico sube 1,45 % —el tramo de septiembre del acuerdo, que suma
 * $ 133.069— pero se van los dos dias de vacaciones y el bono de $ 25.000, que
 * pesan $ 177.746. El neto baja 2,2 %. Sin explicacion, esa caida parece un
 * error de la app y se deja de confiar en el numero.
 */
export function proximoCobro(recibos, { diaCobro = 1, sobre = 0, sobreDesde = null,
                                        acuerdo = null, sumas = null, ritmo = null,
                                        sumasFijas = 0, habil = true, feriados = [] } = {}) {
  const rs = porPeriodo(recibos).filter(r => r.basico > 0);
  if (!rs.length) return null;

  const cal = calendarioDeIngresos(recibos, { meses: 1, diaCobro, sobre, sobreDesde,
                                              acuerdo, sumas, ritmo, sumasFijas,
                                              habil, feriados, juntos: true });
  const fila = cal.find(x => x.concepto === 'Sueldo');
  if (!fila) return null;

  const proy = proyectarSueldo(recibos, { meses: 1, acuerdo, sumas, ritmo, sumasFijas })[0];
  const ult = rs[rs.length - 1];
  const sobreAnterior = Number(ult.sobre || 0);
  const totalAnterior = Number(ult.neto || 0) + sobreAnterior;

  // Cuando la cuenta se hace con menos de lo que necesita, hay que decirlo:
  // un numero flojo sin aviso se lee igual que uno firme, y este es el que
  // decide si el mes cierra.
  const porque = porQueCambia(ult, proy, { acuerdo, sumas });
  if (!rs.some(r => !esAtipico(r))) {
    porque.push({ tipo: 'aviso', texto: 'todos los recibos cargados son meses atípicos ' +
      '(vacaciones, aguinaldo): cargá uno normal y la cuenta se afina' });
  }
  if (proy.sinBruto) {
    porque.push({ tipo: 'aviso', texto: 'ningún recibo trae el bruto remunerativo, ' +
      'así que escalo el último neto con el aumento' });
  }

  return {
    periodo: proy.periodo,
    fecha: fila.fecha,
    banco: fila.banco != null ? fila.banco : fila.monto,
    sobre: fila.efectivo || 0,
    total: fila.monto,
    basico: proy.basico,
    conAcuerdo: !!proy.conAcuerdo,
    anterior: { periodo: ult.periodo, banco: Number(ult.neto || 0),
                sobre: sobreAnterior, total: totalAnterior },
    diferencia: redondear(fila.monto - totalAnterior),
    porcentaje: totalAnterior ? redondear(((fila.monto / totalAnterior) - 1) * 100) : 0,
    sinBruto: !!proy.sinBruto,
    soloAtipicos: !rs.some(r => !esAtipico(r)),
    porque
  };
}

/**
 * Las razones del cambio, en castellano y ordenadas por peso.
 * Solo se nombra lo que efectivamente cambio entre un recibo y el otro.
 */
function porQueCambia(anterior, proyectado, { acuerdo, sumas }) {
  const out = [];

  if (esAtipico(anterior)) {
    const conceptos = (anterior.conceptos || []).join(' ').toUpperCase();
    if (/VACACION/.test(conceptos)) out.push({ tipo: 'baja', texto: 'el mes pasado tenía vacaciones, que se pagan aparte' });
    if (/AGUINALDO/.test(conceptos)) out.push({ tipo: 'baja', texto: 'el mes pasado incluía aguinaldo' });
    if (/RETROACT/.test(conceptos)) out.push({ tipo: 'baja', texto: 'el mes pasado traía un retroactivo' });
  }

  // Sumas que se dejaron de pagar o que empiezan
  for (const s of sumas || []) {
    const antes = (!s.desde || s.desde <= anterior.periodo) && (!s.hasta || s.hasta >= anterior.periodo);
    const ahora = (!s.desde || s.desde <= proyectado.periodo) && (!s.hasta || s.hasta >= proyectado.periodo);
    // El texto va sin el importe: quien muestra decide como formatearlo.
    const nombre = (s.concepto || 'una suma fija').toLowerCase();
    if (antes && !ahora) out.push({ tipo: 'baja', monto: Number(s.monto),
      texto: `el ${nombre} dejó de pagarse`, conMonto: true });
    if (!antes && ahora) out.push({ tipo: 'suba', monto: Number(s.monto),
      texto: `empieza a pagarse el ${nombre}`, conMonto: true });
  }

  // El aumento de paritaria
  if (anterior.basico && proyectado.basico > anterior.basico) {
    const pct = ((proyectado.basico / anterior.basico) - 1) * 100;
    out.push({ tipo: 'suba', texto: proyectado.conAcuerdo
      ? `el básico sube ${pct.toFixed(1)} % por la paritaria ya firmada`
      : `el básico sube ${pct.toFixed(1)} % estimado, sin acuerdo firmado todavía` });
  }

  if (!out.length && !proyectado.conAcuerdo) {
    out.push({ tipo: 'aviso', texto: 'no hay aumento acordado para este mes' });
  }
  return out;
}

// ---------------------------------------------------------------------
export const redondear = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** 'YYYY-MM' + n meses */
export function sumarMeses(periodo, n) {
  const [y, m] = periodo.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Fecha de cobro de un periodo: dia `dia` del mes siguiente.
 *
 * Con `habil: true` corre al primer dia habil siguiente. Es lo que hace el
 * empleador: los recibos pagan el 01/06 (lunes), el 01/07 (miercoles) y el
 * 03/08 — porque el 1 de agosto cayo sabado. Sin esta regla, la app avisa un
 * ingreso que todavia no entro y el saldo del fin de semana queda mal.
 */
function cobroDe(periodo, dia, { habil = false, feriados = [] } = {}) {
  const p = sumarMeses(periodo, 1);
  const [y, m] = p.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  let d = new Date(y, m - 1, Math.min(dia, ultimo));
  if (habil) {
    const esFeriado = f => feriados.includes(f);
    for (let i = 0; i < 10; i++) {
      const iso = fechaISO(d);
      if (d.getDay() !== 0 && d.getDay() !== 6 && !esFeriado(iso)) break;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  }
  return fechaISO(d);
}

const fechaISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
