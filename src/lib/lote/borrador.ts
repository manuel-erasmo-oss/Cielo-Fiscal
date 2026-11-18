import { CAMPOS_EXTRAIDOS, CAMPOS_VACIOS, buscarDuplicado, normalizarNcf, problemasDeRevision, type CamposDocumento } from '@/lib/documentos'
import type { ResultadoOCR } from '@/lib/ocr-tipos'
import { vaConRncDelCliente } from '@/lib/dgii-formatos'
import { leerQrEcf, pertenenciaSegunQr } from '@/lib/qr-ecf'
import { CONTADOR_LOCAL, type CampoExtraido, type ClienteFiscal, type DocumentoFiscal, type TipoDocumento } from '@/types'

// Captura por lotes, lógica pura: qué factura sale de cada página a partir de
// su código QR y de la lectura con IA. Sin navegador ni almacenamiento, para
// poder probarla.

export type EstadoPagina =
  // El QR se leyó y la factura es de este cliente: trae contraparte, e-NCF,
  // fecha y total exactos.
  | 'qr'
  // No se encontró un QR de comprobante electrónico. Puede ser una factura
  // sin QR o una página que no es una factura; se guarda vacía para
  // completarla a mano (o con la lectura automática) viendo la imagen.
  | 'sin_qr'
  // El QR nombra a otro comprador y a otro emisor: no es de este cliente.
  | 'ajena'
  // Ya está registrada, o está repetida dentro del mismo lote.
  | 'duplicada'
  // La IA dice que la página no es una factura (una declaración, una
  // portada, una hoja en blanco).
  | 'no_factura'

export interface BorradorPagina {
  estado: EstadoPagina
  tipo: TipoDocumento
  campos: CamposDocumento
  // true si el QR de la página se leyó: RNC, e-NCF, fecha y total son exactos.
  conQr: boolean
  // true si la IA ya leyó la página.
  leidaConIA: boolean
  // Campos de los que la IA dudó, o que no cuadran entre sí.
  dudosos: CampoExtraido[]
  confianzaOCR: number
  // Explicación para la persona cuando la página no entra por defecto o
  // necesita atención.
  nota?: string
}

export interface ContextoLote {
  cliente: Pick<ClienteFiscal, 'id' | 'rncCedula'>
  // Tipo de las páginas cuyo QR no permite saberlo.
  tipoPorDefecto: TipoDocumento
  // Facturas ya guardadas, más las de páginas anteriores de este lote.
  existentes: readonly Pick<DocumentoFiscal, 'id' | 'clienteId' | 'tipo' | 'ncf' | 'rncCedulaContraparte' | 'estadoRevision'>[]
}

const NOTA_DUPLICADA = 'Este comprobante ya está registrado o está repetido en el lote.'

export function interpretarPagina(textoQr: string | null, ctx: ContextoLote): BorradorPagina {
  const qr = textoQr ? leerQrEcf(textoQr) : null
  const base = { leidaConIA: false, dudosos: [], confianzaOCR: 0 }
  if (!qr) return { ...base, estado: 'sin_qr', tipo: ctx.tipoPorDefecto, campos: { ...CAMPOS_VACIOS }, conQr: false }

  const pertenencia = pertenenciaSegunQr(qr, ctx.cliente.rncCedula)
  // Si el QR no trae comprador, el emisor no es el cliente, así que el
  // cliente solo puede ser quien compró.
  const tipo: TipoDocumento = pertenencia === 'venta' ? 'venta' : 'compra'
  // En un e-CF de compras (41) autoemitido el vendedor figura como
  // comprador; en gastos menores (43) y pagos al exterior (47) el 606 lleva
  // el RNC del propio cliente, que aquí es el emisor.
  const autoemitido = tipo === 'compra' && qr.rncEmisor === ctx.cliente.rncCedula
  const contraparte = tipo === 'venta' || (autoemitido && !vaConRncDelCliente(qr.encf)) ? qr.rncComprador : qr.rncEmisor
  const campos: CamposDocumento = {
    ...CAMPOS_VACIOS,
    rncCedulaContraparte: contraparte,
    ncf: normalizarNcf(qr.encf),
    fechaComprobante: qr.fechaEmision,
    montoTotal: qr.montoTotal,
    tipoIdentificacion: tipo === 'venta' && contraparte ? (contraparte.length === 9 ? '1' : '2') : null,
  }

  if (pertenencia === 'ajena') {
    return { ...base, estado: 'ajena', tipo, campos, conQr: true, nota: 'El código QR dice que esta factura es de otro contribuyente, no de este cliente.' }
  }
  const repetida = buscarDuplicado(
    { id: '', clienteId: ctx.cliente.id, tipo, ncf: campos.ncf, rncCedulaContraparte: campos.rncCedulaContraparte },
    ctx.existentes as readonly DocumentoFiscal[],
  )
  if (repetida) return { ...base, estado: 'duplicada', tipo, campos, conQr: true, nota: NOTA_DUPLICADA }
  return { ...base, estado: 'qr', tipo, campos, conQr: true }
}

// Campos de montos que quedan en duda cuando las partes no suman el total.
function montosDe(tipo: TipoDocumento): CampoExtraido[] {
  return tipo === 'compra' ? ['montoServicios', 'montoBienes', 'itbisFacturado'] : ['montoFacturado', 'itbisFacturado']
}

// ¿Lo facturado más los impuestos da el total? null si falta algún dato.
function cuadra(tipo: TipoDocumento, c: CamposDocumento): boolean | null {
  const base = tipo === 'venta'
    ? c.montoFacturado
    : c.montoServicios === null && c.montoBienes === null ? null : (c.montoServicios ?? 0) + (c.montoBienes ?? 0)
  if (base === null || c.itbisFacturado === null || c.montoTotal === null) return null
  const partes = base + c.itbisFacturado + (c.impuestoSelectivoConsumo ?? 0) + (c.otrosImpuestos ?? 0) + (c.propinaLegal ?? 0)
  return Math.abs(partes - c.montoTotal) <= 0.05
}

// Combina lo que se sabía de la página (su QR, si lo tenía) con lo que leyó
// la IA. Regla: lo que viene del QR manda — lo firmó el emisor y es exacto;
// la IA aporta todo lo demás. Si las partes no suman el total, los montos
// quedan marcados para revisión.
export function fusionarConLectura(borrador: BorradorPagina, lectura: ResultadoOCR, ctx: ContextoLote): BorradorPagina {
  if (borrador.estado === 'ajena' || borrador.estado === 'duplicada') return borrador
  const leida = { ...borrador, leidaConIA: true, confianzaOCR: lectura.confianzaOCR }

  if (!borrador.conQr) {
    if (!lectura.esComprobante) {
      return { ...leida, estado: 'no_factura', nota: 'La IA no la reconoce como una factura.' }
    }
    const campos = lectura.extraccion
    const dudosos = new Set<CampoExtraido>(lectura.camposDudosos)
    if (cuadra(lectura.tipo, campos) === false) montosDe(lectura.tipo).forEach(c => dudosos.add(c))
    const repetida = buscarDuplicado(
      { id: '', clienteId: ctx.cliente.id, tipo: lectura.tipo, ncf: campos.ncf, rncCedulaContraparte: campos.rncCedulaContraparte },
      ctx.existentes as readonly DocumentoFiscal[],
    )
    if (repetida) return { ...leida, estado: 'duplicada', tipo: lectura.tipo, campos, nota: NOTA_DUPLICADA }
    return {
      ...leida,
      tipo: lectura.tipo,
      campos,
      dudosos: CAMPOS_EXTRAIDOS.filter(c => dudosos.has(c)),
      nota: lectura.coincideCliente === false ? 'El RNC de este cliente no aparece en la factura: comprueba que sea suya.' : undefined,
    }
  }

  // Con QR. Si la IA entendió la factura al revés (compra por venta), sus
  // montos están en los campos equivocados: se conserva solo lo del QR.
  if (!lectura.esComprobante || lectura.tipo !== borrador.tipo) {
    return { ...leida, nota: 'La lectura con IA no coincidió con el código QR: completa los montos a mano.' }
  }
  const delQr = borrador.campos
  const campos: CamposDocumento = {
    ...lectura.extraccion,
    rncCedulaContraparte: delQr.rncCedulaContraparte ?? lectura.extraccion.rncCedulaContraparte,
    ncf: delQr.ncf,
    fechaComprobante: delQr.fechaComprobante ?? lectura.extraccion.fechaComprobante,
    montoTotal: delQr.montoTotal ?? lectura.extraccion.montoTotal,
    tipoIdentificacion: delQr.tipoIdentificacion ?? lectura.extraccion.tipoIdentificacion,
  }
  // Lo que quedó con el valor del QR ya no está en duda, lo haya marcado la IA o no.
  const exactos: CampoExtraido[] = ['ncf']
  if (delQr.rncCedulaContraparte) exactos.push('rncCedulaContraparte')
  if (delQr.fechaComprobante) exactos.push('fechaComprobante')
  if (delQr.montoTotal !== null) exactos.push('montoTotal')
  const dudosos = new Set<CampoExtraido>(lectura.camposDudosos.filter(c => !exactos.includes(c)))
  if (cuadra(borrador.tipo, campos) === false) montosDe(borrador.tipo).forEach(c => dudosos.add(c))
  return { ...leida, campos, dudosos: CAMPOS_EXTRAIDOS.filter(c => dudosos.has(c)) }
}

// Lo que impide dar la página por buena: campos que el formato exige y
// faltan, más los que quedaron en duda. Vacío = lista para aprobar.
export function observaciones(borrador: BorradorPagina, rncCliente: string): CampoExtraido[] {
  const pendientes = new Set<CampoExtraido>(borrador.dudosos)
  for (const p of problemasDeRevision(borrador.tipo, borrador.campos, rncCliente)) {
    if (p.nivel === 'error' && p.campo) pendientes.add(p.campo)
  }
  return CAMPOS_EXTRAIDOS.filter(c => pendientes.has(c))
}

// La factura que se guarda a partir de una página: siempre pendiente de
// revisión, con la lista de lo que todavía le falta.
export function documentoDesdePagina(
  id: string,
  borrador: BorradorPagina,
  cliente: Pick<ClienteFiscal, 'id' | 'rncCedula'>,
  archivo: { nombre: string; pagina: number },
  ahora: string,
): DocumentoFiscal {
  return {
    ...borrador.campos,
    id,
    contadorUid: CONTADOR_LOCAL,
    clienteId: cliente.id,
    tipo: borrador.tipo,
    origen: borrador.leidaConIA ? 'ocr' : borrador.conQr ? 'qr' : 'manual',
    archivoNombre: archivo.nombre,
    archivoMimeType: 'image/jpeg',
    archivoPagina: archivo.pagina,
    // Solo con QR (sin IA) los datos son exactos: no hay lectura que puntuar.
    confianzaOCR: borrador.leidaConIA ? borrador.confianzaOCR : borrador.conQr ? 1 : 0,
    camposIncompletos: observaciones(borrador, cliente.rncCedula),
    estadoRevision: 'pendiente_revision',
    creadoEn: ahora,
    actualizadoEn: ahora,
  }
}
