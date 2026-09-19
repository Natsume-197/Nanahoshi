# Investigación del resaltado de Lee y escucha

Fecha: 2026-09-19. Cambios locales, sin despliegue.

## Fallos reproducidos y correcciones

1. **El capítulo llegaba después de los reintentos del resaltado.** `ActiveReadListenCue` abandonaba la búsqueda después de 30 fotogramas. Una carga de 800 ms reprodujo en Chromium el texto visible sin ningún rango resaltado. Ahora los cambios de contenido reactivan la resolución de la oración, incluso después de ese límite.
2. **Se sustituía el texto con la misma oración activa.** El rango de CSS Highlight apuntaba a nodos que el lector había reemplazado. Se vuelve a resolver el índice del capítulo y a instalar el resaltado. Las pruebas incluyen sustitución de texto y de sección, con seguimiento activado/desactivado, y limpieza al salir.
3. **La navegación paginada consultaba capítulos vacíos.** Con `lazyBook`, los descriptores de capítulos son marcadores sin texto. Buscar allí la oración fallaba y la navegación volvía al inicio del capítulo. El resaltado podía existir fuera de pantalla: a 360 × 640, una oración aparecía en x=384 o incluso x=2592. Ahora se resuelve sobre el contenido montado, después de cargarlo, y se navega hasta su posición.
4. **La restauración inicial o una carga anterior ganaban a un salto nuevo.** La inicialización esperaba fuentes y podía restablecer otra sección después del salto de narración. Además, volver al capítulo ya montado no invalidaba un salto pendiente. Ahora prevalece la navegación más reciente. Una prueba específica falla al retirar la invalidación: se esperaba el capítulo 1 y terminaba mostrando el 0.
5. **Rotar inmediatamente en Tategaki continuo podía restaurar una posición atrasada.** El desplazamiento genérico no registraba inmediatamente la posición semántica, y la rotación cancelaba su observación diferida. El lector continuo ofrece ahora navegación por ancla de texto, que registra la posición antes del desplazamiento y descarta las observaciones de scroll pendientes anteriores al salto. El seguimiento conserva su comprobación de visibilidad antes de mover el texto.
6. **Volver al primer carácter en Tategaki continuo usaba scroll cero.** Dentro del contenedor horizontal de la ruta, el principio de una tira vertical puede encontrarse en una coordenada positiva. Ahora se mide el primer carácter también para esa posición.

7. **El paso automático podía deshacerse al centrar un párrafo largo.** Tras navegar por ancla a la página correcta, el seguimiento de dos columnas ejecutaba `scrollIntoView` sobre el párrafo padre y volvía a ajustar la página. Si el párrafo ocupaba varias páginas, ese segundo movimiento dejaba fuera de pantalla la oración siguiente. Se reprodujo avanzando consecutivamente por 64 oraciones agrupadas en dos párrafos, a 390 × 844; fallaban las oraciones 32 y 64. Se eliminó ese segundo desplazamiento: el motor paginado ya es responsable de alinear la oración con su página.
8. **Un pequeño movimiento táctil desactivaba el seguimiento sin pasar de página.** En una columna a 390 × 844, mover el dedo 2 px horizontalmente y 1 px verticalmente suspendía el seguimiento, aunque el lector no reconocía un deslizamiento. El audio podía continuar sin que la siguiente oración provocara el cambio de página. En paginado, los movimientos táctiles ahora suspenden el seguimiento cuando el motor consume un `touchend` como deslizamiento válido. El desplazamiento táctil del modo continuo conserva su comportamiento.

## Validación

Primera validación: **778 comprobaciones de navegador aprobadas, cero fallos**. La combinación de Tategaki continuo en escritorio repite cinco ciclos de rotación para cubrir la carrera intermitente.

Prueba de navegador reproducible:

```sh
bun apps/web/scripts/read-listen-highlight-e2e.ts
```

Puede usarse `READER_E2E_BROWSER` para seleccionar Chromium/Chrome. Por defecto utiliza `/opt/google/chrome/chrome`. No necesita credenciales ni una base de datos. Un argumento opcional filtra las combinaciones por su nombre; las pruebas de entrada se ejecutan siempre.

| Dimensión | Cobertura |
| --- | --- |
| Resoluciones CSS | 360 × 640, 390 × 844, 844 × 390, 768 × 1024, 1280 × 900 |
| Paginado | Una columna, dos columnas y Tategaki; contenido completo y carga diferida |
| Continuo | Horizontal y Tategaki |
| Móvil | Viewport móvil, eventos táctiles habilitados y escala de píxel 2 |
| Navegación | Avance por oraciones, cruces de capítulo, 10 % → 80 % → 10 %, 90 % → inicio, saltos rápidos |
| Ciclo de vida | Reentrada, sustitución de sección, entrada con 800 ms de carga, entrada directa al 82 % |
| Reflujo | Cambio de orientación con la oración activa y regreso a la orientación original |

Cada comprobación de navegador exige que el rango contenga la oración esperada y que el comienzo de la oración esté visible en paginado (al menos un fragmento en continuo), dentro del área visible, descontando el espacio del reproductor. Se usan los componentes y el CSS reales del lector con un libro japonés sintético de diez capítulos. Se verificó visualmente una captura de Tategaki.

También se ejecutaron 109 pruebas de Bun del seguimiento, runtime, anclas y motores continuo/paginado; comprobación de tipos del frontend; Biome sobre los archivos modificados; y `git diff --check`.

## Límites

Es una prueba de integración del lector en Chromium, con cambios de oración controlados. No reproduce audio real ni recorre la autenticación, el catálogo o todos los controles de la aplicación completa. La emulación táctil no equivale a probar gestos en un teléfono físico. No se probaron Safari/iOS, Firefox, las particularidades del EPUB del usuario ni la suspensión del navegador en segundo plano. Estos resultados explican y corrigen condiciones reproducibles, pero no identifican cuál ocurrió en su dispositivo concreto.

## Regresión del paso automático entre páginas

La matriz añade párrafos largos con 64 oraciones consecutivas, en una/dos columnas y Tategaki a las cinco resoluciones. La comprobación paginada exige ver el principio de la nueva oración; un fragmento final visible ya no basta. Esta ampliación detectó un caso que la prueba anterior, con un párrafo por oración, no cubría.

```sh
bun apps/web/scripts/read-listen-highlight-e2e.ts packed
```

Resultado de esta matriz específica: **1090 comprobaciones aprobadas, cero fallos**. El texto anterior describe el caso reproducido en dos columnas; no demuestra que todos los fallos de cambio de página tengan esa misma causa.

La matriz conjunta de navegación, incluidos los párrafos largos, pasó **1858 comprobaciones** después de corregir el desplazamiento de dos columnas.

Después se reprodujo y corrigió por separado la suspensión por movimiento táctil mínimo en una columna. La matriz de gestos cubre una columna, dos columnas y Tategaki en las cinco resoluciones: comprueba que el movimiento mínimo mantiene el seguimiento, que un deslizamiento reconocido lo pausa y que reanudarlo vuelve a mostrar la oración activa.

```sh
bun apps/web/scripts/read-listen-highlight-e2e.ts touch
```

Resultado: **340 comprobaciones aprobadas, cero fallos**, con eventos táctiles sintéticos sobre los manejadores reales del lector. Tras esta última corrección también pasaron 39 pruebas unitarias de seguimiento, bindings y runtime, la comprobación de tipos, Biome y `git diff --check`. La matriz conjunta de 1858 comprobaciones se ejecutó antes de añadir esta corrección táctil; no se presenta como una repetición posterior.

## Corrección posterior: carga infinita y reproducción sin interacción

El usuario aclaró que el fallo de página ocurre durante reproducción normal, sin tocar el lector. La corrección de gestos anterior no explica ese caso y no se considera su resolución.

### Carga infinita introducida durante esta investigación

La guarda de inicialización `renderGeneration > 0` confundía el incremento de limpieza de un efecto con una navegación solicitada durante el montaje actual. Al reiniciarse los efectos, se omitía cargar la primera sección y quedaba visible el indicador de carga indefinidamente. La guarda compara ahora con la generación al iniciar ese efecto, conservando la prioridad de una navegación nueva sin saltarse la carga tras un reinicio.

Reproducción: `bun test apps/web/src/features/reader/renderers/paginated/book-reader-paginated.test.tsx`. La prueba de reinicio con StrictMode falló con contenido vacío e indicador visible antes de la corrección; después pasaron las ocho pruebas del archivo.

### Oración resaltada fuera de pantalla con ruby

Una oración con `<ruby>山々<rp>（</rp><rt>やまやま</rt><rp>）</rp></ruby>` se resolvía correctamente para el resaltado, pero no para la navegación. La búsqueda del lector incluía los paréntesis auxiliares `rp`, ausentes de la oración narrada. Al no encontrarla, no desplazaba la página. Esto reproduce el síntoma sin suspender el seguimiento ni introducir gestos.

La búsqueda de anclas ahora omite `rp`, manteniendo las coordenadas de progreso existentes. Una prueba de ancla falló antes con `undefined` en lugar de la posición 2 y pasó tras el cambio. La prueba de navegador a 390 × 844 y una columna también falló antes: la oración 7 estaba resaltada a x=414, fuera del viewport.

La nueva variante `ruby` incluye reproducción de un WAV silencioso mediante un elemento de audio real. Sus eventos `timeupdate` alimentan el resolvedor de timeline de producción y el componente de seguimiento, durante 64 oraciones y un cruce de capítulo, sin pulsar siguiente ni buscar posiciones durante la reproducción. Se ejecuta a velocidad 4×. No equivale a reproducir el audiolibro del usuario ni monta el contexto completo del reproductor.

```sh
bun apps/web/scripts/read-listen-highlight-e2e.ts ruby
```

El enlace al libro concreto proporcionado por el usuario redirigió a `/login` en el navegador integrado. La comprobación de ese EPUB y su narración queda pendiente de una sesión autenticada; no se atribuye el fallo de ese libro al ruby sin inspeccionarlo.

Validación de las dos correcciones posteriores: 44 pruebas unitarias aprobadas (lector paginado, anclas, bindings y runtime), tipos y Biome sin errores. La matriz de ruby con reloj de audio pasó 1202 comprobaciones en las cinco resoluciones y tres disposiciones. Una repetición móvil de una columna, endurecida para exigir la oración capturada antes de esperar (sin aceptar otra posterior), pasó 90 comprobaciones.
