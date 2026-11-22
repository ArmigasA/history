# Revisión de seguridad del sitio

Revisión estática de los archivos de Inicio y Partes I–III. La URL pública no pudo inspeccionarse desde el lector web de esta sesión, así que no se verificaron sus cabeceras HTTP actuales.

## Protecciones añadidas

- Política CSP en cada página: scripts solo desde el propio sitio, sin objetos, formularios solo al mismo origen, imágenes locales o cargadas por el editor como datos, y actualización de solicitudes inseguras a HTTPS.
- Política de referencia `strict-origin-when-cross-origin`.
- JavaScript separado del HTML para que la CSP pueda bloquear scripts incrustados.
- El editor restaura textos mediante `textContent`; el texto guardado no se interpreta como HTML.
- Colores limitados a valores hexadecimales, tamaños entre 12 y 36 px e imágenes PNG, JPEG o WebP de hasta 1,5 MB. Se rechaza SVG.
- Consentimiento funcional explícito. No hay analítica ni publicidad. La preferencia puede cambiarse desde el pie de página; las cookies usan `SameSite=Lax` y `Secure` bajo HTTPS.
- Enlaces externos con `noopener noreferrer`.

## Límites pendientes del alojamiento

GitHub Pages publica archivos estáticos y no ejecuta un servidor que autentique al editor. La contraseña del modo editor se comprueba en el navegador y solo oculta la interfaz; no protege frente a alguien que inspeccione o modifique el JavaScript. Los cambios editoriales quedan en el almacenamiento local del navegador y no se publican en GitHub.

Las cabeceras HTTP como HSTS, `X-Content-Type-Options`, `X-Frame-Options` y CSP entregada como cabecera no se pueden establecer desde una etiqueta HTML. Para una protección de acceso y publicación multiusuario se necesita un servicio de autenticación y escritura del lado del servidor. En GitHub Pages, un administrador también debe revisar que HTTPS esté forzado en la configuración del repositorio.

La CSP permite estilos en línea porque el editor y los efectos posicionan elementos en tiempo real; no permite JavaScript en línea. Google Fonts sigue siendo una solicitud a un tercero y se informa en el panel de privacidad.
