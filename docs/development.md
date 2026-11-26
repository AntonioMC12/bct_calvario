# Seguimiento del desarrollo

El [estado y los pendientes de Calvario](estado-y-pendientes.md) recoge la cobertura actual y los requisitos añadidos el 26 de noviembre de 2026. Las entradas siguientes conservan el historial de cada entrega.

## 2026-11-26 · Acceso a pasar lista en el detalle del evento

- Dirección encuentra «Pasar lista» debajo del título, como acción principal junto a «Editar». Antes del inicio, su lugar muestra la hora de apertura. El ajuste es de interfaz y la caché de la PWA pasa a `v23`.
- En la demo se comprobaron la disposición a 320, 390 y 1280 px, el acceso a edición, la apertura de la lista con teclado y la vista de músico. Pasaron `npm run check` y las 30 pruebas de `npm test`.

## 2026-11-26 · Lista de presencia por convocatoria

- Dirección puede activar «Pasar lista» al crear o editar un evento. La opción viene marcada en ensayos nuevos. Las convocatorias existentes conservan la lista habilitada y las presencias registradas. Una lista con marcas de presencia debe mantenerse habilitada.
- El botón del evento abre el registro para todos los miembros activos, incluidos los que no tienen cuenta. En las convocatorias futuras muestra la hora a la que se abre la lista. Gestión agrupa las listas disponibles y las futuras. El informe usa los eventos iniciados y vigentes con lista habilitada y apila los campos de fecha en móviles estrechos.
- Se añaden las migraciones SQLite 006 y PostgreSQL 004 y el paquete `upgrade-from-v3.sql`. Pasaron `npm run check`, 30 pruebas generales y 26 de PostgreSQL local. Se ejecutó el SQL de instalación y de actualización desde PostgreSQL 3 en bases aisladas. En la demo se creó un ensayo, se registró presencia desde su detalle y se comprobó el informe a 320 px.

## 2026-11-26 · Partituras desplegables en el detalle de obra

- El detalle muestra una fila plegada por partitura con instrumento, voz, tamaño y estado. Al abrirla se ven el nombre del archivo y sus acciones. Las versiones anteriores conservan su propia sección y los permisos siguen aplicándose al listado y a las acciones.
- Los recursos de la PWA se revalidan al recargar con conexión y se sirven desde la caché cuando falla la red. La caché pasa a `v22`. Se probó en la demo una obra con tres partes, la apertura con teclado, el guardado con la fila abierta, los permisos por rol y la recarga sin conexión. Pasaron `npm run check` y las 29 pruebas.

## 2026-11-26 · Repertorio desplegable por obras

- Cada obra tiene una ficha desplegable con título, autoría y recuento de las partituras visibles. Las partes aparecen ordenadas por instrumento y voz. Dirección abre el catálogo completo por defecto y puede volver a «Mis partituras». El repertorio del músico mantiene el filtro de instrumento y voz. La ficha «Ver obra» permite consultar el detalle y, para Dirección, el historial de versiones.
- Se comprobó una obra ficticia con tres partes a 320, 512 y 1280 px, la apertura con teclado y el guardado sin conexión dentro de la ficha. Con una cuenta de músico solo se mostró su parte. Pasaron `npm run check` y las 29 pruebas. La caché de la PWA pasa a `v21`.

## 2026-11-26 · Legibilidad de Asistentes y Repertorio

- Asistentes muestra los filtros en dos columnas en móvil, con el recuento separado de la etiqueta. En Repertorio, las fichas de partitura reservan una fila completa para el instrumento, la voz y el estado y sitúan los botones debajo. Se comprobaron los filtros y el buscador de asistentes, y el ancho de las fichas a 320, 512 y 1280 px. Pasaron `npm run check` y las 29 pruebas. La caché pasa a `v20`.

## 2026-11-26 · Selectores y acciones superiores

- «Mes / Lista» ocupa todo el ancho del calendario. Se comprobó la alineación en las dos vistas a 320, 390, 512 y 1280 px. Pasaron `npm run check` y las 29 pruebas. La caché de la PWA pasa a `v19`.
- Avisos y Repertorio comparten el selector de ancho completo, con dos opciones del mismo tamaño y selección destacada. En móvil, «Nuevo aviso» y «Nuevo evento» llenan su fila. En Repertorio, la descarga queda debajo de las acciones de gestión y el buscador gana anchura en pantallas estrechas. Se probaron las tres pantallas a 320, 512 y 1280 px.

## 2026-11-26 · Botones de navegación y gestión

- «Ver calendario», «Ver todos», «Repertorio» y «Descarga por lotes» tienen fondo, borde e icono. En la demo se revisaron los tamaños de móvil y escritorio y se abrieron los cuatro destinos. La caché de la PWA pasa a `v18`.
- El mismo estilo se aplica a la edición de convocatorias, las fichas del Directorio y de Material, la sustitución de partituras y el regreso a Inicio desde un error. Se probaron en la demo las cuatro acciones de gestión. Pasaron `npm run check` y las 29 pruebas.

## 2026-11-26 · Acciones de Dirección en Repertorio

- «Cargar partituras» y «Validar partituras» aparecen juntas sobre los filtros, con iconos y jerarquía de botón principal y secundario. En móviles estrechos se apilan. Se verificaron los dos destinos y la vista de músico en la demo. Pasaron las 29 pruebas de `npm test`.

## 2026-11-26 · Asistencia desde Inicio y mapa de la convocatoria

- Los iconos y textos de «Asistiré» y «No asistiré» quedan centrados en ambos estados. Se comprobó en la demo tras seleccionar cada respuesta. Pasaron las 29 pruebas y la caché de la PWA pasa a `v17`.
- El próximo ensayo con respuestas abiertas permite indicar «Asistiré» o «No asistiré» directamente desde Inicio. Si antes hay otro evento, el ensayo tiene su propia tarjeta. Se reutilizan el guardado, la cola sin conexión y el cierre de respuestas de las convocatorias. El motivo opcional se edita en el detalle.
- El detalle incorpora un mapa de Google Maps con el lugar y la localidad de la convocatoria, seguido de los accesos a Mapas y al archivo de calendario. El punto de encuentro permanece como indicación de texto. El mapa requiere conexión y la caché de la PWA pasa a `v16`.
- Pasaron `npm run check` y las 29 pruebas de `npm test`. En la demo del navegador se enviaron ambas respuestas desde Inicio, se verificó la selección tras recargar y se comprobó que carga el mapa integrado.

## 2026-11-26 · Acceso adaptable y escudo de la banda

- El acceso presenta la portada y el formulario apilados en móvil y en dos columnas desde 840 px. La portada muestra el escudo vectorial facilitado y el nombre completo «Banda de Cornetas y Tambores del Santísimo Cristo del Calvario».
- Los campos de acceso, alta y recuperación usan al menos 16 px para evitar que Safari en iOS amplíe la página al enfocarlos. Se conserva el zoom manual. El escudo se sirve en el paquete del piloto y se precarga en la caché `v15`.
- Pasaron `npm run check`, las 29 pruebas de `npm test` y la compilación del piloto. La demo se comprobó en vistas de 320 a 1440 px, incluida una vista horizontal. Se probó el acceso, la visibilidad de la contraseña y la navegación a alta y recuperación. Queda pendiente probar el foco con el teclado de un iPhone físico.

## 2026-11-26 · Login Cinemático de Stitch

- El acceso reproduce la composición móvil de «Login Cinemático · CALVARIO» con la fotografía original de Stitch, la corona, Cinzel, Plus Jakarta Sans y el formulario marfil. En escritorio se centra el marco de la maqueta. Los indicadores del dispositivo los aporta el sistema. [Proyecto de Stitch](https://stitch.withgoogle.com/projects/5747176225622362011)
- Los campos y enlaces usan los métodos configurados en Calvario. El selector de recuerdo guarda solo el correo cuando se activa y se completa el acceso. Al desactivarlo se borra el correo guardado. El acceso con Google queda deshabilitado cuando el proveedor no está configurado.
- La fotografía y Plus Jakarta Sans se sirven desde el mismo origen y se incluyen en la caché `v14`. El paquete estático incorpora la licencia SIL OFL de la fuente. [Plus Jakarta Sans en Google Fonts](https://fonts.google.com/specimen/Plus+Jakarta+Sans)
- Pasaron `npm run check` y las 29 pruebas de `npm test`. La demo se comprobó en móvil y escritorio, con acceso, visibilidad de contraseña, recuerdo del correo, solicitud y recuperación. La publicación se inicia mediante `gh-pages`.

## 2026-11-26 · Renovación visual de Calvario

- RF09–RF15, RF17–RF24 y RF29–RF41. Se revisaron las 16 pantallas de [Calvario PWA Gestión Banda en Stitch](https://stitch.withgoogle.com/projects/5747176225622362011). Inicio, Calendario, Repertorio, Avisos, Perfil y las herramientas de Dirección comparten tipografía Inter, identidad en Cinzel, fondo marfil y acentos rojos y dorados. Las composiciones se adaptan al ancho de pantalla y muestran los estados, datos y permisos de la aplicación.
- El acceso usa un panel fotográfico con el escudo de la banda y un formulario con etiquetas visibles. La portada es una ilustración fotográfica generada con ImageGen e integrada como JPEG local en `public/login-hero.jpg`. La misma composición acompaña la solicitud, la recuperación y los estados de la cuenta.
- La navegación utiliza barra inferior en móvil y barra lateral en escritorio. Las animaciones de entrada y de interacción respetan `prefers-reduced-motion`. La foto se incluye en el paquete del piloto y en la caché `v13` de la PWA. El cambio no requiere migraciones.
- Pasaron `npm run check` y las 29 pruebas de `npm test`. Se revisó en navegador la demo aislada en móvil y escritorio, en tema claro y oscuro, con sesiones de músico y Dirección.
- El código de la entrega es `59fa4c5`. GitHub Pages publica `6a492ef` desde `gh-pages`. Se comprobó que la pantalla de acceso abre en la URL pública, que la portada y la caché `v13` coinciden con el paquete y que la API responde desde ese origen. [Despliegue de GitHub Pages](https://github.com/AntonioMC12/bct_calvario/actions/runs/45851380226)

<details>
<summary>Instrucción de ImageGen para la portada</summary>

> Use case: photorealistic-natural. Asset type: editorial photograph for the sign-in page of Calvario, a Spanish cornet and drum band. Primary request: a richly textured close-up of a polished brass Spanish marching cornet resting diagonally over folded black wool band uniform fabric with a restrained dark-crimson seam. Single instrument, authentic compact tubing and warm brass reflections. Style: premium editorial still-life photography, calm and contemporary, realistic materials. Composition: vertical 2:3, cornet centered slightly to the right, bell pointing towards the upper right, instrument visible in the middle half for a horizontal mobile crop, charcoal negative space in the lower third for overlaid web lettering. Lighting: soft directional late-afternoon stage light, deep garnet and near-black shadows, muted champagne-gold highlights. No people, logos, insignia, text, graphics, or watermarks.

</details>

## 2026-11-26 · Publicación del piloto con Dirección e inventario

- GitHub Pages publica `f35c9cf` desde `gh-pages` y sirve los archivos de la PWA con caché `v12`. El código de la entrega es `ab7f2df`.
- Supabase se actualizó del esquema 1 al 3 antes de desplegar `calvario-api`. Se guardó una copia lógica cifrada fuera de Git y se comprobó su restauración en PostgreSQL aislado, incluidas las huellas de los PDF.
- La API publicada devuelve `ready`, responde desde el origen de Pages y exige sesión para el inventario. Se conservaron los recuentos de miembros y archivos, y el esquema sigue privado. El asesor de seguridad de Supabase no detectó incidencias.
- Quedan por validar los proveedores reales de Google, correo y Web Push y completar la aceptación del piloto en dispositivos físicos.

## 2026-11-26 · Dirección, inventario y repertorio autorizado

- DP02 y RF01–RF08. Administración se integra en Dirección. La migración conserva los identificadores y las sesiones de las cuentas. Dirección vincula una solicitud de correo verificado o Google a una ficha sin cuenta al aprobarla. Se mantienen el perfil musical, la presencia, las asignaciones de material y la identidad de acceso.
- Dirección registra inventario por pieza, préstamos a miembros activos y devoluciones. Se rechazan préstamos simultáneos de la misma pieza y el archivo conserva el historial. El catálogo editable ofrece sugerencias de instrumentos, voces y géneros y admite los valores libres existentes.
- RF29–RF32 y CP07. Los músicos acceden a las partituras vigentes de su parte en el catálogo, por enlace directo y en ZIP. La app depura las descargas internas al actualizar el catálogo. Dirección puede sustituir un PDF y consultar las versiones anteriores. La sustitución se publica solo tras validar la nueva versión.
- Se añade `pdf-lib` para comprobar la estructura, el acceso a las páginas y el cifrado durante la carga. `fflate` genera el ZIP sin volver a comprimir los PDF y el servidor lo entrega leyendo un PDF cada vez. Los adjuntos de eventos mantienen su política de acceso.
- La migración SQLite 005 y la de PostgreSQL 003 conservan los datos. La compilación genera el esquema completo y las rutas de actualización desde PostgreSQL 1 y 2. La importación acepta copias SQLite 3, 4 y 5. La caché de la app pasa a `v12`.
- Pasaron `npm run check`, 29 pruebas generales y 25 de PostgreSQL local. Se ejecutaron el SQL de instalación y los dos SQL de actualización sobre bases aisladas. Deno comprobó el paquete Edge. En el navegador se verificaron inventario, catálogo, vinculación de solicitud, sustitución de PDF y el contenido de los ZIP completo y por selección. Quedan la configuración y la aceptación con el piloto real.

## 2026-11-26 · Miembros sin cuenta y directorio

- RF01, RF05, RF08 y RF22–RF24. Administración y Dirección pueden crear fichas sin cuenta desde Gestión → Directorio, editar los datos de músicos activos y darles de baja. Para dar de alta una ficha basta el nombre. Instrumento y voz son opcionales y siguen siendo texto libre hasta definir el catálogo (DP01).
- Las fichas sin cuenta se incluyen en presencia, informes y formaciones. Las usan las mismas referencias que las membresías con cuenta, con correo vacío en base de datos y acceso por contraseña deshabilitado. Los avisos se destinan a las cuentas activas. La baja conserva las anotaciones y revoca sesiones y enlaces temporales. Queda pendiente vincular una ficha a una futura solicitud de acceso sin duplicar el miembro.
- La migración SQLite 004 y la de PostgreSQL 002 conservan las referencias existentes. El paquete del piloto incluye `upgrade-from-v1.sql`. La importación acepta copias SQLite de las versiones 3 y 4. La caché de aplicación pasa a `v11`.
- Pasaron `npm run check`, 24 pruebas generales y 20 de PostgreSQL local. En navegador y con una demo aislada se creó y editó una ficha, se registró su presencia en un ensayo y se comprobó que seguía en el informe después de la baja.

## 2026-11-24 · Permisos de Administración y Dirección

- DP02. Administración y Dirección comparten los permisos de gestión en la interfaz y la API. Ambos roles pueden gestionar formaciones, asistencia, obras, partituras y avisos. Los motivos privados de ausencia son visibles para quien los escribió y para ambos roles de gestión. El informe de asistencia sigue siendo agregado.
- Los perfiles mantienen sus nombres y los músicos conservan sus permisos. El cambio no requiere migración y actualiza la caché de la PWA a `v10`.
- Se comprobó en navegador que ambos roles tienen las mismas herramientas y acceden a los motivos privados, con una cuenta de músico como control. Pasaron `npm run check`, 22 pruebas generales y 18 de PostgreSQL.

## 2026-11-24 · Carga de partituras por dirección

- RF31–RF32. Dirección puede entrar en Carga de partituras, crear obras y subir PDF en lotes. El catálogo de gestión muestra obras aún sin archivos para que puedan usarse como destino. Editar los datos de una obra existente sigue reservado a administración. Los PDF nuevos quedan privados hasta que dirección los valide expresamente.
- Se comprobó en navegador el recorrido completo de carga y validación por dirección, incluida la visibilidad para el músico después de validar. Pasaron `npm run check`, 22 pruebas generales y 18 de PostgreSQL. La caché de la PWA pasa a `v9`.

## 2026-11-24 · Selector de tema

- RF37–RF40. Perfil permite elegir tema Claro, Oscuro o Sistema. La preferencia se guarda en el navegador y se aplica antes de cargar los estilos. El modo Sistema sigue los cambios del dispositivo y la caché de la PWA pasa a `v8`.
- Se comprobaron los tres modos, la persistencia, la sincronización entre pestañas y el cambio sin conexión. Pasaron `npm run check` y las 21 pruebas de `npm test`.

## 2026-11-24 · Rediseño de las pantallas restantes

- RF01–RF08 y RF41. Acceso, solicitud, verificación, recuperación y estado de la cuenta usan el diseño de Calvario. Perfil reúne historial, descargas, ajustes y herramientas del rol. El directorio interno permite buscar componentes y las solicitudes conservan la verificación previa a la aprobación.
- RF21–RF28. Dirección dispone de un selector de convocatorias, lista de presencia con filtros y totales, e informe por fechas, tipo, instrumento y voz, con CSV e impresión a PDF. Hasta validar el alcance definitivo de DP05, el informe se reserva a dirección, excluye motivos y nombres, y cuenta parejas de evento y componente con alguna anotación. La tasa se calcula sobre la presencia comprobada. Administración puede reordenar filas de formación y descartar cambios antes de guardar.
- RF29–RF36. El repertorio agrupa por género y da acceso a las copias sin conexión. Administración puede crear y editar obras y cargar lotes de PDF. Dirección dispone de una cola de validación y un editor de comunicados con borrador durante la sesión, vista previa, convocatoria vinculada y recuento agregado de lecturas. Se mantiene como audiencia la banda activa y el seguimiento agregado se reserva a dirección mientras se valida DP10.
- Las maquetas son referencias de interfaz. La presencia conserva los estados oficiales de RF22 y se distingue de la intención. La difusión conserva el canal interno y el push opcional de RF36. Los cambios no requieren migración y actualizan la caché de la PWA a `v7`.
- Se verificaron los tres roles en navegador con una demo aislada: solicitud, directorio, formaciones, carga y validación de partituras, presencia, informe y exportación, publicación y lectura de avisos y descarga local. Pasaron `npm run check`, las 21 pruebas de `npm test` y las 17 de `npm run test:postgres`.

## 2026-11-24 · Rediseño de Inicio, Calendario y Detalle de evento

- RF09–RF15, RF17–RF24 y RF33–RF40. Las tres vistas siguen las propuestas de Calvario PWA Gestión Banda en Stitch. Inicio destaca la próxima convocatoria y muestra avisos pendientes y partituras acordes al instrumento. Calendario conserva las vistas Mes y Lista. Detalle reúne convocatoria, asistencia, asistentes y documentos.
- La navegación usa cinco destinos en móvil y una barra lateral en escritorio. Los avisos sin leer se cuentan con los datos de la sesión. Las acciones de administración y dirección conservan sus condiciones de rol, estado del evento y conexión. La interfaz usa recursos locales y actualiza la versión de la caché de la PWA a `v6`.
- Se verificaron en la demo aislada los tres roles, las vistas del calendario, el guardado de asistencia y su privacidad, la lectura de avisos, la apertura de PDF y la descarga ICS. También se comprobó la recarga sin conexión y la sincronización de una respuesta al volver a conectarse. Pasaron `npm run check` y las 19 pruebas de `npm test`.

## 2026-11-24 · Piloto alojado

- GitHub Pages sirve la [PWA del piloto](https://antoniomc12.github.io/bct_calvario/) desde `gh-pages`. La compilación publica una lista cerrada de recursos estáticos y configura la URL de Supabase. El manifiesto y el service worker respetan la ruta `/bct_calvario/`.
- Una Edge Function adapta la API de Calvario a Deno y reutiliza las consultas y las reglas de autorización. PostgreSQL conserva el esquema privado. Pages envía un identificador revocable de sesión en una cabecera. Las descargas privadas requieren la misma sesión.
- La prueba de integración genera los dos paquetes y verifica con PostgreSQL local el acceso desde Pages, el rechazo de otro origen, la autenticación y revocación de sesión y la URL de recuperación. Se comprobó la resolución de dependencias del paquete Edge con Deno.
- El esquema privado y la función `calvario-api` están desplegados en el proyecto `vsmmpccqaywetuiyhevm`. La comprobación de salud devolvió `ready`. Los roles `anon` y `authenticated` carecen de acceso al esquema y el asesor de seguridad de Supabase no notificó incidencias.
- Se comprobó el formulario publicado y, contra la API remota con el origen de Pages, el inicio de sesión de la cuenta ficticia de dirección, la consulta de su panel, el cierre y la revocación. Google, la entrega de correo y los trabajos programados de push requieren configuración y pruebas aparte.

## 2026-11-24 · Base de datos Supabase v0.5

- Se añadió PostgreSQL como opción del servidor y se conserva SQLite para desarrollo y demo. `pg` conecta al esquema privado `calvario` mediante TLS con certificado verificado. La API de Calvario conserva la autorización y Firebase sigue identificando a quienes usan Google.
- Las escrituras relacionadas se agrupan en transacciones. PostgreSQL usa un bloqueo de transacción para coordinar escrituras como cambios de asistencia y asignación de trabajos push. La demo sigue usando las transacciones SQLite.
- `db:setup` prepara el esquema, `db:check` prueba la conexión y `db:import` importa una copia SQLite de esquema 3 a un destino vacío. Verifica relaciones, recuentos y huellas de los PDF. Las sesiones, enlaces de uso único, suscripciones y envíos pendientes no migran.
- Las pruebas PostgreSQL usan PGlite como dependencia de desarrollo y pasan por el cliente de red `pg`. Cubren los flujos existentes y la recuperación de una cuenta y de su PDF tras importar. Falta ejecutar la comprobación de conexión contra el proyecto real y ensayar su copia y restauración.
- Los PDF permanecen en la base privada y consumen espacio de PostgreSQL. Moverlos a Supabase Storage requeriría trasladar los binarios y conservar el control de acceso del servidor.

## 2026-11-24 · Google y Web Push v0.4

- RF01–RF04 y RF41. Firebase Authentication verifica el acceso con Google. SQLite conserva el rol, el estado y el historial. Las cuentas existentes se vinculan solo tras confirmar su contraseña y seleccionar el mismo correo. Las altas nuevas completan su solicitud y pasan por aprobación. Las cuentas de baja no reciben sesión de Google.
- RF33–RF36. Cada dispositivo opta por push desde su perfil. La migración 003 añade las identidades y una cola persistente con reintentos. El aviso se escribe junto con la cola y sigue consultable si falla el envío. El texto de pantalla bloqueada es genérico. El cierre o la caducidad de la sesión retiran la suscripción y la lectura se confirma en la bandeja. Las copias de seguridad conservan identidades, pero limpiar sesiones también retira suscripciones y trabajos en cola.
- El SDK web de Firebase se carga desde su CDN solo cuando está configurado. El SDK Admin verifica las credenciales en servidor. `web-push` prepara el envío VAPID. Las dos integraciones son opcionales y los datos de la banda siguen en SQLite.
- Pasaron 16 pruebas automatizadas. En Chrome, con el proveedor simulado, se comprobó la vinculación, la entrada con Google, el alta y la baja de una suscripción push y la presentación del aviso por el service worker. Quedan por activar el proveedor de Google en un proyecto real, probar el envío Web Push en dispositivos físicos y validar el flujo de vinculación con dirección.

## 2026-11-23 · Correo técnico y acceso v0.3

- RF01–RF04. El alta nueva por contraseña requiere confirmar su correo antes de la aprobación. La migración SQLite 002 conserva el acceso y las solicitudes de v0.2. El correo verificado acredita el buzón y la aprobación sigue siendo tarea de administración o dirección.
- Los enlaces de confirmación y recuperación se canjean mediante una acción explícita. Los tokens se almacenan como huellas. La caducidad de prueba es de 24 horas para confirmar y 30 minutos para recuperar. La recuperación responde igual para direcciones existentes y desconocidas, invalida enlaces y sesiones, y conserva rol e historial.
- Nodemailer es la primera dependencia de ejecución. Se usa para SMTP con TLS cuando se configura un proveedor. La demo usa archivos de buzón y las pruebas usan destinatarios ficticios. La aplicación admite un origen HTTPS configurado detrás de un proxy que entrega la cabecera `Host`. El servidor sigue escuchando en la interfaz local.
- Pasaron 12 pruebas automatizadas. En Chrome se recorrió el alta, confirmación desde el buzón, aprobación, cambio de contraseña y revocación de la sesión anterior. El dominio real, las credenciales SMTP y la entrega con un proveedor quedan por validar en el piloto.
- Siguiente entrega de acceso. Cerrar DP16 y conectar Google, conservando una sola membresía por persona. El envío push sigue pendiente y se mantiene separado del correo técnico.

## 2026-11-23 · Primer núcleo funcional

Las referencias de producto son la ERF 1.1, el manual de marca 1.1 y el brief de pantallas 1.0. Los PDF se conservan en la carpeta de documentación original. Se sigue la matriz confirmada de la ERF. Los valores de trabajo sujetos a DP sirven para desarrollo y prueba con datos ficticios.

### Cobertura actual

| Área | Implementación local | Pendiente de aceptación o desarrollo |
| --- | --- | --- |
| RF01–RF08, RF41 · Acceso | Solicitud, confirmación de correo, aprobación o rechazo, autenticación local y recuperación, sesiones y separación de roles, contactos restringidos, retirada de acceso mediante CLI local. | Entrega con SMTP real, catálogo y edición de perfiles, Google y vinculación, reglas de baja desde la app. DP01, DP02, DP12 y DP16. |
| RF09–RF15 · Eventos | Mes y lista, ficha, creación, edición, cancelación, avisos automáticos, PDF privado, mapas y copia ICS. | Validar campos, importación ICS en los calendarios del piloto y política de documentos. DP04 y DP09. RF16 permanece como propuesta. |
| RF17–RF24 · Asistencia | Tres estados de intención y motivo privado, lista con filtros, corrección por dirección, presencia separada, historial propio y resumen para dirección. | Validar periodos de corrección, lectores del informe y formato de exportación. DP03 y DP05. |
| RF25–RF28 · Formaciones | Edición por administración, 1–12 columnas y hasta 240 posiciones, mover o intercambiar, advertencia de retiradas, guardado con versión, copia independiente y plantillas de posiciones. | Validar visibilidad, rango y contenido de plantillas. DP02, DP06 y DP07. |
| RF29–RF32 · Partituras | Catálogo buscable por título, autoría y género, selección personal por instrumento y voz, lote con resultado individual, PDF privado y validación de distribución por dirección. | Reglas de sustitución y versiones, límites reales del archivo y validación de estructura completa del PDF. DP08 y DP09. |
| RF33–RF36 · Avisos | Bandeja, publicación manual por dirección, audiencia activa, confirmación de lectura y recordatorio interno configurable. | Web Push, seguimiento agregado y política de audiencias. DP10. |
| RF37–RF40 · PWA | Pantallas adaptables, manifiesto, recursos públicos guardados, datos recientes, partituras guardadas por cuenta, cola de intención, reintento con versión, indicador de conflicto y limpieza al cerrar sesión. | Validar límites, instalación, actualización, caducidad y almacenamiento en dispositivos reales. DP03, DP11 y DP12. |

### Decisiones de desarrollo

- JavaScript nativo y Node.js 24 con el módulo SQLite integrado para ejecutar el núcleo de forma reproducible. Los PDF se guardan privados en SQLite, junto con su huella y estado. El alojamiento y los proveedores siguen pendientes en DP13.
- Los roles excluyentes aplican el mínimo de la matriz. Solo administración edita formaciones y carga partituras. Solo dirección corrige a otros, registra presencia, publica avisos y valida partituras. Los responsables se aprovisionan mediante CLI local, sin asignación de roles desde la interfaz. La baja operativa se limita a músicos.
- Se guardan instantes UTC y se muestran en Europe/Madrid. Los cambios propios se aceptan hasta el inicio según la hora del servidor y se cierran en una cancelación. El servidor rechaza versiones en conflicto. Un reintento de la última operación aceptada recibe el mismo resultado sin escribir de nuevo. Como regla de prueba, la presencia puede registrarse desde que empieza un evento sin cancelar.
- Los adjuntos son PDF de hasta 5 MiB. Un lote admite hasta 20 PDF y conserva el resultado por archivo. Se detectan duplicados por contenido y asignación. La distribución del archivo musical requiere validación del director.
- El recordatorio es opcional y su formulario propone 120 minutos al activarlo. Se aplica solo a eventos sin cancelar y todavía futuros. Cambiar el inicio o la antelación recalcula la programación. La lectura requiere confirmación expresa.
- Para la prueba local, la instantánea offline se puede abrir durante 24 horas. Incluye eventos de los últimos 30 y próximos 90 días, hasta 50 avisos de los últimos 30 días y el catálogo publicado. Se pueden guardar hasta 20 partituras por cuenta. La sesión se revisa al reconectar. Una salida sin red retira los datos de la app y revoca la sesión en servidor al recuperar conexión. Las copias exportadas quedan bajo control de quien las descargó.
- Paleta roja y negra normalizada, neutros cálidos, escudo original, Inter funcional, Cinzel en la marca, navegación inferior móvil y lateral en escritorio. Los iconos de instalación se derivan del escudo, manteniendo proporción y colores.

### Verificación

- `npm run check` y `npm test` validan sintaxis y ocho recorridos de integración HTTP. Incluyen cuentas pendientes e inactivas, roles separados, privacidad de motivos y archivos, reintentos, reversión de una lista de presencia inválida, concurrencia de formación, recordatorios y lectura individual de avisos.
- Chrome en escritorio y con tamaño de pantalla móvil. Se probaron el acceso, la consulta y el filtrado de asistentes, la asistencia en línea y en modo avión, la recarga sin red, la sincronización, el conflicto con una corrección de dirección, la lectura de avisos, el PDF en línea y guardado, la salida sin red con limpieza local, la formación y la aprobación de altas.
- Se comprobó la integridad de una copia de la demo con miembros, eventos y PDF. La copia no incluye sesiones activas.

### Siguiente fase

1. Validar las DP de acceso, roles, asistencia y archivos con dirección. Mantener AM01–AM04 y RF16 en el alcance propuesto.
2. Preparar proveedor de identidad y correo técnico, HTTPS, almacenamiento y entorno de piloto. Incorporar el envío push con una cola de trabajo y conservar la bandeja interna.
3. Ejecutar el piloto CP01–CP14 en los dispositivos acordados, incluida la instalación en iOS y Android, el manejo de conflictos y la restauración operativa.

## 2026-11-23 · Base inicial

Commit `baf75c2`. «Hola mundo», servidor de desarrollo sin dependencias, README, exclusiones de Git y guía para agentes. Subido a `main`.
