'use client';

import { EMPTY_COUNTS, type VehicleCounts } from '@winou/config';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QuoteForm, type FormTexts, type OfferTexts } from './quote-form';
import { isFirstOpenOfSession, isPageFormStarted, onRequestSubmitted, requestSubmitted } from './quote-state';

const FIRST_DELAY_MS = 20_000;
const NEXT_DELAY_MS = 60_000;
/** When it is not a good moment (price section on screen, page form started), look again soon. */
const RETRY_MS = 5_000;

const offerOnScreen = () => {
  const r = document.getElementById('offre')?.getBoundingClientRect();
  return !!r && r.top < window.innerHeight && r.bottom > 0;
};

/**
 * Quote popup: 20 s after the first open of a session, 60 s after a reload in that session and
 * after each close. Never over the price section or once the page's form has a phone number,
 * and never again on this browser once a request is submitted. No prices in here. It only
 * exists on the home page, so legal pages never show it.
 */
export function QuotePopup({ locale, t, offer }: { locale: string; t: FormTexts; offer: OfferTexts }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const [counts, setCounts] = useState<VehicleCounts>(EMPTY_COUNTS);

  const plan = useCallback((ms: number) => {
    clearTimeout(timer.current);
    if (requestSubmitted()) return;
    timer.current = setTimeout(() => {
      if (requestSubmitted()) return;
      if (offerOnScreen() || isPageFormStarted()) return plan(RETRY_MS);
      setMounted(true);
      // First time: the contents aren't rendered yet, the effect below opens it once they are.
      const d = dialog.current;
      if (d?.firstChild) open(d);
    }, ms);
  }, []);

  useEffect(() => {
    plan(isFirstOpenOfSession() ? FIRST_DELAY_MS : NEXT_DELAY_MS);
    const off = onRequestSubmitted(() => clearTimeout(timer.current));
    return () => {
      clearTimeout(timer.current);
      off();
    };
  }, [plan]);

  // The first time, the dialog's contents have just been rendered.
  useEffect(() => {
    if (mounted && dialog.current && !dialog.current.open) open(dialog.current);
  }, [mounted]);

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      className="pop"
      aria-label={t.popupLabel}
      onClose={() => plan(NEXT_DELAY_MS)}
      onClick={(e) => {
        if (e.target === dialog.current) close(); // click on the backdrop
      }}
    >
      {mounted && (
        <div className="pop-box">
          <button className="pop-x" type="button" aria-label={t.popupClose} onClick={close}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <QuoteForm variant="popup" idPrefix="pop" locale={locale} t={t} offer={offer} counts={counts} onCounts={setCounts} />
        </div>
      )}
    </dialog>
  );
}

function open(d: HTMLDialogElement) {
  if (d.open) return;
  d.showModal();
  // With a mouse, go straight to the phone field; on a touch screen don't pop the keyboard up.
  const target = window.matchMedia('(pointer: fine)').matches ? d.querySelector<HTMLElement>('input[name="tel"]') : d.querySelector<HTMLElement>('.pop-x');
  target?.focus({ preventScroll: true });
}
