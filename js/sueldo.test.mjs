// =====================================================================
// Pruebas de sueldo.js
// Los importes salen de recibos reales del CCT 130/75 (comercio), sin
// ningun dato personal: solo los numeros, que es lo que hay que fijar.
// Correr con: node js/sueldo.test.mjs
// =====================================================================
import {
  APORTES, netoDeRecibo, esAtipico, variacionesBasico, ritmoParitaria,
  factorRemunerativo, componerNoRemunerativo, proyectarSueldo, aguinaldo,
  calendarioDeIngresos, sumarMeses,
  pctAcumulado, basicoSegunAcuerdo, fueraDeAcuerdo, sumasVigentes
} from './sueldo.js';

let ok = 0, fallo = 0;
const t = (nombre, fn) => {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLA  ' + nombre + '\n        ' + e.message); fallo++; }
};
const igual = (a, b, msg = '') => {
  if (a !== b) throw new Error(`${msg} esperaba ${b}, dio ${a}`);
};
const cerca = (a, b, tol, msg = '') => {
  if (Math.abs(a - b) > tol) throw new Error(`${msg} esperaba ~${b} (±${tol}), dio ${a}`);
};

// --- historia real, anonimizada -------------------------------------
const HISTORIA = [
  { periodo: '2026-05', basico: 1161167.00, remunerativo: 2126368.23,
    noRemunerativo: 144295.56, deducciones: 418249.21, neto: 1852414.58,
    conceptos: ['SUELDO MENSUAL', 'ADIC. EMPRESA', 'ANTIGUEDAD', 'PRESENTISMO'] },
  { periodo: '2026-06', basico: 1179445.00, remunerativo: 2164862.50,
    noRemunerativo: 144295.56, deducciones: 425755.59, neto: 1883402.47,
    conceptos: ['SUELDO MENSUAL', 'ADIC. EMPRESA', 'ANTIGUEDAD', 'PRESENTISMO', 'DIFERENCIA SAC'] },
  { periodo: '2026-07', basico: 1204135.00, remunerativo: 2429014.35,
    noRemunerativo: 184121.81, deducciones: 477635.84, neto: 2135500.32,
    conceptos: ['SUELDO MENSUAL', 'VACACIONES', 'ANTIGUEDAD', 'PRESENTISMO'] },
  { periodo: '2026-08', basico: 1228824.00, remunerativo: 2301786.41,
    noRemunerativo: 172849.90, deducciones: 447970.93, neto: 2026665.38,
    conceptos: ['SUELDO MENSUAL', 'VACACIONES', 'ANTIGUEDAD', 'PRESENTISMO'] }
];
const NORMALES = HISTORIA.slice(0, 2);

console.log('\nRECIBO');
t('el neto de un mes normal sale al centavo', () => {
  const r = netoDeRecibo({ remunerativo: 2126368.23, noRemunerativo: 144295.56 });
  cerca(r.neto, 1852414.58, 0.05);
});
t('las deducciones de otro mes normal tambien', () => {
  const r = netoDeRecibo({ remunerativo: 2164862.50, noRemunerativo: 144295.56 });
  cerca(r.deducciones, 425755.59, 0.05);
});
t('las sumas no remunerativas no pagan jubilacion ni obra social', () => {
  const sinNR = netoDeRecibo({ remunerativo: 1000000, noRemunerativo: 0 });
  const conNR = netoDeRecibo({ remunerativo: 1000000, noRemunerativo: 100000 });
  // sobre los 100.000 extra solo se descuenta el 2,5 % sindical
  cerca(conNR.deducciones - sinNR.deducciones, 2500, 0.01);
});
t('un recibo vacio no rompe', () => igual(netoDeRecibo({}).neto, 0));
t('los aportes suman 19,5 % en el peor caso', () =>
  cerca(APORTES.sobreRemunerativo + APORTES.sobreTotal, 0.195, 1e-9));

console.log('\nMESES ATIPICOS');
t('un mes con vacaciones se marca atipico', () => igual(esAtipico(HISTORIA[2]), true));
t('un mes normal no', () => igual(esAtipico(HISTORIA[0]), false));
t('"DIFERENCIA SAC" no alcanza para marcarlo atipico', () => igual(esAtipico(HISTORIA[1]), false));
t('la marca manual gana sobre los conceptos', () =>
  igual(esAtipico({ atipico: false, conceptos: ['VACACIONES'] }), false));

console.log('\nPARITARIA');
t('detecta los tres saltos del basico', () => igual(variacionesBasico(HISTORIA).length, 3));
t('el ritmo mensual ronda el 1,9 %', () => cerca(ritmoParitaria(HISTORIA), 0.0191, 0.0005));
t('el ritmo es geometrico, no aritmetico', () => {
  const r = ritmoParitaria([{ periodo: '2026-01', basico: 100 },
                            { periodo: '2026-02', basico: 200 },
                            { periodo: '2026-03', basico: 400 }]);
  cerca(r, 1.0, 1e-9);   // duplicar dos veces = +100 % por mes
});
t('con un solo recibo no inventa un ritmo', () => igual(ritmoParitaria([HISTORIA[0]]), 0));
t('el orden en que se cargan los recibos no cambia el resultado', () => {
  const alReves = [...HISTORIA].reverse();
  cerca(ritmoParitaria(alReves), ritmoParitaria(HISTORIA), 1e-12);
});

console.log('\nFACTOR DEL BASICO');
t('el bruto es ~1,83 veces el basico', () => cerca(factorRemunerativo(NORMALES), 1.8334, 0.001));
t('los meses con vacaciones no ensucian el factor', () => {
  cerca(factorRemunerativo(HISTORIA), factorRemunerativo(NORMALES), 0.001);
});
t('sin meses tipicos devuelve 0 y no NaN', () => igual(factorRemunerativo([HISTORIA[2]]), 0));

console.log('\nSUMAS FIJAS');
t('separa lo fijo de lo que escala', () => {
  const c = componerNoRemunerativo(NORMALES, 120000);
  igual(c.fijo, 120000);
  cerca(c.escala, 24295.56, 0.01);
});
t('proyectar sin declarar las sumas fijas sobreestima el neto', () => {
  const conFijas = proyectarSueldo(NORMALES, { meses: 12, ritmo: 0.02, sumasFijas: 120000 });
  const sinFijas = proyectarSueldo(NORMALES, { meses: 12, ritmo: 0.02, sumasFijas: 0 });
  const a = conFijas[11].neto, b = sinFijas[11].neto;
  if (!(b > a)) throw new Error('las sumas fijas tienen que quedar atras de la paritaria');
});

console.log('\nPROYECCION');
t('devuelve la cantidad de meses pedida', () =>
  igual(proyectarSueldo(NORMALES, { meses: 6 }).length, 6));
t('los periodos son consecutivos y arrancan en el mes siguiente', () => {
  const p = proyectarSueldo(NORMALES, { meses: 3 });
  igual(p[0].periodo, '2026-07'); igual(p[1].periodo, '2026-08'); igual(p[2].periodo, '2026-09');
});
t('el periodo cruza bien el fin de año', () => igual(sumarMeses('2026-11', 3), '2027-02'));
t('septiembre proyectado da alrededor de $ 2.010.000', () => {
  const p = proyectarSueldo(HISTORIA, { meses: 1, sumasFijas: 145000 });
  cerca(p[0].neto, 2014000, 40000);
});
t('todo lo proyectado queda marcado como estimado', () => {
  igual(proyectarSueldo(NORMALES, { meses: 2 }).every(p => p.estimado === true), true);
});
t('sin historia devuelve lista vacia en vez de romper', () =>
  igual(proyectarSueldo([], { meses: 6 }).length, 0));
t('un ritmo en cero deja el basico quieto', () => {
  const p = proyectarSueldo(NORMALES, { meses: 3, ritmo: 0 });
  cerca(p[2].basico, 1179445.00, 0.01);
});

console.log('\nAGUINALDO');
t('es la mitad del mejor bruto del semestre', () => {
  const sac = aguinaldo(HISTORIA, 2026, 1);
  cerca(sac.remunerativo, 2164862.50 / 2, 0.01);
});
t('paga los mismos aportes que el sueldo', () => {
  const sac = aguinaldo(HISTORIA, 2026, 1);
  cerca(sac.deducciones, 0.195 * (2164862.50 / 2), 0.01);
});
t('el segundo semestre mira julio a diciembre', () => {
  const sac = aguinaldo(HISTORIA, 2026, 2);
  cerca(sac.remunerativo, 2429014.35 / 2, 0.01);
});
t('un semestre sin recibos devuelve null', () => igual(aguinaldo(HISTORIA, 2025, 1), null));

console.log('\nCALENDARIO');
t('el sueldo acredita el mes siguiente al periodo', () => {
  const c = calendarioDeIngresos(NORMALES, { meses: 1, diaCobro: 1 });
  igual(c[0].fecha, '2026-08-01');
});
t('el sobre entra el mismo dia, aparte y en efectivo', () => {
  const c = calendarioDeIngresos(NORMALES, { meses: 1, sobre: 600000 });
  const s = c.find(x => x.concepto === 'Sobre');
  igual(s.via, 'efectivo');
  igual(s.fecha, c.find(x => x.concepto === 'Sueldo').fecha);
});
t('el sobre acompaña al aumento, no queda congelado', () => {
  const c = calendarioDeIngresos(NORMALES, { meses: 1, sobre: 600000, ritmo: 0.02 });
  cerca(c.find(x => x.concepto === 'Sobre').monto, 612000, 1);
});
t('con ritmo cero el sobre no se mueve', () => {
  const c = calendarioDeIngresos(NORMALES, { meses: 1, sobre: 600000, ritmo: 0 });
  cerca(c.find(x => x.concepto === 'Sobre').monto, 600000, 1);
});
t('sin sobre declarado no aparece la fila', () => {
  igual(calendarioDeIngresos(NORMALES, { meses: 1 }).some(x => x.concepto === 'Sobre'), false);
});
t('el aguinaldo aparece solo en junio y diciembre', () => {
  const c = calendarioDeIngresos(NORMALES, { meses: 12 });
  const sac = c.filter(x => x.concepto === 'Aguinaldo');
  igual(sac.length, 2);
  const meses = sac.map(x => Number(x.periodo.split('-')[1])).sort((a, b) => a - b);
  igual(meses.join(','), '6,12');
});
t('un dia de cobro 31 cae en el ultimo dia de febrero', () => {
  // el ultimo recibo es de diciembre -> se proyecta enero -> se cobra en febrero
  const c = calendarioDeIngresos([{ periodo: '2026-12', basico: 100, remunerativo: 183,
                                    noRemunerativo: 0, conceptos: [] }],
                                 { meses: 1, diaCobro: 31 });
  igual(c[0].fecha, '2027-02-28');
});
t('el sueldo de diciembre se cobra en enero, no en diciembre', () => {
  const c = calendarioDeIngresos([{ periodo: '2026-11', basico: 100, remunerativo: 183,
                                    noRemunerativo: 0, conceptos: [] }],
                                 { meses: 1, diaCobro: 5 });
  const sueldo = c.find(x => x.concepto === 'Sueldo');
  igual(sueldo.periodo, '2026-12');
  igual(sueldo.fecha, '2027-01-05');
  // y el aguinaldo de diciembre se cobra ANTES, el 25 del mismo mes
  igual(c.find(x => x.concepto === 'Aguinaldo').fecha, '2026-12-25');
});
t('todo sale ordenado por fecha', () => {
  const c = calendarioDeIngresos(NORMALES, { meses: 12, sobre: 1 });
  for (let i = 1; i < c.length; i++)
    if (c[i].fecha < c[i - 1].fecha) throw new Error('desordenado en ' + c[i].fecha);
});

console.log('\nACUERDO PARITARIO');
const ACUERDO = {
  base: '2026-06', acumulativo: false, revisionEn: '2026-10',
  tramos: [{ periodo: '2026-07', pct: 1.9 },
           { periodo: '2026-08', pct: 1.9 },
           { periodo: '2026-09', pct: 1.9 }]
};
const SUMAS = [
  { concepto: 'Suma fija', monto: 100000, desde: '2026-01' },
  { concepto: 'Recomposición', monto: 20000, desde: '2026-01' },
  { concepto: 'Bono', monto: 25000, desde: '2026-07', hasta: '2026-08' }
];

t('no acumulativo: los tramos se SUMAN, no se componen', () => {
  cerca(pctAcumulado(ACUERDO, '2026-09'), 5.7, 1e-9);
});
t('acumulativo: los tramos se componen', () => {
  const a = { ...ACUERDO, acumulativo: true };
  cerca(pctAcumulado(a, '2026-09'), 5.8083, 0.001);
});
t('la diferencia entre los dos no es teorica', () => {
  const noAcum = basicoSegunAcuerdo(1179445, ACUERDO, '2026-09');
  const acum = basicoSegunAcuerdo(1179445, { ...ACUERDO, acumulativo: true }, '2026-09');
  if (!(acum > noAcum + 1000)) throw new Error('deberian separarse más de mil pesos');
});
t('el basico de julio coincide con el recibo real dentro del 0,5 %', () => {
  cerca(basicoSegunAcuerdo(1179445, ACUERDO, '2026-07'), 1204135, 1204135 * 0.005);
});
t('el de agosto tambien', () => {
  cerca(basicoSegunAcuerdo(1179445, ACUERDO, '2026-08'), 1228824, 1228824 * 0.005);
});
t('septiembre proyectado por acuerdo da $ 1.246.673', () => {
  cerca(basicoSegunAcuerdo(1179445, ACUERDO, '2026-09'), 1246673.36, 1);
});
t('antes de la base el acuerdo no dice nada', () =>
  igual(pctAcumulado(ACUERDO, '2026-05'), null));
t('en el mes base el aumento es cero', () =>
  cerca(pctAcumulado(ACUERDO, '2026-06'), 0, 1e-9));
t('octubre queda fuera del acuerdo: hay revision', () => {
  igual(fueraDeAcuerdo(ACUERDO, '2026-09'), false);
  igual(fueraDeAcuerdo(ACUERDO, '2026-10'), true);
});

console.log('\nSUMAS CON VIGENCIA');
t('en junio el bono todavia no existe', () => cerca(sumasVigentes(SUMAS, '2026-06'), 120000));
t('en julio y agosto se paga', () => {
  cerca(sumasVigentes(SUMAS, '2026-07'), 145000);
  cerca(sumasVigentes(SUMAS, '2026-08'), 145000);
});
t('en septiembre ya no: el no remunerativo baja 25.000', () =>
  cerca(sumasVigentes(SUMAS, '2026-09'), 120000));
t('sin declarar la vigencia el bono se cobraria para siempre', () => {
  const sinVigencia = SUMAS.map(x => ({ ...x, hasta: undefined }));
  cerca(sumasVigentes(sinVigencia, '2027-06'), 145000);
  cerca(sumasVigentes(SUMAS, '2027-06'), 120000);
});

console.log('\nPROYECCION CON ACUERDO');
t('el acuerdo manda sobre el ritmo aprendido', () => {
  const p = proyectarSueldo(HISTORIA, { meses: 1, acuerdo: ACUERDO, sumas: SUMAS });
  cerca(p[0].basico, 1246673.36, 1);
  igual(p[0].conAcuerdo, true);
});
t('septiembre se cobra MENOS que agosto, y no es un error', () => {
  const p = proyectarSueldo(HISTORIA, { meses: 1, acuerdo: ACUERDO, sumas: SUMAS });
  // agosto trajo 2 dias de vacaciones y el bono de 25.000; septiembre no
  if (!(p[0].neto < 2026665.38)) throw new Error('septiembre deberia dar menos que agosto');
  cerca(p[0].neto, 1981905, 5000);
});
t('pasado el acuerdo, la proyeccion se marca como suposicion', () => {
  const p = proyectarSueldo(HISTORIA, { meses: 3, acuerdo: ACUERDO, sumas: SUMAS });
  igual(p.map(x => x.conAcuerdo).join(','), 'true,false,false');
});
t('sin acuerdo sigue funcionando como antes', () => {
  const p = proyectarSueldo(HISTORIA, { meses: 1 });
  igual(p[0].conAcuerdo, false);
});
t('el sobre declarado en un mes se escala a los demas', () => {
  const c = calendarioDeIngresos(HISTORIA, { meses: 1, sobre: 1532000,
                                             sobreDesde: '2026-08',
                                             acuerdo: ACUERDO, sumas: SUMAS });
  const s = c.find(x => x.concepto === 'Sobre');
  cerca(s.monto, 1532000 * (1246673.36 / 1228824), 50);
});

console.log(`\n${ok} pruebas OK${fallo ? `, ${fallo} FALLAN` : ''}\n`);
process.exit(fallo ? 1 : 0);
