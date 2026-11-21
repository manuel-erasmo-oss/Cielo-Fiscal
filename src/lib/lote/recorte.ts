// Recorte de los márgenes blancos de una página antes de enviarla a la IA.
// La API cobra la imagen por su tamaño en píxeles (parches de 28×28 px, con
// un tope por imagen): quitar el papel en blanco alrededor de la factura
// baja los tokens sin perder letra. Lógica pura, sobre los píxeles RGBA.

export interface Caja {
  x: number
  y: number
  ancho: number
  alto: number
}

// Píxel "con tinta": más oscuro que este umbral (0-255) en promedio RGB.
const UMBRAL = 225
// Borde que se deja alrededor del contenido.
const MARGEN_PX = 24
// Solo se recorta si se ahorra al menos esta fracción del área.
const AHORRO_MINIMO = 0.1

// Caja del contenido (lo que no es papel en blanco), o null si no vale la
// pena recortar: página en blanco, o un ahorro menor al 10%.
// `paso` salta píxeles para que sea rápido en páginas grandes.
export function cajaDeContenido(datos: Uint8ClampedArray, ancho: number, alto: number, paso = 2): Caja | null {
  let minX = ancho, minY = alto, maxX = -1, maxY = -1
  for (let y = 0; y < alto; y += paso) {
    const fila = y * ancho * 4
    for (let x = 0; x < ancho; x += paso) {
      const i = fila + x * 4
      if ((datos[i] + datos[i + 1] + datos[i + 2]) / 3 < UMBRAL) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null // página en blanco: se envía tal cual (la IA dirá que no es factura)
  const x = Math.max(0, minX - MARGEN_PX)
  const y = Math.max(0, minY - MARGEN_PX)
  const caja = { x, y, ancho: Math.min(ancho, maxX + paso + MARGEN_PX) - x, alto: Math.min(alto, maxY + paso + MARGEN_PX) - y }
  if (caja.ancho * caja.alto > ancho * alto * (1 - AHORRO_MINIMO)) return null
  return caja
}
