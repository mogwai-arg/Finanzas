// Un data.js de promos.clash.com.ar, recortado y con los datos cambiados.
//
// La forma sale de la propia página: el navegador hace
// `<script src="data.js">` y después arma cada tarjeta leyendo p.d, p.inst,
// p.cap, p.fr, p.note, p.cards y p.days de window.__clashData.P.
window.__clashData = {
  "updatedAt": "2026-09-02T09:12:00-03:00",
  "banks": [
    { "id": "galicia", "name": "Galicia", "logo": "galicia.png" },
    { "id": "mercadopago", "name": "Mercado Pago", "logo": "mp.png" },
    { "id": "bbva", "name": "BBVA", "logo": "bbva.png" }
  ],
  "merchants": [
    { "id": "ypf", "name": "YPF", "logo": "ypf.png" },
    { "id": "pumaenergy", "name": "Puma Energy", "logo": "puma.png" },
    { "id": "coto", "name": "Coto", "logo": "coto.png" }
  ],
  "P": [
    { "id": "m_galicia_ypf_mtk9x5lk", "bk": "galicia", "mc": "ypf", "d": 25,
      "inst": "Cuenta Sueldo", "cap": "$20.000", "fr": "x cuenta x mes",
      "note": "Jueves 10/09", "cards": ["modo.png", "mastercard platinum.png"],
      "days": [0,0,0,1,0,0,0] },
    { "id": "b_41715", "bk": "mercadopago", "mc": "ypf", "d": 10,
      "cap": "$5.000", "fr": "x cuenta x mes", "note": "Tarjeta física prepaga",
      "cards": ["mercado pago.png"], "days": [0,0,0,0,0,0,1] },
    { "id": "b_39100", "bk": "bbva", "mc": "coto", "d": 20,
      "cap": "$15.000", "fr": "x cuenta x semana",
      "note": "Reintegro con {tope} por operación", "days": [1,1,1,1,1,1,1] },
    { "id": "b_50001", "bk": "galicia", "mc": "pumaenergy",
      "inst": "6 cuotas sin interés", "days": [0,0,0,0,1,1,0] },
    { "id": "b_vacia", "bk": "galicia", "mc": "coto", "note": "sin nada que mostrar" }
  ]
};
