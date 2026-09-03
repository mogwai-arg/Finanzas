// =====================================================================
// proyeccion.js — dejarle al servidor la foto de los meses que vienen.
//
// El aviso al teléfono de "noviembre te aprieta" necesita saber qué parte de
// lo que entra ya tiene dueño. Ese cálculo —el cronograma de cuotas, los
// ciclos de cada tarjeta— es la parte más difícil de la app y ya está escrita
// dos veces: acá y en las pruebas. Portarla a Deno para que la haga el cron
// sería una tercera copia, y tres copias se separan. El día que se separan,
// el aviso miente.
//
// Así que la calcula el navegador, que es donde vive, y deja el resultado
// guardado. El cron lo lee. Si está viejo no avisa, que es mejor que avisar
// con un número de hace dos meses.
//
// Es una foto de meses futuros, no del día: envejece bien. Que sea de hace
// una semana no la hace menos cierta.
// =====================================================================
import { state, guardar } from './db.js';
import * as F from './finance.js';

/** Cuántos días puede tener la foto antes de que no sirva. */
export const VIGENCIA = 20;

/**
 * Calcula la proyección y la guarda si cambió o si la guardada ya está vieja.
 *
 * No se guarda en cada arranque: sin cambios sería un escritura por vez que
 * uno abre la app, y lo único que lograría es gastar cuota.
 */
export async function guardarProyeccion(ref = new Date()) {
  if (!state.user?.id) return null;
  const meses = F.proyeccionMeses(
    { cuentas: state.accounts, txs: state.transactions, recurrings: state.recurrings },
    { meses: 6 }, ref
  ).map(m => ({ periodo: m.periodo, entra: m.entra, comprometido: m.comprometido,
                cuotas: m.cuotas, fijos: m.fijos, libre: m.libre, pct: m.pct }));
  if (!meses.length) return null;

  const foto = { calculada: ref.toISOString(), meses };
  const vieja = state.settings?.proyeccion;
  if (vieja && !cambio(vieja, foto) && fresca(vieja, ref)) return vieja;

  await guardar('settings', { proyeccion: foto });
  return foto;
}

const fresca = (foto, ref) =>
  (ref - new Date(foto.calculada)) / 86400000 < VIGENCIA / 2;

/** Los mismos meses con los mismos números: nada que guardar. */
function cambio(a, b) {
  const clave = f => (f.meses || []).map(m =>
    `${m.periodo}:${Math.round(m.comprometido)}:${Math.round(m.entra)}`).join('|');
  return clave(a) !== clave(b);
}
