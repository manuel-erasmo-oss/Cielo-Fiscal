import { soloDigitos } from '@/lib/utils'

// Padrón de RNC de la DGII, guardado con la aplicación (public/padron-rnc/,
// generado con scripts/padron-rnc.mjs a partir del DGII_RNC.zip). Al escribir
// un RNC o una cédula se busca aquí y se llenan solos la razón social, el
// nombre comercial y la actividad económica (pedido del usuario, 2026-11-25).
// Cada búsqueda descarga solo el pedazo que corresponde al RNC (≤ ~100 KB).

export type EstadoPadron = 'ACTIVO' | 'SUSPENDIDO' | 'DADO DE BAJA' | 'CESE TEMPORAL' | 'ANULADO' | 'RECHAZADO'

const ESTADO: Record<string, EstadoPadron> = {
  A: 'ACTIVO', S: 'SUSPENDIDO', B: 'DADO DE BAJA', C: 'CESE TEMPORAL', N: 'ANULADO', R: 'RECHAZADO',
}

export interface RegistroPadron {
  rnc: string
  razonSocial: string
  nombreComercial: string
  // Como la publica la DGII: cortada a 30 caracteres.
  actividad: string
  estado: EstadoPadron
  // 'NORMAL' o 'RST' (régimen simplificado de tributación).
  regimen: 'NORMAL' | 'RST' | ''
}

export interface IndicePadron {
  fuente: string
  // Fecha del archivo de la DGII ("YYYY-MM-DD").
  fechaArchivo: string
  registros: number
  actividades: string[]
  prefijos: string[]
}

// ── Lógica pura ─────────────────────────────────────────────────────────────

// Pedazo donde estaría el RNC: el prefijo más largo de la lista con que
// empieza. null si ninguno (no está en el padrón).
export function prefijoDe(rnc: string, prefijos: readonly string[]): string | null {
  let mejor: string | null = null
  for (const p of prefijos) if (rnc.startsWith(p) && (!mejor || p.length > mejor.length)) mejor = p
  return mejor
}

// Busca el RNC en el texto de un pedazo (una línea por registro).
export function buscarEnPedazo(texto: string, rnc: string, actividades: readonly string[]): RegistroPadron | null {
  const inicio = texto.startsWith(rnc + '\t') ? 0 : texto.indexOf('\n' + rnc + '\t')
  if (inicio < 0) return null
  const desde = inicio === 0 ? 0 : inicio + 1
  const hasta = texto.indexOf('\n', desde)
  const [r, razonSocial, nombreComercial, act, estado, regimen] = texto.slice(desde, hasta < 0 ? undefined : hasta).split('\t')
  return {
    rnc: r,
    razonSocial,
    nombreComercial,
    actividad: actividades[Number(act)] ?? '',
    estado: ESTADO[estado] ?? 'ACTIVO',
    regimen: regimen === 'R' ? 'RST' : regimen === 'N' ? 'NORMAL' : '',
  }
}

// Cómo se muestra el estado: solo ACTIVO es normal; lo demás se avisa.
export function avisoDeEstado(estado: EstadoPadron): { tono: 'bien' | 'aviso' | 'critico'; texto: string } {
  if (estado === 'ACTIVO') return { tono: 'bien', texto: 'Activo en la DGII' }
  if (estado === 'SUSPENDIDO' || estado === 'CESE TEMPORAL') return { tono: 'aviso', texto: `${estado === 'SUSPENDIDO' ? 'Suspendido' : 'En cese temporal'} en la DGII: confírmalo con el cliente.` }
  return { tono: 'critico', texto: `${estado === 'DADO DE BAJA' ? 'Dado de baja' : estado === 'ANULADO' ? 'Anulado' : 'Rechazado'} en la DGII: revisa que el número sea el correcto.` }
}

// ── Navegador ────────────────────────────────────────────────────────────────

const BASE = '/padron-rnc'
let indice: Promise<IndicePadron> | null = null
const pedazos = new Map<string, Promise<string>>()

function cargarIndice(): Promise<IndicePadron> {
  indice ??= fetch(`${BASE}/indice.json`).then(r => {
    if (!r.ok) throw new Error('No se pudo cargar el padrón de RNC.')
    return r.json() as Promise<IndicePadron>
  }).catch(e => { indice = null; throw e })
  return indice
}

// Los pedazos están comprimidos con gzip. Si el servidor ya los entregó
// descomprimidos (Content-Encoding), se leen tal cual.
async function textoDe(respuesta: Response): Promise<string> {
  const bytes = new Uint8Array(await respuesta.arrayBuffer())
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes)
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(flujo).text()
}

function cargarPedazo(prefijo: string): Promise<string> {
  let p = pedazos.get(prefijo)
  if (!p) {
    p = fetch(`${BASE}/${prefijo}.tsv.gz`).then(r => {
      if (!r.ok) throw new Error('No se pudo cargar el padrón de RNC.')
      return textoDe(r)
    })
    p.catch(() => pedazos.delete(prefijo))
    pedazos.set(prefijo, p)
  }
  return p
}

export interface ResultadoPadron {
  registro: RegistroPadron | null
  fechaPadron: string
}

// Busca un RNC (9 dígitos) o una cédula (11). Lanza si no se pudo cargar.
export async function consultarPadron(rncOCedula: string): Promise<ResultadoPadron> {
  const rnc = soloDigitos(rncOCedula)
  const { prefijos, actividades, fechaArchivo } = await cargarIndice()
  const prefijo = prefijoDe(rnc, prefijos)
  if (!prefijo) return { registro: null, fechaPadron: fechaArchivo }
  return { registro: buscarEnPedazo(await cargarPedazo(prefijo), rnc, actividades), fechaPadron: fechaArchivo }
}

// Actividad económica de un RNC según el padrón, para dársela a la IA como
// pista. undefined si no hay RNC, no está o no se pudo consultar: es solo una
// ayuda y nunca debe frenar la lectura.
export async function actividadDelPadron(rnc: string | null | undefined): Promise<string | undefined> {
  const digitos = soloDigitos(rnc ?? '')
  if (digitos.length !== 9 && digitos.length !== 11) return undefined
  try {
    return (await consultarPadron(digitos)).registro?.actividad || undefined
  } catch {
    return undefined
  }
}
