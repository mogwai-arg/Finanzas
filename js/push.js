// =====================================================================
// push.js — prender y apagar los avisos en el teléfono.
//
// Un aviso push tiene tres piezas y las tres tienen que estar:
//   1. El PERMISO del navegador, que lo da la persona una sola vez y solo
//      con un toque suyo. Pedirlo al abrir la app es la forma más rápida de
//      que lo nieguen para siempre.
//   2. La SUSCRIPCIÓN: el navegador la fabrica con la clave pública del
//      servidor y devuelve una dirección propia de ese teléfono.
//   3. Que esa suscripción esté guardada del lado del servidor, que es quien
//      manda los avisos cuando la app está cerrada.
//
// Si falta la clave pública —todavía sin configurar— no se rompe nada: los
// avisos siguen apareciendo dentro de la app.
// =====================================================================
import { state, guardar, borrar } from './db.js';

const CFG = window.CONFIG || {};

const aBytes = b64 => {
  const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};
const aB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));

export const configurado = () => !!CFG.VAPID_PUBLIC;
export const soportado = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** 'listo' | 'apagado' | 'bloqueado' | 'sin-soporte' | 'sin-clave' */
export async function estadoPush() {
  if (!soportado()) return 'sin-soporte';
  if (!configurado()) return 'sin-clave';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return sub ? 'listo' : 'apagado';
}

/**
 * Prende los avisos. Tiene que llamarse desde un toque de la persona: si no,
 * el navegador ni pregunta.
 */
export async function prenderPush() {
  if (!soportado()) throw new Error('Este teléfono o navegador no maneja avisos.');
  if (!configurado()) throw new Error('Faltan las claves de aviso en la configuración.');

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    throw new Error(permiso === 'denied'
      ? 'Los avisos están bloqueados para esta app. Se prenden desde los ajustes del teléfono.'
      : 'Sin permiso no puedo avisarte.');
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() ||
    await reg.pushManager.subscribe({
      userVisibleOnly: true,                       // obligatorio en Chrome
      applicationServerKey: aBytes(CFG.VAPID_PUBLIC)
    });

  const d = sub.toJSON();
  // Una suscripción por teléfono: la dirección es única, así que si ya estaba
  // se actualiza en vez de duplicarse.
  const ya = (state.push_subscriptions || []).find(x => x.endpoint === d.endpoint);
  await guardar('push_subscriptions', {
    ...(ya || {}), endpoint: d.endpoint,
    p256dh: d.keys.p256dh, auth: d.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200)
  });
  return true;
}

/** Apaga los avisos en ESTE teléfono; los otros siguen como estaban. */
export async function apagarPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return false;
  const { endpoint } = sub.toJSON();
  await sub.unsubscribe().catch(() => {});
  for (const x of (state.push_subscriptions || []).filter(s => s.endpoint === endpoint))
    await borrar('push_subscriptions', x.id);
  return true;
}
