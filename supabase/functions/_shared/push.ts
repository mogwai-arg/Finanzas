// =====================================================================
// push.ts — mandar un aviso al telefono (Web Push, RFC 8291 y RFC 8188).
//
// Va escrito a mano y no con una libreria de npm por una razon practica:
// del otro lado corre Deno, las librerias de push estan hechas para Node y
// arrastran modulos que ahi no existen. Todo lo que hace falta —ECDH, HKDF,
// AES-GCM y una firma ES256— ya viene en WebCrypto.
//
// Un mensaje son dos cosas:
//
//   1. La AUTORIZACION (VAPID): un JWT firmado con la clave privada del
//      servidor que dice "quien manda esto soy yo", con la clave publica al
//      lado para que el servicio de push la verifique.
//   2. El CUERPO cifrado con la clave que publico el navegador cuando el
//      usuario acepto: ni Google ni Apple pueden leer lo que dice el aviso.
//      Por eso el texto viaja cifrado aunque la conexion ya sea HTTPS.
// =====================================================================

export type Suscripcion = { endpoint: string; p256dh: string; auth: string };
export type Claves = { publica: string; privada: string; contacto: string };

// -------------------------------------------------------------- base64url
export const b64uABytes = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};
export const bytesAB64u = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unir = (...partes: Uint8Array[]) => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};
const texto = (s: string) => new TextEncoder().encode(s);

// -------------------------------------------------------------- VAPID
/**
 * El JWT que prueba quien manda el aviso.
 *
 * `aud` es el ORIGEN del endpoint y no el endpoint entero: mandarlo completo
 * es el error clasico y el servicio contesta 401 sin decir por que.
 */
export async function firmaVapid(endpoint: string, claves: Claves): Promise<string> {
  const { origin } = new URL(endpoint);
  const cabecera = { typ: 'JWT', alg: 'ES256' };
  const cuerpo = {
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: claves.contacto
  };
  const sinFirma = `${bytesAB64u(texto(JSON.stringify(cabecera)))}.${bytesAB64u(texto(JSON.stringify(cuerpo)))}`;

  const pub = b64uABytes(claves.publica);            // 65 bytes, sin comprimir
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: bytesAB64u(pub.slice(1, 33)),
    y: bytesAB64u(pub.slice(33, 65)),
    d: claves.privada
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' },
                                            false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, texto(sinFirma)));
  return `${sinFirma}.${bytesAB64u(firma)}`;
}

// -------------------------------------------------------------- cifrado
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, largo: number) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, key, largo * 8));
};

/**
 * El cuerpo cifrado, en el formato aes128gcm que espera el navegador.
 *
 * La cabecera del bloque lleva la sal y la clave publica efimera del
 * servidor: sin eso el navegador no puede derivar la misma clave y descarta
 * el aviso en silencio.
 */
export async function cifrar(mensaje: string, sub: Suscripcion) {
  const uaPublic = b64uABytes(sub.p256dh);
  const authSecret = b64uABytes(sub.auth);

  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' },
                                              true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' },
                                              false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey }, par.privateKey, 256));

  // El "secreto" de la suscripcion es la sal de este primer paso, y el orden
  // de las claves en el info importa: primero la del navegador.
  const prk = await hkdf(authSecret, compartido,
    unir(texto('WebPush: info\0'), uaPublic, asPublic), 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, prk, texto('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, texto('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // El 0x02 marca que este es el ultimo bloque; sin el delimitador el
  // navegador lo toma como incompleto.
  const claro = unir(texto(mensaje), new Uint8Array([2]));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aes, claro));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return unir(salt, rs, new Uint8Array([asPublic.length]), asPublic, cifrado);
}

// -------------------------------------------------------------- envio
export type Aviso = { title: string; body: string; url?: string; tag?: string };

/**
 * Manda un aviso. Devuelve el codigo del servicio de push.
 *
 * 404 y 410 significan que esa suscripcion ya no existe —el usuario borro la
 * app o el navegador la vencio— y hay que borrarla, o cada aviso siguiente
 * vuelve a fallar contra un telefono que no esta.
 */
export async function enviarPush(sub: Suscripcion, aviso: Aviso, claves: Claves) {
  const cuerpo = await cifrar(JSON.stringify(aviso), sub);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${await firmaVapid(sub.endpoint, claves)}, k=${claves.publica}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400'
    },
    body: cuerpo
  });
  return { ok: r.ok, status: r.status, muerta: r.status === 404 || r.status === 410 };
}

/** Las claves del entorno, o null si todavia no estan puestas. */
export function clavesDelEntorno(): Claves | null {
  const publica = Deno.env.get('VAPID_PUBLIC')?.trim();
  const privada = Deno.env.get('VAPID_PRIVATE')?.trim();
  if (!publica || !privada) return null;
  return { publica, privada, contacto: Deno.env.get('VAPID_SUBJECT')?.trim() || 'mailto:avisos@bishusha.app' };
}
