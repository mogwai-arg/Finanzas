// =====================================================================
// gmail-sync — lee los avisos de compra y carga los movimientos solos.
// Se ejecuta por cron (cada 30 min) para todos los usuarios conectados,
// o a demanda con { user_id } en el body.
// =====================================================================
import { admin, json, CORS, hoyISO } from '../_shared/comun.ts';
import { esPagoDeTarjeta, comoPagoDeTarjeta } from '../_shared/pagos.ts';
import { queHagoCon } from '../_shared/clasificar.ts';
import { parsearMail, leerAumento, ES_RUIDO, ES_CONSUMO, type Movimiento } from '../_shared/parsers.ts';

const REMITENTES = [
  'bancogalicia.com.ar', 'galicia.ar', 'modo.com.ar', 'mercadopago.com.ar', 'mercadolibre.com.ar',
  // Personal Pay estaba en la busqueda ancha del diagnostico pero no en esta:
  // la app veia esos mails al preguntarle "que te esta llegando" y despues no
  // cargaba ninguno.
  'personalpay.com.ar'
];
const QUERY = `from:(${REMITENTES.join(' OR ')}) newer_than:14d`;

// Para el diagnostico se busca mas ancho a proposito: la pregunta ahi no es
// "que puedo cargar" sino "que me esta llegando". Sirve para distinguir "el
// banco no manda nada" de "manda, pero no lo reconozco".
const QUERY_ANCHA = 'from:(galicia OR bancogalicia OR modo OR mercadopago OR mercadolibre OR ' +
  'personalpay OR naranja OR uala OR brubank) newer_than:30d';

// El resumen de la tarjeta llega una vez por mes, con el PDF adjunto. Es otra
// busqueda que la de los consumos: los consumos son avisos sueltos de los
// ultimos catorce dias, el resumen es un adjunto del ultimo mes y medio.
//
// Galicia manda desde varios dominios y "mensajesgalicia.com.ar" no estaba en
// ninguna busqueda: el "Resumen de Cuenta VISA" que sale de ahi no lo veia
// nadie.
const QUERY_RESUMEN = 'newer_than:45d ' +
  'from:(bancogalicia.com.ar OR galicia.ar OR mensajesgalicia.com.ar OR mail.galicia.ar OR ' +
  'naranja OR visa OR amex OR santander OR ' +
  'bbva OR macro OR icbc OR hsbc OR patagonia OR supervielle OR comafi)';

// El resumen de CUENTA es otra cosa que el de tarjeta, y el banco casi nunca
// lo adjunta: avisa que esta y hay que bajarlo de su app. Asi que este aviso
// no puede terminar en "lo abro yo" sino en "bajalo y subilo", que es el
// unico paso que no se puede automatizar.
const QUERY_CUENTA = 'newer_than:45d from:(bancogalicia.com.ar OR galicia.ar OR ' +
  'mensajesgalicia.com.ar OR mail.galicia.ar OR santander OR ' +
  'bbva OR macro OR nacion OR brubank OR uala)';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const sb = admin();
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  let q = sb.from('integrations').select('*').eq('proveedor', 'gmail').eq('activo', true);
  if (body.user_id) q = q.eq('user_id', body.user_id);
  const { data: integraciones } = await q;

  // Bajar el PDF de un resumen. Va aca y no en una funcion aparte para que
  // no haya una segunda cosa que pegar en Supabase, y porque el token de
  // Gmail ya se resuelve en este archivo.
  //
  // Los bytes se devuelven tal cual: quien los lee es el navegador, con el
  // mismo parser que ya usa Importar. Portar pdf.js a Deno para hacer del
  // lado del servidor lo que ya funciona del lado del telefono seria escribir
  // dos veces la parte dificil.
  if (body.adjunto) {
    const it = (integraciones ?? [])[0];
    if (!it) return json({ error: 'no hay Gmail conectado' }, 400);
    const token = await accessToken(sb, it);
    const a = await api(`messages/${body.adjunto.mensaje}/attachments/${body.adjunto.id}`, token);
    return json({ data: a.data, tamano: a.size ?? null });
  }

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

    // La misma decisión que toma la sincronización, contada. Antes esto miraba
    // un solo camino de cuatro y decía "descartado" de correos que en realidad
    // sí se procesan, por otro lado.
    const q = queHagoCon(asunto, remitente, cuerpo);
    let veredicto: string;
    if (q.via === 'resumen') {
      const pdf = buscarPdf(msg.payload);
      veredicto = pdf
        ? `TE AVISO · resumen de tarjeta, con el PDF adjunto: lo abro yo`
        : `TE AVISO · resumen de tarjeta, sin adjunto: hay que bajarlo y subirlo`;
    } else if (q.via === 'extracto') {
      veredicto = 'TE AVISO · resumen de cuenta: bajalo del banco y subilo';
    } else if (q.via === 'vencimiento') {
      veredicto = `no hace falta · ${q.porQue}`;
    } else if (q.via !== 'movimiento') {
      veredicto = `descartado · ${q.porQue}`;
    } else {
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
  let cargados = 0, ignorados = 0, adoptados = 0;

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
    if (tx === 'adoptado') {
      await sb.from('ingest_log').insert({
        ...log, estado: 'duplicado', detalle: 'ya estaba anotado a mano; se completó' });
      adoptados++; continue;
    }
    await sb.from('ingest_log').insert({ ...log, estado: 'cargado', transaction_id: tx.id });
    cargados++;
    nuevos.push(`${mov.comercio} ${mov.moneda === 'USD' ? 'U$S' : '$'}${mov.monto.toLocaleString('es-AR')}`);
  }

  const aumentos = await buscarAumentos(sb, it, token);

  await sb.from('integrations')
    .update({ ultima_sync: new Date().toISOString(), ultimo_error: null }).eq('id', it.id);

  if (cargados) {
    await sb.from('notificaciones').insert({
      user_id: it.user_id, tipo: 'carga_auto',
      titulo: `${cargados} ${cargados === 1 ? 'gasto cargado' : 'gastos cargados'} solo`,
      cuerpo: nuevos.slice(0, 4).join(' · ')
    });
  }

  // Los resumenes van aparte y no frenan lo demas: si esta busqueda falla,
  // los consumos ya se cargaron igual.
  let resumenes = 0, extractos = 0;
  try { resumenes = await buscarResumenes(sb, it, token); }
  catch (e) { console.warn('resumenes', e); }
  try { extractos = await buscarAvisosDeCuenta(sb, it, token); }
  catch (e) { console.warn('extractos', e); }

  return { user: it.user_id, cargados, ignorados, adoptados, aumentos, resumenes, extractos };
}

// ---------------------------------------------------------------------
/**
 * Avisos de aumento de los gastos fijos: la prepaga, el colegio, el alquiler.
 *
 * En vez de leer toda la casilla buscando aumentos —que serian miles de mails
 * y un monton de falsos positivos— se busca al reves: por cada gasto fijo que
 * ya tenes cargado, se busca su nombre en el correo reciente. Es una busqueda
 * por cada uno, pero son pocos y acotados.
 *
 * No cambia nada solo: deja el aviso con el numero viejo y el nuevo, y la app
 * ofrece el boton para actualizar. Un monto de un gasto fijo mal cambiado se
 * arrastra todos los meses.
 */
async function buscarAumentos(sb: any, it: any, token: string) {
  const { data: fijos } = await sb.from('recurrings').select('*')
    .eq('user_id', it.user_id).eq('activo', true);
  let propuestos = 0;

  for (const r of fijos ?? []) {
    const nombre = String(r.nombre || '').trim();
    if (nombre.length < 4) continue;            // 'luz' traeria cualquier cosa

    const q = `"${nombre}" newer_than:90d`;
    const lista = await api(`messages?q=${encodeURIComponent(q)}&maxResults=5`, token)
      .catch(() => ({ messages: [] }));

    for (const m of lista.messages ?? []) {
      const msg = await api(`messages/${m.id}?format=full`, token);
      const cab = (n: string) => msg.payload?.headers?.find((h: any) =>
        h.name.toLowerCase() === n)?.value ?? '';
      const texto = cab('subject') + ' ' + textoDe(msg.payload).slice(0, 2000);

      const a = leerAumento(texto);
      if (!a) continue;

      const actual = Number(r.monto_estimado) || 0;
      // Menos de un 2 % es redondeo o un numero que no era el de la cuota.
      if (!actual || Math.abs(a.monto - actual) / actual < 0.02) continue;

      const { error } = await sb.from('notificaciones').insert({
        user_id: it.user_id, tipo: 'aumento',
        titulo: `${nombre} pasa a ${a.monto.toLocaleString('es-AR')}`,
        cuerpo: `Tenés cargado ${actual.toLocaleString('es-AR')}` +
                (a.desde ? ` · desde ${a.desde}` : ''),
        ref_tabla: 'recurrings', ref_id: r.id,
        datos: { monto: a.monto, anterior: actual, desde: a.desde, asunto: cab('subject') }
      });
      if (!error) propuestos++;   // el indice unico evita repetir el mismo aviso
      break;                      // con el mas reciente de cada gasto alcanza
    }
  }
  return propuestos;
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

  // ¿Ya lo anotaste a mano? Anotar en el momento y que despues llegue el
  // aviso es el uso normal, no un error. Se completa esa fila en vez de crear
  // otra, y se respeta lo que hayas escrito.
  const desde = new Date(new Date(mov.fecha).getTime() - 4 * 86400000).toISOString().slice(0, 10);
  const hasta = new Date(new Date(mov.fecha).getTime() + 4 * 86400000).toISOString().slice(0, 10);
  const { data: previos } = await sb.from('transactions').select('*')
    .eq('user_id', userId).eq('fuente', 'manual').eq('tipo', mov.tipo)
    .eq('moneda', mov.moneda).gte('fecha', desde).lte('fecha', hasta);

  const previo = (previos ?? []).find((p: any) =>
    Math.abs(Number(p.monto) - mov.monto) <= 1 &&
    (!p.account_id || !cuenta?.id || p.account_id === cuenta.id));

  if (previo) {
    await sb.from('transactions').update({
      account_id: previo.account_id ?? cuenta?.id ?? null,
      cuotas: mov.cuotas, externo_id: externoId, fuente: 'gmail', revisado: true
    }).eq('id', previo.id);
    return 'adoptado';
  }


  let fila: any = {
    user_id: userId, fecha: mov.fecha, descripcion: mov.comercio, comercio: mov.comercio,
    monto: mov.monto, moneda: mov.moneda, tipo: mov.tipo, cuotas: mov.cuotas,
    account_id: cuenta?.id ?? null, category_id: catId,
    fuente: 'gmail', externo_id: externoId, revisado: false, confianza: mov.confianza
  };

  // Pagar la tarjeta no es un gasto: es plata que sale de una cuenta y salda
  // la tarjeta. Como gasto dejaba el resumen figurando impago —solo cuentan
  // las movidas con destino a la tarjeta— y encima inflaba el mes, contando
  // las compras y después el pago de esas mismas compras.
  const laTarjeta = esPagoDeTarjeta(`${mov.comercio} ${texto}`.slice(0, 400), cuentas);
  if (laTarjeta) {
    fila = comoPagoDeTarjeta(fila, laTarjeta);
    // El origen no puede ser la tarjeta misma: si el aviso vino de la tarjeta,
    // la cuenta que se detectó es el destino, no el origen.
    if (fila.account_id === laTarjeta.id) fila.account_id = null;
  }

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

/**
 * Los resumenes de tarjeta que llegaron con PDF adjunto.
 *
 * No se leen aca: se anotan para que el telefono los abra con el parser que
 * ya existe y ya esta probado, y para que la conciliacion —completar lo
 * anotado a mano, agregar lo que falta, no duplicar nada— pase por la misma
 * pantalla de Importar y no por dos caminos distintos.
 */
async function buscarResumenes(sb: any, it: any, token: string) {
  const lista = await api(`messages?q=${encodeURIComponent(QUERY_RESUMEN)}&maxResults=10`, token);
  let nuevos = 0;

  for (const m of lista.messages ?? []) {
    // Ya anotado: el aviso se manda una vez por resumen, no una por corrida.
    const { data: visto } = await sb.from('notificaciones').select('id')
      .eq('user_id', it.user_id).eq('tipo', 'resumen')
      .eq('datos->>mensaje', m.id).maybeSingle();
    if (visto) continue;

    const msg = await api(`messages/${m.id}?format=full`, token);
    const cab = (n: string) => msg.payload?.headers?.find((h: any) =>
      h.name.toLowerCase() === n)?.value ?? '';
    const asunto = cab('subject'), remitente = cab('from');
    // La misma regla que el diagnóstico, no una parecida. Sin esto un
    // "Resumen de Cuenta" a secas entraba por los dos lados y avisaba dos
    // veces la misma cosa, y la publicidad del banco —que habla de cierres y
    // de "tu cuenta"— se colaba como si fuera un resumen.
    if (queHagoCon(asunto, remitente, textoDe(msg.payload).slice(0, 600)).via !== 'resumen') continue;

    const pdf = buscarPdf(msg.payload);
    const fecha = new Date(Number(msg.internalDate || Date.now())).toISOString().slice(0, 10);

    // Sin adjunto el aviso sirve igual, y era el caso que se perdía entero:
    // el banco avisa que el resumen está y hay que bajarlo de su app. Lo
    // único que cambia es el final —"lo abro yo" o "bajalo y subilo"— y ese
    // paso es el que no se puede automatizar, no una razón para callarse.
    await sb.from('notificaciones').insert({
      user_id: it.user_id, tipo: 'resumen',
      titulo: pdf ? `Llegó ${asunto.slice(0, 70)}` : `Está ${asunto.slice(0, 70)}`,
      cuerpo: pdf
        ? 'Tocá para leerlo: los consumos, las cuotas y las fechas del ciclo.'
        : 'No vino adjunto: bajalo de la app del banco y subilo acá, y te separo ' +
          'los consumos, las cuotas y lo que te cobró de más.',
      datos: { mensaje: m.id, adjunto: pdf?.id ?? null, archivo: pdf?.nombre ?? null,
               asunto, remitente, fecha, tamano: pdf?.tamano ?? null, sinAdjunto: !pdf }
    });
    nuevos++;
  }
  return nuevos;
}

/**
 * Los avisos de "ya esta tu resumen de cuenta", que vienen SIN adjunto.
 *
 * Adentro del resumen de cuenta estan los gastos hormiga del banco:
 * mantenimiento, seguros que se renuevan solos, el impuesto al debito y al
 * credito, retenciones. Ninguno manda aviso propio y nadie los carga a mano,
 * asi que sin este documento no existen para la app.
 */
async function buscarAvisosDeCuenta(sb: any, it: any, token: string) {
  const lista = await api(`messages?q=${encodeURIComponent(QUERY_CUENTA)}&maxResults=15`, token);
  let nuevos = 0;

  for (const m of lista.messages ?? []) {
    const { data: visto } = await sb.from('notificaciones').select('id')
      .eq('user_id', it.user_id).eq('tipo', 'extracto')
      .eq('datos->>mensaje', m.id).maybeSingle();
    if (visto) continue;

    const msg = await api(`messages/${m.id}?format=metadata&metadataHeaders=subject&metadataHeaders=from`, token);
    const cab = (n: string) => msg.payload?.headers?.find((h: any) =>
      h.name.toLowerCase() === n)?.value ?? '';
    const asunto = cab('subject');
    // Tiene que hablar de la CUENTA y no de la tarjeta: el de tarjeta ya
    // tiene su propio camino.
    if (queHagoCon(asunto, cab('from')).via !== 'extracto') continue;

    const fecha = new Date(Number(msg.internalDate || Date.now())).toISOString().slice(0, 10);
    await sb.from('notificaciones').insert({
      user_id: it.user_id, tipo: 'extracto',
      titulo: 'Está tu resumen de cuenta',
      cuerpo: 'Bajalo de la app del banco y subilo acá: adentro están las comisiones ' +
              'y los seguros que no avisa nadie.',
      datos: { mensaje: m.id, asunto, fecha }
    });
    nuevos++;
  }
  return nuevos;
}

/** El primer adjunto PDF de un mail, mirando las partes MIME. */
function buscarPdf(payload: any): { id: string; nombre: string; tamano: number } | null {
  if (!payload) return null;
  const nombre = payload.filename || '';
  if (/\.pdf$/i.test(nombre) && payload.body?.attachmentId) {
    return { id: payload.body.attachmentId, nombre, tamano: payload.body.size ?? 0 };
  }
  for (const p of payload.parts ?? []) {
    const r = buscarPdf(p);
    if (r) return r;
  }
  return null;
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
