import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { ShelfFile } from "../types";
import { usePersistentState } from "./usePersistentState";

export interface Shelf {
  files: ShelfFile[];
  /** Над островком сейчас тащат файл извне. */
  dragOver: boolean;
  remove: (path: string) => void;
  clear: () => void;
  /** Начать перетаскивание файла с полки в другое окно. */
  dragOut: (file: ShelfFile) => void;
}

/**
 * Полка файлов.
 * Приём: нативные drag-drop события окна Tauri (дают реальные пути).
 * Отдача: tauri-plugin-drag запускает системный drag-and-drop с этими путями.
 * На полке хранятся ссылки на файлы, список переживает перезапуск.
 */
export function useShelf(): Shelf {
  const [paths, setPaths] = usePersistentState<string[]>("island.shelf", []);
  const [files, setFiles] = useState<ShelfFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const dragIcon = useRef<string | null>(null);
  /** Идёт наше собственное перетаскивание наружу — его события приёма игнорируем. */
  const selfDrag = useRef(false);

  // Метаданные; заодно отсеиваются файлы, которых больше нет на диске.
  useEffect(() => {
    let cancelled = false;
    if (paths.length === 0) {
      setFiles([]);
      return;
    }
    api
      .fileInfo(paths)
      .then((info) => {
        if (!cancelled) setFiles(info);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [paths]);

  useEffect(() => {
    api
      .dragIconPath()
      .then((p) => {
        dragIcon.current = p;
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (selfDrag.current) return;
        const payload = event.payload;
        switch (payload.type) {
          case "enter":
          case "over":
            setDragOver(true);
            break;
          case "drop":
            setDragOver(false);
            setPaths((prev) => [...prev, ...payload.paths.filter((p) => !prev.includes(p))]);
            break;
          case "leave":
            setDragOver(false);
            break;
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [setPaths]);

  const remove = useCallback(
    (path: string) => setPaths((prev) => prev.filter((p) => p !== path)),
    [setPaths],
  );
  const clear = useCallback(() => setPaths([]), [setPaths]);

  const dragOut = useCallback((file: ShelfFile) => {
    const icon = file.isImage ? file.path : dragIcon.current;
    if (!icon) return;
    selfDrag.current = true;
    startDrag({ item: [file.path], icon })
      .catch(() => undefined)
      .finally(() => {
        selfDrag.current = false;
      });
  }, []);

  return { files, dragOver, remove, clear, dragOut };
}
