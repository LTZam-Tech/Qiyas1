import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { LANGUAGES, getLanguage, makeT } from '../i18n/index.js';
import { Icons } from '../utils/icons.jsx';
import styles from './LanguageMenu.module.css';

/**
 * Language picker. Each language is listed in its own script (العربية,
 * English, اردو) so people can find theirs whatever the current UI language.
 */
export default function LanguageMenu({ lang, onChange, variant = 'icon' }) {
  const t = makeT(lang);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();
  const current = getLanguage(lang);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    const idx = LANGUAGES.findIndex((l) => l.code === lang);
    itemRefs.current[Math.max(idx, 0)]?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, lang]);

  const choose = (code) => {
    setOpen(false);
    if (code !== lang) onChange(code);
  };

  const onMenuKey = (e) => {
    const items = itemRefs.current.filter(Boolean);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      rootRef.current?.querySelector('button')?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const label = t('اللغة', 'Language');

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={variant === 'icon' ? `q-icon-btn ${styles.trigger}` : `q-btn q-btn-ghost q-btn-sm ${styles.triggerText}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label}: ${current.native}`}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        {Icons.globeIcon}
        {variant === 'icon' ? (
          <span className={styles.code} lang={current.code}>{current.short}</span>
        ) : (
          <span lang={current.code}>{current.native}</span>
        )}
        <span className={styles.chev} aria-hidden="true">{Icons.chevronDown}</span>
      </button>

      {open && (
        <ul id={menuId} role="menu" aria-label={label} className={styles.menu} onKeyDown={onMenuKey}>
          {LANGUAGES.map((l, i) => {
            const selected = l.code === lang;
            return (
              <li key={l.code} role="none">
                <button
                  ref={(el) => { itemRefs.current[i] = el; }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`${styles.item} ${selected ? styles.itemOn : ''}`}
                  onClick={() => choose(l.code)}
                >
                  <span className={styles.itemText}>
                    <span className={styles.native} lang={l.code} dir={l.dir}>{l.native}</span>
                    {l.native !== l.english && <span className={styles.english} lang="en" dir="ltr">{l.english}</span>}
                  </span>
                  <span className={styles.check} aria-hidden="true">{selected ? Icons.check : null}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

LanguageMenu.propTypes = {
  lang: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['icon', 'text']),
};
