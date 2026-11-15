// Preferencias que viven solo en este navegador (no son datos fiscales).

const CLAVE_CODIGO_OCR = 'cielo-fiscal:codigo-ocr'

// Código de acceso al OCR que el contador digita una vez en Configuración.
export function leerCodigoOCR(): string {
  try {
    return window.localStorage.getItem(CLAVE_CODIGO_OCR) ?? ''
  } catch {
    return ''
  }
}

export function guardarCodigoOCR(codigo: string): void {
  const limpio = codigo.trim()
  if (limpio) window.localStorage.setItem(CLAVE_CODIGO_OCR, limpio)
  else window.localStorage.removeItem(CLAVE_CODIGO_OCR)
}
