// Lógica de datos: leer el CSV, normalizar texto, calcular el precio por unidad
// y agrupar los resultados. No toca el DOM, así que se puede probar sola.

// Lee un CSV con comas entre comillas, comillas escapadas ("") y saltos CRLF o LF.
export function parsearCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  const contenido = texto.replace(/^\uFEFF/, '');

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i];
    if (entreComillas) {
      if (c !== '"') {
        campo += c;
      } else if (contenido[i + 1] === '"') {
        campo += '"';
        i++;
      } else {
        entreComillas = false;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenido[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  const conDatos = filas.filter((f) => f.some((valor) => valor.trim() !== ''));
  if (conDatos.length === 0) return [];
  const [cabecera, ...cuerpo] = conDatos;
  return cuerpo.map((valores) =>
    Object.fromEntries(
      cabecera.map((nombre, i) => [nombre.trim(), (valores[i] ?? '').trim()])
    )
  );
}

// Minúsculas, sin tildes y con espacios simples. Sirve para buscar y para comparar.
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function aNumero(texto) {
  const limpio = String(texto ?? '').trim();
  if (limpio === '') return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

// CLAUDE.md: si una farmacia tiene varias filas del mismo producto, se usa la de
// fecha más reciente. "Mismo producto" = misma farmacia, misma url y misma
// presentación. Si varias filas comparten la fecha más reciente, se conservan todas.
function quedarseConLaMasReciente(filas) {
  const clave = (f) => [f.farmacia, f.url, f.presentacion].map(normalizarTexto).join('|');
  const fechaMasReciente = new Map();
  for (const f of filas) {
    const k = clave(f);
    if (!fechaMasReciente.has(k) || f.fecha > fechaMasReciente.get(k)) {
      fechaMasReciente.set(k, f.fecha);
    }
  }
  return filas.filter((f) => f.fecha === fechaMasReciente.get(clave(f)));
}

// Convierte una fila del CSV en un producto listo para mostrar y comparar.
// El precio por unidad se calcula aquí (precio / unidades). La columna
// precio_unidad del CSV no se usa, según CLAUDE.md.
function prepararFila(fila) {
  const precio = aNumero(fila.precio);
  const unidades = aNumero(fila.unidades);
  return {
    fecha: fila.fecha,
    farmacia: fila.farmacia,
    principio: fila.principio_activo,
    concentracion: fila.concentracion,
    producto: fila.producto,
    marca: fila.marca,
    presentacion: fila.presentacion,
    unidades,
    precio,
    precioLista: aNumero(fila.precio_lista),
    precioPorUnidad: precio !== null && unidades > 0 ? precio / unidades : null,
    url: fila.url,
    claveGrupo: `${normalizarTexto(fila.principio_activo)}|${normalizarTexto(fila.concentracion)}`,
    textoBusqueda: normalizarTexto(`${fila.producto} ${fila.marca} ${fila.principio_activo}`),
  };
}

// Texto del CSV -> productos listos para buscar.
export function cargarProductos(texto) {
  return quedarseConLaMasReciente(parsearCSV(texto)).map(prepararFila);
}

function valorDeConcentracion(texto) {
  const m = /^([\d.]+)\s*(.*)$/.exec(texto);
  return m ? { numero: Number(m[1]), unidad: m[2] } : { numero: Infinity, unidad: texto };
}

function compararGrupos(a, b) {
  const porPrincipio = a.principio.localeCompare(b.principio, 'es');
  if (porPrincipio !== 0) return porPrincipio;
  const ca = valorDeConcentracion(a.concentracion);
  const cb = valorDeConcentracion(b.concentracion);
  if (ca.numero !== cb.numero) return ca.numero - cb.numero;
  return ca.unidad.localeCompare(cb.unidad, 'es');
}

// De menor a mayor precio por unidad. Si empatan, gana el de menor precio de caja.
function compararOfertas(a, b) {
  return (
    a.precioPorUnidad - b.precioPorUnidad ||
    a.precio - b.precio ||
    a.farmacia.localeCompare(b.farmacia, 'es')
  );
}

// Grupos (principio activo + concentración) con al menos un producto que coincide.
// Un producto coincide si todas las palabras de la consulta aparecen en su
// producto, marca o principio activo, sin importar tildes ni mayúsculas.
// Si coincide un producto, se muestra su grupo completo: así la opción más
// barata es la de toda la sustancia y no solo la de las marcas buscadas.
export function agrupar(productos, consulta) {
  const palabras = normalizarTexto(consulta).split(' ').filter(Boolean);
  if (palabras.length === 0) return [];

  const clavesQueCoinciden = new Set(
    productos
      .filter((p) => palabras.every((palabra) => p.textoBusqueda.includes(palabra)))
      .map((p) => p.claveGrupo)
  );

  const grupos = new Map();
  for (const p of productos) {
    if (!clavesQueCoinciden.has(p.claveGrupo)) continue;
    if (!grupos.has(p.claveGrupo)) {
      grupos.set(p.claveGrupo, { principio: p.principio, concentracion: p.concentracion, productos: [] });
    }
    grupos.get(p.claveGrupo).productos.push(p);
  }

  return [...grupos.values()]
    .map((g) => {
      const conPrecio = g.productos.filter((p) => p.precioPorUnidad !== null).sort(compararOfertas);
      // Sin unidades no hay precio por unidad: van al final, sin ranking ni etiqueta.
      const sinPrecio = g.productos
        .filter((p) => p.precioPorUnidad === null)
        .sort((a, b) => a.farmacia.localeCompare(b.farmacia, 'es') || a.producto.localeCompare(b.producto, 'es'));
      return { ...g, ordenados: [...conPrecio, ...sinPrecio], masBarata: conPrecio[0] ?? null };
    })
    .sort(compararGrupos);
}

// Fechas mínima y máxima de los datos (las fechas ISO se comparan como texto).
export function rangoDeFechas(productos) {
  const fechas = productos.map((p) => p.fecha).filter(Boolean).sort();
  return fechas.length ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : null;
}

// Para un producto tocado: qué costarían las mismas unidades en el más barato de su
// grupo (misma sustancia y concentración). Devuelve el tipo de resultado y, si hay
// ahorro, el porcentaje por unidad y los pesos por las mismas unidades de la caja.
export function compararConLaMasBarata(producto, grupo) {
  if (producto.precioPorUnidad === null || grupo.masBarata === null) {
    return { tipo: 'sin-unidades' };
  }
  const mejor = grupo.masBarata;
  if (mejor === producto) return { tipo: 'es-la-mas-barata' };

  const ahorroPorUnidad = producto.precioPorUnidad - mejor.precioPorUnidad;
  if (ahorroPorUnidad <= 0) return { tipo: 'empata', mejor };

  return {
    tipo: 'ahorro',
    mejor,
    porcentaje: ahorroPorUnidad / producto.precioPorUnidad,
    pesos: producto.precio - mejor.precioPorUnidad * producto.unidades,
  };
}
