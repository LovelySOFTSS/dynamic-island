# Dynamic Island для десктопа

Tauri v2 (Rust) + React 19 + TypeScript + Tailwind CSS 4 + Framer Motion.

## Что нужно установить

- Node.js 20+
- Rust (stable) — https://rustup.rs
- Windows: «Desktop development with C++» из Visual Studio Build Tools и WebView2 (в Windows 11 уже есть)
- macOS: Xcode Command Line Tools (`xcode-select --install`)

## Запуск и сборка

```bash
npm install            # зависимости фронтенда
npm run tauri dev      # dev-режим с горячей перезагрузкой
npm run tauri build    # релиз: бинарник + установщик
```

Готовый бинарник: `src-tauri/target/release/dynamic-island(.exe)`,
установщики: `src-tauri/target/release/bundle/`.

Только exe без установщика (быстрее): `npm run tauri build -- --no-bundle`.

Свои иконки: `npm run tauri icon путь/к/картинке-1024.png`.

## Управление

- Наведение или клик по капсуле — раскрыть.
- `Ctrl+Shift+Space` — закрепить раскрытым / отпустить.
- Иконка в трее — показать/скрыть, перенести на следующий монитор, выход.
- Файл, перетащенный на капсулу, ложится на полку; с полки его можно вытянуть в любое окно.

## Что нового в 0.2

- **Связь:** имя и уровень сигнала Wi-Fi, список подключённых Bluetooth-устройств, переключатели
  обоих модулей, пилюли при подключении и отключении (Windows).
- **Текст песен:** вкладка «Текст» показывает синхронный текст из открытой базы LRCLIB для
  любого плеера (Spotify, браузер). Клик по строке перематывает трек. Есть не для всех песен.
- **Темы:** восемь тем, включая «Под обложку» (фон в цвет трека) и светлую.
- **Эффекты:** свечение в цвет трека, блик по стеклу, живой фон «Аврора» — каждый отключается.
- Анимации стали мягче.

## Структура

```
dynamic-island/
├── package.json, vite.config.ts, tsconfig.json, index.html
├── src/
│   ├── main.tsx, index.css, types.ts
│   ├── lib/
│   │   ├── constants.ts        размеры состояний, пружины
│   │   ├── tauri.ts            типизированные команды и подписка на события
│   │   └── format.ts           время, байты, позиция трека
│   ├── hooks/
│   │   ├── useMedia.ts         системный плеер (события из Rust)
│   │   ├── useShelf.ts         полка файлов: приём и отдача drag-and-drop
│   │   ├── useSystemStats.ts   CPU/RAM, опрос только при открытой вкладке
│   │   ├── usePomodoro.ts      таймер
│   │   ├── useNotifications.ts всплывающая пилюля
│   │   ├── useDominantColor.ts цвет обложки для свечения
│   │   ├── useClock.ts         часы (одно пробуждение в минуту)
│   │   └── usePersistentState.ts
│   └── components/
│       ├── DynamicIsland.tsx   главный компонент: состояния и морфинг
│       ├── IdleView.tsx, CompactView.tsx, Equalizer.tsx
│       ├── ExpandedView.tsx    вкладки
│       ├── MediaPlayer.tsx, FileShelf.tsx, SystemTools.tsx
│       └── NotificationPill.tsx
└── src-tauri/
    ├── Cargo.toml, build.rs, tauri.conf.json
    ├── capabilities/default.json
    ├── icons/
    └── src/
        ├── main.rs
        ├── lib.rs              окно, позиционирование, трей, хоткей, команды
        ├── hit_test.rs         click-through
        ├── media.rs            Windows SMTC / macOS AppleScript
        ├── sys_events.rs       громкость и Bluetooth (Windows)
        ├── system.rs           CPU/RAM
        └── shelf.rs            метаданные файлов
```

## Если сборка Rust падает

Код под Windows использует крейт `windows` версии 0.58 — она закреплена в `Cargo.toml`,
потому что сигнатуры обработчиков событий меняются между версиями.

- Ошибка про `IAudioEndpointVolumeCallback_Impl` или `implement` — добавьте `"implement"`
  в список features крейта `windows` в `Cargo.toml`.
- Ошибка внутри `sys_events.rs` — модуль изолирован: закомментируйте строку
  `sys_events::spawn(handle);` в `lib.rs`, островок соберётся без пилюль громкости и Bluetooth.

## Ограничения

- **Размытие рабочего стола.** `backdrop-filter` в webview размывает только содержимое самой
  страницы, а не окна под прозрачным окном. Фон капсулы почти непрозрачный (0.88), поэтому
  визуально разницы почти нет. Настоящее системное размытие (Mica/Acrylic/Vibrancy)
  накладывается на всё прямоугольное окно, а не на форму капсулы.
- **Яркость.** Системного события изменения яркости в Windows нет — пилюля яркости не сделана.
- **«Не беспокоить».** Публичного API для системного режима фокусировки нет ни в Windows,
  ни в macOS; переключатель глушит пилюли самого островка.
- **macOS.** Плеер работает со Spotify и Music через AppleScript с опросом раз в 2 секунды
  (при первом запуске система спросит разрешение на управление ими). Пилюли громкости и
  Bluetooth — только Windows.
- **Эквалайзер** анимируется по состоянию плеера (играет/пауза), а не по реальному звуку:
  анализ аудиопотока потребовал бы постоянного захвата звука и нагрузки на CPU.
- **Click-through** сделан опросом позиции курсора из Rust: 10 раз в секунду, когда курсор
  далеко, и ~60 раз, когда рядом. Это один системный вызов — в диспетчере задач 0%, но
  формально поток не спит полностью. Webview в покое не делает ничего, кроме одного
  обновления часов в минуту.
