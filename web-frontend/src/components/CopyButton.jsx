import { useEffect, useRef, useState } from 'react';
import { copyText } from '../utils/clipboard';

// A small "Copy" button with honest feedback: "Copied!" on success,
// "Copy failed" (not silence) if the browser refuses both clipboard paths.
// `text` is what's copied; `label` is the idle text. Used for NFC tag URLs on
// the batch-generation screen and in the tag list.
const COLORS = { inkMuted: '#A0A0B0', border: '#5a5c73', ink: '#FFFFFF', ok: '#6fcf97', bad: '#f28b8b' };

export default function CopyButton({ text, label = 'Copy', style }) {
  const [state, setState] = useState('idle'); // 'idle' | 'copied' | 'failed'
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async (e) => {
    e.stopPropagation();
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  };

  const color = state === 'copied' ? COLORS.ok : state === 'failed' ? COLORS.bad : COLORS.ink;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${state === 'idle' ? COLORS.border : color}`,
        color,
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 11.5,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
