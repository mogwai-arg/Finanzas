// =====================================================================
// build-iconos.mjs — genera los PNG del icono a partir del isotipo.
//   npm i -D playwright && node build-iconos.mjs
// Se corre a mano cuando cambia el logo, no en cada deploy.
// El navegador rasteriza el SVG, asi que no hace falta ninguna libreria
// de imagenes: se dibuja igual que en la app.
// =====================================================================
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const B = 'M16 13.5A3.5 3.5 0 0 1 19.5 10h8A3.5 3.5 0 0 1 31 13.5v73a3.5 3.5 0 0 1-3.5 3.5h-8A3.5 3.5 0 0 1 16 86.5Z M22 10h24a18 18 0 0 1 0 36H22Z M31 35h15a7 7 0 0 0 0-14H31Z M22 54h46a18 18 0 0 1 0 36H22Z M31 79h37a7 7 0 0 0 0-14H31Z';

/**
 * `escala` es cuanto ocupa la B dentro del cuadrado.
 * En un icono maskable el sistema recorta hasta un 20 % de cada borde, asi
 * que la marca tiene que vivir en el circulo seguro del centro: por eso va
 * mas chica que en los demas.
 */
const ICONOS = [
  { archivo: 'icon-192.png',        lado: 192, radio: 0.22, escala: 0.62, fondo: '#14161C' },
  { archivo: 'icon-512.png',        lado: 512, radio: 0.22, escala: 0.62, fondo: '#14161C' },
  { archivo: 'maskable-512.png',    lado: 512, radio: 0,    escala: 0.44, fondo: '#14161C' },
  // iOS enmascara solo: el PNG va cuadrado y sin transparencia.
  { archivo: 'apple-touch-icon.png', lado: 180, radio: 0,   escala: 0.62, fondo: '#14161C' }
];

const pagina = ({ lado, radio, escala, fondo }) => {
  // La B mide 70 x 80 dentro de un viewBox de 100. Se centra por su caja real.
  const alto = lado * escala, ancho = alto * (70 / 80);
  const x = (lado - ancho) / 2, y = (lado - alto) / 2;
  const r = lado * radio;
  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
  <rect width="${lado}" height="${lado}" rx="${r}" fill="${fondo}"/>
  <g transform="translate(${x} ${y}) scale(${ancho / 70} ${alto / 80}) translate(-16 -10)">
    <path fill="#FFFFFF" d="${B}"/>
  </g>
</svg>`;
};

mkdirSync('icons', { recursive: true });
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const ic of ICONOS) {
  const p = await nav.newPage({ viewport: { width: ic.lado, height: ic.lado },
                                deviceScaleFactor: 1 });
  await p.setContent(pagina(ic));
  await p.screenshot({ path: `icons/${ic.archivo}`, omitBackground: true });
  await p.close();
  console.log(`icons/${ic.archivo} · ${ic.lado}×${ic.lado}`);
}
await nav.close();
