import { useState, useCallback, useRef, useEffect } from 'react';

interface UseResizableOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export function useResizable({ storageKey, defaultWidth, minWidth, maxWidth }: UseResizableOptions) {
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n >= minWidth && n <= maxWidth) return n;
    }
    return defaultWidth;
  });

  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMouseMove(ev: MouseEvent) {
      const delta = startX.current - ev.clientX;
      const clamped = Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta));
      setWidth(clamped);
    }

    function onMouseUp() {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width, minWidth, maxWidth]);

  // Persist width to localStorage when it changes (debounced to mouseup via the ref check)
  useEffect(() => {
    if (!dragging.current) {
      localStorage.setItem(storageKey, String(width));
    }
  }, [width, storageKey]);

  return { width, handleMouseDown };
}
