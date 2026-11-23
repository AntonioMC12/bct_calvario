# Seguimiento del desarrollo

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
