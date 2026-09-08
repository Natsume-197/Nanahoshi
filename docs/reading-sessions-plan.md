# Sesiones e historial de lectura

Plan de producto e implementación, 2026-09-05. Alcance web implementado siguiendo la dirección aceptada y la referencia visual de historial, evolución, relecturas y récords. Las secciones siguientes conservan las decisiones de diseño originales; el estado de entrega y sus límites se detallan a continuación.

## Estado de entrega

- Implementados esquema y tres migraciones, API autenticada, sincronización idempotente, lecturas y relecturas explícitas, segmentos con localizadores y procedencia del cierre.
- Integrados cronómetro y preferencias automático/manual/desactivado en el lector, pausas por inactividad y visibilidad, cola persistente sin conexión, recuperación tras cierre inesperado y coordinación entre pestañas. El seguimiento usa la posición visible independientemente del marcador manual de reanudación.
- Incorporados historial por libro y período, evolución de posición y tiempo, detalle diario, procedencia, registros retrospectivos y correcciones, descarte, lecturas anteriores y dos momentos destacados. Los saltos instantáneos actualizan la posición sin inventar tiempo.
- Implementada estimación de tiempo restante con muestras suficientes del mismo contenido, excluyendo navegación y duraciones declaradas. Los totales anteriores se conservan separados.
- Interfaz adaptada a móvil y escritorio, controles accesibles por teclado y traducciones en español, inglés y japonés.
- Verificación: comprobación de tipos del monorepo, compilación de producción, 33 pruebas unitarias de la función, 16 pruebas de integración con PostgreSQL y regresiones del lector. Pruebas Chromium con fixture de API para cronómetro, pausa manual, cola offline, saltos, recuperación tras caída del renderizador y coordinación entre pestañas. Diseño comprobado a 320, 375, 768 y 1440 píxeles con texto al 100 % y 200 %, navegación por teclado y restauración de foco. La visibilidad se emula en Chromium headless; no se ha realizado una auditoría manual con lector de pantalla.
- Fuera de esta entrega, como estaba previsto: conectores reales para KOReader/Kobo/aplicación nativa, estadísticas globales y predicción de fecha de finalización. Se conserva cliente, dispositivo y versión de contenido para admitir esos orígenes posteriormente. No se ha desplegado a producción.

## Objetivo

Permitir que cada persona registre sus sesiones de lectura, entienda cuánto tiempo dedicó y cómo avanzó en cada libro, y consulte una estimación de lectura restante. La experiencia debe acompañar la lectura sin exigir administrar un cronómetro.

## Experiencia propuesta

- Preferencia de cuenta: inicio automático, manual o registro desactivado. Propuesta inicial: automático, con explicación breve y acceso directo a cambiarlo. Desactivar el registro conserva el guardado de posición.
- Automático: empezar cuando el contenido esté listo, visible y haya interacción de lectura; no durante la carga. Manual: acción «Iniciar sesión». Ambos permiten pausar, reanudar y terminar.
- Encabezado: control compacto «12 min · +2 %»; al abrirlo muestra duración, posición inicial/actual y acciones. El avance se etiqueta como estimado. En móvil, detalles en panel inferior; en escritorio, popover anclado. Respetar el ocultamiento actual de los controles del lector.
- Pausar al ocultar el documento, bloquear la pantalla o salir del lector. Una pausa manual nunca se reanuda automáticamente. Como hipótesis a validar: pausar tras 5 minutos sin interacción y cerrar tras 30 minutos de ausencia; ofrecer ajuste del umbral porque leer una página larga no exige tocar la pantalla.
- Al volver de una pausa automática corta, reanudar con actividad de lectura. Tras una ausencia larga, abrir otra sesión en modo automático; en manual, pedir pulsar iniciar. Nunca contar la ausencia.
- Al terminar, mostrar un resumen discreto, sin modal obligatorio. Permitir descartar una sesión accidental.
- Ficha del libro: tiempo registrado, días de lectura, tiempo restante e historial diario. Ejemplo: «Lunes · 24 min · 3 % → 5 % · Web». Varias sesiones se despliegan dentro del día; no presentar los huecos entre sesiones como leídos.
- Evolución del libro en el tiempo, con vistas de posición y minutos por día, acompañada por historial textual accesible. Las estadísticas globales quedan para una segunda entrega.

## Dirección visual: historia de lectura, con detalle progresivo

La referencia aportada por el usuario inspira las capacidades, no su interfaz de tres columnas ni su densidad. El orden principal responde a «¿Dónde voy?», «¿Cómo he avanzado?» y «¿Qué leí cada día?».

1. **Resumen compacto:** posición actual y estado de la lectura, tiempo registrado y estimación restante. Fechas, promedio por sesión y número de sesiones pasan al detalle. Evitar una tarjeta independiente por cada métrica.
2. **Evolución como visual principal:** fechas en horizontal, posición de 0–100 % en vertical. Selector local «Posición / Tiempo» para cambiar a minutos diarios, evitando dos escalas superpuestas por defecto. Mostrar la lectura actual inicialmente; «Lecturas anteriores» permite explorar otras.
3. **Historial diario:** fecha, minutos y posición inicial → final. Una barra sobre la misma escala 0–100 % permite comparar dónde se leyó cada día. Si hay tramos separados, conservar sus huecos. Tocar un día despliega sesiones y origen; tocar una sesión muestra pausas, saltos y detalle.
4. **Lecturas anteriores y momentos destacados:** secciones secundarias plegadas, después del historial. No competir permanentemente con el gráfico mediante otra columna de indicadores.

En escritorio, usar una columna principal amplia con resumen horizontal; en móvil, mantener el mismo orden y permitir que el resumen se distribuya en filas. El historial se adapta a filas legibles, sin exigir desplazamiento horizontal de una tabla. Mostrar un período reciente inicialmente, con acceso al historial completo y carga incremental.

El gráfico debe funcionar al tocar y con teclado, con fecha, posición y tiempo disponibles también en texto. No depender de hover ni del color. Distinguir días sin lectura de períodos sin datos. Los puntos representan observaciones: no suavizar curvas ni dibujar lectura continua durante ausencias. Marcar saltos y cambios de lectura; no conectar el final de una lectura con el principio de la siguiente como si fuese un retroceso.

En días con varias sesiones, el resumen inicial/final describe posiciones, no cobertura. Los tramos del detalle y las etiquetas deben mantener esa distinción. Un retroceso se presenta como navegación o relectura, sin tratarlo como un fallo ni como «lectura negativa».

## Lecturas y relecturas

- Incorporar un nivel que agrupe sesiones: **Lectura del libro (Reading Run, término propuesto)**. Es un recorrido personal que puede contener muchas sesiones y durar días o meses. La primera se muestra como «Primera lectura»; las siguientes como «Segunda lectura», etc. Evitar «Intento», que sugiere una prueba que se puede fallar.
- Una lectura puede estar en curso, terminada o dejada. Pausar una sesión no termina ni deja la lectura del libro.
- «Volver a leer» crea explícitamente una lectura nueva y conserva las anteriores. Retroceder de posición, abrir un libro terminado o consultar un capítulo no crea por sí solo otra lectura. Ofrecer continuar la anterior o comenzar otra cuando corresponda.
- Las sesiones pertenecen a una lectura; una importación sin asociación fiable se mantiene como historial sin asignar hasta poder resolverla. No deducir quince lecturas solo porque la posición osciló quince veces.
- Mostrar resumen y estimación de la lectura seleccionada. Los totales de toda la historia deben etiquetarse como tales. Separar cobertura única por lectura de tiempo acumulado entre relecturas.
- Registrar la procedencia del cierre (usuario, regla automática o importación). El cierre automático legado al 90 % no debe fabricar una relectura ni afirmar que se recorrió el 100 %.

## Momentos destacados

Incluir en el primer alcance una sección secundaria con «Sesión más larga» y «Día con más lectura», con fecha y duración. Se calculan sobre la lectura seleccionada y solo con tiempo válido, sin duplicados, pausas ni registros descartados. Un día se calcula en la misma zona horaria del historial. En caso de empate, mostrar el más reciente.

No destacar récord de velocidad: la referencia muestra cambios de +94,8 % en segundos y un ritmo de 1634,2 %/h, que no permiten inferir lectura efectiva. Tampoco usar estos valores para estimar cuándo terminará el usuario. Rachas y objetivos siguen fuera del primer alcance; los momentos destacados son información opcional, sin presión ni celebraciones que interrumpan la lectura.

Permitir corregir o añadir una sesión olvidada desde una acción secundaria del historial. Etiquetarla como registro manual, distinguir duración declarada de observada y excluirla inicialmente de estimaciones y récords; sí puede sumar en el tiempo registrado con su procedencia visible. Este ingreso retrospectivo es diferente de iniciar manualmente el cronómetro.

## Significado de los datos

- **Sesión de lectura (Reading Session, propuesta):** registro personal persistente de una actividad de lectura en un libro y un cliente. Distinta de Playback Session, que el glosario actual define como telemetría efímera de administración.
- **Tiempo registrado:** suma de intervalos activos observados. Es una aproximación a la lectura, no una medición de atención.
- **Posición:** lugar inicial y final del libro; el porcentaje es su representación normalizada. Ir de 3 % a 15 % no demuestra haber leído todos los puntos intermedios.
- **Avance observado:** tramos recorridos durante lectura normal; separar navegación mediante índice, búsqueda, enlaces y saltos. Releer suma tiempo, pero no vuelve a sumar cobertura única. No llamar «porcentaje leído» al simple final menos inicio.
- **Origen:** cliente y dispositivo por separado. KOReader puede ejecutarse en Kobo: guardar ambos permite representarlo correctamente. Asumimos que «co-readers» se refiere a KOReader, pendiente de confirmar.

## Base técnica observada

- `packages/api/src/routers/reading-progress/`: posición y tiempo acumulado por usuario/libro. El repositorio suma segundos recibidos; un reintento de la misma operación puede volver a sumarlos.
- `apps/web/src/features/reader/interaction/use-reader-sync.ts`: envía intervalos de tiempo cada 45 segundos y al ocultar/cerrar. No establece aquí una pausa explícita de tiempo en segundo plano.
- `apps/web/src/features/reader/ui/chrome/reader-header.tsx`: encabezado adaptativo existente, con acciones secundarias agrupadas en pantallas pequeñas.
- El lector marca actualmente el libro como completado desde el 90 %. La estimación de tiempo debe distinguir ese estado del contenido restante; esta función no cambiará silenciosamente esa política.

## Persistencia y sincronización propuestas

1. Conservar progreso actual como posición de reanudación. Añadir sesiones y segmentos de lectura; no reconstruir historia a partir del total legado ni reutilizar telemetría administrativa.
2. Sesión: identificador generado en cliente, usuario autenticado, libro, versión/identidad del contenido, inicio/fin, estado, modo de inicio, cliente, identificador de instalación no sensible, descripción opcional del dispositivo y zona horaria IANA de registro. No copiar IP ni otros datos de auditoría.
3. Segmento: identificador/secuencia estable, fechas del intervalo activo, duración, posiciones normalizadas y localizadores originales, tipo de navegación y calidad/origen de medición. Dividir al pausar y periódicamente para recuperación y resúmenes diarios.
4. API autenticada e idempotente de crear, sincronizar segmentos, pausar/finalizar, listar, resumir y descartar. Validar propiedad y acceso al libro, duración, orden y rango. Una secuencia repetida no suma tiempo otra vez.
5. Cola local persistente para reintentos sin conexión. Contar duración con reloj monotónico; usar fechas para organización. Tras cierre inesperado conservar lo confirmado/localmente persistido y no inventar tiempo hasta la próxima apertura.
6. Una pestaña registra por instalación/libro. Resolver toma de control entre pestañas. Para dispositivos offline simultáneos, conservar registros de origen y excluir solapamientos del total de tiempo, señalando incertidumbre; no prometer exclusión global online para un dispositivo desconectado.
7. Evitar doble contabilización con el envío legado de segundos: el nuevo cliente deja de enviarlos al endpoint antiguo cuando registra segmentos. Mantener el total histórico anterior separado del historial nuevo. Cambios de posición siguen su ordenamiento actual.
8. Agrupar por zona horaria explícita, dividir tiempo al cruzar medianoche y no interpolar porcentajes que no se observaron. Guardar precisión desconocida como tal.
9. Las integraciones futuras pueden aportar solo posición, solo tiempo o sesiones completas. Conservar capacidad y procedencia; no inventar duración ni equivalencia entre porcentajes de ediciones distintas. Primera entrega: web; KOReader, Kobo y nativa requieren investigación e implementación independientes.
10. Historial privado del usuario, independiente de compartir actividad. Permitir eliminar registros personales y recalcular estadísticas derivadas.
11. Añadir la lectura del libro que agrupa sesiones desde la primera migración: usuario/libro, inicio, fin opcional, estado y procedencia. Crear una nueva lectura debe ser idempotente también. El histórico legado sin sesiones no se convierte en lecturas completas inventadas.
12. Las consultas de evolución, historial y récords aceptan la lectura seleccionada y el período. Ediciones incompatibles y datos manuales/incompletos conservan su procedencia; las correcciones y eliminaciones recalculan los resultados afectados.

## Estimación

- Primero: «Te quedan aproximadamente 3 h de lectura»; una fecha requiere además hábitos de frecuencia.
- Calcular tasa con tiempo y avance de segmentos válidos recientes de ese mismo libro/versión, excluyendo saltos, pausas y datos incompatibles. Usar una estimación robusta y redondeada; no extrapolar porcentajes por hora entre libros de diferente longitud.
- Hipótesis inicial de suficiencia: 3 sesiones válidas y 30 minutos acumulados con avance positivo. Antes: «Aún no hay suficientes datos». Ajustar con validación real; no presentar el umbral como estándar establecido.
- Más adelante, fecha aproximada basada en minutos diarios incluyendo días sin lectura, con ventana y zona horaria definidas. Mostrarla como condicional al hábito reciente.

## Entregas y aceptación

1. **Contrato y base de datos:** acordar términos, reglas y esquema; migración y API idempotente. Pruebas de propiedad, reintentos, concurrencia y compatibilidad del progreso legado.
2. **Sesiones web:** controlador compartido por presentaciones, cola local, automático/manual/desactivado y control del encabezado. Verificar pausas manuales, segundo plano, recarga, cierre abrupto, offline, pestañas y cambio de libro.
3. **Historial por libro:** resumen, evolución posición/tiempo, días y sesiones desplegables, origen, lecturas anteriores, dos momentos destacados, corrección/registro retrospectivo y estados vacíos. Verificar medianoche, zona horaria, saltos, retrocesos, relecturas explícitas, solapamientos, exclusión de datos manuales de estimaciones/récords y separación de curvas entre lecturas.
4. **Estimación:** datos insuficientes, lectura irregular, navegación extrema, libro completado al 90 % y cambios de archivo. Verificar que los datos excluidos no distorsionan la tasa.
5. **Validación de experiencia:** móvil estrecho y escritorio, zoom 200 %, teclado, lector de pantalla, controles ocultos y textos largos. El cronómetro no debe anunciar cada segundo ni desplazar el texto de lectura.
6. **Después:** estadísticas globales y conectores externos. No incluir rachas, objetivos o gamificación en el primer alcance.

## Referencias de diseño

- [KOReader User Guide](https://koreader.rocks/user_guide/): referencia de estadísticas de lectura y consideración de lectura después de medianoche; no prueba compatibilidad de integración.
- [Material: Responsive UI](https://m1.material.io/layout/responsive-ui.html): adaptación de la estructura al espacio disponible. Las decisiones concretas anteriores son propuestas para Nanahoshi y requieren validación.

## Contrato implementado del historial diario

`reading-statistics.ts` calcula tanto los totales como `days[].sessions`: tiempo aceptado por sesión y día, inicio local del intervalo y posiciones observadas en sus extremos. La interfaz consume esas filas sin volver a sumar segmentos completos; así, medianoche y solapamientos mantienen los mismos resultados en filas y totales. Los segmentos originales siguen disponibles para corregir la sesión completa. El resumen abarca toda la lectura seleccionada; el filtro de 30 días afecta al gráfico y a las filas.

El historial presenta un resumen compacto de toda la lectura (posición, tiempo, días, última actividad y estimación restante), la gráfica y un diario de días desplegables. Las sesiones, su origen y las acciones de corrección y descarte aparecen al abrir un día. El selector de período está junto a la gráfica y afecta tanto a ella como al diario; el resumen está etiquetado como total de la lectura. La gráfica muestra duración por defecto y conserva las distancias del calendario. El cursor o las flechas permiten explorar; pulsar un punto fija el día y abre sus sesiones, con una acción para llevar el foco al diario. La selección desde el diario también se refleja en la gráfica. Las posiciones desconocidas interrumpen la línea. `ReadingHistory` reinicia su estado al cambiar de libro y utiliza identificadores independientes cuando se abre también dentro del lector. El historial vacío permite registrar la primera sesión y el filtro sin resultados ofrece mostrar toda la lectura.

Validación reproducible desde `apps/web`: iniciar `bunx vite --config scripts/reading-sessions-preview.config.ts` y ejecutar `READER_E2E_BROWSER=/ruta/a/chrome bun run test:e2e:reading-sessions`. `READING_SESSIONS_E2E_URL` permite indicar otro puerto; `READING_SESSIONS_E2E_SCENARIOS=history-empty,history-old,layout-keyboard` selecciona las pruebas de interfaz. El fixture admite `?history=empty` y `?history=old`.

La vista previa contiene un diario determinista de 20 sesiones en 17 días: duraciones y horarios variables, días sin lectura, varias sesiones en un día, una relectura breve y una entrada manual sin posiciones. Estos datos son exclusivos del fixture. La gráfica conserva las distancias del calendario; las posiciones desconocidas interrumpen la línea. La selección muestra duración exacta y posición, con un único punto de entrada por Tab y navegación mediante flechas, Inicio y Fin.


## Integración del diario en el lector (2026-09-08)

- El control del encabezado muestra minutos mientras registra y un estado legible cuando está pausado, terminado, desactivado o activo en otra pestaña. Su ancho no cambia con los segundos y se oculta con el encabezado. Cuando no caben todos los controles, el encabezado permite otra fila; los botones conservan su tamaño al ampliar solo el texto.
- El panel distingue pausa manual, inactividad y salida del lector. Conserva las reglas de reanudación existentes. Los caracteres se presentan como aproximados y las preferencias incluyen la explicación de los saltos y las relecturas.
- Terminar una sesión conserva el tiempo y las posiciones finales como resumen, ofrece descarte y acceso al historial, y distingue finalización de sincronización. El descarte espera a que se confirmen las revisiones pendientes; si no se puede sincronizar o eliminar, conserva la sesión y permite reintentar. No se descartan registros offline de manera silenciosa.
- El panel muestra la actividad sincronizada de hoy en la lectura seleccionada. Abrir el historial desde el lector pausa una sesión activa, mantiene la posición y abre el diario en un diálogo. Al cerrarlo, el foco vuelve al control de sesión; la reanudación es explícita.
- Las preferencias quedan desplegables. Los mensajes distinguen fallos de almacenamiento local, registros guardados pendientes de sincronizar y fallos de sincronización.
- Las pruebas Chromium cubren el diario y su selección desde la gráfica, historial en el lector, cierre y descarte, teclado y foco, barra completa de herramientas y tamaños de 320, 375, 768 y 1440 px con texto al 100 % y 200 %. También comprueban que el propio panel no recorte horizontalmente el contenido. Las pruebas del reloj y tracker cubren las causas de pausa, el resumen estable y la conservación de sesiones si falla el descarte.
