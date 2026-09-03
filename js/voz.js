// =====================================================================
// voz.js — dictar en vez de escribir.
//
// Es el "mensaje de voz" de un chat, que en una app de gastos es lo más
// rápido que hay: se dice "cuarenta y cinco lucas de nafta" caminando hacia
// el auto y ya está anotado.
//
// Usa el reconocimiento del propio navegador —en el iPhone es el mismo motor
// que el dictado del teclado, y corre en el teléfono— así que no manda audio
// a ningún lado ni cuesta por minuto.
//
// Si el navegador no lo tiene, no se disfraza: queda el micrófono del
// teclado, que es exactamente el mismo dictado con un toque más.
// =====================================================================

const Motor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

/**
 * Un dictado que se prende y se apaga.
 *
 * `alOir` recibe (texto, final): mientras hablás llega el borrador para que
 * se vea que está escuchando, y al terminar llega la frase cerrada. Sin el
 * borrador, diez segundos de silencio en pantalla se leen como que se colgó.
 */
export function dictado({ alOir, alCambiar, alFallar } = {}) {
  if (!Motor) return { hay: false, alternar() {}, parar() {} };

  let rec = null, escuchando = false;

  const parar = () => { try { rec?.stop(); } catch { /* ya estaba */ } };

  function arrancar() {
    rec = new Motor();
    rec.lang = 'es-AR';
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = e => {
      let texto = '', final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        texto += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      alOir?.(texto.trim(), final);
    };
    rec.onerror = e => {
      escuchando = false; alCambiar?.(false);
      // El permiso negado es lo único que la persona puede arreglar, así que
      // es lo único que vale la pena decir con nombre propio.
      alFallar?.(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Falta el permiso del micrófono'
        : e.error === 'no-speech' ? 'No te escuché'
        : 'No pude usar el micrófono. Probá con el del teclado.');
    };
    rec.onend = () => { escuchando = false; alCambiar?.(false); };

    try { rec.start(); escuchando = true; alCambiar?.(true); }
    catch { escuchando = false; alCambiar?.(false); }
  }

  return {
    hay: true,
    get escuchando() { return escuchando; },
    alternar: () => escuchando ? parar() : arrancar(),
    parar
  };
}
