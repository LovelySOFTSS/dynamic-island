//! Click-through.
//!
//! Окно больше капсулы (нужно место под раскрытие и тень), поэтому по умолчанию
//! оно полностью пропускает мышь: `set_ignore_cursor_events(true)`.
//! Но в таком режиме webview не получает `mouseenter`, и сам понять, что курсор
//! пришёл на капсулу, не может. Поэтому попадание считает этот поток:
//! сравнивает глобальную позицию курсора с прямоугольником капсулы, который
//! присылает фронтенд, и переключает режим только в момент пересечения границы.
//!
//! Интервал адаптивный: курсор далеко — 10 проверок в секунду (один системный
//! вызов, нагрузка неизмерима), курсор рядом или внутри — ~60 Гц для отзывчивости.

use std::{sync::Mutex, thread, time::Duration};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

/// Прямоугольник капсулы в логических px относительно левого верхнего угла окна.
#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Default for Rect {
    fn default() -> Self {
        // Капсула в покое: 120×32, по центру окна 440px, отступ 10px.
        Self {
            x: 160.0,
            y: 10.0,
            w: 120.0,
            h: 32.0,
        }
    }
}

#[derive(Default)]
pub struct HitRegion(pub Mutex<Rect>);

const NEAR: Duration = Duration::from_millis(8);
const FAR: Duration = Duration::from_millis(100);
const HIDDEN: Duration = Duration::from_millis(500);
/// В пределах этого расстояния (логические px) переходим на частый опрос.
const NEAR_DISTANCE: f64 = 140.0;

pub fn spawn(app: AppHandle) {
    thread::Builder::new()
        .name("island-hit-test".into())
        .spawn(move || {
            let mut inside = false;
            loop {
                thread::sleep(tick(&app, &mut inside));
            }
        })
        .expect("не удалось запустить поток hit-test");
}

/// Один шаг проверки. Возвращает паузу до следующего шага.
fn tick(app: &AppHandle, inside: &mut bool) -> Duration {
    let Some(win) = app.get_webview_window("main") else {
        return HIDDEN;
    };
    if !win.is_visible().unwrap_or(false) {
        return HIDDEN;
    }
    let (Ok(cursor), Ok(origin), Ok(scale)) = (
        win.cursor_position(),
        win.outer_position(),
        win.scale_factor(),
    ) else {
        return FAR;
    };

    let region = *app.state::<HitRegion>().0.lock().unwrap();
    let left = origin.x as f64 + region.x * scale;
    let top = origin.y as f64 + region.y * scale;
    let right = left + region.w * scale;
    let bottom = top + region.h * scale;

    let now_inside = cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom;

    if now_inside != *inside {
        *inside = now_inside;
        let _ = win.set_ignore_cursor_events(!now_inside);
        let _ = app.emit("island-hover", now_inside);
    }

    // Расстояние от курсора до прямоугольника (0, если внутри).
    let dx = (left - cursor.x).max(cursor.x - right).max(0.0);
    let dy = (top - cursor.y).max(cursor.y - bottom).max(0.0);
    if now_inside || dx.hypot(dy) < NEAR_DISTANCE * scale {
        NEAR
    } else {
        FAR
    }
}
