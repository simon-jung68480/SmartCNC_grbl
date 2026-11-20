import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface LayoutSizes {
  leftWidth: number;
  rightWidth: number;
  centerTopPercent: number;
  rightTopPercent: number;
}

export const DEFAULT_LAYOUT: LayoutSizes = {
  leftWidth: 360,
  rightWidth: 375,
  centerTopPercent: 62,
  rightTopPercent: 54,
};

const STORAGE_KEY = 'smartcnc_layout_sizes';

export function useLayoutResizer(containerRef: React.RefObject<HTMLElement | null>) {
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
      const container = containerRef.current;
      if (!container || !container.clientWidth) return;
      const containerRect = container.getBoundingClientRect();
      const zoom = containerRect.width / container.clientWidth;

      if (activeDrag === 'col-left') {
        const rawWidth = (e.clientX - containerRect.left) / zoom;
        const right = container.querySelector<HTMLElement>('.cnc-column-sized[data-column="right"]');
        const minWidth = 240;
        const maxWidth = Math.max(minWidth, Math.min(560, container.clientWidth - (right?.offsetWidth ?? 0) - 280));
        const clamped = Math.max(minWidth, Math.min(maxWidth, rawWidth));
        setLayout((prev) => ({ ...prev, leftWidth: Math.round(clamped) }));
      } else if (activeDrag === 'col-right') {
        const rawWidth = (containerRect.right - e.clientX) / zoom;
        const left = container.querySelector<HTMLElement>('.cnc-column-sized[data-column="left"]');
        const minWidth = 240;
        const maxWidth = Math.max(minWidth, Math.min(750, container.clientWidth - (left?.offsetWidth ?? 0) - 280));
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
  }, [activeDrag, containerRef]);

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
 * Séparateur vertical entre colonnes avec filet discret et barre de saisie au survol
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
      className="cnc-splitter w-2 shrink-0 cursor-col-resize group relative items-center justify-center select-none z-20"
    >
      <div
        className={`w-[2px] h-full rounded-full transition-colors ${
          isActive ? 'bg-sky-400' : 'bg-slate-800/90 group-hover:bg-sky-400'
        }`}
      />
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-1 h-8 rounded-full transition-opacity pointer-events-none ${
          isActive
            ? 'bg-sky-400 opacity-100 shadow-[0_0_8px_rgba(56,189,248,0.65)]'
            : 'bg-sky-400 opacity-0 group-hover:opacity-100'
        }`}
      />
    </div>
  );
};

/**
 * Séparateur horizontal entre panneaux avec filet discret et barre de saisie au survol
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
      className="cnc-splitter h-2 shrink-0 cursor-row-resize group relative items-center justify-center select-none z-20"
    >
      <div
        className={`h-[2px] w-full rounded-full transition-colors ${
          isActive ? 'bg-sky-400' : 'bg-slate-800/90 group-hover:bg-sky-400'
        }`}
      />
      <div
        className={`absolute left-1/2 -translate-x-1/2 h-1 w-8 rounded-full transition-opacity pointer-events-none ${
          isActive
            ? 'bg-sky-400 opacity-100 shadow-[0_0_8px_rgba(56,189,248,0.65)]'
            : 'bg-sky-400 opacity-0 group-hover:opacity-100'
        }`}
      />
    </div>
  );
};
