import assert from 'node:assert/strict';
import { leerAumento, parsearMail, plata, fechaAR } from './parsers.ts';

let ok = 0; const t = (n: string, fn: () => void) => { fn(); ok++; console.log('  ok  ' + n); };
const HOY = '2026-09-01';

console.log('Montos en formato argentino');
t('$ 12.345,67', () => assert.equal(plata('$ 12.345,67'), 12345.67));
t('$ 1.200', () => assert.equal(plata('$ 1.200'), 1200));
t('$ 850,50', () => assert.equal(plata('$ 850,50'), 850.5));
t('$ 99', () => assert.equal(plata('$ 99'), 99));
t('$ 1.234.567,89', () => assert.equal(plata('$ 1.234.567,89'), 1234567.89));

console.log('Fechas');
t('12/09/2026', () => assert.equal(fechaAR('12/09/2026', HOY), '2026-09-12'));
t('5-9-26', () => assert.equal(fechaAR('5-9-26', HOY), '2026-09-05'));
t('sin fecha usa el fallback', () => assert.equal(fechaAR(undefined, HOY), HOY));

console.log('Galicia');
t('consumo con tarjeta de credito en 3 cuotas', () => {
  const m = parsearMail('avisos@bancogalicia.com.ar',
    'Consumo con tu Tarjeta de Credito',
    'Realizaste una compra por $ 45.800,00 en COTO CICSA con tu Tarjeta Visa Galicia terminada en 4821 el dia 28/08/2026 en 3 cuotas.', HOY);
  assert.ok(m);
  assert.equal(m!.monto, 45800);
  assert.equal(m!.comercio, 'COTO CICSA');
  assert.equal(m!.ultimos4, '4821');
  assert.equal(m!.cuotas, 3);
  assert.equal(m!.fecha, '2026-08-28');
  assert.equal(m!.medio, 'credito');
});
t('debito en un pago', () => {
  const m = parsearMail('notificaciones@galicia.ar', 'Compra con tarjeta de debito',
    'Compra por $ 8.500,00 en FARMACITY con tu tarjeta de debito terminada en 1199.', HOY);
  assert.equal(m!.monto, 8500);
  assert.equal(m!.medio, 'debito');
  assert.equal(m!.cuotas, 1);
});
t('consumo en dolares', () => {
  const m = parsearMail('avisos@bancogalicia.com.ar', 'Consumo con tarjeta',
    'Realizaste una compra por U$S 29,99 en NETFLIX con tu Tarjeta terminada en 4821.', HOY);
  assert.equal(m!.moneda, 'USD');
  assert.equal(m!.monto, 29.99);
});

console.log('MODO');
t('pago con QR', () => {
  const m = parsearMail('no-reply@modo.com.ar', 'Pagaste con MODO',
    'Pagaste $ 12.400,00 en YPF Servicompras el 30/08/2026 con tu tarjeta terminada en 4821.', HOY);
  assert.equal(m!.emisor, 'modo');
  assert.equal(m!.monto, 12400);
  assert.ok(m!.comercio.startsWith('YPF'));
});

console.log('Mercado Pago');
t('pago en comercio', () => {
  const m = parsearMail('noreply@mercadopago.com.ar', 'Pagaste $3.200',
    'Pagaste $ 3.200,00 en Kiosco Central el 31/08/2026.', HOY);
  assert.equal(m!.emisor, 'mercadopago');
  assert.equal(m!.monto, 3200);
});

console.log('Lo que NO tiene que parsear');
t('un mail de promociones no genera movimiento', () => {
  const m = parsearMail('promos@bancogalicia.com.ar', 'Tus beneficios de la semana',
    'Descubri 25% de ahorro en gastronomia todos los sabados.', HOY);
  assert.equal(m, null);
});
t('el aviso de aumento del colegio', () => {
  const a = leerAumento('Les informamos que la cuota de septiembre pasa a $ 259.000. ' +
    'El valor anterior era de $ 235.000.');
  assert.equal(a!.monto, 259000);
  assert.equal(a!.desde, 'septiembre');
});

t('toma el valor nuevo y no el viejo', () => {
  const a = leerAumento('Aumento de cuota. Valor anterior $ 100.000. Nuevo valor $ 120.000.');
  assert.equal(a!.monto, 120000);
});

t('la prepaga con decimales', () => {
  const a = leerAumento('Actualización de tu plan: a partir de octubre el nuevo importe ' +
    'será de $ 187.450,50 mensuales.');
  assert.equal(a!.monto, 187450.50);
  assert.equal(a!.desde, 'octubre');
});

t('un mail sin anuncio de aumento no dice nada', () => {
  assert.equal(leerAumento('Adjuntamos la factura de agosto por $ 259.000.'), null);
});

t('un aumento sin importe tampoco', () => {
  assert.equal(leerAumento('Te informamos que habrá un aumento en la cuota a partir de octubre.'), null);
});

t('no confunde un descuento con el valor de la cuota', () => {
  const a = leerAumento('Aumento de cuota: nueva cuota $ 300.000. Pagando en término, 10% de descuento.');
  assert.equal(a!.monto, 300000);
});

t('una transferencia recibida entra como ingreso', () => {
  const m = parsearMail('avisos@bancogalicia.com.ar', 'Recibiste una transferencia',
    'Recibiste una transferencia por $ 150.000,00 de JUAN PEREZ el 02/09/2026.', HOY);
  assert.equal(m!.tipo, 'ingreso');
  assert.equal(m!.monto, 150000);
  assert.equal(m!.medio, 'cuenta');
  assert.match(m!.comercio, /Transferencia recibida/);
});

t('la acreditación de haberes se reconoce', () => {
  const m = parsearMail('avisos@bancogalicia.com.ar', 'Acreditación de haberes',
    'Se acreditó tu sueldo por $ 2.474.636,31 en tu cuenta.', HOY);
  assert.equal(m!.tipo, 'ingreso');
  assert.equal(m!.monto, 2474636.31);
  assert.equal(m!.comercio, 'Acreditación de haberes');
});

t('una transferencia enviada es un egreso', () => {
  const m = parsearMail('avisos@bancogalicia.com.ar', 'Transferencia enviada',
    'Enviaste una transferencia por $ 80.000,00 a MARIA GOMEZ.', HOY);
  assert.equal(m!.tipo, 'gasto');
  assert.equal(m!.medio, 'cuenta');
});

t('un débito automático es un egreso', () => {
  const m = parsearMail('avisos@bancogalicia.com.ar', 'Débito automático',
    'Se debitó automáticamente $ 45.000,00 de tu cuenta por el servicio de EDESUR.', HOY);
  assert.equal(m!.tipo, 'gasto');
  assert.equal(m!.comercio, 'Débito automático');
});

t('un aviso de vencimiento no es un movimiento', () => {
  assert.equal(parsearMail('avisos@bancogalicia.com.ar', 'Vencimiento de tu tarjeta',
    'Tu resumen vence el 04/09/2026 por $ 1.276.838,45. Podés pagarlo por débito automático.', HOY), null);
});

t('un aviso que no dice para qué lado va no entra', () => {
  assert.equal(parsearMail('avisos@bancogalicia.com.ar', 'Movimientos',
    'Hubo movimientos en tu cuenta por $ 10.000,00.', HOY), null);
});

t('la promo de cuotas del banco no genera movimiento', () => {
  // El caso real: entro como un gasto de $1.000 en 9 cuotas que nadie hizo.
  assert.equal(parsearMail('novedades@bancogalicia.com.ar',
    'Comprá en 9 cuotas sin interés',
    'Comprá con tu tarjeta de crédito Galicia en 9 cuotas de $ 1.000 sin interés.', HOY), null);
});

t('una oferta con descuento tampoco', () => {
  assert.equal(parsearMail('novedades@bancogalicia.com.ar',
    'Aprovechá 30% de descuento',
    'Aprovechá 30% de descuento pagando con tu tarjeta de débito. Válido hasta el 30/09.', HOY), null);
});

t('un aviso sin comercio ni tarjeta no alcanza', () => {
  assert.equal(parsearMail('avisos@bancogalicia.com.ar', 'Novedades',
    'Tenés $ 5.000 disponibles en tu cuenta.', HOY), null);
});

t('los últimos cuatro alcanzan como prueba de que pasó', () => {
  const m = parsearMail('avisos@bancogalicia.com.ar', 'Compra con tarjeta de credito',
    'Compra por $ 12.500,00 en LIBRERIA ABC con tu tarjeta terminada en 9817.', HOY);
  assert.equal(m!.monto, 12500);
  assert.equal(m!.ultimos4, '9817');
});

t('un remitente desconocido no genera movimiento', () => {
  const m = parsearMail('facturas@edesur.com.ar', 'Tu factura',
    'Pagaste $ 5.000 en Edesur', HOY);
  assert.equal(m, null);
});
t('un mail sin monto no genera movimiento', () => {
  const m = parsearMail('avisos@bancogalicia.com.ar', 'Consumo con tarjeta',
    'Realizaste una compra con tu tarjeta terminada en 4821.', HOY);
  assert.equal(m, null);
});


console.log('\nPERSONAL PAY');

t('lee un pago de Personal Pay', () => {
  const m = parsearMail('avisos@personalpay.com.ar', 'Comprobante de pago',
    'Pagaste $ 12.500,00 en COTO CICSA el 03/09/2026 con tu cuenta Personal Pay.',
    new Date(2026, 8, 3))!;
  assert.ok(m, 'tiene que reconocerlo');
  assert.equal(m.monto, 12500);
  assert.equal(m.emisor, 'personalpay');
  assert.equal(m.tipo, 'gasto');
  assert.equal(m.fecha, '2026-09-03');
  assert.ok(/COTO/i.test(m.comercio), m.comercio);
});

t('las cuotas y los últimos cuatro, si vienen', () => {
  const m = parsearMail('no-reply@personalpay.com.ar', 'Tu pago',
    'Pagaste $ 120.000,00 en DEXTER en 6 cuotas con tu tarjeta terminada en 4412 el 03/09/2026.',
    new Date(2026, 8, 3))!;
  assert.equal(m.cuotas, 6);
  assert.equal(m.ultimos4, '4412');
});

t('sin comercio entra igual, pero con menos confianza', () => {
  // Entra y cae en Revisar, que es donde se ve si salió bien. Es el único
  // parser escrito sin tener a la vista un mail de verdad.
  const m = parsearMail('avisos@personalpay.com.ar', 'Comprobante',
    'Realizaste una transferencia por $ 5.000,00 el 03/09/2026.',
    new Date(2026, 8, 3))!;
  assert.ok(m);
  assert.ok(m.confianza < 60, 'sin comercio la confianza tiene que ser baja');
});

t('un mail de Personal Pay que no es una operación no se carga', () => {
  const m = parsearMail('novedades@personalpay.com.ar', 'Novedades de la semana',
    'Enterate de los descuentos de este mes.', new Date(2026, 8, 3));
  assert.equal(m, null);
});

console.log(`\n${ok} pruebas OK`);
