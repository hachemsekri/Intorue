'use client';

import type { SupportedLocale } from '@winou/i18n';
import { useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { clamp, prefersReducedMotion, useScrollFrame } from './scroll';

/** The bar above the three steps fills as the steps scroll into view. Full without script. */
export function StepsTrack() {
  const bar = useRef<HTMLElement>(null);
  useScrollFrame(() => {
    const row = bar.current?.parentElement?.parentElement;
    if (!row || !bar.current) return;
    const top = row.getBoundingClientRect().top;
    bar.current.style.transform = `scaleX(${clamp((window.innerHeight * 0.92 - top) / (window.innerHeight * 0.6), 0, 1)})`;
  });
  return (
    <div className="track" aria-hidden="true">
      <i ref={bar} />
    </div>
  );
}

/** Footer wordmark that slides into place as it appears. */
export function MegaWordmark({ parts }: { parts: readonly [string, string] }) {
  const el = useRef<HTMLSpanElement>(null);
  useScrollFrame(() => {
    const m = el.current;
    if (!m || prefersReducedMotion()) return;
    const r = m.getBoundingClientRect();
    if (r.top >= window.innerHeight) return;
    const dir = getComputedStyle(m.parentElement!).direction === 'rtl' ? -1 : 1;
    m.style.transform = `translateX(${(1 - clamp((window.innerHeight - r.top) / (r.height * 1.1), 0, 1)) * -7 * dir}%)`;
  });
  return (
    <span className="mega wm" aria-hidden="true" ref={el}>
      {parts[0]}
      <span>{parts[1]}</span>
    </span>
  );
}

/** Appears after the first screen; returns to the top and moves focus to the logo. */
export function ToTop({ label }: { label: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  useScrollFrame(() => btn.current?.classList.toggle('show', window.scrollY > window.innerHeight * 0.8));
  return (
    <button
      ref={btn}
      type="button"
      className="totop"
      aria-label={label}
      title={label}
      onClick={() => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        document.getElementById('ih-logo')?.focus({ preventScroll: true });
      }}
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
      </svg>
    </button>
  );
}

const LABELS: Record<SupportedLocale, string> = { fr: 'Français', ar: 'العربية', en: 'English' };

/** Compact language menu for the dark header. */
export function HomeLang() {
  const { locale, setLocale, t } = useI18n();
  return (
    <select className="lang" aria-label={t('common.language')} value={locale} onChange={(e) => setLocale(e.target.value as SupportedLocale)}>
      {(Object.keys(LABELS) as SupportedLocale[]).map((l) => (
        <option key={l} value={l} lang={l}>
          {LABELS[l]}
        </option>
      ))}
    </select>
  );
}
