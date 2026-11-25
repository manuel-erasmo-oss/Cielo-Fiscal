import type { IdModeloOCR } from '@/lib/ocr-modelos'

// Qué modelo real hay detrás de cada rol. Solo lo importa la ruta /api/ocr:
// nunca lo importe código del navegador (el usuario no
// debe saber qué IA se usa; decisión del usuario, 2026-11-25).
// - principal: Claude Haiku 5.5 (barato; lee todas las facturas).
// - relectura: Claude Sonnet 5.5 (solo cuando no se ven bien los montos, el
//   ITBIS, el RNC o el NCF).
// - avanzado: Claude Opus 5.5 (solo para comparar; fuera por costo).
// `conRespaldo`: si admite el respaldo de servidor (`fallbacks: 'default'`)
// cuando el modelo declina por política. Haiku 5.5 no lo tiene.
export const MODELOS_REALES: Record<IdModeloOCR, { modelo: string; conRespaldo: boolean }> = {
  principal: { modelo: 'claude-haiku-5-5', conRespaldo: false },
  relectura: { modelo: 'claude-sonnet-5-5', conRespaldo: true },
  avanzado: { modelo: 'claude-opus-5-5', conRespaldo: true },
}
