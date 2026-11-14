import { Bluetooth, BluetoothOff, Cable, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { Connectivity } from "../hooks/useConnectivity";
import { Toggle } from "./Toggle";

interface ConnectTabProps {
  connectivity: Connectivity;
}

export function ConnectTab({ connectivity }: ConnectTabProps) {
  const { network, bluetoothDevices, radios, busy, error, refreshRadios, setRadio } = connectivity;

  // Состояние модулей уточняем каждый раз, когда вкладку открывают.
  useEffect(() => {
    refreshRadios();
  }, [refreshRadios]);

  const wifiOn = radios.wifi ?? (network.connected && network.wifi);
  const onWifi = network.connected && network.wifi;

  let netIcon: LucideIcon = WifiOff;
  let netTitle = "Нет подключения";
  let netSubtitle = radios.wifi === false ? "Wi-Fi выключен" : "Сеть не найдена";
  if (onWifi) {
    netIcon = Wifi;
    netTitle = network.name || "Wi-Fi";
    netSubtitle = "Подключено";
  } else if (network.connected) {
    netIcon = Cable;
    netTitle = network.name || "Проводная сеть";
    netSubtitle = "Подключено по кабелю";
  }

  const bluetoothOn = radios.bluetooth ?? bluetoothDevices.length > 0;
  const bluetoothSubtitle = !bluetoothOn
    ? "Выключен"
    : bluetoothDevices.length === 0
      ? "Нет подключённых устройств"
      : bluetoothDevices.slice(0, 2).join(", ") +
        (bluetoothDevices.length > 2 ? ` и ещё ${bluetoothDevices.length - 2}` : "");

  return (
    <div className="grid h-full grid-cols-2 gap-2.5">
      <Card
        Icon={netIcon}
        iconClass={network.connected ? "text-sky-400" : "text-ink/45"}
        label="Wi-Fi"
        title={netTitle}
        subtitle={error && busy === null ? error : netSubtitle}
        on={wifiOn}
        available={radios.wifi !== null}
        pending={busy === "wifi"}
        activeClass="bg-sky-400"
        onToggle={() => setRadio("wifi", !wifiOn)}
        extra={onWifi ? <SignalBars bars={network.bars} /> : null}
      />
      <Card
        Icon={bluetoothOn ? Bluetooth : BluetoothOff}
        iconClass={bluetoothOn ? "text-blue-400" : "text-ink/45"}
        label="Bluetooth"
        title={
          bluetoothDevices.length > 0 ? `Устройств: ${bluetoothDevices.length}` : "Bluetooth"
        }
        subtitle={bluetoothSubtitle}
        on={bluetoothOn}
        available={radios.bluetooth !== null}
        pending={busy === "bluetooth"}
        activeClass="bg-blue-400"
        onToggle={() => setRadio("bluetooth", !bluetoothOn)}
        extra={null}
      />
    </div>
  );
}

interface CardProps {
  Icon: LucideIcon;
  iconClass: string;
  label: string;
  title: string;
  subtitle: string;
  on: boolean;
  /** Есть ли у компьютера такой модуль (иначе переключатель скрыт). */
  available: boolean;
  pending: boolean;
  activeClass: string;
  onToggle: () => void;
  extra: ReactNode;
}

function Card({
  Icon,
  iconClass,
  label,
  title,
  subtitle,
  on,
  available,
  pending,
  activeClass,
  onToggle,
  extra,
}: CardProps) {
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-2xl bg-ink/[0.07] p-2.5">
      <div className="flex items-center gap-1.5">
        <Icon size={15} strokeWidth={2.3} className={iconClass} />
        <span className="text-[11px] font-medium text-ink/55">{label}</span>
        <span className="ml-auto flex items-center gap-2">
          {extra}
          {available ? (
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${label}: ${on ? "выключить" : "включить"}`}
              disabled={pending}
              onClick={onToggle}
              className={pending ? "opacity-50" : ""}
            >
              <Toggle on={on} activeClass={activeClass} />
            </button>
          ) : null}
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold leading-tight text-ink">{title}</div>
        <div className="mt-0.5 truncate text-[11px] font-medium leading-tight text-ink/50">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

/** Уровень сигнала Wi-Fi: 5 столбиков. */
function SignalBars({ bars }: { bars: number }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" title={`Сигнал: ${bars} из 5`}>
      {[1, 2, 3, 4, 5].map((level) => (
        <span
          key={level}
          className={`w-[3px] rounded-[1px] ${level <= bars ? "bg-sky-400" : "bg-ink/20"}`}
          style={{ height: `${level * 20}%` }}
        />
      ))}
    </span>
  );
}
