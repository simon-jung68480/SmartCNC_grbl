import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface LayoutSizes {
  leftWidth: number;
  rightWidth: number;
  centerTopPercent: number;
  rightTopPercent: number;
}

export const DEFAULT_LAYOUT: LayoutSizes = {
  leftWidth: 340,
  rightWidth: 430,
  centerTopPercent: 50,
  rightTopPercent: 52,
};

const STORAGE_KEY = 'smartcnc_layout_sizes';

export function useLayoutResizer(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [layout, setLayout] = useState<LayoutSizes>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          leftWidth: typeof parsed.leftWidth === 'number' ? parsed.leftWidth : DEFAULT_LAYOUT.leftWidth,
          rightWidth: typeof parsed.rightWidth === 'number' ? parsed.rightWidth : DEFAULT_LAYOUT.rightWidth,
          centerTopPercent:
            typeof parsed.centerTopPercent === 'number' ? parsed.centerTopPercent : DEFAULT_LAYOUT.centerTopPercent,
          rightTopPercent:
            typeof parsed.rightTopPercent === 'number' ? parsed.rightTopPercent : DEFAULT_LAYOUT.rightTopPercent,
        };
      }
    } catch {
      // ignore JSON errors
    }
    return DEFAULT_LAYOUT;
  });

  const [activeDrag, setActiveDrag] = useState<
    'col-left' | 'col-right' | 'row-center' | 'row-right' | null
  >(null);

  const centerColRef = useRef<HTMLDivElement | null>(null);
  const rightColRef = useRef<HTMLDivElement | null>(null);

  // Save to localStorage when layout changes (debounced/on drag end)
  const saveLayout = useCallback((newLayout: LayoutSizes) => {
    setLayout(newLayout);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
    } catch {
      // ignore storage errors
    }
  }, []);

  const resetAll = useCallback(() => {
    saveLayout(DEFAULT_LAYOUT);
  }, [saveLayout]);

  const resetLeftWidth = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, leftWidth: DEFAULT_LAYOUT.leftWidth };
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  const resetRightWidth = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, rightWidth: DEFAULT_LAYOUT.rightWidth };
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  const resetCenterTop = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, centerTopPercent: DEFAULT_LAYOUT.centerTopPercent };
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  const resetRightTop = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, rightTopPercent: DEFAULT_LAYOUT.rightTopPercent };
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  // Pointer move / up listeners on window while dragging
  useEffect(() => {
    if (!activeDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();

      if (activeDrag === 'col-left') {
        const rawWidth = e.clientX - containerRect.left;
        const minWidth = 260;
        const maxWidth = Math.max(minWidth, Math.min(560, containerRect.width - layout.rightWidth - 300));
        const clamped = Math.max(minWidth, Math.min(maxWidth, rawWidth));
        setLayout((prev) => ({ ...prev, leftWidth: Math.round(clamped) }));
      } else if (activeDrag === 'col-right') {
        const rawWidth = containerRect.right - e.clientX;
        const minWidth = 300;
        const maxWidth = Math.max(minWidth, Math.min(750, containerRect.width - layout.leftWidth - 300));
        const clamped = Math.max(minWidth, Math.min(maxWidth, rawWidth));
        setLayout((prev) => ({ ...prev, rightWidth: Math.round(clamped) }));
      } else if (activeDrag === 'row-center' && centerColRef.current) {
        const colRect = centerColRef.current.getBoundingClientRect();
        const rawPercent = ((e.clientY - colRect.top) / colRect.height) * 100;
        const clamped = Math.max(20, Math.min(80, rawPercent));
        setLayout((prev) => ({ ...prev, centerTopPercent: Math.round(clamped) }));
      } else if (activeDrag === 'row-right' && rightColRef.current) {
        const colRect = rightColRef.current.getBoundingClientRect();
        const rawPercent = ((e.clientY - colRect.top) / colRect.height) * 100;
        const clamped = Math.max(20, Math.min(80, rawPercent));
        setLayout((prev) => ({ ...prev, rightTopPercent: Math.round(clamped) }));
      }
    };

    const handlePointerUp = () => {
      setActiveDrag(null);
      // Persist latest state
      setLayout((latest) => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(latest));
        } catch {
          // ignore
        }
        return latest;
      });
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (activeDrag === 'col-left' || activeDrag === 'col-right') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [activeDrag, layout.leftWidth, layout.rightWidth, containerRef]);

  const startDrag = useCallback((type: 'col-left' | 'col-right' | 'row-center' | 'row-right', e: React.PointerEvent) => {
    e.preventDefault();
    setActiveDrag(type);
  }, []);

  return {
    layout,
    activeDrag,
    centerColRef,
    rightColRef,
    startDrag,
    resetAll,
    resetLeftWidth,
    resetRightWidth,
    resetCenterTop,
    resetRightTop,
  };
}

/**
 * Séparateur vertical entre colonnes avec poignée et retour visuel au survol
 */
export const VerticalSplitter: React.FC<{
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  isActive?: boolean;
  title?: string;
}> = ({ onPointerDown, onDoubleClick, isActive = false, title = 'Glisser pour ajuster la largeur (Double-clic pour réinitialiser)' }) => {
  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title={title}
      className={`hidden lg:flex w-2.5 shrink-0 -mx-0.5 cursor-col-resize group relative items-center justify-center select-none z-20 transition-colors ${
        isActive ? 'bg-sky-100' : 'hover:bg-slate-200/80'
      }`}
    >
      {/* Ligne centrale */}
      <div
        className={`w-[2px] h-full transition-colors ${
          isActive ? 'bg-sky-600' : 'bg-slate-300 group-hover:bg-sky-500'
        }`}
      />

      {/* Poignée de saisie avec 3 petits points verticaux */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 flex flex-col gap-1 px-0.5 py-2 rounded-full border transition-all ${
          isActive
            ? 'bg-sky-600 border-sky-700 shadow-sm'
            : 'bg-white border-slate-300 group-hover:border-sky-400 group-hover:bg-sky-50'
        }`}
      >
        <span
          className={`w-1 h-1 rounded-full ${
            isActive ? 'bg-white' : 'bg-slate-400 group-hover:bg-sky-600'
          }`}
        />
        <span
          className={`w-1 h-1 rounded-full ${
            isActive ? 'bg-white' : 'bg-slate-400 group-hover:bg-sky-600'
          }`}
        />
        <span
          className={`w-1 h-1 rounded-full ${
            isActive ? 'bg-white' : 'bg-slate-400 group-hover:bg-sky-600'
          }`}
        />
      </div>
    </div>
  );
};

/**
 * Séparateur horizontal entre panneaux avec poignée et retour visuel au survol
 */
export const HorizontalSplitter: React.FC<{
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  isActive?: boolean;
  title?: string;
}> = ({ onPointerDown, onDoubleClick, isActive = false, title = 'Glisser pour ajuster la hauteur (Double-clic pour réinitialiser)' }) => {
  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title={title}
      className={`hidden lg:flex h-2.5 shrink-0 -my-0.5 cursor-row-resize group relative items-center justify-center select-none z-20 transition-colors ${
        isActive ? 'bg-sky-100' : 'hover:bg-slate-200/80'
      }`}
    >
      {/* Ligne centrale */}
      <div
        className={`h-[2px] w-full transition-colors ${
          isActive ? 'bg-sky-600' : 'bg-slate-300 group-hover:bg-sky-500'
        }`}
      />

      {/* Poignée de saisie avec 3 petits points horizontaux */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 flex flex-row gap-1 py-0.5 px-2 rounded-full border transition-all ${
          isActive
            ? 'bg-sky-600 border-sky-700 shadow-sm'
            : 'bg-white border-slate-300 group-hover:border-sky-400 group-hover:bg-sky-50'
        }`}
      >
        <span
          className={`w-1 h-1 rounded-full ${
            isActive ? 'bg-white' : 'bg-slate-400 group-hover:bg-sky-600'
          }`}
        />
        <span
          className={`w-1 h-1 rounded-full ${
            isActive ? 'bg-white' : 'bg-slate-400 group-hover:bg-sky-600'
          }`}
        />
        <span
          className={`w-1 h-1 rounded-full ${
            isActive ? 'bg-white' : 'bg-slate-400 group-hover:bg-sky-600'
          }`}
        />
      </div>
    </div>
  );
};
