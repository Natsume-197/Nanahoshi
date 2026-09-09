# Auditoría de agrupaciones y orden de audiolibros — 2026-09-09

Auditoría de solo lectura, posterior al despliegue comunicado por el usuario. Código local revisado: `aaefae79`. No se modificaron metadatos, asociaciones, archivos de audio ni código de aplicación.

## Alcance y método

- Instantánea de producción: **4.347 audiolibros**, **3.091 asociados**, **1.256 sin serie**, **559 agrupaciones**.
- Cribado de las **100 agrupaciones con al menos 10 registros**: 26 tienen posiciones desconocidas, 20 tienen posiciones repetidas y 13 presentan saltos entre posiciones enteras. Hay **45 con alguna señal**; las categorías se superponen. Estos números son indicadores, no errores confirmados ni una medida de precisión.
- Contraste dirigido: **59 productos consultados por ASIN en la API oficial de Audible JP** y **11 respuestas de Audnexus**, además de páginas oficiales para descubrir ASIN ausentes o incorrectos.
- Se contrastaron títulos, series y secuencias del catálogo, no el contenido sonoro de los archivos. Antes de una reparación de identidad conviene conservar el snapshot y contrastar los metadatos locales relevantes.
- El orden se comprobó ejecutando en producción el mismo `ORDER BY position ASC NULLS LAST, title ASC` que usa la página de serie.

## 1. Twin-Tail: nueve ASIN incorrectos, seis posiciones incorrectas

La serie tiene 22 registros: los volúmenes 1–21 y el 4.5. Nueve títulos contienen el ASIN de otro volumen. Seis también tienen una posición equivocada. Cambiar solo la posición dejaría el identificador contaminado.

Ejemplo: el registro 38320 dice volumen 11, pero guarda el ASIN `B08GLQBM2Z`, que Audible y Audnexus identifican como volumen 6. El volumen 16 comparte ese mismo ASIN. [Audible: volumen 6](https://www.audible.co.jp/pd/B08GLQBM2Z), [volumen 11](https://www.audible.co.jp/pd/B08GLT8V9F), [volumen 16](https://www.audible.co.jp/pd/B08GLSLZLR).

Los candidatos concretos para reparación son:

| Registro | Volumen del título | Posición actual | ASIN actual | ASIN correcto verificado |
|---|---:|---:|---|---|
| 38085 | 4 | 4 | `B08GLS8ZZH` | [B08GLSR8FT](https://www.audible.co.jp/pd/B08GLSR8FT) |
| 38178 | 5 | 5 | `B08GLTSG6B` | [B08GLT6RSD](https://www.audible.co.jp/pd/B08GLT6RSD) |
| 38320 | 11 | 6 | `B08GLQBM2Z` | [B08GLT8V9F](https://www.audible.co.jp/pd/B08GLT8V9F) |
| 38436 | 12 | 14 | `B08GLSZ1Z9` | [B08GLS3TN4](https://www.audible.co.jp/pd/B08GLS3TN4) |
| 38480 | 15 | 14 | `B08GLSZ1Z9` | [B08GLT1KBD](https://www.audible.co.jp/pd/B08GLT1KBD) |
| 38489 | 16 | 6 | `B08GLQBM2Z` | [B08GLSLZLR](https://www.audible.co.jp/pd/B08GLSLZLR) |
| 38275 | 17 | 7 | `B08GLTSG6B` | [B08GLS19BD](https://www.audible.co.jp/pd/B08GLS19BD) |
| 38445 | 18 | 7 | `B08GLTSG6B` | [B08V1R4SWP](https://www.audible.co.jp/pd/B08V1R4SWP) |
| 38481 | 19 | 19 | `B08GLS4NC3` | [B08V1B8DN2](https://www.audible.co.jp/pd/B08V1B8DN2) |

No son huecos de la colección: los archivos de esos volúmenes ya existen. La agrupación oficial es `B08GP61RH6`.

## 2. Imouto sae Ireba Ii: el volumen 11 está identificado como el 10

Registro **38594**: posición **10**, ASIN `B083Q5TV4L`. El título local es volumen 11. Audible confirma **B084GKGPGT**, secuencia **11**, serie `B07TB7Z6KB`. [Volumen 10](https://www.audible.co.jp/pd/B083Q5TV4L), [volumen 11](https://www.audible.co.jp/pd/B084GKGPGT).

Esto explica el aparente duplicado de posición 10 y el hueco 11. Deben corregirse conjuntamente ASIN y posición.

**Distinción histórica importante:** la hidratación actual de esos ASIN sí incluye números explícitos: Twin-Tail 6 e Imouto 10. El pipeline actual rechaza el conflicto frente a títulos 11/16. Rechazar una nueva coincidencia no elimina los datos erróneos ya guardados: la rama `no_match` retorna sin corregir la asociación anterior. No atribuir estos registros al nuevo despliegue sin evidencia.

## 3. Mushoku Tensei y Bunny Girl Senpai: series partidas por variantes de nombre

| Serie | Agrupación local A | Agrupación local B | Identidad oficial |
|---|---|---|---|
| Mushoku Tensei | `無職転生`, volúmenes 1–14 | `無職転生 ～異世界行ったら本気だす～`, volúmenes 15–26 y especial | `B07H7GGCC7` |
| Bunny Girl Senpai | `青春ブタ野郎`, volúmenes 1–11 | `「青春ブタ野郎」シリーズ`, volúmenes 12–15 | `B09133NYFN` |

En Mushoku se comprobó por API que los volúmenes **1 y 15 comparten el mismo ASIN de serie**. La página oficial reúne 26 volúmenes y el especial. [Mushoku Tensei en Audible](https://www.audible.co.jp/series/%E7%84%A1%E8%81%B7%E8%BB%A2%E7%94%9F-%EF%BD%9E%E7%95%B0%E4%B8%96%E7%95%8C%E8%A1%8C%E3%81%A3%E3%81%9F%E3%82%89%E6%9C%AC%E6%B0%97%E3%81%A0%E3%81%99%EF%BD%9E%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA/B07H7GGCC7).

La página oficial de Bunny Girl reúne los 15 títulos; el volumen 12 devuelve por API ese mismo identificador. [Bunny Girl Senpai en Audible](https://www.audible.co.jp/series/%E3%80%8C%E9%9D%92%E6%98%A5%E3%83%96%E3%82%BF%E9%87%8E%E9%83%8E%E3%80%8D%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA/B09133NYFN).

La reparación debe reconciliar esas identidades concretas, conservando enlaces y posiciones. **No restaurar la fusión general por prefijos**: Hannelore y Bookworm son el contraejemplo. Mushoku `蛇足編` tiene una agrupación independiente que no forma parte de esta propuesta.

Otro candidato: **86** tiene su volumen 1 en `86‐エイティシックス‐` y los 2–14 más Alter en `86‐エイティシックス -`. Falta completar la identificación por ASIN del volumen 1 antes de preparar su reparación; se mantiene como candidato.

## 4. Slayers: siete posiciones recuperables sin adivinar

Los volúmenes **2, 3, 4, 5, 6, 7 y 9** siguen con `position = null`. La consulta de la página los coloca después de los volúmenes numerados, incluido el 15. Audible **y Audnexus** devuelven hoy sus posiciones correctas en la misma serie `B07H7DVKM7`.

| Registro | Volumen | ASIN del archivo verificado |
|---|---:|---|
| 113897 | 2 | [B07BBHFJTX](https://www.audible.co.jp/pd/B07BBHFJTX) |
| 113895 | 3 | [B07BVCT914](https://www.audible.co.jp/pd/B07BVCT914) |
| 113901 | 4 | [B07BVQXZ92](https://www.audible.co.jp/pd/B07BVQXZ92) |
| 113893 | 5 | [B07BVNBS3S](https://www.audible.co.jp/pd/B07BVNBS3S) |
| 113904 | 6 | [B07D8SCHFP](https://www.audible.co.jp/pd/B07D8SCHFP) |
| 113898 | 7 | [B07DF39K2G](https://www.audible.co.jp/pd/B07DF39K2G) |
| 113902 | 9 | [B07JZ3ZWFK](https://www.audible.co.jp/pd/B07JZ3ZWFK) |

Estos siete casos son datos pendientes de recuperación, **no evidencia de que el respaldo actual de Audible falle**. Se pueden reprocesar de manera dirigida respetando bloqueos; el enriquecimiento normal omite registros en estado terminal.

## 5. Youjo Senki: segunda parte antes que primera

Producción devuelve este orden para la posición 1:

1. **38187** — `幼女戦記 1 Deus lo vult （後編）` (segunda parte).
2. **38179** — `幼女戦記 1 Deus lo vult（前編）` (primera parte).

Ambos tienen posición 1. El espacio antes del paréntesis hace que la segunda parte gane el desempate alfabético. La causa está en [audiobook.repository.ts](../../packages/api/src/routers/audiobooks/audiobook.repository.ts), línea 466: solo ordena por posición y título.

Se necesita un criterio semántico de parte dentro del mismo volumen, seguido de un desempate estable. No inventar posiciones 1.1/1.2 ni convertir partes complementarias en duplicados. Como control, las posiciones repetidas de Overlord sí corresponden a partes distintas; los ejemplos 1, 5 y 6 consultados están actualmente en orden correcto.

## 6. Silent Witch: dos especiales pierden su secuencia

| Registro | Secuencia oficial | Posición local |
|---|---|---:|
| 113789 | `4・番外編` | 4 |
| 232141 | `9・短編集` | 9 |

[Especial de IV](https://www.audible.co.jp/pd/B0CMS95VL8), [colección de IX](https://www.audible.co.jp/pd/B0FC5R1H1W). Audible y Audnexus coinciden en las etiquetas textuales. Los dos siguen perteneciendo a `サイレント・ウィッチ`; no deben separarse en series inventadas.

La protección reciente cubre `[番外編2巻]`, pero **no** `[4巻・番外編]` ni `[9巻・短編集]`. La reproducción con el código actual devuelve posición 4/9; después `metadata.service.ts:279` rellena la posición desconocida del proveedor con ese número. El orden observado hoy deja cada extra después de su volumen, pero la distinción no queda almacenada y depende del título. La mejora debe conservar etiqueta y relación de orden, no transformar esos especiales en volúmenes principales ni mandarlos indiscriminadamente al final.

## Cambios recomendados, en orden

1. **Orden semántico de partes y especiales.** Guardar o derivar una clave de parte sin alterar la identidad ni el número editorial; preservar la secuencia textual del proveedor. Pruebas: Youjo 1 delante/detrás, Overlord 5/6, Silent Witch IV/IX y Oregairu `結 1`.
2. **Parser estricto de tags numéricos.** `audiobookProcessor.ts:341` usa `parseInt(...) || null`: `6.5 → 6`, `0.5 → null`, `0 → null`, `6-7 → 6`. Corregirlo con normalización y validación del token completo. Es un defecto vigente reproducible; no se atribuye a un registro concreto sin leer sus tags.
3. **Reconciliación por identificador oficial y marketplace.** El tipo de respuesta contiene el ASIN de la serie, pero se descarta al mapearla. Conservar esa identidad permite reconciliar los casos Mushoku/Bunny Girl con evidencia, sin volver a fusionar por prefijos. Requiere diseñar la persistencia y migración de vínculos.
4. **Mantenimiento dirigido de metadatos históricos.** Preparar cambios acotados para los 10 ASIN incorrectos y las 7 posiciones de Slayers, con snapshot, bloqueos y verificación de conflictos. Un rechazo de identidad debe generar una señal revisable cuando la asociación guardada contradice al catálogo; no borrar datos automáticamente por una búsqueda fallida.
5. **Completar la posición de un proveedor solo con evidencia compatible.** `metadata.service.ts:279` no comprueba que la serie inferida sea la misma que la del proveedor. Añadir un caso `[1巻] Arc B` con serie paraguas y secuencia desconocida: no debe convertirse en volumen 1 del paraguas. Considerar consulta oficial cuando falta secuencia en Audnexus, comprobando el mismo identificador de serie; esto es una oportunidad de código, no la causa de Slayers comprobada hoy.

## Riesgos adicionales reproducidos, sin incidencia real confirmada

- Con título remoto explícitamente distinto (volumen 6 frente a 11), el pipeline rechaza incluso un ASIN idéntico. Con el título remoto sin número —o ausente— y `series.position=6`, el pipeline puede aceptar ese mismo ASIN: la evidencia de identidad no incluye la posición. Cualquier comprobación adicional debe distinguir número editorial de secuencia global de una serie paraguas; comparar números a ciegas rompería Bookworm/Monogatari.
- `routing.primary` no se transmite como proveedor primario requerido salvo selección manual. Es una discrepancia para revisar entre la configuración y el contrato de autoridad, pero no se demostró que causara alguno de los registros anteriores.

## Evidencia y reproducción

- Instantánea: `/tmp/nanahoshi-series-audit-live.json`; lectura SQL: `/tmp/nanahoshi-series-audit.sql`.
- Indicadores de las 100 series: `/tmp/nanahoshi-series-audit-summary.json`.
- Respuestas oficiales: `/tmp/nanahoshi-audit-official.jsonl`; Audnexus: `/tmp/nanahoshi-audit-audnexus.jsonl`.
- Orden real: `/tmp/nanahoshi-series-order.sql` y `/tmp/nanahoshi-series-order.txt`.
- API consultada: `https://api.audible.co.jp/1.0/catalog/products/{ASIN}?response_groups=product_attrs,contributors,series,media`; Audnexus: `https://api.audnex.us/books/{ASIN}?region=jp`.
- Reproducciones locales de inferencia y de la cadena real con proveedor simulado; 30 tests existentes de inferencia/carpetas y 8 de identidad pasan. No se modificaron tests ni fuente.

Esta auditoría confirma los casos descritos, no certifica todas las 100 series contra Audible ni considera error cada señal del cribado. Los ficheros de `/tmp` son evidencia temporal; este informe conserva los identificadores y fuentes necesarios para repetir las comprobaciones.
