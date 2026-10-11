# Pulidor de Prompts

App de Mac para optimizar prompts para Claude. Funciona sin internet y sin IA: un motor de reglas basado en las buenas prácticas de Anthropic arma el prompt con la estructura Contexto · Tarea · Entrega.

## Cómo se usa

1. Escribe lo que necesitas, como te salga.
2. Si falta información, la app te ofrece dos caminos:
   - **Responder preguntas**: hasta 3 preguntas rápidas, una por una, en el mismo chat. Puedes omitir cualquiera o tocar **Generar ya**.
   - **Generar prompt de todos modos**: te da el prompt con lo que hay y te dice aparte qué lo mejoraría.
3. Copia el prompt. Si escribes más detalles después, el prompt se actualiza.

Atajos: **Enter** envía, **Shift+Enter** salto de línea, **⌘N** nuevo prompt, **Esc** cierra paneles.

## Instalar

1. Ve a [Releases](https://github.com/yeezus98/pulidor-de-prompts/releases/latest) y descarga el archivo `.dmg`.
2. Ábrelo y arrastra **Pulidor de Prompts** a **Aplicaciones**.
3. La primera vez macOS la bloquea porque no tiene firma de Apple. Ábrela una vez, luego ve a **Configuración del Sistema → Privacidad y seguridad** y toca **Abrir igualmente**.

Si macOS dice que la app "está dañada", abre Terminal y ejecuta:

```
xattr -cr "/Applications/Pulidor de Prompts.app"
```

## Actualizar

La app avisa cuando hay una versión nueva, se actualiza sola y conserva el historial. También puedes buscar actualizaciones desde el panel de historial.

## Dónde se guarda el historial

`~/Library/Application Support/com.yeezus98.pulidordeprompts/historial.json`

Ese archivo no se toca al actualizar. Antes de cada actualización la app guarda una copia (`historial-respaldo-<versión>.json`). Desde el panel de historial puedes exportarlo o importarlo.

## Publicar una versión nueva (desarrollo)

1. Cambia el número de versión en `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `package.json`.
2. Sube los cambios a `main`. GitHub compila la app (pestaña **Actions**) y publica la versión en **Releases**. Si la versión ya existe, no hace nada.

Requiere el secreto `TAURI_SIGNING_PRIVATE_KEY` en **Settings → Secrets and variables → Actions**. Sin esa llave no se pueden publicar actualizaciones.

## Estructura

- `src/`: la interfaz (`index.html`, `styles.css`, `app.js`), el motor de reglas (`engine.js`) y las fuentes, incluidas para funcionar sin internet.
- `src-tauri/`: la app nativa (Tauri 2): historial, importar/exportar, portapapeles, tamaño de ventana y actualizaciones.
- `scripts/build-artifact.py`: genera la versión de un solo archivo para usarla como artefacto en Claude.
- `.github/workflows/release.yml`: compila y publica en GitHub.
