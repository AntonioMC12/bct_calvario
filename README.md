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
| `administracion@demo.invalid` | Gestión de solicitudes, eventos, asistencia, formaciones, partituras y avisos |
| `direccion@demo.invalid` | Gestión de solicitudes, eventos, asistencia, formaciones, partituras y avisos |

La base se reutiliza al volver a arrancar. Si necesitas otra contraseña de prueba, define `CALVARIO_DEMO_PASSWORD` en el entorno al iniciar la demo. Si ya existían las tres cuentas, se cambia su contraseña y se invalidan sus sesiones. `CALVARIO_DEMO_DB` permite crear una demo separada.

## Piloto en GitHub Pages y Supabase

La [aplicación del piloto](https://antoniomc12.github.io/bct_calvario/) se publica desde la raíz de la rama `gh-pages`. Pages sirve la PWA. La función `calvario-api` del proyecto Supabase `vsmmpccqaywetuiyhevm` ejecuta la API y conecta con el esquema privado `calvario`. El navegador almacena temporalmente la sesión del piloto en la pestaña. En desarrollo local, el servidor sigue usando su cookie HTTP-only.

Con Node.js 24 y la CLI de Supabase 3.3, genera ambos paquetes desde PowerShell en la raíz del repositorio. Utiliza una ruta de salida nueva en cada compilación.

```powershell
$env:CALVARIO_EDGE_URL = 'https://vsmmpccqaywetuiyhevm.supabase.co/functions/v1/calvario-api'
npm run build:pilot -- dist/piloto
npx supabase login
npx supabase db query --remote=vsmmpccqaywetuiyhevm --read-only "SELECT to_regnamespace('calvario') AS schema, to_regclass('calvario.schema_version') AS version_table;"
```

Si el esquema está libre, inicialízalo y despliega la función. Si ya existe, comprueba su versión y sus tablas antes de reutilizarlo.

```powershell
npx supabase db query --remote=vsmmpccqaywetuiyhevm --file dist/piloto/edge/schema.sql --yes
npx supabase functions deploy calvario-api --remote=vsmmpccqaywetuiyhevm --workdir dist/piloto/edge --use-api --yes
Invoke-RestMethod "$env:CALVARIO_EDGE_URL/health"
```

La comprobación devuelve `status: ready` cuando la función puede leer la versión del esquema. Crea la primera cuenta de administración con `npm run account` y la conexión privada a PostgreSQL descrita más abajo. Para publicar cambios en la PWA, copia el contenido de `dist/piloto/pages`, incluido `.nojekyll`, a la rama `gh-pages`. El paquete `dist/piloto/edge`, los secretos, los datos y los ficheros `.env` quedan fuera de Pages.

La función usa la conexión PostgreSQL del entorno Supabase. Si necesitas un pooler explícito o un certificado de CA, configura `CALVARIO_EDGE_DATABASE_URL` y `CALVARIO_DATABASE_CA_PEM` como secretos de la función. Para habilitar la entrega de correos en el piloto, configura `CALVARIO_RESEND_API_KEY` y un `CALVARIO_MAIL_FROM` con un remitente verificado. El acceso con Google utiliza las variables públicas de Firebase descritas abajo y el secreto `CALVARIO_FIREBASE_ADMIN_JSON` en la función. Los recordatorios y los reintentos de Web Push requieren programar una llamada `POST` a `/jobs` de la función con la cabecera `X-Calvario-Job` y el valor privado de `CALVARIO_JOB_SECRET`.

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
- `deployment/edge/` contiene el adaptador Supabase y su configuración de despliegue.
- `public/` contiene el escudo original, los iconos derivados y las fuentes Inter y Cinzel con sus licencias OFL.
- `docs/development.md` registra cobertura, pruebas y decisiones. `AGENTS.md` orienta las siguientes sesiones.

Queda validar el proxy y los proveedores reales de correo, Google y push en los dispositivos del piloto. Los demás pendientes se detallan en el seguimiento.
