# Calvario

PWA para la Banda de Cornetas y Tambores Santísimo Cristo del Calvario. La versión 0.2 es una entrega local con cuentas por correo y contraseña, gestión de convocatorias, asistencia, avisos, formaciones y partituras privadas.

## Probar con datos ficticios

Con Node.js 24, ejecuta:

```sh
npm run demo
```

Abre [localhost:3000](http://localhost:3000). El primer arranque crea `data/demo.sqlite` y muestra una contraseña aleatoria para las tres cuentas de prueba.

| Cuenta | Permisos de prueba |
| --- | --- |
| `musico@demo.invalid` | Consultar, responder, descargar partituras y confirmar lectura |
| `administracion@demo.invalid` | Aprobar solicitudes, gestionar eventos, formaciones y carga musical |
| `direccion@demo.invalid` | Aprobar solicitudes y gestionar eventos, corregir intenciones, pasar lista, validar partituras y publicar avisos |

La base se reutiliza al volver a arrancar. Si necesitas otra contraseña de prueba, define `CALVARIO_DEMO_PASSWORD` en el entorno al iniciar la demo. Si ya existían las tres cuentas, se cambia su contraseña y se invalidan sus sesiones. `CALVARIO_DEMO_DB` permite crear una demo separada.

## Arrancar con una base vacía

```sh
npm start
```

El servidor escucha en la interfaz local. `PORT` cambia el puerto y `CALVARIO_DB` cambia el archivo de base de datos, que por defecto es `data/calvario.sqlite`. No hay dependencias de npm ni paso de compilación.

Para crear la primera cuenta de gestión en desarrollo, define `CALVARIO_PASSWORD` en un entorno privado y ejecuta uno de estos comandos:

```sh
npm run account -- provision admin@ejemplo.invalid admin "Administración"
npm run account -- provision direccion@ejemplo.invalid director "Dirección"
```

El resto de músicos puede solicitar acceso desde la propia aplicación. La retirada operativa de una membresía de músico en desarrollo se hace con `npm run account -- deactivate músico@ejemplo.invalid`. Conserva sus registros e invalida sus sesiones.

## Probar sin conexión

Abre la aplicación con una cuenta activa y deja que el navegador instale el service worker. Guarda una partitura desde Repertorio para consultarla luego en Perfil → Descargas. Desactiva la conexión, vuelve a abrir la app y responde a un evento futuro. La respuesta aparece como pendiente hasta que el servidor la acepta. Si la convocatoria se cierra o la respuesta ha cambiado, se conserva el cambio local para revisión.

El navegador puede ofrecer instalación como PWA. La disponibilidad depende del dispositivo y del navegador. Para trabajar sobre los recursos de la interfaz durante el desarrollo puedes desactivar temporalmente el service worker en las herramientas del navegador.

## Comprobar y respaldar

```sh
npm run check
npm test
npm run backup -- data/copias/calvario.sqlite
```

Las pruebas arrancan un servidor con SQLite en memoria y cubren permisos, alta, validaciones, asistencia, avisos, formaciones y PDF. El comando de copia guarda datos y documentos en un archivo nuevo, comprueba su integridad y deja fuera las sesiones. Para ensayar la restauración, arranca una instancia aislada con una **copia** del archivo en `CALVARIO_DB` y otro `PORT`.

## Código y seguimiento

- `src/` contiene vistas, componentes, fechas y datos sin conexión.
- `server/` contiene la API, la autorización, las reglas y la migración SQLite.
- `scripts/` contiene el servidor local, la demo, las cuentas operativas y la copia.
- `public/` contiene el escudo original, los iconos derivados y las fuentes Inter y Cinzel con sus licencias OFL.
- `docs/development.md` registra cobertura, pruebas y decisiones. `AGENTS.md` orienta las siguientes sesiones.

La preparación de producción, el acceso Google, el correo de recuperación y las notificaciones push siguen pendientes. El detalle del piloto está en el seguimiento.
