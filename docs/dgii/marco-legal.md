# Marco legal: fuentes recibidas, vigencia y qué se aplicó

Fuentes entregadas por el usuario para estructurar el sistema. Método: se
lee el texto, se cita en el código el artículo de donde sale cada regla, se
parafrasea (no se copian los textos) y lo que no sale de una fuente
entregada queda marcado `⚠️ SIN VERIFICAR`. Los formatos 606 y 607 tienen
su propio documento: `formatos-606-607.md`.

## Resumen de vigencia (al 2026-11-18)

| Fuente | Estado | Qué se usa |
|---|---|---|
| Código Tributario, Ley 11-92 (texto consolidado DGII, oct. 2025) | Vigente, con artículos ya superados dentro del mismo texto (ver abajo) y modificado después por la Ley 30-26 | ITBIS (arts. 335-360), tasas ISR (296-297), deberes formales (50) |
| **Ley 30-26** (pro-crecimiento y simplificación fiscal; dada el 18-06-2026) | Vigente; varias partes rigen desde 2027 | Escala ISR personas físicas 2027, ISR jurídicas, recargo por mora, retenciones |
| Ley 32-23 de Facturación Electrónica (G.O. 11107, 17-05-2023) | Vigente; calendario de implementación ya vencido | Tipos e-CF, plazos |
| Decreto 587-24 (reglamento de la Ley 32-23) | Vigente | Prórroga, contingencia, vencimiento de la serie B |
| Guía Informativa de NCF (DGII, marzo 2026) | Vigente (guía, no norma) | Tipos de comprobante y quién los emite |
| **Decreto 293-11**, Reglamento del ITBIS (12-05-2011) | Vigente | Deducción del ITBIS adelantado, retención del ITBIS, IT-1 |
| Decreto de 2001 que modifica el Reglamento 140-98 (el usuario lo envió como "Decreto ITBIS") | **Derogado**: el art. 30 del Decreto 293-11 deroga el 140-98 y sus modificaciones de 2001 (196-01, 274-01, 1108-01) y la 603-10 | Nada |
| **Norma General 06-2018** sobre comprobantes fiscales (01-02-2018) | Vigente para comprobantes no electrónicos; la facturación electrónica la va dejando sin objeto | Vigencia de secuencias, fin de las series de 19 posiciones |
| NIIF para las PYMES, 3.ª edición (2025) | Vigente | Costo, gasto y activo en el 606 |
| **Decreto 254-06**, reglamento de comprobantes fiscales (19-06-2006) | Vigente; la NG 01-2020 hace equivalentes a él los e-CF | Tipos, requisitos de la factura, obligación de validar el NCF |
| **Norma General 06-2014**, remisión de informaciones (rige desde 2015) | **Sustituida** en el formato y el plazo: la NG 01-2020 dice que el 606 se rige por la **NG 07-2018** (modificada por la NG 10-18). Su formato de ancho fijo y su plazo del día 20 ya no son los de la herramienta vigente (separador `\|`, 23 campos, día 15) | Solo el alcance: qué se reporta en 606, 607, 608 y 609 |
| **Norma General 06-2021** (14-06-2021) | Vigente; solo cambia de 10 a 5 días hábiles la respuesta a la solicitud de comprobantes (art. 3 de la NG 06-2018) | Nada |
| **Norma General 01-2020**, facturación electrónica (09-01-2020) | Vigente, ahora bajo la Ley 32-23 y el Decreto 587-24 | Definición de cada tipo de e-CF, timbre (QR), validación por el receptor |
| Guía Informativa de NCF (2.ª copia recibida en el tercer lote) | Igual a la ya leída | — |

**Cadena de la norma de remisión de informaciones (la que rige el 606)**:
NG 01-07 → NG 06-2014 (recibida; vigente desde 2015) → **NG 07-2018**, del
09-03-2018, modificada por la **NG 10-18** (las cita como vigentes la NG
01-2020, art. 8 párrafo III). Las dos últimas no se han recibido. Mientras
tanto, el formato y el plazo del 606 salen de la herramienta y el
instructivo de la DGII de 2025 (ver `formatos-606-607.md`), que son
posteriores a todas ellas. Antes se dijo por error que la NG 06-2018 era la
de remisión: es la de comprobantes.

## Dentro del Código Tributario: lo superado

- Art. 341 (ITBIS 16%, Ley 288-04): superado por el art. 345 (Ley 253-12).
- Art. 345: 18% en 2013-2014 y 16% desde 2015, rebaja condicionada a una
  meta de presión tributaria. **Rige el 18%** (confirmado por el usuario,
  contador, el 2026-11-18; las facturas reales lo cobran). La Ley 30-26 no
  toca los arts. 341 ni 345.
- Art. 345 párrafo II: tasa reducida que subió por año hasta **16% desde
  2016** para una lista cerrada de bienes (yogures, mantequilla, café,
  aceites, azúcar, cacao y chocolate, entre otros).
- Art. 296 (escala ISR personas físicas de la Ley 253-12): reemplazado por
  la Ley 30-26 desde el ejercicio 2027.
- Art. 297 (ISR jurídicas 28%, luego 27% desde 2015): reescrito por la Ley
  30-26 (27% desde 2026, con 30% transitorio para ingresos altos).
- Art. 252 (recargo por mora 10% + 4%): reescrito por la Ley 30-26.

## Ley 30-26: lo que importa al sistema

- **ITBIS**: no cambia la tasa, las deducciones ni el plazo del IT-1 (no
  toca los arts. 341-353). Agrega bienes exentos (art. 343), percepción a
  importadores informales (nuevo art. 354-1) y el Régimen Simplificado
  también para ITBIS (art. 340 d).
- **ISR personas jurídicas** (art. 297): 27% desde el ejercicio 2026;
  **30% en 2026, 2027 y 2028** para quienes tengan ingresos desde
  RD$1,000 millones. → `tasaISRPersonaJuridica` en `dgii-fiscal.ts`.
- **ISR personas físicas** (art. 296) desde el ejercicio 2027: exento hasta
  RD$480,000; 15% hasta 685,000; 20% hasta 910,000; 25% hasta 4,800,000;
  27% en adelante (montos fijos 30,750 / 75,750 / 1,048,250). Se ajusta
  cada año por inflación. → `TRAMOS_ISR_PERSONA_FISICA_2027`.
- **Recargo por mora** (art. 252): 3% por mes o fracción, tope 100% del
  impuesto; descuentos por pronto pago de 90/70/50/30%. **Interés
  indemnizatorio** (art. 27): tasa activa promedio de la banca múltiple más
  30 puntos básicos; la DGII publica el porcentaje cada año. → `recargoMora`
  (el interés no se modela). Esto deja sin efecto el "10% + 4% + 1.10%"
  del IR-17 que menciona la lección 2 de CLAUDE.md.
- **Retenciones de ISR** (art. 309): 15% alquileres y 15% honorarios y
  servicios de personas físicas, 25% premios, 5% pagos del Estado, 15% otras
  rentas. Para el paso IR-17. El texto viene de un OCR con ruido: verificar
  los porcentajes contra la Gaceta antes de codificarlos.
- **Pagos al exterior** (arts. 305, 305-1 y 305-2): retención única y
  definitiva; regalías 15%; software, publicidad en línea y almacenamiento
  de datos con su propia retención.
- **Anticipos** (art. 314): rigen desde el período 2027 (1.5% de ingresos
  para medianas y grandes con tasa efectiva baja; pequeñas 50/30/20 sobre
  el impuesto del año anterior; micro exentas).
- **Régimen Simplificado de Tributación** (art. 290): nuevos topes (RD$30
  millones por ingresos, RD$15 millones profesionales, RD$60 millones por
  compras).
- **Amnistía** (art. 8): hasta el 31-12-2026.
- **Acuerdos de pago** (nuevo art. 17-1): inicial mínima de 15%, máximo 12
  meses (24 en casos especiales).
- Impuesto a cheques y transferencias (art. 382): 2 por mil.
- Vigencia (art. 62): desde su promulgación y publicación más los plazos
  del Código Civil. El texto recibido dice "dada" el 18-06-2026; no trae el
  número ni la fecha de la Gaceta Oficial.

## Decreto 293-11 (Reglamento del ITBIS): lo que importa

- Art. 17: para deducir el ITBIS de las compras locales hace falta un
  comprobante fiscal según el Decreto 254-06.
- Art. 18, requisitos del ITBIS adelantado: contribuyente del ITBIS; bienes
  o servicios para actividades gravadas (salvo productores de exentos y
  exportadores); gasto deducible en el ISR; ITBIS trasladado expresamente;
  no llevado al costo; no de bienes de la categoría 1; ITBIS por separado en
  el comprobante. → base del paso IT-1 (aún no construido).
- Art. 19: proporcionalidad cuando no se sabe si la compra fue para
  operaciones gravadas o exentas (campo "ITBIS sujeto a proporcionalidad"
  del 606).
- Art. 24: IT-1 en los primeros **20 días** del mes siguiente (coincide con
  el art. 353 del Código).
- Art. 25: el receptor retiene el **100% del ITBIS** de los servicios que
  le presta una persona física; también el de bienes según las normas de la
  DGII. → aviso en el 606.
- Art. 29: libro de compras y de ventas con nombre, RNC/cédula, NCF, fecha,
  monto sin ITBIS, ITBIS y total. Los Excel del 606 y de ingresos traen
  esas columnas.

## Norma General 06-2018: lo que importa

- Art. 6: una secuencia de NCF se puede usar hasta dos años calendario,
  contando el año en que se autorizó (coincide con la Guía de NCF).
- Art. 7: los comprobantes con valor fiscal deben imprimir la **fecha de
  vencimiento de la secuencia**; las notas de crédito y débito, el NCF que
  modifican. (Idea sin decidir: que la IA lea esa fecha y avise si la
  factura es posterior.)
- Art. 10: los NCF autorizados antes de la norma (series de 19 posiciones)
  solo podían emitirse hasta el **30-04-2018**. → aviso en el 606.

## Decreto 254-06 (reglamento de comprobantes): lo que importa

- Art. 4: tipos (crédito fiscal, consumo, notas de débito y crédito); las
  notas solo modifican comprobantes del mismo comprador. Los tiques de
  máquina registradora solo valen con consumidores finales (art. 20).
- Art. 5 párrafo III: comprobante especial que emite el propio comprador
  (hoy el de compras, 11/41): el emisor es el comprador y quien lo recibe
  es el vendedor. → instrucción a la IA.
- Art. 8: la factura debe desglosar el ITBIS y otros impuestos, y marcar
  con una **"E"** a la izquierda los artículos exentos. → instrucción a la
  IA.
- Art. 9: la factura con valor fiscal lleva nombre y RNC del comprador; las
  notas, el NCF que modifican.
- **Art. 27: quien use un comprobante para crédito de ITBIS o para costos y
  gastos debe consultar su validez en la DGII**; si no lo hace, no puede
  alegar desconocimiento. (Idea sin decidir: validar en la DGII desde el
  sistema.)

## Norma General 01-2020 (facturación electrónica): lo que importa

- Art. 3: estados del e-CF (aceptado, aceptado condicional, rechazado, en
  proceso); un e-CF rechazado no vale para fines fiscales (art. 8 párr. V).
- Art. 3 j): el **timbre electrónico** (el QR) permite verificar que el
  e-NCF está autorizado, que los datos principales no se alteraron y quién
  lo emitió; para sustentar costos y gastos debe coincidir con lo
  registrado en la DGII. Respalda la regla de la captura por lotes de que
  lo del QR manda.
- Art. 3, definiciones de cada tipo: gastos menores (43) = pagos del
  personal por su trabajo (consumibles, pasajes, transporte, parqueos,
  peajes); pagos al exterior (47) = rentas de fuente dominicana pagadas a
  no residentes con retención total del ISR; regímenes especiales (44) =
  ventas exentas a quienes tienen esos regímenes.
- Art. 8 párrafos I y III: el receptor electrónico da su conformidad con la
  aprobación comercial o al reportar la compra en el 606, y debe consultar
  la validez del e-CF en la DGII.
- Art. 14 párrafo: las facturas de consumo electrónicas desde el monto que
  fije la NG 07-2018 deben identificar al comprador.

## Aplicado en el código (2026-11-18)

- Tercer lote: dos instrucciones nuevas a la IA (`src/app/api/ocr/route.ts`):
  la "E" de los artículos exentos y, en el comprobante de compras (11/41),
  poner al vendedor como "comprador", que es como lo interpreta
  `interpretarLectura`.

- `dgii-fiscal.ts`: ITBIS 18% verificado (usuario + Código); ISR jurídicas
  27% con el 30% transitorio; escala de personas físicas 2027; recargo por
  mora de la Ley 30-26.
- `dgii-formatos.ts`, avisos que no bloquean: servicio de persona física a
  una empresa sin ITBIS retenido; NCF de 19 posiciones después del
  30-04-2018. Los comprobantes serie B se siguen aceptando (decisión del
  usuario: la facturación electrónica ya es obligatoria, pero "deja pasar
  al sistema los comprobantes serie B"); solo llevan el aviso.
