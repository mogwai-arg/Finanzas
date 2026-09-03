// =====================================================================
// promos-clash — trae las promos vigentes de promos.clash.com.ar
//
// Va del lado del servidor y no del navegador por una razon simple: desde la
// pagina, pedirle datos a otro dominio lo bloquea el navegador salvo que el
// otro lo permita. Aca no hay ese problema, y de paso el telefono no baja
// 200 KB de HTML.
//
// Se pide de a un rubro, que es como esta armado el sitio y como uno busca:
// "estoy en el super, ¿con que pago?".
// =====================================================================
import { json, CORS } from '../_shared/comun.ts';
import { leerPromosClash, leerDatosClash, revisarDatosClash } from '../_shared/clash.ts';

const RUBROS: Record<string, string> = {
  supermercado: 'supermercados',
  combustible: 'combustibles',
  gastronomia: 'gastronomia',
  salud: 'farmacias',
  transporte: 'transportes'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const pedido = String(body.rubro ?? url.searchParams.get('rubro') ?? 'supermercado');
  const rubro = RUBROS[pedido] ?? (Object.values(RUBROS).includes(pedido) ? pedido : null);
  if (!rubro) return json({ error: `no conozco el rubro "${pedido}"`, rubros: Object.keys(RUBROS) }, 400);

  // Un navegador, no un robot: con un user-agent propio varios sitios
  // contestan una pagina de desafio en vez del contenido, y desde el telefono
  // eso se ve igual que "no hay promos".
  const COMO_NAVEGADOR = {
    'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
    'accept-language': 'es-AR,es;q=0.9'
  };

  try {
    // Primero el data.js, que es de donde el propio sitio saca las promos.
    const datos = await fetch(`https://promos.clash.com.ar/${rubro}/data.js`,
      { headers: { ...COMO_NAVEGADOR, accept: 'application/javascript,text/plain,*/*' } });
    if (datos.ok) {
      const js = await datos.text();
      const promos = leerDatosClash(js, rubro);
      if (promos.length) return json({ rubro, promos, fuente: 'data.js', cuando: new Date().toISOString() });
      // Las claves y los largos, no los primeros 200 caracteres: el
      // encabezado es igual en todos los rubros y no dice nada.
      var revisionDatos = revisarDatosClash(js);
    }

    // Si no salio nada, la pagina armada: hubo una epoca en que venia asi.
    const r = await fetch(`https://promos.clash.com.ar/${rubro}/`,
      { headers: { ...COMO_NAVEGADOR, accept: 'text/html,application/xhtml+xml' } });
    if (!r.ok) return json({ error: `clash contestó ${r.status}` }, 502);

    const html = await r.text();
    const promos = leerPromosClash(html);
    // Cuando no sale ninguna hay que poder distinguir "hoy no hay" de "la
    // pagina cambio" o "nos contestaron otra cosa", sin tener que estar
    // mirando los registros de la funcion.
    const revision = promos.length ? undefined : {
      data: revisionDatos ?? 'no vino',
      bytes: html.length,
      bloques: (html.match(/data-pid="/g) || []).length,
      titulo: html.match(/<title[^>]*>([^<]*)</i)?.[1]?.trim() ?? null
    };
    return json({ rubro, promos, fuente: 'html', revision, cuando: new Date().toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
