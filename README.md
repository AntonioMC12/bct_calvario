# Calvario

PWA para la Banda de Cornetas y Tambores Santísimo Cristo del Calvario. La versión 0.3 añade la confirmación de correo para altas nuevas y la recuperación de contraseña al núcleo de convocatorias, asistencia, avisos, formaciones y partituras privadas.

## Probar con datos ficticios

Con Node.js 24, instala las dependencias y arranca la demo.

```sh
npm ci
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

El servidor escucha en la interfaz local. `PORT` cambia el puerto y `CALVARIO_DB` cambia el archivo de base de datos, que por defecto es `data/calvario.sqlite`. Ejecuta `npm ci` tras clonar o actualizar las dependencias. La interfaz se sirve sin compilar.

Para crear la primera cuenta de gestión en desarrollo, define `CALVARIO_PASSWORD` en un entorno privado y ejecuta uno de estos comandos:

```sh
npm run account -- provision admin@ejemplo.invalid admin "Administración"
npm run account -- provision direccion@ejemplo.invalid director "Dirección"
```

El resto de músicos puede solicitar acceso desde la propia aplicación. Las altas nuevas confirman su correo antes de que administración o dirección las aprueben. La retirada operativa de una membresía de músico en desarrollo se hace con `npm run account -- deactivate músico@ejemplo.invalid`. Conserva sus registros e invalida sus sesiones.

## Confirmar un correo o recuperar la contraseña

En la demo, busca el mensaje para tu dirección en `data/demo-mailbox/` y abre el enlace en el navegador. Si arrancas con `npm start` sin SMTP, el buzón es `data/mailbox/`. Puedes cambiarlo mediante `CALVARIO_MAILBOX`. Los archivos del buzón contienen enlaces temporales de acceso y deben quedarse en el entorno local.

El enlace de confirmación caduca en 24 horas. Desde **¿Has olvidado la contraseña?** puedes pedir un enlace de recuperación que caduca en 30 minutos. Al cambiar la contraseña se invalidan los enlaces y las sesiones previas de esa cuenta.

Para preparar una instancia de piloto, usa `.env.example` como referencia. Configura `CALVARIO_PUBLIC_ORIGIN` con el origen HTTPS, `CALVARIO_SMTP_URL` con la conexión al proveedor y `CALVARIO_MAIL_FROM` con el remitente. El proxy debe terminar TLS y pasar la cabecera `Host` del origen público al servidor local. Arranca con `node --env-file=.env scripts/serve.mjs`. `smtp://` exige STARTTLS y `smtps://` usa TLS desde el inicio. La demo escribe siempre en archivos de prueba.

## Probar sin conexión

Abre la aplicación con una cuenta activa y deja que el navegador instale el service worker. Guarda una partitura desde Repertorio para consultarla luego en Perfil → Descargas. Desactiva la conexión, vuelve a abrir la app y responde a un evento futuro. La respuesta aparece como pendiente hasta que el servidor la acepta. Si la convocatoria se cierra o la respuesta ha cambiado, se conserva el cambio local para revisión.

El navegador puede ofrecer instalación como PWA. La disponibilidad depende del dispositivo y del navegador. Para trabajar sobre los recursos de la interfaz durante el desarrollo puedes desactivar temporalmente el service worker en las herramientas del navegador.

## Comprobar y respaldar

```sh
npm run check
npm test
npm run backup -- data/copias/calvario.sqlite
```

Las pruebas cubren migraciones, permisos, alta, recuperación, validaciones, asistencia, avisos, formaciones y PDF. El comando de copia guarda datos y documentos en un archivo nuevo y comprueba su integridad. Las sesiones y los enlaces de acceso no se restauran. Para ensayar la restauración, arranca una instancia aislada con una **copia** del archivo en `CALVARIO_DB` y otro `PORT`.

## Código y seguimiento

- `src/` contiene vistas, componentes, fechas y datos sin conexión.
- `server/` contiene la API, la autorización, las reglas y la migración SQLite.
- `scripts/` contiene el servidor local, la demo, las cuentas operativas y la copia.
- `public/` contiene el escudo original, los iconos derivados y las fuentes Inter y Cinzel con sus licencias OFL.
- `docs/development.md` registra cobertura, pruebas y decisiones. `AGENTS.md` orienta las siguientes sesiones.

Quedan por probar un proveedor SMTP real y el proxy del piloto. El acceso con Google, las notificaciones push y los demás pendientes se detallan en el seguimiento.
