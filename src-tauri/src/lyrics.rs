//! Тексты песен из открытой базы LRCLIB (https://lrclib.net).
//!
//! Работает для любого плеера, который отдаёт название и исполнителя в системную
//! медиа-сессию (Spotify, браузер, и т.д.). Запрос делается один раз на трек и
//! только когда открыта вкладка «Текст».

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
pub struct Lyrics {
    /// Текст с таймкодами в формате LRC.
    pub synced: Option<String>,
    pub plain: Option<String>,
    pub instrumental: bool,
}

const API: &str = "https://lrclib.net/api";
const USER_AGENT: &str = "DynamicIslandDesktop/0.2";

fn text_field(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn to_lyrics(v: &Value) -> Option<Lyrics> {
    let lyrics = Lyrics {
        synced: text_field(v, "syncedLyrics"),
        plain: text_field(v, "plainLyrics"),
        instrumental: v
            .get("instrumental")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    };
    (lyrics.synced.is_some() || lyrics.plain.is_some() || lyrics.instrumental).then_some(lyrics)
}

/// "Song (feat. X) - Remastered 2011" → "Song"
fn clean_title(title: &str) -> String {
    let mut out = String::new();
    let mut depth = 0u32;
    for ch in title.chars() {
        match ch {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = depth.saturating_sub(1),
            _ if depth == 0 => out.push(ch),
            _ => {}
        }
    }
    let out = out.split(" - ").next().unwrap_or("").trim().to_string();
    if out.is_empty() {
        title.trim().to_string()
    } else {
        out
    }
}

fn get_json(
    agent: &ureq::Agent,
    path: &str,
    query: &[(&str, &str)],
) -> Result<Option<Value>, String> {
    let mut req = agent.get(&format!("{API}{path}"));
    for (k, v) in query {
        req = req.query(k, v);
    }
    match req.call() {
        Ok(resp) => {
            let body = resp.into_string().map_err(|e| e.to_string())?;
            serde_json::from_str(&body)
                .map(Some)
                .map_err(|e| e.to_string())
        }
        Err(ureq::Error::Status(404, _)) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Лучший результат поиска: сначала с таймкодами и близкой длительностью.
fn best_match(results: &Value, duration_s: f64) -> Option<Lyrics> {
    let list = results.as_array()?;
    let close = |v: &&Value| {
        duration_s <= 0.0
            || v.get("duration")
                .and_then(Value::as_f64)
                .is_some_and(|d| (d - duration_s).abs() <= 4.0)
    };
    let synced = |v: &&Value| text_field(v, "syncedLyrics").is_some();
    list.iter()
        .find(|v| synced(v) && close(v))
        .or_else(|| list.iter().find(synced))
        .or_else(|| list.iter().find(close))
        .or_else(|| list.first())
        .and_then(to_lyrics)
}

#[tauri::command(async)]
pub fn fetch_lyrics(
    title: String,
    artist: String,
    duration_ms: f64,
) -> Result<Option<Lyrics>, String> {
    let title = title.trim();
    let artist = artist.trim();
    if title.is_empty() {
        return Ok(None);
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(10))
        .user_agent(USER_AGENT)
        .build();
    let duration_s = (duration_ms / 1000.0).round();
    let duration_text = format!("{duration_s:.0}");

    // 1. Точное совпадение по названию, исполнителю и длительности.
    if !artist.is_empty() && duration_s > 0.0 {
        let exact = get_json(
            &agent,
            "/get",
            &[
                ("track_name", title),
                ("artist_name", artist),
                ("duration", &duration_text),
            ],
        )?;
        if let Some(found) = exact.as_ref().and_then(to_lyrics) {
            return Ok(Some(found));
        }
    }

    // 2. Поиск по очищенному названию и исполнителю.
    let cleaned = clean_title(title);
    if !artist.is_empty() {
        let results = get_json(
            &agent,
            "/search",
            &[("track_name", cleaned.as_str()), ("artist_name", artist)],
        )?;
        if let Some(found) = results.as_ref().and_then(|r| best_match(r, duration_s)) {
            return Ok(Some(found));
        }
    }

    // 3. Свободный поиск (для браузеров, где «исполнитель» — это название канала).
    let query = format!("{cleaned} {artist}");
    let results = get_json(&agent, "/search", &[("q", query.trim())])?;
    Ok(results.as_ref().and_then(|r| best_match(r, duration_s)))
}
