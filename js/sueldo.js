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
  const rs = porPeriodo(recibos).filter(r => !esAtipico(r) && r.basico > 0 && r.remunerativo > 0);
  if (!rs.length) return 0;
  return rs.reduce((s, r) => s + r.remunerativo / r.basico, 0) / rs.length;
}

/**
 * Las sumas no remunerativas del acuerdo son MONTOS FIJOS: no acompañan al
 * basico. Se separan en la parte fija y la parte que si escala, para que la
 * proyeccion no las infle. Ignorar esto sobreestima el neto todos los meses.
 */
export function componerNoRemunerativo(recibos, sumasFijas = 0, sumas = null) {
  const rs = porPeriodo(recibos).filter(r => !esAtipico(r) && r.basico > 0);
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

    out.push({
      periodo, basico: redondear(basico),
      ...netoDeRecibo({ remunerativo, noRemunerativo }),
      estimado: true, conAcuerdo
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
                                                acuerdo = null, sumas = null } = {}) {
  const proy = proyectarSueldo(recibos, { meses, ritmo, sumasFijas, acuerdo, sumas });
  const rs = porPeriodo(recibos).filter(r => r.basico > 0);
  // El sobre sube con el mismo aumento que el banco, asi que se escala con el
  // basico. `sobreDesde` es el periodo del que se conoce el importe.
  const refSobre = sobreDesde
    ? (rs.find(r => r.periodo === sobreDesde) || {}).basico
    : (rs.length ? rs[rs.length - 1].basico : null);

  const out = [];
  for (const p of proy) {
    out.push({ fecha: cobroDe(p.periodo, diaCobro), concepto: 'Sueldo',
               monto: p.neto, via: 'banco', periodo: p.periodo,
               estimado: true, conAcuerdo: p.conAcuerdo });
    if (sobre > 0) {
      const monto = refSobre ? redondear(Number(sobre) * (p.basico / refSobre)) : Number(sobre);
      out.push({ fecha: cobroDe(p.periodo, diaCobro), concepto: 'Sobre',
                 monto, via: 'efectivo', periodo: p.periodo,
                 estimado: true, conAcuerdo: p.conAcuerdo });
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
export const redondear = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** 'YYYY-MM' + n meses */
export function sumarMeses(periodo, n) {
  const [y, m] = periodo.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Fecha de cobro de un periodo: dia `dia` del mes siguiente. */
function cobroDe(periodo, dia) {
  const p = sumarMeses(periodo, 1);
  const [y, m] = p.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${p}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}
