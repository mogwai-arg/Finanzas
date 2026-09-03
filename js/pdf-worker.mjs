// =====================================================================
// pdf-worker.mjs — el worker de pdf.js, con los parches puestos antes.
//
// El worker es un módulo aparte: no hereda nada de la página que lo creó, así
// que el parche de `Promise.withResolvers` tiene que aplicarse también acá
// adentro. Sin esto, en un iPhone con iOS anterior a 17.4 el worker se cae
// apenas arranca y la lectura falla sin decir por qué.
//
// Este archivo existe para no tocar vendor/: lo de afuera se actualiza sin
// pisar lo nuestro.
// =====================================================================
import './compat.js';
import '../vendor/pdf.worker.mjs';
