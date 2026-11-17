import { MAXIMO_TRAMOS } from '@/lib/ocr-tipos'

// Un recibo de caja escaneado es una tira muy larga y angosta (en la muestra
// real, unos 620 px de ancho por hasta 4,400 de alto). Enviado entero, el
// modelo lo reduce por su lado mayor y la letra queda ilegible. Por eso se
// parte en tramos consecutivos, con un poco de solape para no cortar un
// renglón por la mitad, y se envían todos en la misma solicitud.

// A partir de esta proporción alto/ancho una imagen se considera "larga".
const PROPORCION_LARGA = 2
// Alto de cada tramo, en anchos de la imagen.
const ALTO_TRAMO = 1.5
// Solape entre tramos, como fracción del alto del tramo.
const SOLAPE = 0.12

export interface Tramo {
  y: number
  alto: number
}

// Dónde cortar una imagen de `ancho` × `alto`. Devuelve un solo tramo (la
// imagen entera) si no es larga. Nunca más de MAXIMO_TRAMOS: si hicieran
// falta más, los tramos se alargan.
export function calcularTramos(ancho: number, alto: number): Tramo[] {
  if (ancho <= 0 || alto <= 0 || alto / ancho <= PROPORCION_LARGA) return [{ y: 0, alto }]
  let altoTramo = Math.min(alto, Math.round(ancho * ALTO_TRAMO))
  // Cuántos tramos de ese alto, solapados, hacen falta para cubrir la imagen.
  let cantidad = Math.max(2, Math.ceil((alto - altoTramo * SOLAPE) / (altoTramo * (1 - SOLAPE))))
  if (cantidad > MAXIMO_TRAMOS) {
    cantidad = MAXIMO_TRAMOS
    altoTramo = Math.ceil(alto / (cantidad * (1 - SOLAPE) + SOLAPE))
  }
  // Los cortes se reparten por igual entre el principio y el final, así el
  // último tramo termina exactamente donde termina la imagen.
  const paso = (alto - altoTramo) / (cantidad - 1)
  return Array.from({ length: cantidad }, (_, i) => ({ y: Math.round(i * paso), alto: altoTramo }))
}

// Parte una imagen larga en tramos JPEG. Si no es larga (o no es una imagen
// que el navegador pueda abrir), devuelve el archivo tal cual.
export async function trocearSiEsLarga(archivo: Blob): Promise<Blob[]> {
  if (!archivo.type.startsWith('image/')) return [archivo]
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(archivo)
  } catch {
    return [archivo]
  }
  try {
    const tramos = calcularTramos(bitmap.width, bitmap.height)
    if (tramos.length === 1) return [archivo]
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return [archivo]
    const partes: Blob[] = []
    for (const { y, alto } of tramos) {
      canvas.width = bitmap.width
      canvas.height = alto
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, y, bitmap.width, alto, 0, 0, bitmap.width, alto)
      const parte = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!parte) return [archivo]
      partes.push(parte)
    }
    return partes
  } finally {
    bitmap.close()
  }
}
