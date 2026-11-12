import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Rendered above the player's own fullscreen layer. */
  zIndex?: number;
}

/**
 * Mobile-native sheet: slides up from the bottom, closes on backdrop tap / Escape / swipe-down on the
 * handle, respects the iPhone home-indicator safe area and never lets its scroll leak to the page.
 * On wide screens it becomes a centred dialog.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({ open, onClose, title, children, zIndex = 80 }) => {
  const startY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const onHandleDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (startY.current === null || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - startY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = 'none';
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (startY.current === null) return;
    const dy = e.clientY - startY.current;
    startY.current = null;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = '';
    }
    if (dy > 90) onClose();
  };

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center" style={{ zIndex }} data-no-ptr>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-md max-h-[85dvh] flex flex-col bg-[#0d1322]/95 backdrop-blur-2xl border border-white/10 rounded-t-[28px] sm:rounded-[28px] shadow-2xl animate-in slide-in-from-bottom-8 duration-200"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      >
        <div
          className="pt-2.5 pb-1 flex flex-col items-center cursor-grab touch-none sm:hidden"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <div className="w-10 h-1.5 rounded-full bg-white/25" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h3 className="text-base font-bold text-white font-display">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pb-3 overflow-y-auto overscroll-contain space-y-3">{children}</div>
      </div>
    </div>
  );
};
