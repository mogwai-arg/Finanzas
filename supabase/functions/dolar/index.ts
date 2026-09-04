// =====================================================================
// dolar — la cotización, para poder sumar pesos y dólares.
//
// Sin esto, "Dónde está la plata" muestra dos totales que no se pueden sumar
// y nunca dice cuánto tenés en total. El código para decirlo ya estaba desde
// el principio; lo que faltaba era el número, y no había ningún lugar donde
// escribirlo.
//
// Va del lado del servidor por lo mismo que las promos: desde la página, el
// navegador bloquea pedirle datos a otro dominio salvo que el otro lo
// permita, y no conviene depender de que un servicio gratuito mantenga esa
// cabecera para siempre.
// =====================================================================
import { json, CORS } from '../_shared/comun.ts';
import { leerDolar } from '../_shared/dolar.ts';

const FUENTES = [
  { nombre: 'dolarapi', url: 'https://dolarapi.com/v1/dolares' },
  { nombre: 'criptoya', url: 'https://criptoya.com/api/dolar' }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const errores: string[] = [];
  for (const f of FUENTES) {
    try {
      // Con límite de tiempo: un servicio gratuito que no contesta no puede
      // dejar la pantalla colgada. Diez segundos y se prueba el siguiente.
      const ctrl = new AbortController();
      const reloj = setTimeout(() => ctrl.abort(), 10_000);
      const r = await fetch(f.url, { signal: ctrl.signal,
                                     headers: { accept: 'application/json' } });
      clearTimeout(reloj);
      if (!r.ok) { errores.push(`${f.nombre}: contestó ${r.status}`); continue; }

      const valor = leerDolar(await r.json());
      if (valor) return json({ ...valor, fuente: f.nombre, cuando: new Date().toISOString() });
      errores.push(`${f.nombre}: contestó pero no encontré el MEP`);
    } catch (e) {
      errores.push(`${f.nombre}: ${String(e).slice(0, 80)}`);
    }
  }

  // Cuando falla, se dice qué se intentó. "No pude" a secas no deja arreglar
  // nada ni saber si el problema es de un servicio o de los dos.
  return json({ error: 'ninguna fuente contestó', intentos: errores }, 502);
});
