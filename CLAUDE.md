# RecetApp

RecetApp compara precios de medicamentos entre farmacias de Colombia y muestra la opción más barata con la misma sustancia.

## Tecnología

- Sitio estático en HTML, CSS y JavaScript. Sin frameworks y sin paso de build: nada de npm, bundlers ni compiladores.
- Sin librerías externas. Si una hace falta, se pregunta antes.
- Tiene que funcionar en GitHub Pages tal cual está en el repositorio: `index.html` en la raíz y rutas relativas (`data/precios.csv`, nunca `/data/precios.csv`).
- Estructura prevista: `index.html`, `css/`, `js/` y `data/precios.csv`.
- Para probar en local, usar un servidor HTTP, por ejemplo `python -m http.server`. Si se abre el archivo directamente (`file://`), el `fetch` del CSV falla.

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
sustancia,concentracion,producto,unidad,unidades_por_caja,precio_caja,farmacia,fecha
```

| Columna | Qué guarda |
|---|---|
| `sustancia` | Principio activo en minúsculas, por ejemplo `ibuprofeno`. |
| `concentracion` | Dosis por unidad, por ejemplo `400 mg`. |
| `producto` | Nombre con el que la farmacia vende el producto. |
| `unidad` | Lo que se cuenta: `tableta`, `cápsula`, `ml`... |
| `unidades_por_caja` | Cuántas unidades trae la caja. Entero mayor que cero. |
| `precio_caja` | Precio de la caja en pesos. Solo dígitos, sin `$` ni puntos. |
| `farmacia` | Nombre de la farmacia. |
| `fecha` | Fecha de la consulta, en formato `AAAA-MM-DD`. |

## Comparación

- Se compara por precio por unidad, no por caja: `precio_caja / unidades_por_caja`. Se calcula en el navegador y nunca se guarda en el CSV.
- El precio de la caja se puede mostrar, pero no decide quién es más barato.
- Solo se compara dentro del mismo grupo: `sustancia` + `concentracion` + `unidad`. La marca o el `producto` no separan grupos.
- La opción más barata es la de menor precio por unidad del grupo.
- Si una farmacia tiene varias filas para el mismo `producto`, se usa la de `fecha` más reciente.
- El precio por unidad se muestra redondeado a pesos enteros, pero la comparación usa el valor exacto.
- Cada precio que se muestra va con su farmacia y su fecha.

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
