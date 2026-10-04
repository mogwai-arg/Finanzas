# Fixtures

Datos reales anonimizados a mano, para probar contra lo que de verdad manda
cada uno en vez de contra un ejemplo inventado.

| Archivo | Qué es |
|---|---|
| `resumen-visa.txt` | Resumen de tarjeta de Galicia, texto extraído del PDF |
| `resumen-mastercard.txt` | Idem, la otra tarjeta |
| `resumen-visa-puntos.txt` | El Visa de 2026: fechas con puntos, comprobante adelante, menos atras y el ciclo en seis casillas con etiqueta. Es otro formato del MISMO banco |
| `clash-combustibles.html` | La página de promos de combustibles de `promos.clash.com.ar`, guardada tal cual |

`clash-combustibles.html` es la copia que sirve el sitio, con las rutas a las
imágenes reemplazadas. No tiene datos de nadie: son promociones públicas.
Está acá porque el lector de promos se prueba contra ella, y sin un ejemplo
real un lector de HTML ajeno es una adivinanza.
