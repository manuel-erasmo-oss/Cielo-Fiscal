import { leerCodigoOCR } from '@/lib/config-local'
import { ENCABEZADO_CODIGO } from '@/lib/ocr-tipos'
import type { RespuestaDGII } from '@/lib/verificacion-dgii'

// Llama a /api/verificar-dgii desde el navegador.

export class VerificacionError extends Error {
  // true si no tiene sentido seguir intentando con otras facturas (falta el
  // código o el servidor no tiene configurada la verificación).
  constructor(mensaje: string, readonly detenerTodo = false) {
    super(mensaje)
  }
}

export async function verificarEnDGII(url: string): Promise<RespuestaDGII> {
  const codigo = leerCodigoOCR()
  if (!codigo) throw new VerificacionError('Falta el código de acceso: escríbelo en Configuración.', true)
  let r: Response
  try {
    r = await fetch('/api/verificar-dgii', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ENCABEZADO_CODIGO]: codigo },
      body: JSON.stringify({ url }),
    })
  } catch {
    throw new VerificacionError('No hay conexión con el servidor.')
  }
  const cuerpo = (await r.json().catch(() => null)) as (RespuestaDGII & { error?: string }) | null
  if (!r.ok || !cuerpo || cuerpo.error) {
    throw new VerificacionError(cuerpo?.error ?? 'No se pudo verificar en la DGII.', r.status === 401 || r.status === 503)
  }
  return cuerpo
}
