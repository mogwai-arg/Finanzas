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
import { leerPromosClash } from '../_shared/clash.ts';

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

  try {
    const r = await fetch(`https://promos.clash.com.ar/${rubro}/`, {
      // Un user-agent de navegador: con uno propio varios sitios contestan
      // una pagina de desafio en vez del contenido, y desde el telefono eso
      // se ve igual que "no hay promos".
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'es-AR,es;q=0.9'
      }
    });
    if (!r.ok) return json({ error: `clash contestó ${r.status}` }, 502);

    const html = await r.text();
    const promos = leerPromosClash(html);
    // Cuando no sale ninguna hay que poder distinguir "hoy no hay" de "la
    // pagina cambio" o "nos contestaron otra cosa", sin tener que estar
    // mirando los registros de la funcion.
    const revision = promos.length ? undefined : {
      bytes: html.length,
      bloques: (html.match(/data-pid="/g) || []).length,
      titulo: html.match(/<title[^>]*>([^<]*)</i)?.[1]?.trim() ?? null
    };
    return json({ rubro, promos, revision, cuando: new Date().toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
