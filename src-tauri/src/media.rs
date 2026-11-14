//! Системная медиа-сессия.
//!
//! * Windows — SMTC (`GlobalSystemMediaTransportControlsSessionManager`), полностью
//!   событийно: поток спит на `recv()` и просыпается только по событию системы
//!   или команде из UI.
//! * macOS — AppleScript к Spotify и Music.app (публичного NowPlaying API у
//!   системы нет, а приватный MediaRemote закрыт начиная с macOS 15.4).
//!   Опрос раз в 2 секунды.
//! * Прочие ОС — пустая реализация.
//!
//! События во фронтенд:
//! * `media-update` — [`MediaState`];
//! * `media-cover`  — `Option<String>` (data-URL или https-ссылка на обложку).

use std::{
    sync::{
        mpsc::{self, Sender},
        Mutex,
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    /// Есть ли активная медиа-сессия.
    pub active: bool,
    pub title: String,
    pub artist: String,
    pub playing: bool,
    /// Позиция на момент `updated_at_ms`.
    pub position_ms: f64,
    pub duration_ms: f64,
    /// Unix-время (мс), к которому относится `position_ms`.
    pub updated_at_ms: f64,
    /// Меняется при смене трека.
    pub track_key: String,
}

#[derive(Debug)]
pub enum MediaCmd {
    /// Системное событие: что-то изменилось. `props` — могла смениться обложка.
    Refresh {
        props: bool,
    },
    /// Сменилась активная сессия (другой плеер).
    SessionChanged,
    /// UI просит прислать состояние заново (после загрузки страницы).
    Sync,
    Toggle,
    Next,
    Prev,
    Seek(f64),
}

pub struct MediaHandle(pub Mutex<Sender<MediaCmd>>);

pub fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

pub fn spawn(app: AppHandle) -> MediaHandle {
    let (tx, rx) = mpsc::channel::<MediaCmd>();
    let thread_tx = tx.clone();
    thread::Builder::new()
        .name("island-media".into())
        .spawn(move || imp::run(app, thread_tx, rx))
        .expect("не удалось запустить поток медиа-сессии");
    MediaHandle(Mutex::new(tx))
}

// ───────────────────────────── Windows ─────────────────────────────

#[cfg(windows)]
mod imp {
    use std::sync::mpsc::{Receiver, Sender};

    use base64::{engine::general_purpose::STANDARD, Engine};
    use tauri::{AppHandle, Emitter};
    use windows::{
        Foundation::TypedEventHandler,
        Media::Control::{
            CurrentSessionChangedEventArgs, GlobalSystemMediaTransportControlsSession as Session,
            GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionMediaProperties as MediaProps,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
            MediaPropertiesChangedEventArgs, PlaybackInfoChangedEventArgs,
            TimelinePropertiesChangedEventArgs,
        },
        Storage::Streams::DataReader,
        Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
    };

    use super::{now_ms, MediaCmd, MediaState};

    /// Разница между эпохой Windows (1601) и Unix (1970) в 100-нс тиках.
    const EPOCH_DIFF_TICKS: i64 = 116_444_736_000_000_000;
    const TICKS_PER_MS: f64 = 10_000.0;

    /// Текущая сессия и функции отписки от её событий.
    struct Attached {
        session: Session,
        detach: Vec<Box<dyn FnOnce()>>,
    }

    impl Attached {
        fn release(self) {
            for f in self.detach {
                f();
            }
        }
    }

    pub fn run(app: AppHandle, tx: Sender<MediaCmd>, rx: Receiver<MediaCmd>) {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }

        let manager = match Manager::RequestAsync().and_then(|op| op.get()) {
            Ok(m) => m,
            Err(err) => {
                eprintln!("[island] SMTC недоступен: {err}");
                // Держим канал открытым, чтобы команды из UI не возвращали ошибку.
                for _ in rx {}
                return;
            }
        };

        {
            let tx = tx.clone();
            let handler =
                TypedEventHandler::<Manager, CurrentSessionChangedEventArgs>::new(move |_, _| {
                    let _ = tx.send(MediaCmd::SessionChanged);
                    Ok(())
                });
            let _ = manager.CurrentSessionChanged(&handler);
        }

        let mut attached = attach(&manager, &tx);
        let mut last_state: Option<MediaState> = None;
        let mut last_cover: Option<String> = None;
        let mut cover_sent = false;
        publish(
            &app,
            attached.as_ref(),
            true,
            &mut last_state,
            &mut last_cover,
            &mut cover_sent,
        );

        // Блокирующее ожидание: 0% CPU, пока ничего не происходит.
        while let Ok(cmd) = rx.recv() {
            match cmd {
                MediaCmd::SessionChanged => {
                    if let Some(old) = attached.take() {
                        old.release();
                    }
                    attached = attach(&manager, &tx);
                    publish(
                        &app,
                        attached.as_ref(),
                        true,
                        &mut last_state,
                        &mut last_cover,
                        &mut cover_sent,
                    );
                }
                MediaCmd::Refresh { props } => publish(
                    &app,
                    attached.as_ref(),
                    props,
                    &mut last_state,
                    &mut last_cover,
                    &mut cover_sent,
                ),
                MediaCmd::Sync => {
                    last_state = None;
                    cover_sent = false;
                    publish(
                        &app,
                        attached.as_ref(),
                        true,
                        &mut last_state,
                        &mut last_cover,
                        &mut cover_sent,
                    );
                }
                MediaCmd::Toggle => control(attached.as_ref(), |s| {
                    s.TryTogglePlayPauseAsync()?.get().map(|_| ())
                }),
                MediaCmd::Next => control(attached.as_ref(), |s| {
                    s.TrySkipNextAsync()?.get().map(|_| ())
                }),
                MediaCmd::Prev => control(attached.as_ref(), |s| {
                    s.TrySkipPreviousAsync()?.get().map(|_| ())
                }),
                MediaCmd::Seek(ms) => control(attached.as_ref(), |s| {
                    s.TryChangePlaybackPositionAsync((ms * TICKS_PER_MS) as i64)?
                        .get()
                        .map(|_| ())
                }),
            }
        }
    }

    fn control(attached: Option<&Attached>, f: impl FnOnce(&Session) -> windows::core::Result<()>) {
        if let Some(a) = attached {
            if let Err(err) = f(&a.session) {
                eprintln!("[island] команда плееру не выполнена: {err}");
            }
        }
    }

    /// Подписывается на события текущей сессии.
    fn attach(manager: &Manager, tx: &Sender<MediaCmd>) -> Option<Attached> {
        let session = manager.GetCurrentSession().ok()?;
        let mut detach: Vec<Box<dyn FnOnce()>> = Vec::new();

        {
            let tx = tx.clone();
            let handler =
                TypedEventHandler::<Session, MediaPropertiesChangedEventArgs>::new(move |_, _| {
                    let _ = tx.send(MediaCmd::Refresh { props: true });
                    Ok(())
                });
            if let Ok(token) = session.MediaPropertiesChanged(&handler) {
                let s = session.clone();
                detach.push(Box::new(move || {
                    let _ = s.RemoveMediaPropertiesChanged(token);
                }));
            }
        }
        {
            let tx = tx.clone();
            let handler =
                TypedEventHandler::<Session, PlaybackInfoChangedEventArgs>::new(move |_, _| {
                    let _ = tx.send(MediaCmd::Refresh { props: false });
                    Ok(())
                });
            if let Ok(token) = session.PlaybackInfoChanged(&handler) {
                let s = session.clone();
                detach.push(Box::new(move || {
                    let _ = s.RemovePlaybackInfoChanged(token);
                }));
            }
        }
        {
            let tx = tx.clone();
            let handler = TypedEventHandler::<Session, TimelinePropertiesChangedEventArgs>::new(
                move |_, _| {
                    let _ = tx.send(MediaCmd::Refresh { props: false });
                    Ok(())
                },
            );
            if let Ok(token) = session.TimelinePropertiesChanged(&handler) {
                let s = session.clone();
                detach.push(Box::new(move || {
                    let _ = s.RemoveTimelinePropertiesChanged(token);
                }));
            }
        }

        Some(Attached { session, detach })
    }

    /// Читает состояние и отправляет во фронтенд только то, что изменилось.
    fn publish(
        app: &AppHandle,
        attached: Option<&Attached>,
        with_cover: bool,
        last_state: &mut Option<MediaState>,
        last_cover: &mut Option<String>,
        cover_sent: &mut bool,
    ) {
        let (state, cover) = match attached {
            Some(a) => match snapshot(&a.session) {
                Ok((state, props)) => {
                    let cover = if with_cover {
                        read_thumbnail(&props)
                    } else {
                        last_cover.clone()
                    };
                    (state, cover)
                }
                Err(_) => (MediaState::default(), None),
            },
            None => (MediaState::default(), None),
        };

        if last_state.as_ref() != Some(&state) {
            let _ = app.emit("media-update", &state);
            *last_state = Some(state);
        }
        if !*cover_sent || *last_cover != cover {
            let _ = app.emit("media-cover", &cover);
            *last_cover = cover;
            *cover_sent = true;
        }
    }

    fn snapshot(session: &Session) -> windows::core::Result<(MediaState, MediaProps)> {
        let props = session.TryGetMediaPropertiesAsync()?.get()?;
        let title = props.Title()?.to_string();
        let artist = props.Artist()?.to_string();
        let playing = session.GetPlaybackInfo()?.PlaybackStatus()? == PlaybackStatus::Playing;

        let timeline = session.GetTimelineProperties()?;
        let start = timeline.StartTime()?.Duration;
        let end = timeline.EndTime()?.Duration;
        let position = timeline.Position()?.Duration;
        let last_updated = timeline.LastUpdatedTime()?.UniversalTime;

        // Некоторые плееры (браузеры) не заполняют LastUpdatedTime.
        let updated_at_ms = if last_updated > EPOCH_DIFF_TICKS {
            (last_updated - EPOCH_DIFF_TICKS) as f64 / TICKS_PER_MS
        } else {
            now_ms()
        };

        let state = MediaState {
            active: !title.is_empty() || !artist.is_empty(),
            track_key: format!("{title}\u{1f}{artist}"),
            title,
            artist,
            playing,
            position_ms: ((position - start).max(0)) as f64 / TICKS_PER_MS,
            duration_ms: ((end - start).max(0)) as f64 / TICKS_PER_MS,
            updated_at_ms,
        };
        Ok((state, props))
    }

    /// Обложка трека в виде data-URL.
    fn read_thumbnail(props: &MediaProps) -> Option<String> {
        let reference = props.Thumbnail().ok()?;
        let stream = reference.OpenReadAsync().ok()?.get().ok()?;
        let size = u32::try_from(stream.Size().ok()?).ok()?;
        // Защита от пустых и аномально больших картинок.
        if size == 0 || size > 8 * 1024 * 1024 {
            return None;
        }
        let mime = stream
            .ContentType()
            .map(|s| s.to_string())
            .ok()
            .filter(|s| s.starts_with("image/"))
            .unwrap_or_else(|| "image/png".to_string());

        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size).ok()?.get().ok()?;
        let mut bytes = vec![0u8; size as usize];
        reader.ReadBytes(&mut bytes).ok()?;
        let _ = reader.Close();

        Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
    }
}

// ───────────────────────────── macOS ─────────────────────────────

#[cfg(target_os = "macos")]
mod imp {
    use std::{
        process::Command,
        sync::mpsc::{Receiver, RecvTimeoutError, Sender},
        time::Duration,
    };

    use tauri::{AppHandle, Emitter};

    use super::{now_ms, MediaCmd, MediaState};

    const POLL: Duration = Duration::from_secs(2);

    /// Скрипт на одно приложение: если плеер не установлен, падает только он.
    fn query_script(app_name: &str) -> String {
        let (duration_expr, artwork_expr) = if app_name == "Spotify" {
            ("((duration of t) / 1000)", "(artwork url of t)")
        } else {
            ("(duration of t)", "\"\"")
        };
        format!(
            r#"if application "{app}" is running then
  tell application "{app}"
    if player state is not stopped then
      set t to current track
      set isPlaying to "0"
      if player state is playing then set isPlaying to "1"
      return (name of t) & tab & (artist of t) & tab & isPlaying & tab & (player position as text) & tab & ({dur} as text) & tab & {art}
    end if
  end tell
end if
return """#,
            app = app_name,
            dur = duration_expr,
            art = artwork_expr
        )
    }

    fn osascript(script: &str) -> Option<String> {
        let out = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        Some(String::from_utf8_lossy(&out.stdout).trim_end().to_string())
    }

    /// AppleScript печатает дробные числа с запятой в части локалей.
    fn parse_seconds(s: &str) -> f64 {
        s.trim().replace(',', ".").parse::<f64>().unwrap_or(0.0)
    }

    /// Возвращает (имя приложения, состояние, ссылка на обложку).
    fn query() -> Option<(&'static str, MediaState, Option<String>)> {
        let mut paused: Option<(&'static str, MediaState, Option<String>)> = None;
        for app_name in ["Spotify", "Music"] {
            let Some(raw) = osascript(&query_script(app_name)) else {
                continue;
            };
            let parts: Vec<&str> = raw.split('\t').collect();
            if parts.len() < 5 {
                continue;
            }
            let title = parts[0].to_string();
            let artist = parts[1].to_string();
            let state = MediaState {
                active: true,
                track_key: format!("{title}\u{1f}{artist}"),
                title,
                artist,
                playing: parts[2] == "1",
                position_ms: parse_seconds(parts[3]) * 1000.0,
                duration_ms: parse_seconds(parts[4]) * 1000.0,
                updated_at_ms: now_ms(),
            };
            let cover = parts
                .get(5)
                .map(|s| s.trim().to_string())
                .filter(|s| s.starts_with("http"));
            if state.playing {
                return Some((app_name, state, cover));
            }
            if paused.is_none() {
                paused = Some((app_name, state, cover));
            }
        }
        paused
    }

    fn tell(app_name: &str, command: &str) {
        let _ = osascript(&format!(r#"tell application "{app_name}" to {command}"#));
    }

    pub fn run(app: AppHandle, _tx: Sender<MediaCmd>, rx: Receiver<MediaCmd>) {
        // (ключ трека, играет ли, длительность) + ожидаемая позиция для сверки.
        let mut last_key: Option<(String, bool, f64)> = None;
        let mut last_pos: (f64, f64) = (0.0, 0.0);
        let mut last_cover: Option<String> = None;
        let mut cover_sent = false;

        loop {
            let (player, state, cover) = match query() {
                Some((n, s, c)) => (Some(n), s, c),
                None => (None, MediaState::default(), None),
            };

            // UI сам экстраполирует позицию, поэтому шлём обновление только при
            // смене трека/состояния или если позиция разошлась с ожидаемой
            // (перемотка) — иначе фронтенд перерисовывался бы каждые 2 секунды.
            let key = (state.track_key.clone(), state.playing, state.duration_ms);
            let expected = last_pos.0
                + if state.playing {
                    state.updated_at_ms - last_pos.1
                } else {
                    0.0
                };
            let drifted = (state.position_ms - expected).abs() > 1500.0;
            if last_key.as_ref() != Some(&key) || (state.active && drifted) {
                last_pos = (state.position_ms, state.updated_at_ms);
                let _ = app.emit("media-update", &state);
                last_key = Some(key);
            }
            if !cover_sent || last_cover != cover {
                let _ = app.emit("media-cover", &cover);
                last_cover = cover;
                cover_sent = true;
            }

            match rx.recv_timeout(POLL) {
                Ok(cmd) => {
                    if let Some(p) = player {
                        match cmd {
                            MediaCmd::Toggle => tell(p, "playpause"),
                            MediaCmd::Next => tell(p, "next track"),
                            MediaCmd::Prev => tell(p, "previous track"),
                            MediaCmd::Seek(ms) => {
                                tell(p, &format!("set player position to {}", ms / 1000.0))
                            }
                            MediaCmd::Sync => {
                                last_key = None;
                                cover_sent = false;
                            }
                            MediaCmd::Refresh { .. } | MediaCmd::SessionChanged => {}
                        }
                    } else if let MediaCmd::Sync = cmd {
                        last_key = None;
                        cover_sent = false;
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }
}

// ───────────────────────────── Прочие ОС ─────────────────────────────

#[cfg(not(any(windows, target_os = "macos")))]
mod imp {
    use std::sync::mpsc::{Receiver, Sender};

    use tauri::{AppHandle, Emitter};

    use super::{MediaCmd, MediaState};

    pub fn run(app: AppHandle, _tx: Sender<MediaCmd>, rx: Receiver<MediaCmd>) {
        for cmd in rx {
            if let MediaCmd::Sync = cmd {
                let _ = app.emit("media-update", MediaState::default());
                let _ = app.emit("media-cover", Option::<String>::None);
            }
        }
    }
}
