import { DIA_LIMITE_606_607 } from '@/lib/dgii-formatos'
import { fechaLocalISO, redondear2 } from '@/lib/utils'

// Motor fiscal de Cielo Cloud Fiscal.
//
// REGLA: ningún parámetro legal se escribe de memoria. Cada constante dice de
// dónde sale. Lo que no viene de una fuente oficial consultada, o del código
// ya verificado de Cielo Cloud Nómina, lleva la marca `⚠️ SIN VERIFICAR` y
// debe confirmarse contra la DGII antes de usarse con datos reales.

// ─── Reutilizado de Cielo Cloud Nómina ───────────────────────────────────────

// Tramos anuales de ISR de personas físicas. Copiados literalmente de
// `TRAMOS_ISR` en `src/lib/dominican-labor.ts` de manuel-erasmo-oss/tyui
// (allí documentado como "DGII, Ley 11-92 art. 296 según modificaciones
// vigentes"). Si la DGII indexa la escala, hay que actualizar ambos productos.
export const TRAMOS_ISR_PERSONA_FISICA = [
  { hasta: 416_220.00, tasa: 0.00, fijo: 0 },
  { hasta: 624_329.00, tasa: 0.15, fijo: 0 },
  { hasta: 867_123.00, tasa: 0.20, fijo: 31_216.00 },
  { hasta: Infinity,   tasa: 0.25, fijo: 79_776.00 },
] as const

// Misma lógica que `calcularISRAnual` de Cielo Cloud Nómina.
export function calcularISRAnualPersonaFisica(rentaNetaImponibleAnual: number): number {
  const t = TRAMOS_ISR_PERSONA_FISICA
  if (rentaNetaImponibleAnual <= t[0].hasta) return 0
  if (rentaNetaImponibleAnual <= t[1].hasta)
    return (rentaNetaImponibleAnual - t[0].hasta) * t[1].tasa
  if (rentaNetaImponibleAnual <= t[2].hasta)
    return t[2].fijo + (rentaNetaImponibleAnual - t[1].hasta) * t[2].tasa
  return t[3].fijo + (rentaNetaImponibleAnual - t[2].hasta) * t[3].tasa
}

// Impuesto Sustitutivo sobre Retribuciones Complementarias. Mismo valor que
// `TASA_IMPUESTO_SUSTITUTIVO` en `src/app/retribuciones-complementarias/page.tsx`
// de Cielo Cloud Nómina (allí: "guía oficial DGII").
export const TASA_IMPUESTO_SUSTITUTIVO_RETRIBUCIONES = 0.27

// ISR de personas jurídicas. El CLAUDE.md de este repo lo registra como
// confirmado en la sesión de Cielo Cloud Nómina; no se re-verificó contra la
// DGII al recrear este archivo.
export const TASA_ISR_PERSONA_JURIDICA = 0.27

// Día del mes siguiente en que vence el IR-17. En Cielo Cloud Nómina
// (`src/app/reportes/page.tsx`: "Vencimiento de pago: día 10 del mes
// siguiente") y, según el CLAUDE.md de este repo, confirmado allá contra la
// Guía del Contribuyente No.14 de la DGII.
export const DIA_LIMITE_IR17 = 10

// ─── ⚠️ SIN VERIFICAR ────────────────────────────────────────────────────────

// ⚠️ SIN VERIFICAR — tasa general de ITBIS asumida. Falta confirmar contra la
// DGII, junto con la tasa reducida y el catálogo de bienes que la llevan
// (ninguno de los dos está modelado todavía).
export const TASA_ITBIS_GENERAL = 0.18

// ⚠️ SIN VERIFICAR — placeholder. Día del mes siguiente en que vence la
// declaración de ITBIS (IT-1). El día de los formatos 606 y 607 SÍ está
// verificado (día 15) y vive en dgii-formatos.ts: `DIA_LIMITE_606_607`.
export const DIA_LIMITE_IT1 = 20

// ─── Fechas límite ───────────────────────────────────────────────────────────

// Fecha límite nominal: el día `diaLimite` del mes SIGUIENTE al período
// (diciembre → enero del año siguiente), como "YYYY-MM-DD" local.
// ⚠️ SIN VERIFICAR — no corre la fecha cuando cae en fin de semana o feriado;
// la regla oficial de prórroga al siguiente día laborable no se ha consultado.
export function fechaLimiteMesSiguiente(anio: number, mes: number, diaLimite: number): string {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`Mes fuera de rango (1-12): ${mes}`)
  }
  // `mes` es 1-12, así que como índice 0-based ya apunta al mes siguiente;
  // Date normaliza mes 12 a enero del año siguiente.
  return fechaLocalISO(new Date(anio, mes, diaLimite))
}

export function fechaLimiteIR17(anio: number, mes: number): string {
  return fechaLimiteMesSiguiente(anio, mes, DIA_LIMITE_IR17)
}

// Fuente: instructivos oficiales del 606 (julio 2025) y 607 (sept. 2020).
export function fechaLimite606607(anio: number, mes: number): string {
  return fechaLimiteMesSiguiente(anio, mes, DIA_LIMITE_606_607)
}

export function fechaLimiteIT1(anio: number, mes: number): string {
  return fechaLimiteMesSiguiente(anio, mes, DIA_LIMITE_IT1)
}

// ─── ITBIS mensual ───────────────────────────────────────────────────────────

export interface EntradaITBIS {
  // ITBIS cobrado en ventas del mes (total del 607).
  itbisFacturado: number
  // ITBIS pagado en compras del mes que se adelanta (total del 606).
  itbisAdelantado: number
  // Saldo a favor arrastrado del período anterior.
  saldoAFavorAnterior?: number
}

export interface ResultadoITBIS {
  itbisAPagar: number
  saldoAFavorSiguiente: number
}

// Aritmética base: facturado − adelantado − saldo a favor anterior.
// ⚠️ SIN VERIFICAR — NO es el IT-1 completo. Faltan, hasta tener el
// instructivo vigente, las casillas reales del formulario (ITBIS retenido
// por terceros, proporcionalidad, operaciones exentas, pagos computables…).
export function calcularITBISDelMes(entrada: EntradaITBIS): ResultadoITBIS {
  const { itbisFacturado, itbisAdelantado, saldoAFavorAnterior = 0 } = entrada
  for (const [nombre, valor] of Object.entries({ itbisFacturado, itbisAdelantado, saldoAFavorAnterior })) {
    if (!Number.isFinite(valor) || valor < 0) {
      throw new Error(`${nombre} debe ser un monto >= 0 (recibido: ${valor})`)
    }
  }
  const neto = redondear2(itbisFacturado - itbisAdelantado - saldoAFavorAnterior)
  return neto >= 0
    ? { itbisAPagar: neto, saldoAFavorSiguiente: 0 }
    : { itbisAPagar: 0, saldoAFavorSiguiente: -neto }
}

// ─── Proyección de ISR ───────────────────────────────────────────────────────

// Estimación para planificación, no una liquidación: aplica la tasa/escala a
// la renta neta imponible que el contador proyecte. No modela anticipos,
// pérdidas compensables, retenciones acreditables ni el impuesto a los
// activos.
export function proyectarISR(
  tipoPersona: 'juridica' | 'fisica',
  rentaNetaImponibleAnual: number,
): number {
  const base = Math.max(0, rentaNetaImponibleAnual)
  return redondear2(
    tipoPersona === 'juridica'
      ? base * TASA_ISR_PERSONA_JURIDICA
      : calcularISRAnualPersonaFisica(base),
  )
}
