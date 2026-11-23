# BCT Calvario

Base inicial de la aplicación. Esta primera entrega muestra únicamente **Hola mundo**.

## Arranque local

Requisito: Node.js 24 o superior. No hay dependencias externas ni hace falta ejecutar `npm install`.

```sh
npm start
```

Abre http://localhost:3000. Para reiniciar el servidor automáticamente al editarlo, usa `npm run dev`. El navegador se recarga manualmente. La variable opcional `PORT` permite cambiar el puerto.

## Arquitectura inicial

```text
index.html           Página de entrada
src/main.js          Entrada del comportamiento del cliente
src/styles.css       Estilos y colores iniciales
scripts/serve.mjs    Servidor HTTP local de desarrollo
docs/development.md  Estado y próximos pasos
AGENTS.md            Guía para agentes
```

Frontend estático con HTML, CSS y JavaScript nativos; servidor local con módulos integrados de Node.js. No se decide todavía el framework ni la arquitectura de backend. El servidor escucha únicamente en la interfaz local y no está preparado para producción.

## Comprobaciones

```sh
npm run check
```

Verifica la sintaxis de JavaScript. Comprueba también que la página carga y muestra el saludo al arrancar el servidor.

## Alcance

Sin autenticación, datos, API ni funcionalidades de negocio. Los PDF funcional y de marca v1.1 permanecen en la carpeta de documentación original, fuera de este repositorio. Su análisis e implementación quedan para la siguiente fase. Los colores iniciales proceden de la paleta local v1.1; la aplicación completa del manual de marca queda pendiente.

Repositorio: https://github.com/AntonioMC12/bct_calvario
