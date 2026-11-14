import { AnimatePresence, motion } from "framer-motion";
import { File as FileIcon, Folder, Image as ImageIcon, Inbox, Trash2, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Shelf } from "../hooks/useShelf";
import { SPRING } from "../lib/constants";
import { formatBytes } from "../lib/format";
import type { ShelfFile } from "../types";

interface FileShelfProps {
  shelf: Shelf;
}

/** Порог в px, после которого нажатие считается началом перетаскивания. */
const DRAG_THRESHOLD = 6;

export function FileShelf({ shelf }: FileShelfProps) {
  const { files, dragOver } = shelf;

  if (files.length === 0) {
    return (
      <motion.div
        className={`flex h-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed transition-colors duration-300 ${
          dragOver ? "border-sky-400 bg-sky-400/10" : "border-ink/20"
        }`}
        initial={false}
        animate={{ scale: dragOver ? 1.015 : 1 }}
        transition={SPRING.snappy}
      >
        <Inbox size={22} strokeWidth={1.8} className={dragOver ? "text-sky-300" : "text-ink/45"} />
        <span className="text-[12px] font-medium text-ink/55">
          {dragOver ? "Отпустите, чтобы положить на полку" : "Перетащите файлы сюда"}
        </span>
      </motion.div>
    );
  }

  return (
    <div className="flex h-full items-stretch gap-2">
      <div
        className={`no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto rounded-2xl px-1 transition-colors duration-300 ${
          dragOver ? "bg-sky-400/10" : ""
        }`}
        onWheel={(e) => {
          // Колесо мыши листает полку по горизонтали.
          e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        <AnimatePresence initial={false}>
          {files.map((file) => (
            <ShelfItem key={file.path} file={file} shelf={shelf} />
          ))}
        </AnimatePresence>
      </div>

      <motion.button
        type="button"
        aria-label="Очистить полку"
        title="Очистить полку"
        onClick={shelf.clear}
        className="flex w-8 shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] text-ink/50 hover:bg-red-500/20 hover:text-red-300"
        whileTap={{ scale: 0.9 }}
        transition={SPRING.snappy}
      >
        <Trash2 size={15} />
      </motion.button>
    </div>
  );
}

interface ShelfItemProps {
  file: ShelfFile;
  shelf: Shelf;
}

function ShelfItem({ file, shelf }: ShelfItemProps) {
  const Icon = file.isDir ? Folder : file.isImage ? ImageIcon : FileIcon;

  // Нативный drag стартует не по нажатию, а после сдвига — иначе не работал бы клик.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
    };
    const onMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      cleanup();
      shelf.dragOut(file);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7 }}
      whileHover={{ scale: 1.04 }}
      transition={SPRING.snappy}
      onPointerDown={onPointerDown}
      title={`${file.name} — потяните, чтобы перенести в другое окно`}
      className="group relative flex h-[88px] w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-ink/[0.07] px-1.5"
    >
      <Icon size={26} strokeWidth={1.6} className={file.isDir ? "text-sky-300" : "text-ink/80"} />
      <span className="w-full truncate text-center text-[10px] font-medium text-ink/85">
        {file.name}
      </span>
      <span className="text-[9px] font-medium text-ink/40">
        {file.isDir ? "Папка" : formatBytes(file.size)}
      </span>
      <button
        type="button"
        aria-label={`Убрать ${file.name} с полки`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => shelf.remove(file.path)}
        className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink/15 text-ink/80 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ink/30"
      >
        <X size={10} strokeWidth={3} />
      </button>
    </motion.div>
  );
}
