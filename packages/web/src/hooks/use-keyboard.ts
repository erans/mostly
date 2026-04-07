import { useEffect, useCallback } from 'react';

type ShortcutHandler = () => void;

interface Shortcuts {
  [key: string]: ShortcutHandler;
}

export function useKeyboard(shortcuts: Shortcuts) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't fire shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
      // Exception: Escape always fires
      if (e.key !== 'Escape') return;
    }

    // Cmd+K / Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      shortcuts['cmd+k']?.();
      return;
    }

    // Single-key shortcuts
    const handler = shortcuts[e.key.toLowerCase()];
    if (handler && !e.metaKey && !e.ctrlKey && !e.altKey) {
      handler();
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
