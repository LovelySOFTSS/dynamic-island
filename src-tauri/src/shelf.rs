//! Полка файлов: метаданные и иконка-превью для перетаскивания наружу.
//!
//! Сами файлы не копируются — на полке лежат ссылки (пути). Перетаскивание из
//! островка в другое окно делает `tauri-plugin-drag` через нативный drag-and-drop.

use std::{fs, path::Path};

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_image: bool,
}

const IMAGE_EXT: [&str; 7] = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico"];

/// Возвращает сведения только о существующих путях (удалённые файлы отсеиваются).
#[tauri::command]
pub fn file_info(paths: Vec<String>) -> Vec<FileInfo> {
    paths
        .into_iter()
        .filter_map(|path| {
            let meta = fs::metadata(&path).ok()?;
            let p = Path::new(&path);
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.clone());
            let is_image = p
                .extension()
                .map(|e| e.to_string_lossy().to_ascii_lowercase())
                .is_some_and(|e| IMAGE_EXT.contains(&e.as_str()));
            Some(FileInfo {
                name,
                size: if meta.is_dir() { 0 } else { meta.len() },
                is_dir: meta.is_dir(),
                is_image: is_image && !meta.is_dir(),
                path,
            })
        })
        .collect()
}

/// Плагину drag нужен путь к картинке-превью. Кладём встроенную иконку во
/// временную папку (один раз) и отдаём путь.
#[tauri::command]
pub fn drag_icon_path() -> Result<String, String> {
    const ICON: &[u8] = include_bytes!("../icons/drag.png");
    let path = std::env::temp_dir().join("dynamic-island-drag.png");
    if !path.exists() {
        fs::write(&path, ICON).map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
}
