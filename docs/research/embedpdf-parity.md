# Paridad del lector PDF con EmbedPDF 2.15

Fecha: 2026-08-16

## Alcance y evidencia

Nanahoshi usa el runtime **2.15.0** de EmbedPDF, fijado en
[`bun.lock`](../../bun.lock). Esta nota compara el lector personalizado de
Nanahoshi con las capacidades del viewer React y los plugins headless de la
rama estable `v2` de EmbedPDF. La documentación pública vigente puede ir por
delante de la versión fijada; por eso las funciones se tratan como
**capacidades de la familia v2**, no como una afirmación de que cada detalle
de UI apareció exactamente en el patch `2.15.0`.

Las fuentes son únicamente oficiales: la [documentación React de
EmbedPDF](https://www.embedpdf.com/docs/react), el [repositorio oficial, rama
v2](https://github.com/embedpdf/embed-pdf-viewer/tree/v2) y el
[catálogo de paquetes v2](https://github.com/embedpdf/embed-pdf-viewer/tree/v2/packages).

### Qué se consideró “paridad”

EmbedPDF ofrece dos superficies distintas: un viewer preconstruido y componentes
headless. Nanahoshi eligió correctamente la segunda: conserva la interfaz,
progreso y navegación propios, pero usa el mismo motor PDFium/EmbedPDF. Por
ello, la paridad se mide por la capacidad para el lector, no por copiar su
toolbar ni sus paquetes de UI.

## Estado de Nanahoshi hoy

La implementación examinada está concentrada en:

- [`book-reader-pdf.tsx`](../../apps/web/src/features/reader/renderers/pdf/book-reader-pdf.tsx): composición del viewport y las capas EmbedPDF.
- [`pdf-reader-config.ts`](../../apps/web/src/features/reader/renderers/pdf/pdf-reader-config.ts): plugins registrados y límites del motor.
- [`pdf-navigation-toolbar.tsx`](../../apps/web/src/features/reader/renderers/pdf/pdf-navigation-toolbar.tsx): controles de lectura.
- [`pdf-search-panel.tsx`](../../apps/web/src/features/reader/renderers/pdf/pdf-search-panel.tsx) y [`pdf-page-navigator.tsx`](../../apps/web/src/features/reader/renderers/pdf/pdf-page-navigator.tsx): búsqueda y navegación.

## Ya implementado

| Capacidad de EmbedPDF | Estado en Nanahoshi | Evidencia local | Fuente oficial |
| --- | --- | --- | --- |
| Renderizado PDFium/WebAssembly, páginas virtualizadas y tiling para documentos largos | Implementado. `RenderLayer` + `TilingLayer`; `Scroller` virtualiza el documento y EmbedPDF virtualiza independientemente la cola de miniaturas. | `book-reader-pdf.tsx`, `pdf-reader-config.ts`, `pdf-page-navigator.tsx` | [React: motor y virtualización](https://www.embedpdf.com/docs/react); [Render/Tiling](https://www.embedpdf.com/docs/react/headless/plugins/plugin-render) |
| Carga remota con estado de carga/error | Implementado para un libro, con URL, `range-request` y credenciales de la sesión. | `pdf-reader-config.ts`, `book-reader-pdf.tsx` | [Document Manager](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-document-manager) |
| Navegación por página, anterior/siguiente, salto directo y sincronización del contador | Implementado, incluido guardado/restauración de progreso como posición de lectura. | `use-pdf-navigation.ts`, `pdf-navigation-toolbar.tsx`, `pdf-view-state.ts` | [Scrolling & Navigation](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-scroll) |
| Lectura continua, página única y doble página con portada aislada | Implementado. El modo doble usa la agrupación equivalente a `SpreadMode.Even`. | `book-reader-pdf.tsx`, `pdf-view-state.ts` | [Spread layouts](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-spread) |
| Zoom, ajustar a página/ancho, límites, atajos y gestos | Implementado: 25–400 %, botones, `FitPage`/`FitWidth`, `+`, `-`, `0` y `ZoomGestureWrapper`. No hay selector de porcentaje exacto, pero no impide la lectura. | `pdf-reader-config.ts`, `book-reader-pdf.tsx`, `pdf-navigation-toolbar.tsx` | [Zoom](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-zoom) |
| Herramienta mano/pan, con selección como modo alternativo | Implementado, con modo móvil por defecto y toggle explícito. | `pdf-reader-config.ts`, `pdf-navigation-toolbar.tsx` | [Pan tool](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-pan) |
| Rotación | Implementado con botón y atajo `Shift+R`. | `book-reader-pdf.tsx`, `pdf-navigation-toolbar.tsx` | [Categoría de rotación](https://www.embedpdf.com/docs/react/viewer/customizing-ui) |
| Selección de texto y capas de resultados | Implementado mediante `SelectionLayer` y `SearchLayer`. La selección puede usarse con el comportamiento nativo del navegador. | `book-reader-pdf.tsx` | [Text selection](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-selection) |
| Búsqueda de texto | Implementado con resaltados, lista contextual, navegación entre coincidencias, `Ctrl/Cmd+F`, `F3`, mayúsculas y palabra completa. | `pdf-search-panel.tsx`, `book-reader-pdf.tsx` | [Catálogo de plugins React](https://www.embedpdf.com/docs/react/headless/understanding-plugins) |
| Tema, interfaz responsiva y pantalla completa | Implementado por la capa de producto: los colores vienen del tema del reader, la barra se adapta y el menú PDF tiene acción de fullscreen. | `book-reader-pdf.tsx`, `pdf-navigation-toolbar.tsx`, `reader-screen.tsx` | [Configuración del viewer](https://www.embedpdf.com/docs/react/viewer/getting-started) |
| Menú de presentación PDF | Implementado: página única, doble página con paridad par/impar, scroll vertical/horizontal, rotación bidireccional y fullscreen se agrupan en una sola superficie. Cada cambio conserva la página activa. | `pdf-navigation-toolbar.tsx`, `book-reader-pdf.tsx`, `pdf-view-state.ts` | [Spread layouts](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-spread); [Scrolling & Navigation](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-scroll) |
| Miniaturas de página virtualizadas | Implementado con `ThumbnailPluginPackage`, `ThumbnailsPane` y `ThumbImg`; el panel lateral ya no es una lista de números. | `pdf-reader-config.ts`, `pdf-page-navigator.tsx` | [Thumbnail Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-thumbnail) |
| Imprimir y descargar una copia del documento | Implementado mediante los plugins oficiales de impresión y exportación, expuestos en el menú PDF. | `pdf-reader-config.ts`, `pdf-navigation-toolbar.tsx` | [Print Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-print); [Export Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-export) |
| Enlaces, anotaciones incorporadas y formularios AcroForm | Implementado en modo seguro: la capa de anotaciones se muestra bloqueada para evitar editar el libro, mientras que los widgets de formularios se renderizan e interactúan según el motor. | `pdf-reader-config.ts`, `book-reader-pdf.tsx` | [Annotation Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-annotation); [Form Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-form) |

## Disponible en EmbedPDF y faltante: sí aporta a un reader

Estas son las brechas que conviene cerrar para alcanzar una paridad práctica de
**lectura**, ordenadas por valor y no por cantidad de plugins.

| Prioridad | Capacidad | Diferencia actual | Recomendación KISS | Fuente oficial |
| --- | --- | --- | --- | --- |
| P1 | Índice/outline PDF y marcadores internos | El reader tiene su propio índice de libro, pero no expone el outline embebido de un PDF. | Añadir una segunda pestaña al panel lateral: “Páginas” y “Índice”, sólo si el PDF contiene outline. Es una mejora directa para manuales y libros técnicos. | [Catálogo v2: plugin-bookmark](https://github.com/embedpdf/embed-pdf-viewer/tree/v2/packages) |
| P2 | Copiar selección explícitamente | La capa permite seleccionar texto, pero no hay menú de selección ni botón de copiar. | Al detectar selección, mostrar una única acción contextual “Copiar”. No hace falta crear una barra de edición. | [Text Selection](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-selection) |
| P2 | Zoom exacto y modo automático | Hoy sólo hay incrementar/reducir y el botón central alterna un fit según layout. | Convertir el porcentaje actual en un menú con `Automático`, `Ajustar página`, `Ajustar ancho` y un campo de porcentaje. | [Zoom modes](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-zoom) |
| P2 | Traducción de la superficie PDF | Etiquetas, títulos y estados del panel PDF están escritos en inglés. | Llevar esos textos al sistema de i18n de Nanahoshi; no es necesario añadir el plugin de UI de EmbedPDF. | [Configuración i18n del viewer](https://www.embedpdf.com/docs/react/viewer/getting-started) |
| P3 | Capturar una región/página como imagen | Es útil para citar o compartir, aunque no esencial para terminar un libro. | Posponer hasta definir la política de copias/DRM; después añadir una acción “Copiar imagen de página”. | [Capture Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-capture) |

### Decisión importante: descargar es una copia local

La acción actual usa el exportador de EmbedPDF: genera una copia descargable del
documento, incluyendo los valores de formularios que el usuario haya escrito
durante esa sesión. Nanahoshi no persiste ni sincroniza estas modificaciones.
[EmbedPDF distingue explícitamente esa copia modificada](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-export).

## Disponible, pero no aplicable por defecto a un producto de lectura

No son omisiones accidentales. Todas exigen convertir el reader en editor,
definir permisos, persistencia, sincronización, exportación y, en algunos
casos, consecuencias legales. Deben habilitarse sólo si Nanahoshi abre un
producto explícito de revisión/edición de documentos.

| Capacidad de EmbedPDF | Por qué no debe entrar por defecto | Fuente oficial |
| --- | --- | --- |
| Anotaciones: highlight/underline/strikeout, notas, texto libre, tinta, formas y sellos | Requiere modelo de anotación, autoría, sincronización, conflictos, borrado y exportación. Un simple resaltado visual no resuelve esos contratos. | [Annotation Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-annotation) |
| Historial, deshacer y rehacer | Sólo aporta valor con operaciones mutables como anotaciones, formularios o redacciones. | [Categorías del viewer](https://www.embedpdf.com/docs/react/viewer/customizing-ui) |
| Guardar o sincronizar valores de formularios AcroForm | Los formularios se pueden completar y descargar como copia, pero persistirlos en Nanahoshi requeriría proteger datos personales, sincronizarlos y resolver conflictos. | [Forms](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-form) |
| Firmas electrónicas/initials | Flujo legal y de identidad distinto a lectura; además depende de anotaciones y exportación. | [Signature Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-signature) |
| Redacción real/destructiva | Es edición irreversible y no debe exponerse en un lector de biblioteca. | [Redaction Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-redaction) |
| Abrir múltiples documentos, pestañas y cerrar documentos | Nanahoshi ya tiene navegación entre libros y una sesión representa un libro; duplicar tabs dentro del reader crearía dos modelos de navegación. | [Document Manager](https://www.embedpdf.com/docs/react/viewer/plugins/plugin-document-manager) |
| Estampas, insertar imágenes/páginas, adjuntos, comandos de edición y view manager | Son herramientas de autoría o de un espacio de trabajo documental, no acciones para consumir un libro. | [Catálogo de paquetes v2](https://github.com/embedpdf/embed-pdf-viewer/tree/v2/packages) |

## Ruta recomendada

1. **Índice/outline PDF y copiar selección.** Mejoran orientación y utilidad
   sin añadir un modelo de edición.
2. **Zoom con presets e i18n.** Acabado de paridad,
   no un prerrequisito de estabilidad.

Con esas cuatro fases Nanahoshi tendría paridad funcional de lector con el
viewer de EmbedPDF, manteniendo una ventaja deliberada: una sesión de lectura
unificada con el resto de formatos, progreso de libro y una interfaz sin la
complejidad de un editor PDF.
