//! Связь: состояние сети и Bluetooth, переключатели радиомодулей Wi-Fi / Bluetooth.
//!
//! Состояние сети и список Bluetooth-устройств наполняют потоки из `sys_events`
//! (событийно) и кладут сюда; фронтенд читает снимок при старте и слушает события
//! `network-update` / `bluetooth-update`.
//! Радиомодули переключаются через WinRT `Windows.Devices.Radios` (только Windows).

use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkState {
    /// Есть ли подключение к интернету.
    pub connected: bool,
    /// Подключение идёт через Wi-Fi (иначе — кабель/модем).
    pub wifi: bool,
    /// Имя сети (для Wi-Fi — SSID).
    pub name: String,
    /// Уровень сигнала 0..5 (только Wi-Fi).
    pub bars: u8,
}

#[derive(Default)]
pub struct ConnectState {
    pub network: Mutex<NetworkState>,
    pub bluetooth: Mutex<Vec<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectSnapshot {
    pub network: NetworkState,
    pub bluetooth_devices: Vec<String>,
}

#[tauri::command]
pub fn connectivity_snapshot(state: State<ConnectState>) -> ConnectSnapshot {
    ConnectSnapshot {
        network: state.network.lock().unwrap().clone(),
        bluetooth_devices: state.bluetooth.lock().unwrap().clone(),
    }
}

/// `None` — такого радиомодуля нет (или ОС не Windows).
#[derive(Clone, Copy, Debug, Default, Serialize)]
pub struct RadioStates {
    pub wifi: Option<bool>,
    pub bluetooth: Option<bool>,
}

// `async` — чтобы блокирующие WinRT-вызовы шли в пуле потоков, а не в главном потоке.
#[tauri::command(async)]
pub fn radio_states() -> RadioStates {
    imp::states().unwrap_or_default()
}

#[tauri::command(async)]
pub fn set_radio(kind: String, on: bool) -> Result<RadioStates, String> {
    imp::set(&kind, on)?;
    Ok(imp::states().unwrap_or_default())
}

#[cfg(windows)]
mod imp {
    use windows::Devices::Radios::{Radio, RadioAccessStatus, RadioKind, RadioState};

    use super::RadioStates;

    fn radios() -> windows::core::Result<Vec<(Radio, RadioKind)>> {
        let list = Radio::GetRadiosAsync()?.get()?;
        let mut out = Vec::new();
        for i in 0..list.Size()? {
            let radio = list.GetAt(i)?;
            let kind = radio.Kind()?;
            out.push((radio, kind));
        }
        Ok(out)
    }

    pub fn states() -> Option<RadioStates> {
        let mut states = RadioStates::default();
        for (radio, kind) in radios().ok()? {
            let on = radio.State().map(|s| s == RadioState::On).unwrap_or(false);
            if kind == RadioKind::WiFi {
                states.wifi = Some(states.wifi.unwrap_or(false) || on);
            } else if kind == RadioKind::Bluetooth {
                states.bluetooth = Some(states.bluetooth.unwrap_or(false) || on);
            }
        }
        Some(states)
    }

    pub fn set(kind: &str, on: bool) -> Result<(), String> {
        let wanted = match kind {
            "wifi" => RadioKind::WiFi,
            "bluetooth" => RadioKind::Bluetooth,
            _ => return Err("неизвестный радиомодуль".into()),
        };
        let target = if on { RadioState::On } else { RadioState::Off };
        let run = || -> windows::core::Result<bool> {
            let _ = Radio::RequestAccessAsync()?.get()?;
            let mut found = false;
            let mut allowed = true;
            for (radio, radio_kind) in radios()? {
                if radio_kind == wanted {
                    found = true;
                    let status = radio.SetStateAsync(target)?.get()?;
                    allowed &= status == RadioAccessStatus::Allowed;
                }
            }
            Ok(found && allowed)
        };
        match run() {
            Ok(true) => Ok(()),
            Ok(false) => Err("Windows не дала переключить модуль".into()),
            Err(err) => Err(err.to_string()),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::RadioStates;

    pub fn states() -> Option<RadioStates> {
        None
    }

    pub fn set(_kind: &str, _on: bool) -> Result<(), String> {
        Err("переключение радиомодулей поддерживается только в Windows".into())
    }
}
