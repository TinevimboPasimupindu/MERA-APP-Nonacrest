import { useEffect } from 'react';
import { FONT_LINK } from '../lib/theme';

export default function FontLoader() {
  useEffect(() => {
    if (document.getElementById('mera-fonts')) return;
    const link = document.createElement('link');
    link.id = 'mera-fonts';
    link.rel = 'stylesheet';
    link.href = FONT_LINK;
    document.head.appendChild(link);
  }, []);
  return null;
}