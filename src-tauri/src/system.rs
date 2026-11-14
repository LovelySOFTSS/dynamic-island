//! Мини-мониторинг CPU/RAM.
//!
//! Никаких фоновых потоков: фронтенд сам вызывает команду раз в ~1.5 с и только
//! пока открыта вкладка «Инструменты». Островок свёрнут — вызовов нет.

use std::sync::Mutex;

use serde::Serialize;
use sysinfo::System;
use tauri::State;

pub struct SysState(pub Mutex<System>);

impl Default for SysState {
    fn default() -> Self {
        Self(Mutex::new(System::new()))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    /// Загрузка CPU, 0..100. Первый вызов после паузы возвращает 0 —
    /// sysinfo считает загрузку как разницу между двумя замерами.
    pub cpu: f32,
    /// Байты.
    pub mem_used: u64,
    pub mem_total: u64,
}

#[tauri::command]
pub fn get_system_stats(state: State<SysState>) -> SystemStats {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    SystemStats {
        cpu: sys.global_cpu_usage(),
        mem_used: sys.used_memory(),
        mem_total: sys.total_memory(),
    }
}
