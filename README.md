# Calvario

PWA para la Banda de Cornetas y Tambores Santísimo Cristo del Calvario. La versión 0.5 admite PostgreSQL en Supabase y conserva la demo SQLite. El núcleo incluye acceso con Google y Web Push configurables, recuperación de contraseña, asistencia, avisos, formaciones y partituras privadas.

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

## Conectar Supabase

1. Crea un proyecto de pruebas. En **Connect**, copia la cadena **Session pooler** del puerto 5432. También se admite la conexión directa si tu red tiene IPv6. Sustituye el marcador de contraseña y aplica codificación URL si contiene caracteres reservados.
2. Descarga el certificado desde **Database → Settings → SSL Configuration**. Define `CALVARIO_DATABASE_URL` y `CALVARIO_DATABASE_CA` en `.env`. Solo Node.js usa ese archivo. El servidor verifica el certificado y el nombre del servidor de Supabase.
3. Ejecuta `npm run db:setup` y `npm run db:check`. Las tablas se crean en el esquema privado `calvario`. Mantén ese esquema fuera de la lista de esquemas expuestos por la Data API.
4. Si partes de cero, crea una cuenta de gestión con `npm run account` como se indica arriba. Si quieres conservar datos, importa primero la copia SQLite.
5. Arranca con `npm start`. La consola debe indicar **Supabase PostgreSQL**. `npm run demo` sigue usando SQLite y sus cuentas ficticias.

Firebase sigue verificando el acceso con Google. Node.js aplica los permisos, sirve los PDF privados y envía Web Push. Los PDF permanecen en PostgreSQL y cuentan para la cuota de la base de datos. Supabase Storage sería una migración aparte.

### Migrar una base SQLite existente

Detén la instancia que escribe en SQLite durante el cambio o utiliza una copia coherente del archivo de esquema 3. Prepara primero un destino vacío con `npm run db:setup`, y luego ejecuta:

```sh
npm run db:import -- data/copias/antes-supabase.sqlite
```

La importación conserva las cuentas, las vinculaciones con Google, el historial, los avisos y los PDF. Comprueba las relaciones, verifica las huellas de los PDF y cancela la operación si hay un error o el destino contiene datos. Las sesiones, enlaces temporales y suscripciones push se vuelven a crear desde la app. Guarda la copia de origen hasta verificar el piloto.

## Confirmar un correo o recuperar la contraseña

En la demo, busca el mensaje para tu dirección en `data/demo-mailbox/` y abre el enlace en el navegador. Si arrancas con `npm start` sin SMTP, el buzón es `data/mailbox/`. Puedes cambiarlo mediante `CALVARIO_MAILBOX`. Los archivos del buzón contienen enlaces temporales de acceso y deben quedarse en el entorno local.

El enlace de confirmación caduca en 24 horas. Desde **¿Has olvidado la contraseña?** puedes pedir un enlace de recuperación que caduca en 30 minutos. Al cambiar la contraseña se invalidan los enlaces y las sesiones previas de esa cuenta.

Para preparar una instancia de piloto, usa `.env.example` como referencia. Configura `CALVARIO_PUBLIC_ORIGIN` con el origen HTTPS, `CALVARIO_SMTP_URL` con la conexión al proveedor y `CALVARIO_MAIL_FROM` con el remitente. El proxy debe terminar TLS y pasar la cabecera `Host` del origen público al servidor local. Arranca con `node --env-file=.env scripts/serve.mjs`. `smtp://` exige STARTTLS y `smtps://` usa TLS desde el inicio. La demo escribe siempre en archivos de prueba.

## Activar el acceso con Google

1. Registra una aplicación web en un proyecto de Firebase. En Authentication, activa Google en Métodos de inicio de sesión y autoriza el dominio de Calvario. Añade también `localhost` al proyecto de pruebas si vas a usarlo en ese equipo.
2. Pon el `projectId`, la `apiKey` pública y el `appId` de la aplicación web en las variables `CALVARIO_FIREBASE_*` de `.env`. El navegador usa el dominio de autenticación estándar del proyecto.
3. Da al servidor credenciales de aplicación de Google para ese proyecto. En desarrollo, puedes apuntar `GOOGLE_APPLICATION_CREDENTIALS` a un archivo privado fuera del repositorio. El servidor verifica la firma, el proyecto y el estado de revocación de la identidad antes de abrir una sesión de Calvario.
4. Arranca con `node --env-file=.env scripts/serve.mjs`. Para probar con los datos ficticios, usa `node --env-file=.env scripts/demo.mjs`.

Quien ya tenga cuenta inicia sesión con su contraseña y vincula el mismo correo desde **Perfil → Acceso con Google**. Quien use Google por primera vez completa nombre e instrumento y solicita acceso. Administración o dirección sigue aprobando las altas y las cuentas de baja conservan el bloqueo. La recuperación por correo de Calvario se aplica a sus cuentas con contraseña.

## Activar Web Push

Genera un par de claves VAPID con `npx --no-install web-push generate-vapid-keys --json`. Guarda ambas claves y un contacto `mailto:` en las variables `CALVARIO_PUSH_*` del servidor. Usa HTTPS en el piloto. El miembro elige **Perfil → Notificaciones → Activar en este dispositivo**. En iPhone y iPad, debe abrir Calvario desde la pantalla de inicio.

El servidor registra el aviso y encola su envío a las sesiones suscritas. El texto visible dice que hay un aviso nuevo en Calvario, sin mostrar los detalles de la convocatoria en la pantalla bloqueada. La lectura se confirma en la bandeja. Al cerrar sesión se retira la suscripción de esa sesión y, cuando caduca, hay que activar de nuevo los avisos. La demo deja desactivado el envío push real.

## Probar sin conexión

Abre la aplicación con una cuenta activa y deja que el navegador instale el service worker. Guarda una partitura desde Repertorio para consultarla luego en Perfil → Descargas. Desactiva la conexión, vuelve a abrir la app y responde a un evento futuro. La respuesta aparece como pendiente hasta que el servidor la acepta. Si la convocatoria se cierra o la respuesta ha cambiado, se conserva el cambio local para revisión.

El navegador puede ofrecer instalación como PWA. La disponibilidad depende del dispositivo y del navegador. Para trabajar sobre los recursos de la interfaz durante el desarrollo puedes desactivar temporalmente el service worker en las herramientas del navegador.

## Comprobar y respaldar

```sh
npm run check
npm test
npm run test:postgres
npm run backup -- data/copias/calvario.sqlite
```

Las pruebas cubren migraciones, permisos, alta, recuperación, validaciones, asistencia, avisos, formaciones y PDF. `npm run test:postgres` vuelve a ejecutar los flujos principales contra PostgreSQL local por el protocolo de red, sin conectarse a Supabase.

El comando `npm run backup` respalda SQLite y comprueba su integridad. Para ensayar su restauración, arranca una instancia aislada con una **copia** del archivo en `CALVARIO_DB` y otro `PORT`. Para Supabase, usa `pg_dump` con el esquema `calvario` y excluye los datos de `sessions`, `account_tokens`, `push_subscriptions` y `push_jobs`.

## Código y seguimiento

- `src/` contiene vistas, componentes, fechas y datos sin conexión.
- `server/` contiene la API, la autorización, las reglas y la migración SQLite.
- `scripts/` contiene el servidor local, la demo, las cuentas operativas y la copia.
- `public/` contiene el escudo original, los iconos derivados y las fuentes Inter y Cinzel con sus licencias OFL.
- `docs/development.md` registra cobertura, pruebas y decisiones. `AGENTS.md` orienta las siguientes sesiones.

Queda validar el proxy y los proveedores reales de correo, Google y push en los dispositivos del piloto. Los demás pendientes se detallan en el seguimiento.
