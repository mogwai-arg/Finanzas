// =====================================================================
// gmail-sync — lee los avisos de compra y carga los movimientos solos.
// Se ejecuta por cron (cada 30 min) para todos los usuarios conectados,
// o a demanda con { user_id } en el body.
// =====================================================================
import { admin, json, CORS, hoyISO } from '../_shared/comun.ts';
import { parsearMail, ES_RUIDO, ES_CONSUMO, type Movimiento } from '../_shared/parsers.ts';

const REMITENTES = [
  'bancogalicia.com.ar', 'galicia.ar', 'modo.com.ar', 'mercadopago.com.ar', 'mercadolibre.com.ar'
];
const QUERY = `from:(${REMITENTES.join(' OR ')}) newer_than:14d`;

// Para el diagnostico se busca mas ancho a proposito: la pregunta ahi no es
// "que puedo cargar" sino "que me esta llegando". Sirve para distinguir "el
// banco no manda nada" de "manda, pero no lo reconozco".
const QUERY_ANCHA = 'from:(galicia OR bancogalicia OR modo OR mercadopago OR mercadolibre OR ' +
  'personalpay OR naranja OR uala OR brubank) newer_than:30d';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const sb = admin();
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  let q = sb.from('integrations').select('*').eq('proveedor', 'gmail').eq('activo', true);
  if (body.user_id) q = q.eq('user_id', body.user_id);
  const { data: integraciones } = await q;

  // Modo diagnostico: mira que llega y por que se descarta, sin cargar nada.
  if (body.solo_ver) {
    const it = (integraciones ?? [])[0];
    if (!it) return json({ error: 'no hay Gmail conectado' }, 400);
    return json(await mirar(sb, it));
  }

  const resumen: unknown[] = [];
  for (const it of integraciones ?? []) {
    try { resumen.push(await sincronizar(sb, it)); }
    catch (e) {
      await sb.from('integrations').update({ ultimo_error: String(e) }).eq('id', it.id);
      resumen.push({ user: it.user_id, error: String(e) });
    }
  }
  return json({ ok: true, resumen });
});

// ---------------------------------------------------------------------
/**
 * Que hay en la bandeja y que haria la app con cada mail. No escribe nada.
 *
 * Existe porque "no entra nada" tiene dos causas opuestas —el banco no manda
 * avisos, o los manda y no los reconozco— y desde afuera se ven igual.
 */
async function mirar(sb: any, it: any) {
  const token = await accessToken(sb, it);
  const lista = await api(`messages?q=${encodeURIComponent(QUERY_ANCHA)}&maxResults=25`, token);
  const vistos: unknown[] = [];

  for (const m of (lista.messages ?? []).slice(0, 25)) {
    const msg = await api(`messages/${m.id}?format=full`, token);
    const cab = (n: string) => msg.payload?.headers?.find((h: any) =>
      h.name.toLowerCase() === n)?.value ?? '';
    const remitente = cab('from'), asunto = cab('subject');
    const cuerpo = textoDe(msg.payload);
    const muestra = asunto + ' ' + cuerpo.slice(0, 600);
    const fecha = new Date(Number(msg.internalDate || Date.now())).toISOString().slice(0, 10);

    let veredicto: string;
    if (ES_RUIDO.test(muestra)) veredicto = 'descartado · parece publicidad o aviso';
    else if (!ES_CONSUMO.test(muestra)) veredicto = 'descartado · no dice que algo ya pasó';
    else {
      const mov = parsearMail(remitente, asunto, cuerpo, fecha);
      veredicto = !mov ? 'descartado · ninguna regla lo entiende'
        : mov.confianza < 75 ? `descartado · poca confianza (${mov.confianza})`
        : `SE CARGA · ${mov.tipo} ${mov.moneda} ${mov.monto} · ${mov.comercio}`;
    }
    vistos.push({ fecha, de: remitente.slice(0, 60), asunto: asunto.slice(0, 80), veredicto });
  }

  return { encontrados: (lista.messages ?? []).length, busqueda: QUERY_ANCHA, vistos };
}

// ---------------------------------------------------------------------
async function sincronizar(sb: any, it: any) {
  const token = await accessToken(sb, it);
  const lista = await api(`messages?q=${encodeURIComponent(QUERY)}&maxResults=60`, token);
  let cargados = 0, ignorados = 0;

  const { data: cuentas } = await sb.from('accounts').select('*').eq('user_id', it.user_id);
  const { data: cats }    = await sb.from('categories').select('*').eq('user_id', it.user_id);
  const { data: reglas }  = await sb.from('reglas').select('*').eq('user_id', it.user_id);
  const nuevos: string[] = [];

  for (const m of lista.messages ?? []) {
    // ¿ya lo procesamos?
    const { data: visto } = await sb.from('ingest_log').select('id')
      .eq('user_id', it.user_id).eq('fuente', 'gmail').eq('externo_id', m.id).maybeSingle();
    if (visto) continue;

    const msg = await api(`messages/${m.id}?format=full`, token);
    const cab = (n: string) => msg.payload?.headers?.find((h: any) =>
      h.name.toLowerCase() === n)?.value ?? '';
    const remitente = cab('from'), asunto = cab('subject');
    const fechaMail = new Date(Number(msg.internalDate || Date.now()));
    const cuerpo = textoDe(msg.payload);

    const log: any = {
      user_id: it.user_id, fuente: 'gmail', externo_id: m.id,
      remitente, asunto, recibido_at: fechaMail.toISOString()
    };

    // Tres filtros, de mas barato a mas caro, y todos hacia el mismo lado:
    // ante la duda no se carga nada. Un gasto inventado cuesta mucho mas caro
    // que uno que hay que anotar a mano, porque rompe la confianza en todo lo
    // demas que la app dice.
    const muestra = asunto + ' ' + cuerpo.slice(0, 600);

    if (ES_RUIDO.test(muestra)) {
      await sb.from('ingest_log').insert({ ...log, estado: 'ignorado', detalle: 'publicidad o aviso, no un consumo' });
      ignorados++; continue;
    }
    // Un aviso cuenta algo que ya paso. Si no lo dice, no se toma.
    if (!ES_CONSUMO.test(muestra)) {
      await sb.from('ingest_log').insert({ ...log, estado: 'ignorado', detalle: 'no dice que la compra ya ocurrió' });
      ignorados++; continue;
    }

    const mov = parsearMail(remitente, asunto, cuerpo, fechaMail.toISOString().slice(0, 10));
    if (!mov) {
      await sb.from('ingest_log').insert({ ...log, estado: 'ignorado', detalle: 'sin patron que matchee' });
      ignorados++; continue;
    }
    // Sin comercio reconocido, lo unico que quedaria es un importe suelto:
    // eso no es un movimiento, es una adivinanza. (Una transferencia sin
    // contraparte sigue siendo real, y por eso entra con confianza alta.)
    if (mov.confianza < 75) {
      await sb.from('ingest_log').insert({
        ...log, estado: 'ignorado',
        detalle: `poca confianza (${mov.confianza}): no se reconoció el comercio` });
      ignorados++; continue;
    }

    const tx = await insertar(sb, it.user_id, mov, cuentas ?? [], cats ?? [], reglas ?? [], m.id);
    if (tx === 'duplicado') {
      await sb.from('ingest_log').insert({ ...log, estado: 'duplicado' });
      continue;
    }
    await sb.from('ingest_log').insert({ ...log, estado: 'cargado', transaction_id: tx.id });
    cargados++;
    nuevos.push(`${mov.comercio} ${mov.moneda === 'USD' ? 'U$S' : '$'}${mov.monto.toLocaleString('es-AR')}`);
  }

  await sb.from('integrations')
    .update({ ultima_sync: new Date().toISOString(), ultimo_error: null }).eq('id', it.id);

  if (cargados) {
    await sb.from('notificaciones').insert({
      user_id: it.user_id, tipo: 'carga_auto',
      titulo: `${cargados} ${cargados === 1 ? 'gasto cargado' : 'gastos cargados'} solo`,
      cuerpo: nuevos.slice(0, 4).join(' · ')
    });
  }
  return { user: it.user_id, cargados, ignorados };
}

// ---------------------------------------------------------------------
async function insertar(sb: any, userId: string, mov: Movimiento, cuentas: any[],
                        cats: any[], reglas: any[], externoId: string) {
  // Tarjeta: primero por ultimos 4, si no por emisor.
  let cuenta = mov.ultimos4 ? cuentas.find(c => c.ultimos4 === mov.ultimos4) : null;
  if (!cuenta) {
    // 'cuenta' es plata que entra o sale del banco, no un consumo con
    // plastico: va a la caja de ahorro, no a una tarjeta.
    const tipoBuscado = mov.medio === 'cuenta' ? 'cuenta'
                      : mov.medio === 'debito' ? 'debito' : 'credito';
    cuenta = cuentas.find(c =>
      (mov.emisor === 'galicia' && /galicia/i.test(c.banco ?? c.nombre ?? '') && c.tipo === tipoBuscado) ||
      (mov.emisor !== 'galicia' && new RegExp(mov.emisor, 'i').test(c.nombre)));
  }

  // Categoria: por regla del usuario, si no por palabra clave.
  const texto = mov.comercio.toLowerCase();
  let catId = reglas.sort((a, b) => b.prioridad - a.prioridad)
    .find(r => texto.includes(String(r.patron).toLowerCase()))?.category_id ?? null;
  if (!catId) catId = porPalabraClave(texto, cats);

  const fila = {
    user_id: userId, fecha: mov.fecha, descripcion: mov.comercio, comercio: mov.comercio,
    monto: mov.monto, moneda: mov.moneda, tipo: mov.tipo, cuotas: mov.cuotas,
    account_id: cuenta?.id ?? null, category_id: catId,
    fuente: 'gmail', externo_id: externoId, revisado: false, confianza: mov.confianza
  };
  const { data, error } = await sb.from('transactions').insert(fila).select().single();
  if (error) return error.code === '23505' ? 'duplicado' : Promise.reject(error);
  return data;
}

const CLAVES: Record<string, RegExp> = {
  'Supermercado': /coto|carrefour|jumbo|dia|vea|disco|changomas|chango|libertad|makro|vital|super/i,
  'Combustible / Transporte': /ypf|shell|axion|puma|sube|telepase|uber|cabify|estacion/i,
  'Gastronomia': /rappi|pedidosya|resto|caf[eé]|bar |pizz|burger|mostaza|starbucks|heladeria/i,
  'Salud': /farmacia|farmacity|farmaplus|simplicity|clinica|hospital|osde|swiss/i,
  'Servicios': /edesur|edenor|metrogas|aysa|personal|movistar|claro|telecentro|fibertel|flow/i,
  'Entretenimiento': /netflix|spotify|disney|hbo|max|prime video|steam|playstation|cine/i,
  'Hogar': /easy|sodimac|ferreteria|sanitarios|pinturer/i,
  'Indumentaria': /zara|adidas|nike|dexter|stock center|indumentaria|calzado/i
};
function porPalabraClave(texto: string, cats: any[]) {
  for (const [nombre, rx] of Object.entries(CLAVES)) {
    if (rx.test(texto)) return cats.find(c => c.nombre === nombre)?.id ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------
async function accessToken(sb: any, it: any) {
  if (it.expira_at && new Date(it.expira_at) > new Date(Date.now() + 60000)) return it.access_token;
  const r = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: it.refresh_token, grant_type: 'refresh_token' })
  })).json();
  if (r.error) throw new Error('refresh: ' + (r.error_description ?? r.error));
  await sb.from('integrations').update({ access_token: r.access_token,
    expira_at: new Date(Date.now() + r.expires_in * 1000).toISOString() }).eq('id', it.id);
  return r.access_token;
}

async function api(path: string, token: string) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`gmail ${r.status}: ${await r.text()}`);
  return r.json();
}

/** Saca el texto plano de un mail (recorre las partes MIME). */
function textoDe(payload: any): string {
  if (!payload) return '';
  const dec = (d: string) => {
    try {
      const b = atob(d.replace(/-/g, '+').replace(/_/g, '/'));
      return new TextDecoder('utf-8').decode(Uint8Array.from(b, c => c.charCodeAt(0)));
    } catch { return ''; }
  };
  if (payload.mimeType === 'text/plain' && payload.body?.data) return dec(payload.body.data);
  if (payload.parts) {
    const plano = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (plano?.body?.data) return dec(plano.body.data);
    for (const p of payload.parts) { const t = textoDe(p); if (t) return t; }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return dec(payload.body.data).replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  }
  return '';
}
