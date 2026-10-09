import { cargarProductos, agrupar, rangoDeFechas, compararConLaMasBarata } from './datos.js';

const RUTA_DATOS = 'data/precios.csv';

const formatoPesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const formatoPorcentaje = new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: 0 });
const formatoFechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const formatoFechaLarga = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

const elFormulario = document.querySelector('#formulario');
const elBuscador = document.querySelector('#buscador');
const elFecha = document.querySelector('#fecha-datos');
const elResumen = document.querySelector('#resumen');
const elResultados = document.querySelector('#resultados');

const TEXTO_BOTON_ABRIR = 'Ver misma sustancia, más barato';
const TEXTO_BOTON_CERRAR = 'Ocultar comparación';

let productos = [];
let estado = 'cargando'; // 'cargando' | 'listo' | 'error'

// "2026-10-08" -> fecha local, sin el desfase de zona horaria de new Date("2026-10-08").
function aFecha(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function plural(n, singular, plurar) {
  return `${n} ${n === 1 ? singular : plurar}`;
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ETIQUETA_FORMA = { tableta: 'tabletas', capsula: 'cápsulas', 'sin especificar': 'forma no especificada' };

// "Losartan 100 mg (cápsulas)": principio, concentración y forma del grupo.
function etiquetaGrupo(grupo) {
  return `${capitalizar(grupo.principio)} ${grupo.concentracion} (${ETIQUETA_FORMA[grupo.forma]})`;
}

function pintarFecha() {
  const rango = rangoDeFechas(productos);
  if (!rango) {
    elFecha.textContent = '';
  } else if (rango.desde === rango.hasta) {
    elFecha.textContent = `Precios del ${formatoFechaLarga.format(aFecha(rango.hasta))}`;
  } else {
    elFecha.textContent = `Precios entre el ${formatoFechaCorta.format(aFecha(rango.desde))} y el ${formatoFechaCorta.format(aFecha(rango.hasta))}`;
  }
}

function crearEnlace(url) {
  const enlace = crear('a', 'enlace', 'Ver en la farmacia');
  enlace.href = url;
  enlace.target = '_blank';
  enlace.rel = 'noopener noreferrer';
  enlace.append(crear('span', 'sr-only', ' (se abre en otra pestaña)'));
  return enlace;
}

// Sección "Misma sustancia, más barato": cuánto costarían las mismas unidades
// en el producto más barato del grupo (misma sustancia y concentración).
function pintarComparacion(p, grupo) {
  const panel = crear('div', 'comparacion');
  panel.append(crear('h4', 'comparacion-titulo', 'Misma sustancia, más barato'));
  const nombreGrupo = etiquetaGrupo(grupo);
  const resultado = compararConLaMasBarata(p, grupo);

  if (resultado.tipo === 'sin-unidades') {
    panel.append(crear('p', '', 'No se puede comparar: este producto no informa las unidades de la caja.'));
  } else if (resultado.tipo === 'es-la-mas-barata') {
    panel.append(crear('p', '', `Este ya es el más barato de ${nombreGrupo} por unidad.`));
  } else if (resultado.tipo === 'empata') {
    panel.append(crear('p', '', `Tiene el mismo precio por unidad que el más barato de ${nombreGrupo}.`));
  } else {
    const mejor = resultado.mejor;
    const linea = crear('p', '');
    linea.append(
      'Más barato: ',
      crear('strong', '', mejor.producto),
      ` en ${mejor.farmacia} (${mejor.marca}), a ${formatoPesos.format(mejor.precioPorUnidad)} por unidad.`
    );
    const ahorro = crear('p', '');
    ahorro.append(
      'Ahorras ',
      crear('strong', '', formatoPorcentaje.format(resultado.porcentaje)),
      ' por unidad, o ',
      crear('strong', '', formatoPesos.format(resultado.pesos)),
      ` por las ${p.unidades} unidades de esta caja.`
    );
    panel.append(linea, ahorro);
    if (mejor.url.startsWith('https://')) panel.append(crearEnlace(mejor.url));
  }
  return panel;
}

function pintarTarjeta(p, esMasBarata, grupo) {
  const li = crear('li', esMasBarata ? 'tarjeta mas-barata' : 'tarjeta');
  if (esMasBarata) li.append(crear('p', 'etiqueta', 'Más barata en este grupo'));
  li.append(crear('h3', '', p.producto));
  li.append(crear('p', 'tarjeta-farmacia', `${p.farmacia} · ${p.marca}`));

  const datos = crear('dl', 'datos');
  const agregar = (termino, valor, clase) => {
    datos.append(crear('dt', '', termino), crear('dd', clase ?? '', valor));
  };
  agregar('Presentación', p.presentacion);
  if (p.unidades !== null) agregar('Unidades', String(p.unidades));
  agregar('Precio de la caja', formatoPesos.format(p.precio));
  if (p.precioPorUnidad !== null) {
    agregar('Precio por unidad', formatoPesos.format(p.precioPorUnidad), 'precio-unidad');
  } else {
    agregar('Precio por unidad', 'No se compara: faltan las unidades', 'sin-precio');
  }
  agregar('Fecha de los datos', formatoFechaCorta.format(aFecha(p.fecha)));
  li.append(datos);

  const boton = crear('button', 'boton-comparar', TEXTO_BOTON_ABRIR);
  boton.type = 'button';
  boton.setAttribute('aria-expanded', 'false');
  const comparacion = pintarComparacion(p, grupo);
  comparacion.hidden = true;
  boton.addEventListener('click', () => {
    const abrir = comparacion.hidden;
    comparacion.hidden = !abrir;
    boton.setAttribute('aria-expanded', String(abrir));
    boton.textContent = abrir ? TEXTO_BOTON_CERRAR : TEXTO_BOTON_ABRIR;
  });
  li.append(boton, comparacion);

  if (p.url.startsWith('https://')) li.append(crearEnlace(p.url));
  return li;
}

function pintarGrupo(grupo) {
  const seccion = crear('section', 'grupo');
  const farmacias = new Set(grupo.productos.map((p) => p.farmacia)).size;
  seccion.append(
    crear('h2', 'grupo-titulo', etiquetaGrupo(grupo)),
    crear('p', 'grupo-resumen', `${plural(grupo.productos.length, 'producto', 'productos')} · ${plural(farmacias, 'farmacia', 'farmacias')}`)
  );

  const lista = crear('ul', 'tarjetas');
  for (const p of grupo.ordenados) {
    lista.append(pintarTarjeta(p, p === grupo.masBarata, grupo));
  }
  seccion.append(lista);
  return seccion;
}

function mensaje(texto) {
  elResultados.append(crear('p', 'mensaje', texto));
}

function render() {
  elResultados.replaceChildren();
  elResumen.textContent = '';

  if (estado === 'cargando') {
    mensaje('Cargando precios…');
    return;
  }
  if (estado === 'error') {
    mensaje('No pudimos cargar los precios. Recarga la página para intentarlo de nuevo.');
    return;
  }
  if (productos.length === 0) {
    mensaje('Todavía no hay precios cargados.');
    return;
  }

  const consulta = elBuscador.value.trim();
  if (consulta === '') {
    mensaje('Escribe el nombre, la marca o el principio activo del medicamento que buscas.');
    return;
  }

  const grupos = agrupar(productos, consulta);
  if (grupos.length === 0) {
    mensaje(`No encontramos resultados para “${consulta}”. Prueba con el principio activo, por ejemplo ibuprofeno.`);
    return;
  }

  const total = grupos.reduce((n, g) => n + g.productos.length, 0);
  elResumen.textContent = `${plural(total, 'producto', 'productos')} en ${plural(grupos.length, 'grupo', 'grupos')}`;
  for (const g of grupos) elResultados.append(pintarGrupo(g));
}

async function cargarPrecios() {
  try {
    const respuesta = await fetch(RUTA_DATOS, { cache: 'no-cache' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    productos = cargarProductos(await respuesta.text());
    estado = 'listo';
  } catch (error) {
    console.error('No se pudieron leer los precios:', error);
    estado = 'error';
  }
  pintarFecha();
  render();
}

elFormulario.addEventListener('submit', (e) => e.preventDefault());
elBuscador.addEventListener('input', render);
cargarPrecios();
