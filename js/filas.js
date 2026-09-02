// =====================================================================
// filas.js — deja una fila como la base la espera, antes de subirla.
//
// Va aparte de db.js porque eso arrastra el navegador y no se puede importar
// para probarlo, y esto es justo lo que conviene tener probado: un campo de
// mas o un valor imposible traba la sincronizacion hasta que alguien mira.
// =====================================================================

// ---------------------------------------------------------------- columnas
//
// Que campos acepta cada tabla. Existe por dos accidentes reales:
//
//   1. La pantalla de cuentas le agrega un `saldo` calculado a cada cuenta
//      para mostrarlo, y al tocar una para editarla ese campo derivado
//      viajaba a la base. Postgres no tiene esa columna y rechazaba la fila:
//      cada edicion quedaba trabada para siempre en el cajon de fallidas.
//   2. Un dia de cierre invalido —509, de teclear '5/09'— chocaba contra el
//      check de la base y hacia lo mismo.
//
// Filtrar y normalizar aca, en el unico lugar por donde pasa todo lo que se
// guarda, es mas seguro que acordarse en cada vista.
const COLUMNAS = {
  accounts: ['id', 'user_id', 'nombre', 'tipo', 'banco', 'marca', 'ultimos4', 'moneda',
             'cierre_dia', 'vencimiento_dia', 'limite', 'color', 'orden', 'activo',
             'saldo_inicial', 'saldo_al', 'ciclos', 'updated_at'],
  transactions: ['id', 'user_id', 'fecha', 'descripcion', 'comercio', 'monto', 'moneda',
                 'tipo', 'account_id', 'destino_account_id', 'monto_destino', 'moneda_destino',
                 'category_id', 'cuotas', 'reintegro', 'promo_id', 'notas', 'origen',
                 'import_hash', 'fuente', 'revisado', 'confianza', 'externo_id', 'updated_at']
};

const diaValido = n => (Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 31
  ? Number(n) : null);

/** Deja la fila como la base la espera: sin campos de mas ni valores imposibles. */
export function normalizar(tabla, fila) {
  const cols = COLUMNAS[tabla];
  const f = cols
    ? Object.fromEntries(Object.entries(fila).filter(([k]) => cols.includes(k)))
    : { ...fila };

  if (tabla === 'accounts') {
    f.cierre_dia = diaValido(f.cierre_dia);
    f.vencimiento_dia = diaValido(f.vencimiento_dia);
  }
  if (tabla === 'transactions' && f.monto != null) f.monto = Math.abs(Number(f.monto)) || 0;
  return f;
}
