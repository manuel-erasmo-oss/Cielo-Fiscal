import { CAMPOS_EXTRAIDOS, CAMPOS_VACIOS, buscarDuplicado, normalizarNcf, problemasDeRevision, type CamposDocumento } from '@/lib/documentos'
import { leerQrEcf, pertenenciaSegunQr } from '@/lib/qr-ecf'
import { CONTADOR_LOCAL, type CampoExtraido, type ClienteFiscal, type DocumentoFiscal, type TipoDocumento } from '@/types'

// Captura por lotes, lógica pura: qué factura sale de cada página a partir de
// su código QR. Sin navegador ni almacenamiento, para poder probarla.

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

export interface BorradorPagina {
  estado: EstadoPagina
  tipo: TipoDocumento
  campos: CamposDocumento
  // Explicación para la persona cuando la página no entra por defecto.
  nota?: string
}

export interface ContextoLote {
  cliente: Pick<ClienteFiscal, 'id' | 'rncCedula'>
  // Tipo de las páginas cuyo QR no permite saberlo.
  tipoPorDefecto: TipoDocumento
  // Facturas ya guardadas, más las de páginas anteriores de este lote.
  existentes: readonly Pick<DocumentoFiscal, 'id' | 'clienteId' | 'tipo' | 'ncf' | 'rncCedulaContraparte' | 'estadoRevision'>[]
}

export function interpretarPagina(textoQr: string | null, ctx: ContextoLote): BorradorPagina {
  const qr = textoQr ? leerQrEcf(textoQr) : null
  if (!qr) return { estado: 'sin_qr', tipo: ctx.tipoPorDefecto, campos: { ...CAMPOS_VACIOS } }

  const pertenencia = pertenenciaSegunQr(qr, ctx.cliente.rncCedula)
  // Si el QR no trae comprador, el emisor no es el cliente, así que el
  // cliente solo puede ser quien compró.
  const tipo: TipoDocumento = pertenencia === 'venta' ? 'venta' : 'compra'
  const contraparte = tipo === 'venta' ? qr.rncComprador : qr.rncEmisor
  const campos: CamposDocumento = {
    ...CAMPOS_VACIOS,
    rncCedulaContraparte: contraparte,
    ncf: normalizarNcf(qr.encf),
    fechaComprobante: qr.fechaEmision,
    montoTotal: qr.montoTotal,
    tipoIdentificacion: tipo === 'venta' && contraparte ? (contraparte.length === 9 ? '1' : '2') : null,
  }

  if (pertenencia === 'ajena') {
    return { estado: 'ajena', tipo, campos, nota: 'El código QR dice que esta factura es de otro contribuyente, no de este cliente.' }
  }
  const repetida = buscarDuplicado(
    { id: '', clienteId: ctx.cliente.id, tipo, ncf: campos.ncf, rncCedulaContraparte: campos.rncCedulaContraparte },
    ctx.existentes as readonly DocumentoFiscal[],
  )
  if (repetida) return { estado: 'duplicada', tipo, campos, nota: 'Este comprobante ya está registrado o está repetido en el lote.' }
  return { estado: 'qr', tipo, campos }
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
  const faltantes = new Set<CampoExtraido>()
  for (const p of problemasDeRevision(borrador.tipo, borrador.campos, cliente.rncCedula)) {
    if (p.nivel === 'error' && p.campo) faltantes.add(p.campo)
  }
  return {
    ...borrador.campos,
    id,
    contadorUid: CONTADOR_LOCAL,
    clienteId: cliente.id,
    tipo: borrador.tipo,
    origen: borrador.estado === 'sin_qr' ? 'manual' : 'qr',
    archivoNombre: archivo.nombre,
    archivoMimeType: 'image/jpeg',
    archivoPagina: archivo.pagina,
    // Los datos del QR son exactos: no hay lectura dudosa que puntuar.
    confianzaOCR: borrador.estado === 'sin_qr' ? 0 : 1,
    camposIncompletos: CAMPOS_EXTRAIDOS.filter(c => faltantes.has(c)),
    estadoRevision: 'pendiente_revision',
    creadoEn: ahora,
    actualizadoEn: ahora,
  }
}
