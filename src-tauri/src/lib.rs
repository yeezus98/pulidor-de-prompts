// Pulidor de Prompts — lado nativo de la app.
//
// El historial vive en un archivo JSON dentro de la carpeta de datos de la app
// (~/Library/Application Support/com.yeezus98.pulidordeprompts/historial.json).
// Esa carpeta está ligada al identificador de la app, no al archivo .app,
// así que reemplazar o actualizar la app no la toca.

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const EMPTY: &str = "{\"v\":2,\"chats\":[]}";

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn history_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("historial.json"))
}

/// Lee el historial. Si el archivo no existe, devuelve un historial vacío.
#[tauri::command]
fn load_history(app: tauri::AppHandle) -> Result<String, String> {
    let path = history_file(&app)?;
    if !path.exists() {
        return Ok(EMPTY.to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Guarda el historial de forma segura: escribe en un archivo temporal y luego lo reemplaza,
/// para que un corte a mitad de guardado no deje el historial dañado.
#[tauri::command]
fn save_history(app: tauri::AppHandle, data: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&data).map_err(|_| "Datos inválidos".to_string())?;
    let path = history_file(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Copia de respaldo del historial, por ejemplo antes de instalar una actualización.
#[tauri::command]
fn backup_history(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let path = history_file(&app)?;
    if !path.exists() {
        return Ok(());
    }
    let safe: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-')
        .collect();
    let backup = data_dir(&app)?.join(format!("historial-respaldo-{}.json", safe));
    fs::copy(&path, backup).map(|_| ()).map_err(|e| e.to_string())
}

/// Exporta el historial a la carpeta Descargas y devuelve la ruta del archivo.
#[tauri::command]
fn export_history(app: tauri::AppHandle, data: String) -> Result<String, String> {
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let path = dir.join("pulidor-historial.json");
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            load_history,
            save_history,
            backup_history,
            export_history
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Pulidor de Prompts");
}
