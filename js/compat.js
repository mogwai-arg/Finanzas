// =====================================================================
// compat.js — lo que falta en navegadores que siguen andando.
//
// Existe por un caso concreto: en un iPhone, "Elegir el PDF del resumen"
// contestaba `TypeError: undefined is not a function`. No era el archivo ni
// el servidor: pdf.js usa `Promise.withResolvers()`, que Safari incorporó
// recién en la 17.4. En un teléfono con iOS 16 o 17.0 la librería se cae
// apenas arranca, y desde afuera se ve igual que un PDF roto.
//
// Se carga en el hilo principal y también adentro del worker de pdf.js, que
// es un módulo aparte y no hereda nada del que lo creó.
// =====================================================================

if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new this((ok, mal) => { resolve = ok; reject = mal; });
    return { promise, resolve, reject };
  };
}

// Safari 15.4 y anteriores. Son de una línea y evitan la misma clase de
// caída silenciosa.
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(Object(o), k);
}
if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    value: function at(i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length;
                            return i < 0 || i >= this.length ? undefined : this[i]; },
    writable: true, configurable: true
  });
}
if (typeof Array.prototype.findLast !== 'function') {
  Object.defineProperty(Array.prototype, 'findLast', {
    value: function findLast(fn, self) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (fn.call(self, this[i], i, this)) return this[i];
      }
      return undefined;
    },
    writable: true, configurable: true
  });
}
