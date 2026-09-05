// =====================================================================
// revisar-a11y.mjs — la revisión de accesibilidad, corrida y no opinada.
//   node build-demo.mjs && npm run serve   (en otra terminal)
//   node revisar-a11y.mjs
//
// Mide cuatro cosas sobre la app de verdad, en las dos apariencias y en todas
// las pantallas: área de toque, contraste real del texto contra el fondo que
// tiene detrás, botones sin nombre para el lector de pantalla y campos sin
// etiqueta.
//
// Existe porque la accesibilidad se dice y no se mide. Un ojo entrenado no
// distingue 4,3:1 de 4,6:1, y esa diferencia es la que decide si un número se
// puede leer con el teléfono al sol.
//
// Dos trampas que costaron encontrar y que están resueltas acá adentro:
//
//   · color-mix() computa a "color(srgb 1 1 1 / .94)" y ahí los canales van de
//     0 a 1, no de 0 a 255. Leerlos mal convertía la barra de pestañas en un
//     falso positivo de 2,5:1.
//   · Una casilla mide 13 px siempre, pero lo que se toca es la etiqueta que
//     la envuelve. Medir la casilla sola daba diez errores que no existían.
// =====================================================================
import { chromium } from 'playwright';
const SP='/tmp/claude-0/-home-user-Finanzas/b1802126-6f08-561b-9c57-86811996c491/scratchpad';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
// La ficha de una tarjeta entra a la lista: hasta ahora era la unica pantalla
// que nadie medía, y es la que tiene el texto blanco sobre un degradé.
const rutas = ['/hoy','/gastos','/mes','/estadisticas','/donde','/fondos','/chat',
               '/ajustes','/categorizar','/tarjetas/demo-visa'];
const problemas = [];

for (const modo of ['light','dark']) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: modo });
  await p.goto('http://localhost:8099/dist/bishusha-demo.html');
  await p.waitForTimeout(1600);
  for (const r of rutas) {
    await p.evaluate(h => { location.hash = '#' + h; }, r);
    await p.waitForTimeout(700);
    const res = await p.evaluate(() => {
      // color-mix() computa a "color(srgb 1 1 1 / .94)": ahi los canales van
      // de 0 a 1, no de 0 a 255. Leerlos como 0-255 daba casi negro y
      // convertia la barra de pestanas en un falso positivo.
      const canales = c => {
        const n = (c.match(/-?\d*\.?\d+/g) || []).map(Number);
        return /^color\(/.test(c) ? n.slice(0, 3).map(v => v * 255) : n.slice(0, 3);
      };
      const lum = c => { const [r,g,bl]=canales(c)
        .map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
        return 0.2126*r+0.7152*g+0.0722*bl; };
      const ratio = (a,b2) => { const l1=lum(a), l2=lum(b2); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1];
        return (hi+0.05)/(lo+0.05); };
      // El fondo de verdad que hay detras de un texto.
      //
      // Un degrade no es `background-color` sino `background-image`, asi que
      // la version anterior lo salteaba y seguia subiendo hasta el body: el
      // texto blanco del plastico daba 1,12:1 contra el blanco de la pagina y
      // aparecian ocho errores que no existen. De un degrade se toma el PRIMER
      // color, que en esta app es siempre el mas claro de los dos: si contra
      // ese pasa, contra el resto tambien.
      const fondoDe = el => { let n=el; while(n && n!==document.documentElement){
        const cs=getComputedStyle(n);
        const grad=(cs.backgroundImage||'').match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i);
        if (grad) return grad[0];
        const bg=cs.backgroundColor;
        if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg; n=n.parentElement; }
        return getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)'; };

      const out = { chicos: [], contraste: [], sinNombre: [], sinLabel: [],
                    aMano: [], foco: 0 };
      // 1) area de toque
      for (const el of document.querySelectorAll(
             'button, a[href], input, select, [role=tab], [role=button]')) {
        // Una casilla vive adentro de su etiqueta y el area que se toca es la
        // etiqueta entera: medir la casilla sola da un falso positivo.
        const caja = el.type === 'checkbox' || el.type === 'radio'
          ? (el.closest('label') || el) : el;
        const r2 = caja.getBoundingClientRect();
        if (r2.width === 0 || r2.height === 0) continue;
        if (r2.height < 44 || r2.width < 24) {
          const t = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0,34);
          out.chicos.push([t, Math.round(r2.width), Math.round(r2.height)]);
        }
      }
      // 2) contraste del texto
      for (const el of document.querySelectorAll('body *')) {
        if (!el.childNodes.length) continue;
        const txt = [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
        if (!txt) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
        const grande = px >= 24 || (px >= 18.66 && bold);
        const req = grande ? 3 : 4.5;
        const rr = ratio(cs.color, fondoDe(el));
        if (rr < req) out.contraste.push([txt.slice(0,30), cs.color, Math.round(rr*100)/100, req, px]);
      }
      // 3) botones sin nombre accesible
      for (const el of document.querySelectorAll('button, a[href]')) {
        const n = (el.getAttribute('aria-label') || el.textContent || '').trim();
        if (!n && el.getBoundingClientRect().width) out.sinNombre.push(el.className || el.tagName);
      }
      // 4) lo que se toca pero no es un boton
      //
      // Un div con onclick funciona con el dedo y no existe para el teclado
      // ni para el lector de pantalla: no se le llega con el tabulador, no se
      // abre con Enter y no se anuncia como nada. Pasa sin que nadie lo note
      // porque en el telefono anda perfecto.
      //
      // No hay forma de leer los onclick puestos con addEventListener, asi
      // que se busca la pista que si se ve: `cursor: pointer` en algo que no
      // es un boton ni un enlace. Es la pista que delato a la tarjeta de la
      // pantalla de tarjetas, que se tocaba desde el primer dia y nunca fue
      // alcanzable con el teclado.
      for (const el of document.querySelectorAll('div, span, li, section, article')) {
        if (getComputedStyle(el).cursor !== 'pointer') continue;
        if (el.closest('button, a[href], label, [role=button], [role=tab], summary')) continue;
        // Solo el de MAS AFUERA: `cursor` se hereda, asi que un div clicable
        // con cuatro hijos daba cinco avisos del mismo problema.
        if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer') continue;
        const r3 = el.getBoundingClientRect();
        if (!r3.width || !r3.height) continue;
        out.aMano.push((el.className || el.tagName).toString().slice(0, 40));
      }
      // 5) inputs sin etiqueta
      for (const el of document.querySelectorAll('input, select, textarea')) {
        const id = el.id;
        const lab = (id && document.querySelector(`label[for="${id}"]`)) ||
                    el.closest('label') || el.getAttribute('aria-label') ||
                    (el.closest('.f') && el.closest('.f').querySelector('label'));
        if (!lab) out.sinLabel.push((el.type||el.tagName)+' '+(el.placeholder||''));
      }
      return out;
    });
    for (const c of res.chicos) problemas.push({ modo, ruta: r, tipo: 'toque', d: c });
    for (const c of res.contraste) problemas.push({ modo, ruta: r, tipo: 'contraste', d: c });
    for (const c of res.sinNombre) problemas.push({ modo, ruta: r, tipo: 'sinNombre', d: c });
    for (const c of res.sinLabel) problemas.push({ modo, ruta: r, tipo: 'sinLabel', d: c });
    for (const c of res.aMano) problemas.push({ modo, ruta: r, tipo: 'soloConElDedo', d: c });
  }
  await p.close();
}

const agrupar = tipo => {
  const m = new Map();
  for (const p2 of problemas.filter(x => x.tipo === tipo)) {
    const k = JSON.stringify(p2.d);
    if (!m.has(k)) m.set(k, { d: p2.d, donde: new Set() });
    m.get(k).donde.add(`${p2.modo}${p2.ruta}`);
  }
  return [...m.values()];
};
for (const t of ['toque','contraste','sinNombre','sinLabel','soloConElDedo']) {
  const g = agrupar(t);
  console.log(`\n=== ${t.toUpperCase()} (${g.length} distintos) ===`);
  for (const x of g.slice(0, 18)) console.log(' ', JSON.stringify(x.d), '·', [...x.donde].slice(0,3).join(' '));
}
await b.close();
