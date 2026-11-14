//! Системные события для всплывающей «пилюли»: громкость и Bluetooth.
//!
//! Реализовано для Windows, оба источника событийные (потоки припаркованы):
//! * громкость — `IAudioEndpointVolumeCallback` устройства вывода по умолчанию;
//! * Bluetooth — `DeviceWatcher` по подключённым устройствам.
//!
//! Событие во фронтенд: `island-notify` с [`Notice`].

use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    /// "volume" | "bluetooth"
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
            Arc, Mutex,
        },
        thread,
    };

    use tauri::{AppHandle, Emitter};
    use windows::{
        core::{implement, IInspectable, Result},
        Devices::{
            Bluetooth::{BluetoothConnectionStatus, BluetoothDevice},
            Enumeration::{DeviceInformation, DeviceInformationUpdate, DeviceWatcher},
        },
        Foundation::TypedEventHandler,
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

    // ── Bluetooth ──

    pub fn watch_bluetooth(app: AppHandle) -> Result<()> {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }

        let selector = BluetoothDevice::GetDeviceSelectorFromConnectionStatus(
            BluetoothConnectionStatus::Connected,
        )?;
        let watcher = DeviceInformation::CreateWatcherAqsFilter(&selector)?;

        // Устройства, уже подключённые на старте, не должны давать уведомлений.
        let ready = Arc::new(AtomicBool::new(false));
        let names: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(HashMap::new()));

        {
            let (app, ready, names) = (app.clone(), ready.clone(), names.clone());
            watcher.Added(&TypedEventHandler::<DeviceWatcher, DeviceInformation>::new(
                move |_, info| {
                    if let Some(info) = info.as_ref() {
                        let id = info.Id()?.to_string();
                        let name = info.Name()?.to_string();
                        names.lock().unwrap().insert(id, name.clone());
                        if ready.load(Ordering::Relaxed) && !name.is_empty() {
                            let _ = app.emit(
                                "island-notify",
                                Notice {
                                    kind: "bluetooth",
                                    title: name,
                                    subtitle: Some("Подключено".into()),
                                    value: None,
                                    muted: None,
                                },
                            );
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
                            if let Some(name) = names.lock().unwrap().remove(&id) {
                                if !name.is_empty() {
                                    let _ = app.emit(
                                        "island-notify",
                                        Notice {
                                            kind: "bluetooth",
                                            title: name,
                                            subtitle: Some("Отключено".into()),
                                            value: None,
                                            muted: None,
                                        },
                                    );
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
            let ready = ready.clone();
            watcher.EnumerationCompleted(
                &TypedEventHandler::<DeviceWatcher, IInspectable>::new(move |_, _| {
                    ready.store(true, Ordering::Relaxed);
                    Ok(())
                }),
            )?;
        }

        watcher.Start()?;
        loop {
            thread::park();
        }
    }
}
