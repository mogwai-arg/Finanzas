// node --experimental-strip-types supabase/functions/_shared/push.test.ts
//
// Las pruebas hacen de navegador: generan el par de claves como lo haria el
// telefono al suscribirse, dejan que push.ts cifre, y descifran del otro lado.
// Es la unica forma honesta de probar esto sin un telefono: si la derivacion
// tuviera un byte de diferencia, el aviso saldria igual y no llegaria nunca.
import assert from 'node:assert/strict';
import { cifrar, firmaVapid, parValido, b64uABytes, bytesAB64u } from './push.ts';

let ok = 0, mal = 0;
const t = async (n: string, fn: () => void | Promise<void>) => {
  try { await fn(); console.log('  ok  ' + n); ok++; }
  catch (e: any) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; }
};

const texto = (s: string) => new TextEncoder().encode(s);
const unir = (...p: Uint8Array[]) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0; for (const x of p) { out.set(x, i); i += x.length; }
  return out;
};

/** Un telefono que se suscribe: par ECDH + secreto de autenticacion. */
async function telefono() {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' },
                                              true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { par, pub, auth,
           sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
                  p256dh: bytesAB64u(pub), auth: bytesAB64u(auth) } };
}

/** Lo que hace el navegador al recibir el bloque. */
async function descifrar(bloque: Uint8Array, tel: Awaited<ReturnType<typeof telefono>>) {
  const salt = bloque.slice(0, 16);
  const largoId = bloque[20];
  const asPublic = bloque.slice(21, 21 + largoId);
  const cifrado = bloque.slice(21 + largoId);

  const asKey = await crypto.subtle.importKey('raw', asPublic,
    { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: asKey }, tel.par.privateKey, 256));

  const hkdf = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, largo: number) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: s, info }, k, largo * 8));
  };
  const prk = await hkdf(tel.auth, compartido,
    unir(texto('WebPush: info\0'), tel.pub, asPublic), 32);
  const cek = await hkdf(salt, prk, texto('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, texto('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const claro = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce }, aes, cifrado));
  return new TextDecoder().decode(claro.slice(0, -1));   // sin el 0x02 del final
}

console.log('\nLOS AVISOS AL TELÉFONO');

await t('el teléfono puede leer lo que se cifró', async () => {
  const tel = await telefono();
  const mensaje = JSON.stringify({ title: 'Bishu', body: 'Hoy toca la de YPF · 25 %' });
  const claro = await descifrar(await cifrar(mensaje, tel.sub), tel);
  assert.equal(claro, mensaje);
});

await t('cada aviso sale con otra sal, aunque diga lo mismo', async () => {
  const tel = await telefono();
  const a = await cifrar('hola', tel.sub);
  const b = await cifrar('hola', tel.sub);
  assert.notDeepEqual(a.slice(0, 16), b.slice(0, 16));
  assert.equal(await descifrar(b, tel), 'hola');
});

await t('la cabecera del bloque tiene la forma que espera el navegador', async () => {
  const tel = await telefono();
  const b = await cifrar('x', tel.sub);
  assert.equal(new DataView(b.buffer, b.byteOffset).getUint32(16), 4096);  // tamaño de registro
  assert.equal(b[20], 65);                                                 // clave sin comprimir
  assert.equal(b[21], 4);                                                  // 0x04 = sin comprimir
});

await t('un acento no rompe el cifrado', async () => {
  const tel = await telefono();
  const m = 'Mañana vence Galicia Visa · $ 939.323';
  assert.equal(await descifrar(await cifrar(m, tel.sub), tel), m);
});

await t('la firma VAPID la puede verificar quien recibe', async () => {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' },
                                              true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const claves = { publica: bytesAB64u(pub), privada: jwk.d!, contacto: 'mailto:yo@ejemplo.com' };

  const jwt = await firmaVapid('https://fcm.googleapis.com/fcm/send/abc', claves);
  const [h, c, f] = jwt.split('.');
  const bien = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' },
    par.publicKey, b64uABytes(f), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(bien, 'la firma no verifica');

  const claims = JSON.parse(new TextDecoder().decode(b64uABytes(c)));
  // El error clásico: mandar el endpoint entero en aud y comerse un 401 sin
  // explicación. Va solo el origen.
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:yo@ejemplo.com');
  assert.ok(claims.exp > Math.floor(Date.now() / 1000));
  assert.ok(claims.exp <= Math.floor(Date.now() / 1000) + 12 * 3600);
});

/** Un par de claves VAPID, como el que genera la función. */
async function parVapid() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' },
                                              true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  return { publica: bytesAB64u(pub), privada: jwk.d!, contacto: 'mailto:yo@ejemplo.com' };
}

await t('un par que va junto se reconoce', async () => {
  assert.equal(await parValido(await parVapid()), true);
});

await t('una pública de una generación con una privada de otra NO pasa', async () => {
  // La falla que no se ve: las dos claves están puestas y el aviso sale
  // firmado igual, pero el servicio de push lo rechaza y no llega nada.
  const a = await parVapid(), b = await parVapid();
  assert.equal(await parValido({ ...a, privada: b.privada }), false);
  assert.equal(await parValido({ ...b, publica: a.publica }), false);
});

await t('una clave con basura tampoco pasa, y no explota', async () => {
  const a = await parVapid();
  assert.equal(await parValido({ ...a, publica: 'no-es-una-clave' }), false);
  assert.equal(await parValido({ ...a, privada: '' }), false);
  assert.equal(await parValido({ ...a, publica: '' }), false);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
