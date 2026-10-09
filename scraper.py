"""Consulta el catálogo público de La Rebaja y guarda los precios de hoy.

Desde la raíz del repositorio:
    python scraper.py            resumen por término y descartes
    python scraper.py --detalle  además, cada producto descartado y por qué

Solo usa la biblioteca estándar. Antes de consultar lee robots.txt con su
propio User-Agent y espera al menos 1,5 segundos entre peticiones. El resultado
queda en data/scrapeado-hoy.csv. Ese archivo no es data/precios.csv: los datos
de la web se cargan aparte, con el esquema de CLAUDE.md.
"""

import csv
import datetime
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

FARMACIA = "La Rebaja"
BASE = "https://www.larebajavirtual.com"
ENDPOINT = BASE + "/api/catalog_system/pub/products/search"
ROBOTS = BASE + "/robots.txt"
USER_AGENT = "RecetAppBot/1.0 (comparador de precios de medicamentos)"
PAUSA_MINIMA = 1.5  # segundos entre peticiones
PAGINA = 50  # la API devuelve como máximo 50 productos por consulta
MAX_PAGINAS = 20  # tope de seguridad: 1.000 productos por término

TERMINOS = [
    "losartan", "acetaminofen", "ibuprofeno", "atorvastatina", "metformina",
    "omeprazol", "loratadina", "amlodipino", "dolex", "advil",
]

COLUMNAS = [
    "fecha", "farmacia", "principio_activo", "concentracion", "producto",
    "marca", "presentacion", "unidades", "precio", "precio_lista",
    "precio_unidad", "url",
]

SALIDA = Path(__file__).resolve().parent / "data" / "scrapeado-hoy.csv"

RE_CONCENTRACION = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(MG|MCG|UG|G|UI|%)(?![A-Z])")
RE_UNIDADES = re.compile(r"\bX\s*(\d+(?:[.,]\d+)?)")
RE_LIQUIDO = re.compile(
    r"\b(JARABE|SUSPENSION|SUSP|SOLUCION|GOTAS|ELIXIR|EMULSION|LIQUIDO"
    r"|INYECT\w*|AMPOLLA|ML|MILILITROS?)\b"
)
RE_COMBINACION_NOMBRE = re.compile(r"[+/]|\bHCT\b")
RE_COMBINACION_PRINCIPIO = re.compile(r"[+/,]|\bY\b")


class Cliente:
    """Hace las peticiones y espera la pausa mínima entre una y otra."""

    def __init__(self, pausa):
        self.pausa = pausa
        self._ultima = None

    def pedir(self, url):
        if self._ultima is not None:
            espera = self.pausa - (time.monotonic() - self._ultima)
            if espera > 0:
                time.sleep(espera)
        self._ultima = time.monotonic()
        req = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", "replace")


def leer_robots(cliente):
    """Lee robots.txt con nuestro User-Agent. Si no se puede leer, no se consulta nada."""
    try:
        texto = cliente.pedir(ROBOTS)
    except OSError as err:
        sys.exit(f"No pude leer robots.txt ({err}). No consulto el sitio sin revisarlo.")
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(texto.splitlines())
    return rp


def consultar_termino(cliente, termino):
    """Trae los productos del término, de 50 en 50 hasta que una página venga incompleta."""
    productos = []
    for pagina in range(MAX_PAGINAS):
        desde = pagina * PAGINA
        query = urllib.parse.urlencode(
            {"ft": termino, "_from": desde, "_to": desde + PAGINA - 1}
        )
        lote = json.loads(cliente.pedir(f"{ENDPOINT}?{query}"))
        if not isinstance(lote, list):
            raise ValueError("respuesta inesperada de la API")
        productos.extend(lote)
        if len(lote) < PAGINA:
            return productos
    print(f"{termino}: se llegó al tope de {MAX_PAGINAS} páginas; puede haber más productos.")
    return productos


def sin_tildes(texto):
    """Quita tildes y pasa a mayúsculas para comparar textos."""
    descompuesto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in descompuesto if not unicodedata.combining(c)).upper()


def lista(producto, campo):
    """Valores de un campo de especificación. La API los entrega como lista."""
    datos = producto.get(campo) or []
    if isinstance(datos, list):
        return [str(d) for d in datos]
    return [str(datos)]


def valor(producto, campo):
    """Primer valor de un campo de especificación, o cadena vacía."""
    valores = lista(producto, campo)
    return valores[0].strip() if valores else ""


def numero(x):
    """Entero si no tiene decimales; si no, dos decimales."""
    if x is None:
        return ""
    x = round(float(x), 2)
    return str(int(x)) if x.is_integer() else f"{x:.2f}"


def extraer_concentracion(nombre):
    """'LOSARTAN POTASICO 50 MG (GENFAR)' -> '50 mg'."""
    m = RE_CONCENTRACION.search(sin_tildes(nombre))
    if not m:
        return ""
    cantidad = m.group(1).replace(",", ".")
    unidad = m.group(2)
    return f"{cantidad}%" if unidad == "%" else f"{cantidad} {unidad.lower()}"


def a_entero(texto):
    try:
        return int(float(texto.replace(",", ".")))
    except ValueError:
        return None


def extraer_unidades(producto):
    """Unidades de la caja: de 'CAJA X 30 TAB', luego del nombre o de Cantidadunidadesmedida."""
    m = RE_UNIDADES.search(sin_tildes(valor(producto, "Presentacionunidadmedida")))
    if m:
        return a_entero(m.group(1))
    m = RE_UNIDADES.search(sin_tildes(producto.get("productName", "")))
    if m:
        return a_entero(m.group(1))
    cantidad = valor(producto, "Cantidadunidadesmedida")
    return a_entero(cantidad) if cantidad else None


def texto_presentacion(producto):
    """'Caja X 30.00 TAB' -> 'CAJA X 30 TAB'."""
    texto = re.sub(r"\s+", " ", sin_tildes(valor(producto, "Presentacionunidadmedida")))
    return re.sub(r"(\d)\.00\b", r"\1", texto).strip()


def es_liquido(producto):
    textos = [
        producto.get("productName", ""),
        valor(producto, "Unidadmedida"),
        valor(producto, "Contenido"),
        valor(producto, "Presentacionunidadmedida"),
    ]
    return bool(RE_LIQUIDO.search(sin_tildes(" ".join(textos))))


def es_combinacion(producto, principios):
    """Combinaciones: más de una sustancia, o nombres con +, / o HCT."""
    if len(principios) != 1:
        return True
    if RE_COMBINACION_PRINCIPIO.search(sin_tildes(principios[0])):
        return True
    return bool(RE_COMBINACION_NOMBRE.search(sin_tildes(producto.get("productName", ""))))


def evaluar(producto, item, fecha):
    """Devuelve (fila, None) si el producto sirve, o (None, motivo) si se descarta."""
    principios = [p.strip() for p in lista(producto, "Principio activo") if p.strip()]
    if not principios:
        return None, "sin principio activo"
    if es_liquido(producto):
        return None, "forma líquida"
    if es_combinacion(producto, principios):
        return None, "combinación de sustancias"
    concentracion = extraer_concentracion(producto.get("productName", ""))
    if not concentracion:
        return None, "sin concentración"
    unidades = extraer_unidades(producto)
    if not unidades:
        return None, "sin unidades"

    sellers = item.get("sellers") or []
    if not sellers:
        return None, "sin vendedor"
    oferta = sellers[0].get("commertialOffer") or {}
    if not oferta.get("IsAvailable"):
        return None, "no disponible"
    precio = oferta.get("Price")
    if not precio or precio <= 0:
        return None, "sin precio"

    fila = {
        "fecha": fecha,
        "farmacia": FARMACIA,
        "principio_activo": principios[0].lower(),
        "concentracion": concentracion,
        "producto": " ".join(producto.get("productName", "").split()),
        "marca": (producto.get("brand") or "").strip(),
        "presentacion": texto_presentacion(producto),
        "unidades": unidades,
        "precio": numero(precio),
        "precio_lista": numero(oferta.get("ListPrice")),
        "precio_unidad": numero(precio / unidades),
        "url": producto.get("link") or "",
    }
    return fila, None


def procesar(productos, fecha, vistos, descartes, detalle):
    """Convierte productos en filas del CSV y cuenta los descartes por motivo."""
    filas = []
    for producto in productos:
        items = producto.get("items") or []
        clave = (producto.get("link"), tuple(i.get("itemId") for i in items))
        if clave in vistos:
            continue  # el mismo producto llegó por otro término
        vistos.add(clave)

        # Los atributos son del producto, no de cada SKU: solo sirve un SKU por producto.
        if len(items) != 1:
            fila, motivo = None, ("varios SKU en un producto" if items else "sin SKU")
        else:
            fila, motivo = evaluar(producto, items[0], fecha)

        if fila:
            filas.append(fila)
        else:
            descartes[motivo] = descartes.get(motivo, 0) + 1
            if detalle:
                print(f"    descartado ({motivo}): {producto.get('productName', '')}")
    return filas


def main():
    detalle = "--detalle" in sys.argv
    cliente = Cliente(PAUSA_MINIMA)
    rp = leer_robots(cliente)
    if not rp.can_fetch(USER_AGENT, ENDPOINT):
        sys.exit("robots.txt no permite consultar esta API con nuestro User-Agent. No consulté nada.")
    cliente.pausa = max(PAUSA_MINIMA, rp.crawl_delay(USER_AGENT) or 0)
    print(f"robots.txt revisado. Pausa entre peticiones: {cliente.pausa} s")

    fecha = datetime.date.today().isoformat()
    vistos = set()
    descartes = {}
    filas = []
    for termino in TERMINOS:
        try:
            productos = consultar_termino(cliente, termino)
        except (OSError, ValueError) as err:
            print(f"{termino}: error al consultar ({err}). Se omite.")
            continue
        nuevas = procesar(productos, fecha, vistos, descartes, detalle)
        filas.extend(nuevas)
        print(f"{termino}: {len(productos)} productos, {len(nuevas)} filas nuevas")

    filas.sort(
        key=lambda f: (f["principio_activo"], f["concentracion"], f["producto"], float(f["precio_unidad"]))
    )
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with SALIDA.open("w", encoding="utf-8", newline="") as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=COLUMNAS)
        escritor.writeheader()
        escritor.writerows(filas)

    print("\nDescartados:")
    for motivo, cuenta in sorted(descartes.items()):
        print(f"  {motivo}: {cuenta}")
    print(f"\nFilas guardadas: {len(filas)} en {SALIDA}")


if __name__ == "__main__":
    main()
