# RecetApp

RecetApp compara precios de medicamentos entre farmacias de Colombia y muestra la opción más barata con la misma sustancia.

## Tecnología

- Sitio estático en HTML, CSS y JavaScript. Sin frameworks y sin paso de build: nada de npm, bundlers ni compiladores.
- Sin librerías externas. Si una hace falta, se pregunta antes.
- Tiene que funcionar en GitHub Pages tal cual está en el repositorio: `index.html` en la raíz y rutas relativas (`data/precios.csv`, nunca `/data/precios.csv`).
- Estructura: `index.html`, `css/estilo.css`, `js/datos.js` (lógica sin DOM), `js/app.js` (página), `data/precios.csv` y `scraper.py` (descarga de La Rebaja).
- Para probar en local, usar un servidor HTTP, por ejemplo `python -m http.server 8081`. Si se abre el archivo directamente (`file://`), el `fetch` del CSV falla.

## Idioma

- Todo en español de Colombia: textos de la web, mensajes de error, documentación, comentarios y mensajes de commit.
- `<html lang="es-CO">`.
- Trato de tú, igual que en la advertencia.
- Precios en pesos colombianos (COP), con punto como separador de miles y sin decimales en el precio de la caja.

## Datos

- Los precios viven en `data/precios.csv`. El navegador lo lee con `fetch` y lo procesa con JavaScript. No hay precios escritos en el HTML ni en el JavaScript.
- Formato: UTF-8, separado por comas, con el encabezado en la primera fila. Si un valor tiene coma, va entre comillas dobles.
- Nunca inventar precios, ni siquiera de muestra. Nunca editar precios a mano.
- Un precio solo entra desde una consulta real a la farmacia o a su web, con la fecha de esa consulta. Si un precio cambia, se agrega una fila nueva con la fecha nueva. Las filas anteriores no se borran.
- Los datos de prueba nunca van en `data/precios.csv`. Si hacen falta para desarrollar, van en un archivo aparte marcado como ficticio.
- Si el CSV no tiene filas, la web lo dice ("Todavía no hay precios cargados") en vez de mostrar datos de relleno.

El encabezado es exactamente este, en este orden:

```
fecha,farmacia,principio_activo,concentracion,producto,marca,presentacion,unidades,precio,precio_lista,precio_unidad,url
```

| Columna | Qué guarda |
|---|---|
| `fecha` | Fecha de la consulta, en formato `AAAA-MM-DD`. |
| `farmacia` | Nombre de la farmacia: La Rebaja, Locatel u Olímpica. |
| `principio_activo` | Principio activo en minúsculas, por ejemplo `ibuprofeno`. |
| `concentracion` | Dosis por unidad, por ejemplo `400 mg`. |
| `producto` | Nombre con el que la farmacia vende el producto. |
| `marca` | Marca o laboratorio, en mayúsculas. |
| `presentacion` | Texto de la presentación, por ejemplo `CAJA X 30 TAB`. |
| `unidades` | Unidades que trae la caja. Entero mayor que cero; vacío si no se sabe. |
| `precio` | Precio de la caja en pesos. Solo dígitos, sin `$` ni puntos. |
| `precio_lista` | Precio de lista en pesos. Puede ser igual a `precio`. |
| `precio_unidad` | `precio / unidades` según el proceso de carga. La app no la usa: calcula el suyo en el navegador. |
| `url` | Enlace a la página del producto en la farmacia. |

## Comparación

- Se compara por precio por unidad, no por caja: `precio / unidades`. Se calcula en el navegador. La columna `precio_unidad` del CSV no se usa.
- El precio de la caja se puede mostrar, pero no decide quién es más barato.
- Solo se compara dentro del mismo grupo: `principio_activo` + `concentracion` + forma (tableta o cápsula). La forma se deduce del `producto` y, si ahí no aparece, de la `presentacion`. Si no se puede deducir, va en un grupo aparte, "forma no especificada". La marca o el `producto` no separan grupos. Los productos sin unidades no entran al ranking.
- La opción más barata es la de menor precio por unidad del grupo.
- Si una farmacia tiene varias filas para la misma `url` y `presentacion`, se usa la de `fecha` más reciente. Si varias filas comparten esa fecha, se conservan todas.
- El precio por unidad se muestra redondeado a pesos enteros, pero la comparación usa el valor exacto.
- Cada precio que se muestra va con su farmacia y su fecha.
- Misma sustancia, más barato: al tocar un producto, se compara con el más barato de su grupo. Se muestra el ahorro por unidad en porcentaje y en pesos por las mismas unidades de la caja. Si el producto ya es el más barato, se dice. Si no informa unidades, se explica que no se puede comparar.

## Diseño

- Diseñado primero para celular: los estilos base son para 360 px de ancho. Las reglas `min-width` solo amplían para pantallas grandes.
- Sin scroll horizontal. Botones y áreas para tocar de al menos 44 px. Texto base de 16 px o más.
- Nada depende de hover.

## Advertencia siempre visible

Esta frase aparece en todo momento, en todas las pantallas y estados (incluidos error y "sin datos"). No va dentro de un modal, un acordeón ni un enlace que haya que abrir. Se escribe exactamente así:

> RecetApp compara precios; no reemplaza la indicación de tu médico o farmacéutico

## Antes de terminar un cambio

- Probar con el servidor local y revisar primero en ancho de celular (360 px).
- Confirmar que la advertencia se ve, que cada precio muestra farmacia y fecha, y que no se agregó ningún precio inventado.
