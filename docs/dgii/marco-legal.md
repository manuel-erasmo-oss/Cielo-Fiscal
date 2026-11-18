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

**Ojo con un error anterior**: en la lista de pedidos se llamó a la NG
06-2018 "la de remisión de informaciones". No lo es: es la de comprobantes.
La de remisión de informaciones (la que rige el 606) es la **NG 06-2014**,
que la propia 06-2018 cita como "que sustituye la NG 01-07 sobre Remisión
de Informaciones". Falta recibirla y confirmar si sigue vigente.

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

## Aplicado en el código (2026-11-18)

- `dgii-fiscal.ts`: ITBIS 18% verificado (usuario + Código); ISR jurídicas
  27% con el 30% transitorio; escala de personas físicas 2027; recargo por
  mora de la Ley 30-26.
- `dgii-formatos.ts`, avisos que no bloquean: servicio de persona física a
  una empresa sin ITBIS retenido; NCF de 19 posiciones después del
  30-04-2018. Los comprobantes serie B se siguen aceptando (decisión del
  usuario: la facturación electrónica ya es obligatoria, pero "deja pasar
  al sistema los comprobantes serie B"); solo llevan el aviso.
