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
  // Si el micrófono está prendido porque la persona lo prendió, o porque el
  // navegador todavía no lo apagó. Son cosas distintas y de eso depende si
  // volver a arrancar cuando corta solo.
  let queriamos = false;

  const parar = () => { queriamos = false; try { rec?.stop(); } catch { /* ya estaba */ } };

  function arrancar() {
    rec = new Motor();
    rec.lang = 'es-AR';
    // Sigue escuchando entre frases. Con `false` cortaba al primer silencio, y
    // corregir dictando —"comí empanadas... ay no, con efectivo"— obligaba a
    // tocar el micrófono para cada frase, que es justo la fricción que el
    // dictado viene a sacar.
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = e => {
      // Solo lo NUEVO desde resultIndex: en modo continuo, e.results acumula
      // todo lo dicho desde que se prendió el micrófono, así que recorrerlo
      // entero repetía la frase anterior pegada a la nueva.
      let texto = '', final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        texto += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      alOir?.(texto.trim(), final);
    };
    rec.onerror = e => {
      // Un silencio largo no es un error del que haya que avisar: se corta y
      // listo. Avisar "no te escuché" cada vez que uno piensa es peor que
      // callarse.
      if (e.error === 'no-speech' || e.error === 'aborted') { queriamos = false; return; }
      queriamos = false; escuchando = false; alCambiar?.(false);
      // El permiso negado es lo único que la persona puede arreglar, así que
      // es lo único que vale la pena decir con nombre propio.
      alFallar?.(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Falta el permiso del micrófono'
        : 'No pude usar el micrófono. Probá con el del teclado.');
    };
    // En modo continuo el navegador igual corta solo cada tanto —sin voz, por
    // límite de tiempo— y ahí hay que volver a arrancar o el micrófono se
    // apaga sin que nadie lo haya apagado. Se distingue por `queriamos`: si la
    // persona lo apagó, se apaga.
    rec.onend = () => {
      if (queriamos) { try { rec.start(); return; } catch { /* no se pudo */ } }
      escuchando = false; alCambiar?.(false);
    };

    try { queriamos = true; rec.start(); escuchando = true; alCambiar?.(true); }
    catch { queriamos = false; escuchando = false; alCambiar?.(false); }
  }

  return {
    hay: true,
    get escuchando() { return escuchando; },
    alternar: () => escuchando ? parar() : arrancar(),
    parar
  };
}
