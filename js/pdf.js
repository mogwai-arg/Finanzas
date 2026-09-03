// =====================================================================
// pdf.js — sacar el texto de un PDF, en el navegador.
//
// El parser de resúmenes trabaja sobre líneas: cada consumo es una fila con
// la fecha, el comercio, el comprobante y el importe. Un PDF no tiene líneas:
// tiene pedacitos de texto con una posición cada uno. Reconstruirlas es todo
// el trabajo de este archivo.
//
// pdf.js pesa 1,7 MB, así que se carga recién cuando hace falta: quien no
// importa un resumen no lo baja nunca.
// =====================================================================

let motor = null;
let sinWorker = false;

/**
 * Arranca pdf.js. El Worker se intenta, pero no se depende de él.
 *
 * pdf.js hace el trabajo pesado en un Worker de módulo. Cuando ese Worker no
 * arranca —pasa en iOS dentro de una PWA, y con cualquier servidor que no
 * mande el .mjs con el tipo correcto— la librería falla con un error que
 * desde afuera se ve igual que "el PDF está roto", y no lo está.
 *
 * No se comprueba de antemano si el Worker anda: eso obligaría a esperar
 * antes de cada lectura, siempre, para un problema que casi nunca pasa. Se
 * intenta con Worker y, si la lectura falla, se reintenta sin él. Sin Worker
 * tarda unos segundos más y traba la pantalla mientras lee, pero lee: un
 * resumen que tarda cinco segundos es infinitamente mejor que uno que no se
 * puede abrir.
 */
async function cargar({ conWorker = true } = {}) {
  const pdfjs = motor || (motor = await import('../vendor/pdf.mjs'));
  const url = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
  if (conWorker) {
    pdfjs.GlobalWorkerOptions.workerSrc = url;
    sinWorker = false;
  } else {
    // Con el Worker apagado, pdf.js carga el mismo módulo en el hilo
    // principal. Necesita poder importarlo, no evaluarlo como texto.
    pdfjs.GlobalWorkerOptions.workerPort = null;
    pdfjs.GlobalWorkerOptions.workerSrc = url;
    sinWorker = true;
  }
  return pdfjs;
}

/** Si la última lectura tuvo que hacerse sin worker. */
export const leyoSinWorker = () => sinWorker;

/**
 * Cuántos espacios separan dos pedazos de texto.
 *
 * Se calcula con el ancho del texto anterior: el resumen usa columnas, y sin
 * respetar los huecos el comercio se pega al importe y las expresiones que
 * los separan dejan de encontrar el límite.
 */
function huecoEntre(anterior, x) {
  const finAnterior = anterior.x + anterior.ancho;
  const hueco = x - finAnterior;
  if (hueco < 2) return '';
  return ' '.repeat(Math.min(30, Math.max(1, Math.round(hueco / 4))));
}

/**
 * Si el PDF pide contraseña.
 *
 * Los resúmenes de los bancos argentinos suelen venir con el DNI de clave, y
 * hasta ahora eso era el final del camino: "no puedo abrirlo, copiá el texto
 * a mano". Distinguir este error del resto es lo que permite pedirla en vez
 * de rendirse.
 */
export class PideClave extends Error {
  constructor() { super('El PDF está protegido con contraseña.'); this.name = 'PideClave'; }
}

/** Texto de un PDF, con las líneas rearmadas por posición vertical. */
export async function textoDePDF(archivo, { alAvanzar, clave } = {}) {
  const datos = archivo instanceof Uint8Array ? archivo
    : new Uint8Array(await archivo.arrayBuffer());
  try {
    return await leer(datos, { alAvanzar, clave, conWorker: true });
  } catch (e) {
    // La clave no se arregla apagando el worker.
    if (e?.name === 'PideClave') throw e;
    console.warn('pdf: falló con worker, reintento sin él', e);
    return await leer(datos, { alAvanzar, clave, conWorker: false });
  }
}

async function leer(datos, { alAvanzar, clave, conWorker }) {
  const pdfjs = await cargar({ conWorker });
  // Los bytes se consumen al abrir: si hay que reintentar, hace falta una
  // copia propia o el segundo intento recibe un buffer vacío.
  const tarea = pdfjs.getDocument({ data: datos.slice(), isEvalSupported: false,
                                    password: clave || undefined,
                                    disableWorker: !conWorker });
  let doc;
  try {
    doc = await tarea.promise;
  } catch (e) {
    // pdf.js avisa con un nombre propio, y con un código distinto según sea
    // "falta la clave" o "la clave está mal". Para quien la escribe es lo
    // mismo: la que puso no sirve.
    if (e?.name === 'PasswordException') throw new PideClave();
    throw e;
  }

  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    alAvanzar && alAvanzar(n, doc.numPages);
    const pagina = await doc.getPage(n);
    const contenido = await pagina.getTextContent();

    // Se agrupa por la coordenada vertical: todo lo que está a la misma
    // altura es una línea. Se redondea porque dos pedazos de la misma fila
    // pueden diferir en decimos de punto.
    const filas = new Map();
    for (const it of contenido.items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      const x = it.transform[4];
      if (!filas.has(y)) filas.set(y, []);
      filas.get(y).push({ x, texto: it.str, ancho: it.width || 0 });
    }

    const ordenadas = [...filas.entries()].sort((a, b) => b[0] - a[0]);   // de arriba hacia abajo
    for (const [, pedazos] of ordenadas) {
      pedazos.sort((a, b) => a.x - b.x);
      let linea = '';
      let anterior = null;
      for (const p of pedazos) {
        if (anterior) linea += huecoEntre(anterior, p.x);
        linea += p.texto;
        anterior = p;
      }
      if (linea.trim()) paginas.push(linea);
    }
  }
  // Segun la version, el que sabe liberar es el documento o la tarea que lo
  // abrio. Si ninguno esta, tampoco pasa nada: se libera al recolectar.
  await (doc.destroy?.() ?? tarea.destroy?.());
  return paginas.join('\n');
}
