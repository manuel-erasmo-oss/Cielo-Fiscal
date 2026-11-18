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
// El art. 296 del Código (texto consolidado, octubre 2025) trae la escala
// base de la Ley 253-12 (exento hasta RD$399,923; 15%, 20% y 25%) y manda
// ajustarla cada año por la inflación (párrafo I). Las tasas coinciden; los
// montos de aquí son una escala ya ajustada que ese texto no permite
// comprobar: hace falta el aviso o la resolución de la DGII del año.
// Rige hasta el ejercicio fiscal 2026; desde 2027 ver `TRAMOS_ISR_PERSONA_FISICA_2027`.
export const TRAMOS_ISR_PERSONA_FISICA = [
  { hasta: 416_220.00, tasa: 0.00, fijo: 0 },
  { hasta: 624_329.00, tasa: 0.15, fijo: 0 },
  { hasta: 867_123.00, tasa: 0.20, fijo: 31_216.00 },
  { hasta: Infinity,   tasa: 0.25, fijo: 79_776.00 },
] as const

// Escala del art. 296 del Código Tributario según la Ley 30-26 (art. 10),
// "a partir del ejercicio fiscal 2027". Agrega un quinto tramo de 27%. Los
// montos fijos de cada tramo son los que trae la ley y cuadran con la
// escala (p. ej. 205,000 × 15% = 30,750). La ley manda ajustarla cada año
// por la inflación (párrafo I): desde 2028 estos montos ya no son los
// vigentes sin el ajuste que publique la DGII.
export const TRAMOS_ISR_PERSONA_FISICA_2027 = [
  { hasta: 480_000.00,   tasa: 0.00, fijo: 0 },
  { hasta: 685_000.00,   tasa: 0.15, fijo: 0 },
  { hasta: 910_000.00,   tasa: 0.20, fijo: 30_750.00 },
  { hasta: 4_800_000.00, tasa: 0.25, fijo: 75_750.00 },
  { hasta: Infinity,     tasa: 0.27, fijo: 1_048_250.00 },
] as const

type Tramo = { readonly hasta: number; readonly tasa: number; readonly fijo: number }

export function tramosISRPersonaFisica(anioFiscal: number): readonly Tramo[] {
  return anioFiscal >= 2027 ? TRAMOS_ISR_PERSONA_FISICA_2027 : TRAMOS_ISR_PERSONA_FISICA
}

// Misma lógica que `calcularISRAnual` de Cielo Cloud Nómina, generalizada a
// cualquier número de tramos: monto fijo del tramo + tasa sobre lo que
// excede el límite del tramo anterior. Sin año usa la escala hasta 2026.
export function calcularISRAnualPersonaFisica(rentaNetaImponibleAnual: number, anioFiscal = 2026): number {
  const t = tramosISRPersonaFisica(anioFiscal)
  if (rentaNetaImponibleAnual <= t[0].hasta) return 0
  for (let i = 1; i < t.length; i++) {
    if (rentaNetaImponibleAnual <= t[i].hasta) return t[i].fijo + (rentaNetaImponibleAnual - t[i - 1].hasta) * t[i].tasa
  }
  return 0 // inalcanzable: el último tramo llega a Infinity
}

// Impuesto Sustitutivo sobre Retribuciones Complementarias. Mismo valor que
// `TASA_IMPUESTO_SUSTITUTIVO` en `src/app/retribuciones-complementarias/page.tsx`
// de Cielo Cloud Nómina (allí: "guía oficial DGII").
export const TASA_IMPUESTO_SUSTITUTIVO_RETRIBUCIONES = 0.27

// ISR de personas jurídicas: 27%. Código Tributario, art. 297, en la
// redacción de la Ley 30-26 (art. 15): "a partir del ejercicio fiscal 2026".
// Antes ya era 27% desde 2015 (Ley 253-12).
export const TASA_ISR_PERSONA_JURIDICA = 0.27

// Ley 30-26, art. 15 (art. 297 párrafo II): solo en los períodos fiscales
// 2026, 2027 y 2028, quienes tengan ingresos desde RD$1,000 millones pagan
// 30%. Desde 2029 vuelven al 27%.
export const TASA_ISR_PERSONA_JURIDICA_INGRESOS_ALTOS = 0.30
export const UMBRAL_INGRESOS_ISR_TRANSITORIO = 1_000_000_000

export function tasaISRPersonaJuridica(anioFiscal: number, ingresosBrutos: number): number {
  const transitorio = anioFiscal >= 2026 && anioFiscal <= 2028 && ingresosBrutos >= UMBRAL_INGRESOS_ISR_TRANSITORIO
  return transitorio ? TASA_ISR_PERSONA_JURIDICA_INGRESOS_ALTOS : TASA_ISR_PERSONA_JURIDICA
}

// Recargo por mora: 3% por cada mes o fracción, sobre el impuesto dejado de
// pagar, sin pasar del 100% del impuesto. Código Tributario, art. 252, en la
// redacción de la Ley 30-26 (art. 7). Reemplaza el esquema anterior (10% el
// primer mes y 4% los siguientes). Aparte va el interés indemnizatorio
// (art. 27 nuevo): tasa activa promedio de la banca múltiple más 30 puntos
// básicos, que la DGII fija cada año; no se modela.
export const RECARGO_MORA_MENSUAL = 0.03
export const TOPE_RECARGO_MORA = 1.0

export function recargoMora(impuesto: number, mesesOFraccion: number): number {
  if (impuesto <= 0 || mesesOFraccion <= 0) return 0
  return redondear2(impuesto * Math.min(TOPE_RECARGO_MORA, RECARGO_MORA_MENSUAL * Math.ceil(mesesOFraccion)))
}

// Día del mes siguiente en que vence el IR-17. En Cielo Cloud Nómina
// (`src/app/reportes/page.tsx`: "Vencimiento de pago: día 10 del mes
// siguiente") y, según el CLAUDE.md de este repo, confirmado allá contra la
// Guía del Contribuyente No.14 de la DGII.
export const DIA_LIMITE_IR17 = 10

// Día del mes siguiente en que vence la declaración de ITBIS (IT-1).
// Verificado (2026-11-18): Código Tributario, art. 353 c), "en el transcurso
// de los primeros veinte (20) días de cada mes, aun cuando no exista
// impuesto a pagar". El período fiscal es el mes calendario (art. 353 a).
// El día de los formatos 606 y 607 (15) vive en dgii-formatos.ts:
// `DIA_LIMITE_606_607`. La Ley 30-26 no modifica el art. 353.
export const DIA_LIMITE_IT1 = 20

// Tasa reducida de ITBIS. Código Tributario, art. 345 párrafo II (Ley
// 253-12): 16% a partir de 2016 para una lista cerrada de bienes por código
// arancelario (yogures, mantequilla, café, aceites comestibles, azúcar,
// cacao y chocolate, entre otros). La lista no está modelada: la tasa la da
// la factura. La Ley 30-26 no toca los arts. 341 ni 345.
export const TASA_ITBIS_REDUCIDA = 0.16

// Tasa general de ITBIS: 18%. Confirmada por el usuario (contador) el
// 2026-11-18. El texto consolidado del Código no lo dice solo: el art. 341
// trae 16% (texto viejo de la Ley 288-04) y el art. 345 (Ley 253-12) 18%
// para 2013-2014 y 16% desde 2015, rebaja condicionada por su párrafo I a
// una meta de presión tributaria que no se cumplió. La Ley 30-26 no toca
// esos artículos, y las facturas reales de la muestra cobran 18%.
export const TASA_ITBIS_GENERAL = 0.18

// ─── ⚠️ SIN VERIFICAR ────────────────────────────────────────────────────────

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
