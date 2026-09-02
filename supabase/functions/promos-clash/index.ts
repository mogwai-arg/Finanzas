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
      headers: { 'user-agent': 'BISHUSHA/1.0 (app personal de finanzas)' }
    });
    if (!r.ok) return json({ error: `clash contestó ${r.status}` }, 502);

    const promos = leerPromosClash(await r.text());
    return json({ rubro, promos, cuando: new Date().toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
