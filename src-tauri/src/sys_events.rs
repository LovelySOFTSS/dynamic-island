//! Системные события: громкость, Bluetooth, сеть.
//!
//! Реализовано для Windows, все источники событийные (потоки спят, пока система
//! сама не сообщит об изменении):
//! * громкость — `IAudioEndpointVolumeCallback` устройства вывода по умолчанию;
//! * Bluetooth — `DeviceWatcher` по подключённым устройствам (классика и LE);
//! * сеть — `NetworkInformation::NetworkStatusChanged`.
//!
//! События во фронтенд:
//! * `island-notify`    — [`Notice`] для всплывающей пилюли;
//! * `network-update`   — `connect::NetworkState`;
//! * `bluetooth-update` — `Vec<String>` имён подключённых устройств.

use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    /// "volume" | "bluetooth" | "wifi"
    pub kind: &'static str,
    pub title: String,
    pub subtitle: Option<String>,
    /// 0..100 для громкости.
    pub value: Option<f32>,
    pub muted: Option<bool>,
}

#[cfg(windows)]
pub fn spawn(app: AppHandle) {
    use std::thread;

    {
        let app = app.clone();
        let _ = thread::Builder::new()
            .name("island-volume".into())
            .spawn(move || {
                if let Err(err) = win::watch_volume(app) {
                    eprintln!("[island] слежение за громкостью недоступно: {err}");
                }
            });
    }
    {
        let app = app.clone();
        let _ = thread::Builder::new()
            .name("island-network".into())
            .spawn(move || {
                if let Err(err) = win::watch_network(app) {
                    eprintln!("[island] слежение за сетью недоступно: {err}");
                }
            });
    }
    let _ = thread::Builder::new()
        .name("island-bluetooth".into())
        .spawn(move || {
            if let Err(err) = win::watch_bluetooth(app) {
                eprintln!("[island] слежение за Bluetooth недоступно: {err}");
            }
        });
}

#[cfg(not(windows))]
pub fn spawn(_app: AppHandle) {}

#[cfg(windows)]
mod win {
    use std::{
        collections::HashMap,
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc, Arc, Mutex,
        },
        thread,
        time::Duration,
    };

    use tauri::{AppHandle, Emitter, Manager};
    use windows::{
        core::{implement, IInspectable, Result, HSTRING},
        Devices::{
            Bluetooth::{BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice},
            Enumeration::{DeviceInformation, DeviceInformationUpdate, DeviceWatcher},
        },
        Foundation::TypedEventHandler,
        Networking::Connectivity::{NetworkInformation, NetworkStatusChangedEventHandler},
        Win32::{
            Media::Audio::{
                eConsole, eRender,
                Endpoints::{
                    IAudioEndpointVolume, IAudioEndpointVolumeCallback,
                    IAudioEndpointVolumeCallback_Impl,
                },
                IMMDeviceEnumerator, MMDeviceEnumerator, AUDIO_VOLUME_NOTIFICATION_DATA,
            },
            System::{
                Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
                WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
            },
        },
    };

    use super::Notice;
    use crate::connect::{ConnectState, NetworkState};

    // ── Громкость ──

    #[implement(IAudioEndpointVolumeCallback)]
    struct VolumeCallback {
        app: AppHandle,
    }

    impl IAudioEndpointVolumeCallback_Impl for VolumeCallback_Impl {
        fn OnNotify(&self, pnotify: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> Result<()> {
            // SAFETY: система передаёт валидный указатель на время вызова.
            if let Some(data) = unsafe { pnotify.as_ref() } {
                let _ = self.app.emit(
                    "island-notify",
                    Notice {
                        kind: "volume",
                        title: "Громкость".into(),
                        subtitle: None,
                        value: Some((data.fMasterVolume * 100.0).round()),
                        muted: Some(data.bMuted.as_bool()),
                    },
                );
            }
            Ok(())
        }
    }

    pub fn watch_volume(app: AppHandle) -> Result<()> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;
            let callback: IAudioEndpointVolumeCallback = VolumeCallback { app }.into();
            volume.RegisterControlChangeNotify(&callback)?;

            // COM-объекты должны жить, пока нужны уведомления: паркуем поток навсегда.
            loop {
                thread::park();
            }
        }
    }

    // ── Сеть ──

    fn read_network() -> NetworkState {
        let Ok(profile) = NetworkInformation::GetInternetConnectionProfile() else {
            return NetworkState::default();
        };
        NetworkState {
            connected: true,
            wifi: profile.IsWlanConnectionProfile().unwrap_or(false),
            name: profile
                .ProfileName()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            bars: profile.GetSignalBars().and_then(|r| r.Value()).unwrap_or(0),
        }
    }

    pub fn watch_network(app: AppHandle) -> Result<()> {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let (tx, rx) = mpsc::channel::<()>();
        NetworkInformation::NetworkStatusChanged(&NetworkStatusChangedEventHandler::new(
            move |_| {
                let _ = tx.send(());
                Ok(())
            },
        ))?;

        let mut last: Option<NetworkState> = None;
        loop {
            let now = read_network();
            if last.as_ref() != Some(&now) {
                if let Some(prev) = &last {
                    let wifi_now = now.connected && now.wifi;
                    let wifi_before = prev.connected && prev.wifi;
                    let notice = if wifi_now && (!wifi_before || prev.name != now.name) {
                        Some((now.name.clone(), "Подключено"))
                    } else if wifi_before && !wifi_now {
                        Some((prev.name.clone(), "Отключено"))
                    } else {
                        None
                    };
                    if let Some((title, subtitle)) = notice {
                        let _ = app.emit(
                            "island-notify",
                            Notice {
                                kind: "wifi",
                                title: if title.is_empty() {
                                    "Wi-Fi".into()
                                } else {
                                    title
                                },
                                subtitle: Some(subtitle.into()),
                                value: None,
                                muted: None,
                            },
                        );
                    }
                }
                *app.state::<ConnectState>().network.lock().unwrap() = now.clone();
                let _ = app.emit("network-update", &now);
                last = Some(now);
            }

            // Спим до следующего события системы.
            if rx.recv().is_err() {
                return Ok(());
            }
            // При смене сети события идут пачкой — ждём, пока состояние устоится.
            thread::sleep(Duration::from_millis(500));
            while rx.try_recv().is_ok() {}
        }
    }

    // ── Bluetooth ──

    type Names = Arc<Mutex<HashMap<String, String>>>;

    fn publish_bluetooth(app: &AppHandle, names: &Names) {
        let mut list: Vec<String> = names
            .lock()
            .unwrap()
            .values()
            .filter(|n| !n.is_empty())
            .cloned()
            .collect();
        list.sort();
        list.dedup();
        *app.state::<ConnectState>().bluetooth.lock().unwrap() = list.clone();
        let _ = app.emit("bluetooth-update", list);
    }

    fn bluetooth_notice(app: &AppHandle, name: String, subtitle: &str) {
        let _ = app.emit(
            "island-notify",
            Notice {
                kind: "bluetooth",
                title: name,
                subtitle: Some(subtitle.into()),
                value: None,
                muted: None,
            },
        );
    }

    fn start_watcher(app: &AppHandle, selector: &HSTRING, names: &Names) -> Result<DeviceWatcher> {
        let watcher = DeviceInformation::CreateWatcherAqsFilter(selector)?;
        // Устройства, уже подключённые на старте, не должны давать уведомлений.
        let ready = Arc::new(AtomicBool::new(false));

        {
            let (app, ready, names) = (app.clone(), ready.clone(), names.clone());
            watcher.Added(&TypedEventHandler::<DeviceWatcher, DeviceInformation>::new(
                move |_, info| {
                    if let Some(info) = info.as_ref() {
                        let id = info.Id()?.to_string();
                        let name = info.Name()?.to_string();
                        let known = names.lock().unwrap().values().any(|n| *n == name);
                        names.lock().unwrap().insert(id, name.clone());
                        if ready.load(Ordering::Relaxed) {
                            publish_bluetooth(&app, &names);
                            if !name.is_empty() && !known {
                                bluetooth_notice(&app, name, "Подключено");
                            }
                        }
                    }
                    Ok(())
                },
            ))?;
        }
        {
            let (app, names) = (app.clone(), names.clone());
            watcher.Removed(
                &TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(
                    move |_, update| {
                        if let Some(update) = update.as_ref() {
                            let id = update.Id()?.to_string();
                            let removed = names.lock().unwrap().remove(&id);
                            if let Some(name) = removed {
                                let still = names.lock().unwrap().values().any(|n| *n == name);
                                publish_bluetooth(&app, &names);
                                if !name.is_empty() && !still {
                                    bluetooth_notice(&app, name, "Отключено");
                                }
                            }
                        }
                        Ok(())
                    },
                ),
            )?;
        }
        // Без подписки на Updated watcher не присылает Removed.
        watcher.Updated(
            &TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(|_, _| Ok(())),
        )?;
        {
            let (app, names) = (app.clone(), names.clone());
            watcher.EnumerationCompleted(
                &TypedEventHandler::<DeviceWatcher, IInspectable>::new(move |_, _| {
                    ready.store(true, Ordering::Relaxed);
                    publish_bluetooth(&app, &names);
                    Ok(())
                }),
            )?;
        }

        watcher.Start()?;
        Ok(watcher)
    }

    pub fn watch_bluetooth(app: AppHandle) -> Result<()> {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let names: Names = Arc::new(Mutex::new(HashMap::new()));

        let classic = BluetoothDevice::GetDeviceSelectorFromConnectionStatus(
            BluetoothConnectionStatus::Connected,
        )?;
        let low_energy = BluetoothLEDevice::GetDeviceSelectorFromConnectionStatus(
            BluetoothConnectionStatus::Connected,
        )?;

        // Наблюдатели должны жить всё время работы приложения.
        let _watchers = [
            start_watcher(&app, &classic, &names)?,
            start_watcher(&app, &low_energy, &names)?,
        ];
        loop {
            thread::park();
        }
    }
}
