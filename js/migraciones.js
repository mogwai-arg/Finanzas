// =====================================================================
// migraciones.js — que archivo de SQL crea cada columna.
//
// Cuando la base no tiene una columna que la app escribe, Postgres rechaza
// la fila ENTERA y contesta "Could not find the 'saldos_tarjeta' column of
// 'settings' in the schema cache". Con eso solo no se sabe que hacer: hay
// veintitrés archivos en supabase/migrations y hay que abrirlos de a uno
// para encontrar cual la crea.
//
// Paso tres veces —cotejos, suscripciones, el saldo del banco de una
// tarjeta— y las tres veces el sintoma fue el mismo: se anota algo, la
// pantalla dice "Guardado", y a la siguiente sincronizacion no esta.
//
// El mapa de abajo sale de leer supabase/migrations. Una prueba de
// js/filas.test.mjs lo vuelve a leer y compara: si se agrega una columna en
// un SQL y no se agrega aca, falla y dice cual.
// =====================================================================
export const MIGRACION = {
  accounts: {
    ciclos: '006_faltantes.sql',
    saldo_al: '004_transferencias.sql',
    saldo_inicial: '004_transferencias.sql',
    saldo_visto_at: '023_saldo_visto.sql',
    tna: '017_remunerada.sql',
    tna_al: '017_remunerada.sql'
  },
  budgets: {
    account_id: '013_presupuesto_por_cuenta.sql',
    clase: '013_presupuesto_por_cuenta.sql'
  },
  categories: { icono: '012_icono_categoria.sql' },
  notificaciones: { datos: '009_avisos_con_datos.sql' },
  promos: { recordar: '010_promos_recordar.sql' },
  push_subscriptions: { updated_at: '011_avisos_al_telefono.sql' },
  recurrings: { debito_automatico: '014_debito_automatico.sql' },
  settings: {
    avisos: '011_avisos_al_telefono.sql',
    bishu: '015_bishu_memoria.sql',
    cotejos: '020_cotejos_suscripciones.sql',
    dia_cobro: '003_recibos.sql',
    proyeccion: '016_proyeccion.sql',
    ritmo_paritaria: '003_recibos.sql',
    saldo_minimo: '011_avisos_al_telefono.sql',
    saldos_tarjeta: '021_saldo_del_banco.sql',
    sobre_estimado: '003_recibos.sql',
    sumas_fijas_nr: '003_recibos.sql',
    suscripciones: '020_cotejos_suscripciones.sql',
    usd_ref: '018_dolar.sql',
    usd_ref_al: '018_dolar.sql',
    usd_ref_de: '018_dolar.sql'
  },
  transactions: {
    destino_account_id: '004_transferencias.sql',
    moneda_destino: '004_transferencias.sql',
    monto_destino: '004_transferencias.sql'
  },
};

/**
 * El rechazo de Postgres, dicho de forma que se pueda hacer algo.
 *
 * Devuelve null si el error es otra cosa: no hay que disfrazar de "falta una
 * migracion" un error que no lo es.
 */
export function faltaMigracion(error) {
  const m = /could not find the '(\w+)' column of '(\w+)'/i.exec(String(error || ''));
  if (!m) return null;
  const [, columna, tabla] = m;
  const archivo = MIGRACION[tabla] && MIGRACION[tabla][columna];
  return { tabla, columna, archivo: archivo || null };
}

/**
 * Los archivos que hay que correr, leidos de lo que no se pudo subir.
 *
 * Agrupa por archivo: una migracion que crea dos columnas es una sola cosa
 * que correr, no dos.
 */
export function migracionesQueFaltan(rotas) {
  const porArchivo = new Map();
  for (const r of rotas || []) {
    const f = faltaMigracion(r && r.error);
    if (!f) continue;
    const k = f.archivo || '';
    if (!porArchivo.has(k)) porArchivo.set(k, new Set());
    porArchivo.get(k).add(`${f.tabla}.${f.columna}`);
  }
  return [...porArchivo].map(([archivo, cols]) => ({ archivo, columnas: [...cols] }));
}
