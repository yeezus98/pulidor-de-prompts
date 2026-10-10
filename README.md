# Pulidor de Prompts

App de Mac para optimizar prompts para Claude. Funciona sin internet y sin IA: un motor de reglas basado en las buenas prácticas de Anthropic detecta qué le falta a tu pedido, te pregunta lo necesario y arma el prompt con la estructura Contexto · Tarea · Entrega.

## Instalar

1. Ve a [Releases](https://github.com/yeezus98/pulidor-de-prompts/releases/latest) y descarga el archivo `.dmg`.
2. Ábrelo y arrastra **Pulidor de Prompts** a **Aplicaciones**.
3. La primera vez macOS la bloquea porque no tiene firma de Apple. Ábrela una vez, luego ve a **Configuración del Sistema → Privacidad y seguridad** y toca **Abrir igualmente**.

Si macOS dice que la app "está dañada", abre Terminal y ejecuta:

```
xattr -cr "/Applications/Pulidor de Prompts.app"
```

## Actualizar

No hace falta descargar nada: la app avisa cuando hay una versión nueva, se actualiza sola y conserva el historial. También puedes buscar actualizaciones desde el panel de historial.

## Dónde se guarda el historial

`~/Library/Application Support/com.yeezus98.pulidordeprompts/historial.json`

Ese archivo no se toca al actualizar. Antes de cada actualización la app guarda una copia (`historial-respaldo-<versión>.json`). Desde el panel de historial puedes exportarlo a Descargas o importar uno.

## Publicar una versión nueva (para desarrollo)

1. Cambia el número de versión en `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `package.json`.
2. Crea y sube la etiqueta: `git tag v0.2.0 && git push origin v0.2.0`.
3. GitHub compila la app en la pestaña **Actions** y publica la versión en **Releases**.

Requiere el secreto `TAURI_SIGNING_PRIVATE_KEY` en **Settings → Secrets and variables → Actions**. Sin esa llave no se pueden publicar actualizaciones.

## Estructura

- `src/index.html`: la interfaz y el motor de reglas.
- `src-tauri/`: la app nativa (Tauri 2): guardado del historial, exportar y actualizaciones.
- `.github/workflows/release.yml`: compila y publica en GitHub.
