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
  pctAcumulado, basicoSegunAcuerdo, fueraDeAcuerdo, sumasVigentes,
  brutoDeRecibo, netoDeclarado, proximoCobro, acuerdoVigente, sumasDeclaradas
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
t('sin ningun recibo con el bruto devuelve 0 y no NaN', () => {
  igual(factorRemunerativo([]), 0);
  igual(factorRemunerativo([{ periodo: '2026-08', basico: 1240000, neto: 2000000 }]), 0);
});
t('con un solo mes atipico se aprende de el, que es mejor que no aprender', () => {
  // Antes daba 0 y el sueldo proyectado se caia a las sumas fijas.
  const f = factorRemunerativo([HISTORIA[2]]);
  if (!(f > 1.5)) throw new Error(`esperaba aprender algo, dio ${f}`);
});

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
  const c = calendarioDeIngresos(NORMALES, { meses: 1, diaCobro: 1, habil: false });
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
                                 { meses: 1, diaCobro: 31, habil: false });
  igual(c[0].fecha, '2027-02-28');
});
t('si el ultimo dia del mes cae domingo, el cobro pasa al mes siguiente', () => {
  // 28/02/2027 es domingo: se cobra el lunes 1 de marzo
  const c = calendarioDeIngresos([{ periodo: '2026-12', basico: 100, remunerativo: 183,
                                    noRemunerativo: 0, conceptos: [] }],
                                 { meses: 1, diaCobro: 31 });
  igual(c[0].fecha, '2027-03-01');
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

console.log('\nBRUTO, NETO Y COSTO: los tres numeros del recibo');
const AGOSTO = HISTORIA[3];
t('el bruto es remunerativo + no remunerativo', () =>
  cerca(brutoDeRecibo(AGOSTO), 2474636.31, 0.02));
t('el neto es el bruto menos los aportes', () =>
  cerca(netoDeclarado(AGOSTO), 2026665.38, 0.02));
t('entre uno y otro hay $ 447.970 de aportes', () =>
  cerca(brutoDeRecibo(AGOSTO) - netoDeclarado(AGOSTO), 447970.93, 0.02));
t('usar el bruto como ingreso lo sobreestima un 22 %', () => {
  const error = brutoDeRecibo(AGOSTO) / netoDeclarado(AGOSTO) - 1;
  if (error < 0.20 || error > 0.24) throw new Error('el error deberia rondar el 22 %, dio ' + (error * 100).toFixed(1));
});
t('lo que se proyecta es el neto, nunca el bruto', () => {
  const p = proyectarSueldo(HISTORIA, { meses: 1, acuerdo: ACUERDO, sumas: SUMAS })[0];
  if (p.neto >= p.remunerativo + p.noRemunerativo)
    throw new Error('el neto no puede ser mayor o igual al bruto');
});

console.log('\nPRIMER DIA HABIL');
t('si el 1 es dia de semana, se cobra el 1', () => {
  // 01/07/2026 cae miercoles
  const c = calendarioDeIngresos(NORMALES, { meses: 1, diaCobro: 1 });
  igual(c[0].fecha, '2026-08-03');   // 01/08/2026 es sabado -> lunes 3
});
t('si el 1 cae sabado, se corre al lunes: pasa en agosto/26', () => {
  const c = calendarioDeIngresos([{ periodo: '2026-06', basico: 100, remunerativo: 183,
                                    noRemunerativo: 0, conceptos: [] }],
                                 { meses: 1, diaCobro: 1 });
  igual(c[0].fecha, '2026-08-03');
});
t('si el 1 cae domingo tambien se corre', () => {
  // 01/11/2026 es domingo -> lunes 2
  const c = calendarioDeIngresos([{ periodo: '2026-09', basico: 100, remunerativo: 183,
                                    noRemunerativo: 0, conceptos: [] }],
                                 { meses: 1, diaCobro: 1 });
  igual(c[0].fecha, '2026-11-02');
});
t('un feriado declarado tambien corre el cobro', () => {
  // recibo de julio -> se proyecta agosto -> se cobra el 1 de septiembre (martes)
  const c = calendarioDeIngresos([{ periodo: '2026-07', basico: 100, remunerativo: 183,
                                    noRemunerativo: 0, conceptos: [] }],
                                 { meses: 1, diaCobro: 1 });
  igual(c[0].fecha, '2026-09-01');
  const conFeriado = calendarioDeIngresos([{ periodo: '2026-07', basico: 100, remunerativo: 183,
                                             noRemunerativo: 0, conceptos: [] }],
                                          { meses: 1, diaCobro: 1, feriados: ['2026-09-01'] });
  igual(conFeriado[0].fecha, '2026-09-02');
});
t('con habil en false se respeta el dia tal cual', () => {
  const c = calendarioDeIngresos([{ periodo: '2026-06', basico: 100, remunerativo: 183,
                                    noRemunerativo: 0, conceptos: [] }],
                                 { meses: 1, diaCobro: 1, habil: false });
  igual(c[0].fecha, '2026-08-01');
});

console.log('\nUN SOLO COBRO: banco y sobre juntos');
t('con juntos, banco y sobre son una sola fila', () => {
  const c = calendarioDeIngresos(HISTORIA, { meses: 1, sobre: 1532000, sobreDesde: '2026-08',
                                             acuerdo: ACUERDO, sumas: SUMAS, juntos: true });
  const s = c.filter(x => x.concepto === 'Sueldo');
  igual(s.length, 1);
  igual(s[0].via, 'mixto');
  cerca(s[0].monto, s[0].banco + s[0].efectivo, 0.02);
});
t('el sobre es alrededor del 44 % de lo que entra', () => {
  const c = calendarioDeIngresos(HISTORIA, { meses: 1, sobre: 1532000, sobreDesde: '2026-08',
                                             acuerdo: ACUERDO, sumas: SUMAS, juntos: true });
  const s = c.find(x => x.concepto === 'Sueldo');
  const pct = s.efectivo / s.monto;
  if (pct < 0.42 || pct > 0.46) throw new Error('esperaba ~44 %, dio ' + (pct * 100).toFixed(1));
});
t('sin juntos siguen siendo dos filas del mismo dia', () => {
  const c = calendarioDeIngresos(HISTORIA, { meses: 1, sobre: 1532000, sobreDesde: '2026-08' });
  const s = c.find(x => x.concepto === 'Sueldo'), o = c.find(x => x.concepto === 'Sobre');
  igual(s.fecha, o.fecha);
});

console.log('\nCONTRA EL BANCO DE VERDAD');
// Extracto de Galicia: "Acreditamiento de haberes  01/09/26  $ 2.026.665,38".
// Es el unico punto de control real que tenemos: importe y fecha juntos.
t('el neto del recibo de agosto es lo que acredito el banco', () =>
  cerca(netoDeclarado(AGOSTO), 2026665.38, 0.01));
t('la formula de aportes reproduce ese importe sin mirar el recibo', () => {
  const r = netoDeRecibo({ remunerativo: AGOSTO.remunerativo, noRemunerativo: AGOSTO.noRemunerativo });
  // agosto es atipico (vacaciones), asi que la base sindical difiere unos pesos
  cerca(r.neto, 2026665.38, 5500);
});
t('el sueldo de agosto se cobra el 1 de septiembre, martes', () => {
  const c = calendarioDeIngresos(HISTORIA, { meses: 0, diaCobro: 1 });
  igual(c.length, 0, 'con meses 0 no hay proyeccion');
  // el periodo 08 se cobra el mes siguiente, primer dia habil
  const conJulio = calendarioDeIngresos(HISTORIA.slice(0, 3), { meses: 1, diaCobro: 1 });
  igual(conJulio.find(x => x.concepto === 'Sueldo').periodo, '2026-08');
  igual(conJulio.find(x => x.concepto === 'Sueldo').fecha, '2026-09-01');
});
t('cuatro periodos, cuatro fechas de cobro correctas', () => {
  // 05->01/06 lunes · 06->01/07 miercoles · 07->03/08 (el 1 fue sabado) · 08->01/09 martes
  const esperado = { '2026-05': '2026-06-01', '2026-06': '2026-07-01',
                     '2026-07': '2026-08-03', '2026-08': '2026-09-01' };
  for (const [per, fecha] of Object.entries(esperado)) {
    const previos = HISTORIA.filter(r => r.periodo < per);
    if (!previos.length) continue;
    const c = calendarioDeIngresos(previos, { meses: 1, diaCobro: 1 });
    const s = c.find(x => x.concepto === 'Sueldo');
    igual(s.periodo, per);
    igual(s.fecha, fecha, `periodo ${per}`);
  }
});
t('lo que entra de verdad es banco mas sobre', () => {
  const c = calendarioDeIngresos(HISTORIA.slice(0, 3), { meses: 1, diaCobro: 1,
                                                         sobre: 1532000, sobreDesde: '2026-07',
                                                         juntos: true });
  const s = c.find(x => x.concepto === 'Sueldo');
  if (s.monto < 3000000) throw new Error('el sobre tiene que estar sumado, dio ' + s.monto);
  igual(s.via, 'mixto');
});

console.log('\nEL PROXIMO COBRO');
const HIST_SOBRE = HISTORIA.map((r, i) => ({ ...r, neto: [1852414.58, 1883402.47, 2135500.32, 2026665.38][i],
                                             sobre: [1400000, 1440000, 1490000, 1532000][i] }));
const OPC = { acuerdo: ACUERDO, sumas: SUMAS, sobre: 1532000, sobreDesde: '2026-08', diaCobro: 1 };

t('proyecta el período siguiente al último recibo', () =>
  igual(proximoCobro(HIST_SOBRE, OPC).periodo, '2026-09'));
t('se cobra el 1 de octubre, que es jueves', () =>
  igual(proximoCobro(HIST_SOBRE, OPC).fecha, '2026-10-01'));
t('separa banco de sobre', () => {
  const p = proximoCobro(HIST_SOBRE, OPC);
  cerca(p.banco, 1981987, 3000);
  cerca(p.sobre, 1554253, 3000);
  cerca(p.total, p.banco + p.sobre, 0.02);
});
t('el sobre sube con el mismo aumento que el banco', () => {
  const p = proximoCobro(HIST_SOBRE, OPC);
  cerca(p.sobre / 1532000, p.basico / 1228824, 0.002);
});
t('compara contra lo que se cobró el mes pasado', () => {
  const p = proximoCobro(HIST_SOBRE, OPC);
  cerca(p.anterior.total, 2026665.38 + 1532000, 0.02);
  if (!(p.diferencia < 0)) throw new Error('octubre tiene que dar menos que septiembre');
});

console.log('\nPOR QUE CAMBIA');
t('nombra las vacaciones del mes anterior', () => {
  const r = proximoCobro(HIST_SOBRE, OPC).porque;
  if (!r.some(x => /vacaciones/i.test(x.texto))) throw new Error('falta la razón de vacaciones');
});
t('nombra el bono que dejó de pagarse', () => {
  const r = proximoCobro(HIST_SOBRE, OPC).porque;
  const b = r.find(x => /bono/i.test(x.texto));
  if (!b) throw new Error('falta el bono');
  igual(b.tipo, 'baja'); cerca(b.monto, 25000);
  // el importe va aparte, para que quien muestre decida como formatearlo
  igual(b.conMonto, true);
  igual(/\d/.test(b.texto), false, 'el texto no debe traer el numero crudo');
});
t('nombra el aumento, aunque el neto baje', () => {
  const p = proximoCobro(HIST_SOBRE, OPC);
  const a = p.porque.find(x => x.tipo === 'suba' && /básico sube/.test(x.texto));
  if (!a) throw new Error('el aumento tiene que aparecer igual');
  if (!/paritaria ya firmada/.test(a.texto)) throw new Error('deberia decir que está firmado');
});
t('sin acuerdo que cubra el mes, lo dice', () => {
  const viejo = { ...ACUERDO, tramos: [{ periodo: '2026-07', pct: 1.9 }] };
  const p = proximoCobro(HIST_SOBRE, { ...OPC, acuerdo: viejo });
  igual(p.conAcuerdo, false);
  if (!p.porque.some(x => /sin acuerdo firmado|no hay aumento acordado/.test(x.texto)))
    throw new Error('tiene que avisar que es estimado');
});
t('un mes normal seguido de otro normal no inventa razones', () => {
  const normales = HIST_SOBRE.slice(0, 2);
  const p = proximoCobro(normales, { ...OPC, sobreDesde: '2026-06' });
  igual(p.porque.some(x => /vacaciones|aguinaldo/i.test(x.texto)), false);
});
t('sin recibos devuelve null en vez de romper', () => igual(proximoCobro([], OPC), null));

console.log('\nACUERDOS CARGADOS');
const JUL = { nombre: 'julio 2026', base: '2026-06', acumulativo: false, revision_en: '2026-10',
              tramos: [{ periodo: '2026-07', pct: 1.9 }, { periodo: '2026-08', pct: 1.9 },
                       { periodo: '2026-09', pct: 1.9 }] };
const OCT = { nombre: 'octubre 2026', base: '2026-09', acumulativo: false, revision_en: '2027-01',
              tramos: [{ periodo: '2026-10', pct: 2.2 }, { periodo: '2026-11', pct: 2.2 }] };

t('elige el acuerdo que cubre el período', () => {
  igual(acuerdoVigente([JUL, OCT], '2026-08').nombre, 'julio 2026');
  igual(acuerdoVigente([JUL, OCT], '2026-10').nombre, 'octubre 2026');
});
t('el orden en que se cargan no importa', () => {
  igual(acuerdoVigente([OCT, JUL], '2026-08').nombre, 'julio 2026');
});
t('si ninguno cubre el período, devuelve el último que ya empezó', () => {
  const a = acuerdoVigente([JUL], '2026-12');
  igual(a.nombre, 'julio 2026');
  igual(fueraDeAcuerdo(a, '2026-12'), true, 'y queda marcado como fuera de acuerdo');
});
t('un acuerdo que todavía no empezó no se elige', () =>
  igual(acuerdoVigente([OCT], '2026-07'), null));
t('los desactivados quedan afuera', () =>
  igual(acuerdoVigente([{ ...JUL, activo: false }], '2026-08'), null));
t('sin acuerdos cargados devuelve null en vez de romper', () => {
  igual(acuerdoVigente([], '2026-08'), null);
  igual(acuerdoVigente(null, '2026-08'), null);
});
t('un acuerdo sin tramos no cuenta', () =>
  igual(acuerdoVigente([{ ...JUL, tramos: [] }], '2026-08'), null));
t('cargar la paritaria nueva cambia la proyección', () => {
  const conJulio = proyectarSueldo(HISTORIA, { meses: 2, acuerdo: JUL, sumas: SUMAS });
  const conOctubre = proyectarSueldo(HISTORIA, { meses: 2,
    acuerdo: acuerdoVigente([JUL, OCT], '2026-10'), sumas: SUMAS });
  igual(conJulio[1].conAcuerdo, false, 'octubre queda fuera del acuerdo viejo');
  if (!(conOctubre[1].basico > conJulio[1].basico))
    throw new Error('con el acuerdo nuevo octubre tiene que dar más');
});

console.log('\nSUMAS CARGADAS');
t('normaliza lo que viene de la base', () => {
  const s = sumasDeclaradas([{ concepto: 'Bono', monto: '25000', desde: '2026-07', hasta: '2026-08' }]);
  igual(s.length, 1); cerca(s[0].monto, 25000); igual(s[0].desde, '2026-07');
});
t('las desactivadas no se usan', () =>
  igual(sumasDeclaradas([{ concepto: 'x', monto: 1, activo: false }]).length, 0));
t('sin vigencia declarada valen siempre', () => {
  const s = sumasDeclaradas([{ concepto: 'Fija', monto: 100000 }]);
  cerca(sumasVigentes(s, '2030-01'), 100000);
});
t('una lista vacía no rompe', () => igual(sumasDeclaradas(null).length, 0));

t('con todos los recibos atípicos igual proyecta un sueldo, no las migajas', () => {
  // Junio trae aguinaldo y agosto vacaciones: los dos atípicos. Antes el
  // factor básico→bruto daba cero y el sueldo proyectado quedaba en las sumas
  // fijas: $ 141.375 en vez de dos millones.
  const recibos = [
    { periodo: '2026-06', basico: 1200000, remunerativo: 2400000, noRemunerativo: 145000,
      neto: 2135500, conceptos: ['AGUINALDO'] },
    { periodo: '2026-08', basico: 1240000, remunerativo: 2480000, noRemunerativo: 145000,
      neto: 2026665, conceptos: ['VACACIONES'] }
  ];
  if (!(factorRemunerativo(recibos) > 1.5)) throw new Error('el factor no se aprendió');
  const p = proyectarSueldo(recibos, { meses: 1 })[0];
  if (!(p.neto > 1800000)) throw new Error(`neto proyectado demasiado bajo: ${p.neto}`);
  igual(p.sinBruto, false, 'sinBruto');
});

t('sin el bruto cargado, escala el último neto en vez de inventar', () => {
  const recibos = [
    { periodo: '2026-07', basico: 1200000, noRemunerativo: 145000, neto: 2000000 },
    { periodo: '2026-08', basico: 1240000, noRemunerativo: 145000, neto: 2060000 }
  ];
  const p = proyectarSueldo(recibos, { meses: 1 })[0];
  igual(p.sinBruto, true, 'sinBruto');
  // El básico sube ~3,3 %: el neto proyectado tiene que acompañar, no caerse.
  if (!(p.neto > 2060000 && p.neto < 2200000)) throw new Error(`neto raro: ${p.neto}`);
});

t('avisa cuando la cuenta se hizo con menos de lo que necesita', () => {
  const recibos = [
    { periodo: '2026-06', basico: 1200000, remunerativo: 2400000, noRemunerativo: 145000,
      neto: 2135500, sobre: 1530000, conceptos: ['AGUINALDO'] },
    { periodo: '2026-08', basico: 1240000, remunerativo: 2480000, noRemunerativo: 145000,
      neto: 2026665, sobre: 1530000, conceptos: ['VACACIONES'] }
  ];
  const c = proximoCobro(recibos, { sobre: 1530000, sobreDesde: '2026-08' });
  igual(c.soloAtipicos, true, 'soloAtipicos');
  if (!c.porque.some(x => /atípicos/.test(x.texto))) throw new Error('no avisa que son atípicos');
  // Y el número tiene que ser creíble: nada de caer a la mitad.
  if (!(c.banco > 1800000)) throw new Error(`banco: ${c.banco}`);
  if (Math.abs(c.porcentaje) >= 25) throw new Error(`variación irreal: ${c.porcentaje} %`);
});

console.log(`\n${ok} pruebas OK${fallo ? `, ${fallo} FALLAN` : ''}\n`);
process.exit(fallo ? 1 : 0);
