import { useCallback, useEffect, useState } from "react";
import { api, useTauriEvent } from "../lib/tauri";
import type { NetworkState, RadioKind, RadioStates } from "../types";

const OFFLINE: NetworkState = { connected: false, wifi: false, name: "", bars: 0 };
const NO_RADIOS: RadioStates = { wifi: null, bluetooth: null };

export interface Connectivity {
  network: NetworkState;
  /** Пришло ли уже состояние сети от системы (до этого «нет сети» не показываем). */
  known: boolean;
  bluetoothDevices: string[];
  radios: RadioStates;
  /** Какой модуль сейчас переключается. */
  busy: RadioKind | null;
  error: string | null;
  refreshRadios: () => void;
  setRadio: (kind: RadioKind, on: boolean) => void;
}

/** Сеть и Bluetooth. Событийно: таймеров нет, радиомодули опрашиваются по запросу. */
export function useConnectivity(): Connectivity {
  const [network, setNetwork] = useState<NetworkState>(OFFLINE);
  const [known, setKnown] = useState(false);
  const [bluetoothDevices, setBluetoothDevices] = useState<string[]>([]);
  const [radios, setRadios] = useState<RadioStates>(NO_RADIOS);
  const [busy, setBusy] = useState<RadioKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRadios = useCallback(() => {
    api
      .radioStates()
      .then(setRadios)
      .catch(() => undefined);
  }, []);

  useTauriEvent<NetworkState>("network-update", (state) => {
    setNetwork(state);
    setKnown(true);
    refreshRadios();
  });
  useTauriEvent<string[]>("bluetooth-update", (devices) => {
    setBluetoothDevices(devices);
    refreshRadios();
  });

  // Страница могла загрузиться позже первых событий.
  useEffect(() => {
    api
      .connectivity()
      .then((snapshot) => {
        setBluetoothDevices(snapshot.bluetoothDevices);
        if (snapshot.network.connected) {
          setNetwork(snapshot.network);
          setKnown(true);
        }
      })
      .catch(() => undefined);
    refreshRadios();
  }, [refreshRadios]);

  const setRadio = useCallback((kind: RadioKind, on: boolean) => {
    setBusy(kind);
    setError(null);
    // Оптимистично переключаем сразу, система подтвердит или откатит.
    setRadios((prev) => ({ ...prev, [kind]: on }));
    api
      .setRadio(kind, on)
      .then(setRadios)
      .catch((reason: unknown) => {
        setError(typeof reason === "string" ? reason : "Не удалось переключить");
        api
          .radioStates()
          .then(setRadios)
          .catch(() => undefined);
      })
      .finally(() => setBusy(null));
  }, []);

  return { network, known, bluetoothDevices, radios, busy, error, refreshRadios, setRadio };
}
