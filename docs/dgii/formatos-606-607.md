# Formatos de envío 606 y 607 — especificación extraída de las fuentes de la DGII

Fuentes entregadas por el usuario el 2026-11-15 (no están en el repo: son
binarios de la DGII de ~15 MB; se descargan de dgii.gov.do → Herramientas →
Formularios → Formatos Envíos de Datos):

| Archivo | Qué es | Versión / fecha |
|---|---|---|
| `Formato-de-Envio-606-NG-07-2018-y-05-2019.xls` | Herramienta de envío 606 (Excel con macros) | "Versión 2025", guardada 2025-06-04 |
| `LlenadoyEnvioFormato606.pdf` | Instructivo 606 | Julio 2025 |
| `Herramienta_de_Envio_Formato_607.xls` | Herramienta de envío 607 (Excel con macros) | "Version 2023.1.1", guardada 2023-05-25 |
| `5-InstructivoLlenadoyenvioFomato607.pdf` | Instructivo 607 | Septiembre 2020 |

Todo lo que sigue sale del texto de los instructivos o del código de las
macros de las herramientas (que es lo que realmente escribe el TXT). Donde
los dos difieren, manda la macro. Lo que es interpretación propia lo dice.
Los instructivos se declaran "publicación informativa sin validez legal".

## Común a ambos

- Base legal citada: Norma General 07-2018 (y 05-2019). Períodos desde 201805.
- **Fecha límite: a más tardar el día 15 de cada mes** (del mes siguiente al
  período). Sin operaciones se presentan en cero por "Declaraciones en cero"
  en la Oficina Virtual: no se genera archivo.
- Archivo de texto, campos separados por `|`, una línea por comprobante,
  líneas separadas por CRLF y **sin salto de línea al final**.
- Primera línea (encabezado): `606|RNC|AAAAMM|cantidad` / `607|RNC|AAAAMM|cantidad`.
- Nombre: `DGII_F_606_<RNC>_<AAAAMM>.TXT` / `DGII_F_607_<RNC>_<AAAAMM>.txt`.
- Montos con punto decimal (ej. `10.18`). Fechas `AAAAMMDD`, año 1950–2099.
- RNC = 9 dígitos, cédula = 11. Las herramientas solo validan longitud y que
  sea numérico. El dígito verificador está implementado en la macro
  (`GenDV_Para_Republica_Dominicana`) pero **su comprobación está
  desactivada** en ambas herramientas. Algoritmo:
  - RNC: pesos `7,9,8,6,5,4,3,2` sobre los 8 primeros dígitos; resto de la
    suma entre 11; resto 0 → 2, resto 1 → 1, si no → 11 − resto.
  - Cédula: pesos `1,2,1,2,…` sobre los 10 primeros; se suman los dígitos
    de cada producto; verificador = (10 − suma mod 10) mod 10.
- Tipo de NCF (`ObtenerTipoNcf`): con 11 posiciones, los caracteres 2-3; con
  19, los caracteres 10-11; **con 13 (e-NCF) la macro devuelve vacío**, así
  que ninguna regla "por tipo" aplica a un e-NCF.
- Una nota de crédito (tipo 04) **resta** en los totales.

## 606 — Compras de bienes y servicios (máximo 10,000 registros)

NCF válido (regex de la macro, versión 2025):
`[AQP]` + 8 dígitos + tipo (01-04, 11-15) + 8 dígitos (19 posiciones, solo
comprobantes anteriores a mayo 2018) · `B` + tipo (01-04, 11-15, 17) + 8
dígitos (11 posiciones) · `E` + tipo (31-34, 41-45, 47) + 10 dígitos (13
posiciones, e-CF).

| # | Campo | Regla |
|---|---|---|
| 1 | RNC o Cédula del proveedor | Obligatorio, numérico, 9 u 11. Con NCF tipo 13 (gastos menores) debe ser el mismo RNC del encabezado; el instructivo dice lo mismo para B17 (pagos al exterior). |
| 2 | Tipo Id | 1 = RNC, 2 = Cédula (la macro lo deduce de la longitud) |
| 3 | Tipo de bienes y servicios comprados | Obligatorio. Código de 2 dígitos, ver catálogo |
| 4 | NCF | Obligatorio |
| 5 | NCF o documento modificado | Opcional (notas de débito/crédito) |
| 6 | Fecha comprobante | Obligatoria, AAAAMMDD |
| 7 | Fecha pago | Opcional. Obligatoria si se llena 12, 17 o 18 |
| 8 | Monto facturado en servicios | Opcional, ≥ 0, sin impuestos |
| 9 | Monto facturado en bienes | Opcional, ≥ 0, sin impuestos |
| 10 | Total monto facturado | Calculado: 8 + 9. Debe ser > 0 |
| 11 | ITBIS facturado | Sin validación en la macro |
| 12 | ITBIS retenido | Opcional, ≥ 0 |
| 13 | ITBIS sujeto a proporcionalidad (Art. 349) | Opcional, ≥ 0 |
| 14 | ITBIS llevado al costo | Opcional, ≥ 0 |
| 15 | ITBIS por adelantar | Calculado: 11 − 14 |
| 16 | ITBIS percibido en compras | No habilitado: va vacío |
| 17 | Tipo de retención en ISR | Opcional. Código de 2 dígitos |
| 18 | Monto retención renta | Opcional, ≥ 0 |
| 19 | ISR percibido en compras | No habilitado: va vacío |
| 20 | Impuesto selectivo al consumo | Opcional, ≥ 0 |
| 21 | Otros impuestos/tasas | Opcional, ≥ 0 |
| 22 | Monto propina legal | Opcional, ≥ 0 (Ley 54-32, 10%) |
| 23 | Forma de pago | Obligatoria. Código de 2 dígitos |

Catálogos (texto de las listas de la herramienta):

- **Tipo de bienes y servicios**: 01 Gastos de personal · 02 Gastos por
  trabajos, suministros y servicios · 03 Arrendamientos · 04 Gastos de
  activos fijos · 05 Gastos de representación · 06 Otras deducciones
  admitidas · 07 Gastos financieros · 08 Gastos extraordinarios · 09 Compras
  y gastos que formarán parte del costo de venta · 10 Adquisiciones de
  activos · 11 Gastos de seguros.
- **Tipo de retención en ISR**: 01 Alquileres · 02 Honorarios por servicios
  · 03 Otras rentas · 04 Otras rentas (rentas presuntas) · 05 Intereses
  pagados a personas jurídicas residentes · 06 Intereses pagados a personas
  físicas residentes · 07 Retención por proveedores del Estado · 08 Juegos
  telefónicos · 09 Retenciones subsector de ganadería de carne bovina.
- **Forma de pago**: 01 Efectivo · 02 Cheques/transferencias/depósito · 03
  Tarjeta crédito/débito · 04 Compra a crédito · 05 Permuta · 06 Nota de
  crédito · 07 Mixto.

Del instructivo (no implementado, ver "Pendiente"): un NCF se **remite por
segunda vez** cuando se paga en fecha distinta a la de emisión para reportar
las retenciones, con la fecha original del NCF.

## 607 — Ventas de bienes y servicios (máximo 65,000 registros)

> **EN DESUSO en esta aplicación.** El usuario indicó el 2026-11-15 que el
> Formato 607 fue descontinuado (no se verificó contra la DGII). Las ventas
> se llevan como reporte de ingresos interno, con reglas más laxas
> (`validarVentaIngresos`). Lo que sigue documenta la herramienta 607
> versión 2023.1.1 tal como se recibió, y su generador se conserva probado.

NCF válido (regex de la macro, versión 2023.1.1): `[AQP]` + 8 dígitos + tipo
(01-04, 11-15) + 8 dígitos · `B` + tipo (01-04, 11-16) + 8 dígitos. **Esta
versión no admite e-NCF (serie E)**: longitud solo 11 o 19.

| # | Campo | Regla |
|---|---|---|
| 1 | RNC / Cédula o Pasaporte del cliente | Obligatorio, salvo la excepción de abajo |
| 2 | Tipo identificación | 1 = RNC, 2 = Cédula, 3 = Pasaporte o ID tributaria |
| 3 | Número comprobante fiscal | Obligatorio |
| 4 | NCF modificado | Opcional |
| 5 | Tipo de ingreso | Obligatorio. **Un solo dígito** (1-6) |
| 6 | Fecha comprobante | Obligatoria, AAAAMMDD |
| 7 | Fecha de retención | Opcional. Obligatoria si se llena 10 o 12 |
| 8 | Monto facturado | Obligatorio, sin impuestos, ≥ ITBIS facturado |
| 9 | ITBIS facturado | |
| 10 | ITBIS retenido por terceros | Opcional |
| 11 | ITBIS percibido | No habilitado: va vacío |
| 12 | Retención renta por terceros | Opcional |
| 13 | ISR percibido | No habilitado: va vacío |
| 14 | Impuesto selectivo al consumo | Opcional |
| 15 | Otros impuestos/tasas | Opcional |
| 16 | Monto propina legal | Opcional |
| 17 | Efectivo | Formas de cobro: montos **con impuestos**. |
| 18 | Cheque/transferencia/depósito | Al menos una de 17-23 debe ser > 0, |
| 19 | Tarjeta débito/crédito | salvo en notas de crédito (tipo 04). |
| 20 | Venta a crédito | El instructivo dice que la suma debe ser |
| 21 | Bonos o certificados de regalo | igual al total de la factura (la macro |
| 22 | Permuta | no lo comprueba). |
| 23 | Otras formas de ventas | |

- **Tipo de ingreso**: 1 Ingresos por operaciones (no financieros) · 2
  Ingresos financieros · 3 Ingresos extraordinarios · 4 Ingresos por
  arrendamientos · 5 Ingresos por venta de activo depreciable · 6 Otros
  ingresos.
- **Facturas de consumo (tipo 02)**: desde julio 2018 solo se detallan en el
  archivo las de valor igual o superior a RD$250,000.00 (Norma General
  10-18), con el documento de identidad del comprador. Las menores no van
  en el TXT: se reportan como totales (cantidad y monto) en el "Resumen
  General de Facturas de Consumo" al enviar por la Oficina Virtual.
  *Interpretación propia*: el umbral se compara contra el monto facturado
  sin impuestos, que es lo que compara la macro.
- Excepción de identificación: una nota de débito/crédito (03/04) que
  modifica una factura de consumo (02) por menos del umbral puede ir sin
  identificación.
- Con NCF tipo 12 (registro único de ingresos) la identificación debe ser
  la misma del encabezado.

## Dónde el sistema se aparta de la macro, y por qué

- **Forma de pago (606, campo 23)**: la macro la exige en cada fila. El
  usuario decidió que no sea obligatoria al registrar la factura; el
  sistema la completa al generar el archivo con una forma de pago por
  defecto que se elige en Reportes. El archivo resultante cumple la macro.
- **ITBIS facturado**: la macro no lo valida; el sistema exige un valor
  explícito (0 si no tiene).
- **e-NCF y código QR**: en facturas reales, el QR de un e-CF lleva una URL
  de `ecf.dgii.gov.do/.../ConsultaTimbre` con `RncEmisor`, `RncComprador`,
  `ENCF`, `FechaEmision` (DD-MM-AAAA), `MontoTotal`, `FechaFirma` y
  `CodigoSeguridad`. No se usa todavía.

## Pendiente / dudas abiertas

1. **607 y e-NCF**: la herramienta 607 entregada (2023.1.1) rechaza la
   serie E, mientras la 606 (2025) la acepta. Confirmar con el usuario si
   existe una versión más nueva de la herramienta 607.
2. **Segunda remisión por retenciones** (606): no modelada. Hoy cada
   factura pertenece solo al período de su fecha de comprobante.
3. El resultado real solo se confirma pasando el TXT por la **Herramienta
   de Pre-validación** de la DGII (aplicación de Windows) y enviándolo. Eso
   lo tiene que hacer el usuario; aquí solo se verificó contra la macro.
4. Semántica de los tipos de e-CF (31-34, 41-47): las fuentes solo dan los
   rangos válidos, no qué significa cada uno. No se codificó nada que
   dependa de ello.
