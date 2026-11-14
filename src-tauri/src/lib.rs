//! Dynamic Island — бэкенд.
//!
//! Отвечает за:
//! * позиционирование прозрачного окна по центру верхней кромки монитора;
//! * click-through (см. `hit_test`);
//! * системную медиа-сессию (см. `media`);
//! * системные события: громкость, Bluetooth (см. `sys_events`);
//! * трей, глобальный хоткей, мониторинг CPU/RAM, полку файлов.

mod connect;
mod hit_test;
mod lyrics;
mod media;
mod shelf;
mod sys_events;
mod system;

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Логический размер окна. Должен совпадать с `tauri.conf.json`
/// и константами `WINDOW_W` / `WINDOW_H` во фронтенде.
pub const WINDOW_W: f64 = 440.0;
pub const WINDOW_H: f64 = 230.0;

/// Выбранный монитор: `None` — основной, `Some(i)` — индекс в списке мониторов.
struct MonitorSlot(Mutex<Option<usize>>);

/// Ставит окно по центру верхней кромки нужного монитора.
/// Отступ капсулы от края (10px) задаётся во фронтенде, само окно прижато к y = 0.
fn place_window(win: &WebviewWindow, slot: Option<usize>) -> tauri::Result<()> {
    let monitors = win.available_monitors()?;
    let monitor = match slot {
        Some(i) if !monitors.is_empty() => Some(monitors[i % monitors.len()].clone()),
        _ => win.primary_monitor()?.or_else(|| monitors.first().cloned()),
    };
    let Some(monitor) = monitor else {
        return Ok(());
    };

    let scale = monitor.scale_factor();
    let size = PhysicalSize::new(
        (WINDOW_W * scale).round() as u32,
        (WINDOW_H * scale).round() as u32,
    );
    let x = monitor.position().x + (monitor.size().width as i32 - size.width as i32) / 2;
    let y = monitor.position().y;

    win.set_size(size)?;
    win.set_position(PhysicalPosition::new(x, y))?;
    Ok(())
}

/// Переносит островок на следующий монитор по кругу.
fn next_monitor(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let monitors = win.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        return;
    }
    let state = app.state::<MonitorSlot>();
    let mut slot = state.0.lock().unwrap();
    let current = slot
        .or_else(|| {
            let primary = win.primary_monitor().ok().flatten()?;
            monitors
                .iter()
                .position(|m| m.position() == primary.position())
        })
        .unwrap_or(0);
    let next = (current + 1) % monitors.len();
    *slot = Some(next);
    let _ = place_window(&win, Some(next));
}

fn toggle_visibility(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
        }
    }
}

// ───────────────────────────── Команды ─────────────────────────────

/// Фронтенд сообщает прямоугольник капсулы (логические px относительно окна).
#[tauri::command]
fn set_hit_region(region: hit_test::Rect, state: State<hit_test::HitRegion>) {
    *state.0.lock().unwrap() = region;
}

#[tauri::command]
fn cycle_monitor(app: AppHandle) {
    next_monitor(&app);
}

#[tauri::command]
fn media_command(action: String, position_ms: Option<f64>, state: State<media::MediaHandle>) {
    let cmd = match action.as_str() {
        "toggle" => media::MediaCmd::Toggle,
        "next" => media::MediaCmd::Next,
        "prev" => media::MediaCmd::Prev,
        "seek" => media::MediaCmd::Seek(position_ms.unwrap_or(0.0)),
        "sync" => media::MediaCmd::Sync,
        _ => return,
    };
    let _ = state.0.lock().unwrap().send(cmd);
}

// ───────────────────────────── Запуск ─────────────────────────────

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Показать / скрыть", true, None::<&str>)?;
    let monitor = MenuItem::with_id(app, "monitor", "На следующий монитор", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &monitor, &quit])?;

    let mut tray = TrayIconBuilder::with_id("island-tray")
        .tooltip("Dynamic Island")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_visibility(app),
            "monitor" => next_monitor(app),
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_drag::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        // Ctrl+Shift+Space — закрепить/открепить раскрытый островок.
                        let _ = app.emit("island-toggle", ());
                    }
                })
                .build(),
        )
        .manage(MonitorSlot(Mutex::new(None)))
        .manage(hit_test::HitRegion::default())
        .manage(system::SysState::default())
        .manage(connect::ConnectState::default())
        .invoke_handler(tauri::generate_handler![
            set_hit_region,
            cycle_monitor,
            media_command,
            system::get_system_stats,
            shelf::file_info,
            shelf::drag_icon_path,
            connect::connectivity_snapshot,
            connect::radio_states,
            connect::set_radio,
            lyrics::fetch_lyrics,
        ])
        .setup(|app| {
            // macOS: без иконки в Dock.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            let win = app
                .get_webview_window("main")
                .expect("окно main не найдено в tauri.conf.json");

            // Позиция + click-through по умолчанию, и только потом показываем окно.
            place_window(&win, None)?;
            win.set_ignore_cursor_events(true)?;
            win.show()?;

            // При смене DPI / конфигурации мониторов пересчитываем позицию.
            {
                let handle = handle.clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::ScaleFactorChanged { .. } = event {
                        if let Some(win) = handle.get_webview_window("main") {
                            let slot = *handle.state::<MonitorSlot>().0.lock().unwrap();
                            let _ = place_window(&win, slot);
                        }
                    }
                });
            }

            build_tray(&handle)?;

            // Хоткей может быть занят другим приложением — это не повод падать.
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            if let Err(err) = app.global_shortcut().register(shortcut) {
                eprintln!("[island] не удалось зарегистрировать Ctrl+Shift+Space: {err}");
            }

            // Фоновые сервисы. Все они событийные (блокируются на ожидании),
            // кроме hit-test, который опрашивает курсор с адаптивным интервалом.
            hit_test::spawn(handle.clone());
            app.manage(media::spawn(handle.clone()));
            sys_events::spawn(handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("ошибка запуска Dynamic Island");
}
