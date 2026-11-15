import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Icons } from '../utils/icons.jsx';

// Small auto-dismissing confirmation message. Render `toast` anywhere in the page.
export default function useToast(durationMs = 3200) {
  const [message, setMessage] = useState('');
  const timer = useRef(null);

  const showToast = useCallback(
    (text) => {
      if (!text) return;
      setMessage(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(''), durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const toast = message
    ? createElement('div', { className: 'q-toast', role: 'status', 'aria-live': 'polite' }, Icons.checkCircle, message)
    : null;

  return { toast, showToast };
}
