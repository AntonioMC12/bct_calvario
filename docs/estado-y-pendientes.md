# Estado y pendientes de Calvario

Actualizado el 26 de noviembre de 2026. Este fichero recoge el estado del repositorio y los requisitos añadidos desde la especificación funcional 1.1. El [seguimiento del desarrollo](development.md) conserva el historial de entregas y pruebas.

## Implementado

| Área | Disponible en el código |
| --- | --- |
| Acceso y miembros (RF01–RF08, RF41) | Acceso con contraseña o Google, verificación de correo, aprobación o rechazo y recuperación. El directorio permite crear fichas sin cuenta, vincularles una solicitud aprobada, editar datos de músicos activos y darles de baja conservando el historial. |
| Permisos (DP02) | Dirección es el único rol de gestión en la app, la API y la base de datos. La migración integra las cuentas de Administración conservando su acceso e historial. |
| Calendario y eventos (RF09–RF15) | Vistas Mes y Lista, ficha, creación, edición y cancelación de convocatorias, mapa, PDF adjuntos privados y exportación individual a calendario mediante ICS. |
| Asistencia (RF17–RF24) | Intención con motivo privado, correcciones por gestión, lista de presencia real independiente, historial propio e informe agregado con CSV e impresión a PDF. |
| Formaciones (RF25–RF28) | Cuadrícula editable por evento, copia de formaciones, plantillas de posiciones, confirmación al retirar asignaciones y control de ediciones simultáneas. |
| Repertorio (RF29–RF32) | Búsqueda por título y autoría, filtro por género, descarga individual, ZIP por lotes y guardado sin conexión. Dirección carga hasta 20 PDF por lote y 5 MiB por archivo. La app comprueba la estructura de los PDF. Dirección valida, publica y sustituye partituras, y conserva las versiones anteriores. |
| Material | Inventario de piezas por código, categoría y estado. Dirección registra préstamos y devoluciones, consulta el historial y puede archivar y restaurar piezas. |
| Avisos (RF33–RF36) | Bandeja, avisos manuales y automáticos, recordatorios configurables y confirmación de lectura con recuento agregado. Web Push y reintentos disponibles en el código con configuración del proveedor. |
| PWA y alojamiento (RF37–RF40, DP13) | Instalación como PWA, temas claro, oscuro y del sistema, consulta de datos recientes y partituras guardadas sin conexión. Las respuestas de asistencia pendientes se sincronizan al reconectar. Demo local con SQLite y piloto alojado en GitHub Pages con API y base PostgreSQL en Supabase. |

## Requisitos añadidos

### Miembros y gestión

- [x] **Dar de alta miembros sin cuenta (RF01, RF05, RF22–RF24).** Disponible desde **Gestión → Directorio → Añadir miembro**. La ficha aparece al pasar lista en ensayos y otros eventos y su presencia cuenta en los informes. Al aprobar una solicitud verificada se puede vincular la cuenta a la ficha existente.
- [x] **Añadir un apartado de gestión de material para Dirección.** Disponible desde **Gestión → Material**. El inventario registra piezas identificadas por un código. Se puede buscar, editar, prestar a miembros activos, registrar devoluciones y conservar cada movimiento en el historial.
- [x] **Unificar Administración y Dirección en un solo rol (DP02).** Las cuentas de Administración migran a Dirección con la misma identidad, permisos e historial.

### Partituras

- [x] **Limitar las partituras de cada músico a su instrumento y voz (RF30, CP07).** El catálogo, los enlaces directos y los ZIP usan la misma autorización para los PDF vigentes. Al actualizar los datos se retiran de las descargas internas las copias que dejen de corresponder. Este requisito sustituye el acceso de músicos a «Todas» previsto en la especificación 1.1.
- [x] **Carga masiva de partituras (RF31, CP07).** Ya disponible desde **Repertorio → Carga de partituras** para los perfiles de gestión. Queda validar con un lote representativo si los límites actuales cubren el volumen de la banda (DP09).
- [x] **Descarga masiva de partituras (RF30–RF32).** Disponible desde **Repertorio → Descarga por lotes**. Permite buscar y marcar varios PDF autorizados y descargarlos en un ZIP.
- [x] **Descargar todas las partituras de mi instrumento y voz (RF30).** **Descargar mis partituras** reúne en un ZIP todos los PDF vigentes del instrumento y la voz del músico, incluidas las partituras de distintas obras.

## Decisiones y validaciones pendientes

- [ ] **Perfiles y bajas (DP01, DP02, DP12).** Dirección puede editar las fichas, tramitar bajas y mantener las sugerencias de instrumento y voz. Queda acordar los valores oficiales del catálogo y los plazos de conservación de datos y descargas.
- [ ] **Asistencia y eventos (DP03–DP05).** Acordar plazos de respuesta y corrección, tratamiento de conflictos al sincronizar, alcance de los informes y visibilidad de la presencia real. Confirmar los campos de eventos y probar la importación de ICS en los calendarios del piloto.
- [ ] **Formaciones (DP06, DP07).** Definir qué formación ven los músicos, los límites de la cuadrícula, qué guardan las plantillas y cómo se tratan las bajas al copiar.
- [ ] **Archivo musical (DP08, DP09).** Dirección puede configurar sugerencias de géneros. La carga comprueba la estructura del PDF y la sustitución conserva la versión anterior al validar la nueva. Queda acordar géneros oficiales y validar el tamaño y volumen de carga y descarga con el repertorio real.
- [ ] **Avisos y contenido sin conexión (DP10–DP12).** Acordar audiencias, seguimiento de lectura, caducidad, límites de almacenamiento y tratamiento de copias que dejen de estar disponibles.
- [ ] **Piloto y operación (DP13, DP15, DP16).** Publicar con la migración a PostgreSQL 3, configurar y comprobar Google, correo y Web Push con los proveedores reales y programar recordatorios y reintentos. Completar las pruebas de aceptación aplicables (CP01–CP14) en iOS y Android físicos y ensayar una copia y restauración de Supabase.

Siguen como propuestas de alcance la designación de responsables desde la app (RF06), el repertorio ordenado por evento (RF16) y la documentación interna, fotos, vídeos y encuestas (AM01–AM04).
