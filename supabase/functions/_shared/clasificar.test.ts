// node --experimental-strip-types supabase/functions/_shared/clasificar.test.ts
import assert from 'node:assert/strict';
import { queHagoCon } from './clasificar.ts';

let ok = 0, mal = 0;
const t = (n: string, fn: () => void) => { try { fn(); console.log('  ok  ' + n); ok++; }
                                           catch (e: any) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };
const via = (asunto: string, de = 'e-resumen@bancogalicia.com.ar', cuerpo = '') =>
  queHagoCon(asunto, de, cuerpo).via;

console.log('\nQUÉ HAGO CON CADA MAIL');

t('el resumen de la cuenta avisa para bajarlo y subirlo', () => {
  assert.equal(via('Resumen de Cuenta'), 'extracto');
  assert.equal(via('Ya está el extracto de cuenta'), 'extracto');
});

t('el de una tarjeta es otra cosa: ese trae consumos', () => {
  assert.equal(via('Resumen de Tarjeta MasterCard'), 'resumen');
  assert.equal(via('Resumen de Cuenta VISA', 'e-resumen@mensajesgalicia.com.ar'), 'resumen');
});

t('"Resumen de Cuenta VISA" dice las dos cosas y manda la tarjeta', () => {
  // Si entrara por los dos lados avisaría dos veces lo mismo.
  assert.notEqual(via('Resumen de Cuenta VISA'), 'extracto');
});

t('el aviso de vencimiento no se descarta: se dice que no hace falta', () => {
  // La app calcula sola cuándo vence cada tarjeta. Pero decir "descartado" de
  // algo que uno sabe importante hace dudar de todo el resto.
  assert.equal(via('El vencimiento es hoy', 'bancogalicia@mail.galicia.ar'), 'vencimiento');
  assert.equal(via('Recordatorio de pago', 'bancogalicia@mail.galicia.ar'), 'vencimiento');
});

t('un consumo es un consumo', () => {
  assert.equal(via('Pago aprobado en Colegio Juan Bautista', 'info@mercadopago.com'), 'movimiento');
  assert.equal(via('Comprobante de pago', 'avisos@personalpay.com.ar'), 'movimiento');
});

t('la publicidad se descarta y se nombra como lo que es', () => {
  // La publicidad del banco habla de cierres, de cuotas y de "tu cuenta", así
  // que si no se descarta antes se cuela como resumen.
  assert.equal(via('Promos para toda la semana', 'eminent@mail.galicia.ar'), 'ruido');
  assert.equal(via('Aprovechá 12 cuotas sin interés con tu tarjeta',
                   'eminent@mail.galicia.ar'), 'ruido');
});

t('un aviso de vencimiento no se explica como publicidad', () => {
  // "Recordatorio de pago" y "vence el" están en la lista de ruido para que no
  // se carguen como gasto. Está bien que no se carguen; estaba mal que se
  // explicaran como publicidad. Con las dos el mail termina igual y lo único
  // que cambia es si la explicación es cierta.
  for (const a of ['Recordatorio de pago', 'Vence el 10 tu resumen', 'Próximo vencimiento'])
    assert.equal(via(a, 'bancogalicia@mail.galicia.ar'), 'vencimiento', a);
});

t('lo que no dice nada queda afuera, con ese motivo', () => {
  const q = queHagoCon('Viernes de indumentaria', 'beneficios@mail.beneficios.gal', '');
  assert.equal(q.via, 'nada');
  assert.match(q.porQue, /no dice que algo ya pasó/);
});

t('nada de lo descartado se carga como movimiento', () => {
  // Es la única garantía que importa de verdad: la etiqueta puede afinarse,
  // pero un mail que no cuenta una operación no puede terminar en un gasto.
  for (const [a, d, c] of [['Promos para toda la semana', 'eminent@mail.galicia.ar', ''],
                           ['Recordatorio de pago', 'bancogalicia@mail.galicia.ar', ''],
                           ['Novedades', 'info@banco.com', 'Enterate de lo nuevo.'],
                           ['Alerta de seguridad', 'no-responder@mercadopago.com', '']])
    assert.notEqual(via(a, d, c), 'movimiento', a);
});

t('cada camino explica por qué, que es para lo que existe la pantalla', () => {
  for (const [a, d] of [['Resumen de Cuenta', 'e-resumen@bancogalicia.com.ar'],
                        ['Resumen de Tarjeta VISA', 'e-resumen@bancogalicia.com.ar'],
                        ['El vencimiento es hoy', 'bancogalicia@mail.galicia.ar']]) {
    const q = queHagoCon(a, d, '');
    assert.ok(q.porQue && q.porQue.length > 10, a);
  }
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
