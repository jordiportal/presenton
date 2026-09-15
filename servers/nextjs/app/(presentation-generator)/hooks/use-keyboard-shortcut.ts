import { useEffect, useCallback } from 'react';

type KeyboardEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey?: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
};

export const useKeyboardShortcut = (
  keys: string[],
  callback: (e: KeyboardEvent) => void,
  deps: any[] = []
) => {
  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if ((event as unknown as globalThis.KeyboardEvent).defaultPrevented) {
        return;
      }

      const nativeEvent = event as unknown as globalThis.KeyboardEvent;
      const target = nativeEvent.target;
      if (
        target instanceof Element &&
        target.closest("input,textarea,select,[contenteditable='true']")
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const isModifierPressed = Boolean(event.ctrlKey || event.metaKey || nativeEvent.metaKey);
      
      if (keys.includes(key) && isModifierPressed) {
        event.preventDefault();
        callback(event);
      }
    },
    [callback, ...deps]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress as any);
    return () => {
      document.removeEventListener('keydown', handleKeyPress as any);
    };
  }, [handleKeyPress]);
}; 
