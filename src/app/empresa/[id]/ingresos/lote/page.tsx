'use client'

import { CapturaLote } from '@/components/lote/CapturaLote'

// Captura por lotes desde Ingresos: si no se puede saber, se asume venta.
export default function LoteIngresosPage() {
  return <CapturaLote tipo="venta" />
}
