// =====================================================================
// texto.js — como se nombran las cosas en pantalla.
//
// Va aparte de formato.js porque eso arrastra el estado de la app, y estas
// son funciones puras: entra un movimiento, sale un texto. Asi se pueden
// probar sin navegador.
// =====================================================================

/**
 * Como se titula un movimiento.
 *
 * Son dos datos distintos: QUE compraste ('zapatillas para Feli') y DONDE
 * ('Dexter'). El resumen del banco solo trae el comercio, asi que ahi los dos
 * coinciden y se muestra uno solo.
 */
export function tituloTx(tx) {
  const que = (tx.descripcion || '').trim();
  const donde = (tx.comercio || '').trim();
  return que && que !== donde ? que : (donde || que || 'Movimiento');
}

/** El renglon de abajo: donde fue, si no es ya el titulo. */
export function dondeTx(tx) {
  const que = (tx.descripcion || '').trim();
  const donde = (tx.comercio || '').trim();
  return que && donde && que !== donde ? donde : '';
}
