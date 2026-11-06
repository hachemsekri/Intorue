'use client';

import { PRICING, quoteFor, VEHICLE_KINDS, type VehicleCounts, type VehicleKind } from '@winou/config';
import { interpolate, type Messages } from '@winou/i18n';
import { normalizePhone } from '@winou/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { markRequestSubmitted, setPageFormStarted } from './quote-state';

export type OfferTexts = Messages['home']['offer'];
export type FormTexts = Messages['home']['form'];

const LOCALE_TAG: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN-u-nu-latn' };

/** "2 800 DT" in the page's language. */
export function money(v: number, locale: string, unit: string) {
  return `${new Intl.NumberFormat(LOCALE_TAG[locale] ?? 'fr-FR').format(v)} ${unit}`;
}

/** Old price crossed out and the fleet price, or just the price. */
export function PriceTag({ kind, fleet, locale, unit }: { kind: VehicleKind; fleet: boolean; locale: string; unit: string }) {
  const item = PRICING.items[kind];
  if (!fleet) return <>{money(item.price, locale, unit)}</>;
  return (
    <>
      <s>{money(item.price, locale, unit)}</s> <span className="now">{money(item.fleetPrice, locale, unit)}</span>
    </>
  );
}

export function Stepper({ kind, value, onChange, offer }: { kind: VehicleKind; value: number; onChange: (n: number) => void; offer: OfferTexts }) {
  return (
    <div className="stp" role="group" aria-label={interpolate(offer.quantity, { kind: offer.kinds[kind] })}>
      <button type="button" className="minus" aria-label={offer.remove[kind]} onClick={() => onChange(Math.max(0, value - 1))}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={offer.add[kind]} onClick={() => onChange(Math.min(PRICING.maxPerKind, value + 1))}>
        +
      </button>
    </div>
  );
}

type Step = 1 | 2 | 3 | 4;
type Who = 'individual' | 'company' | '';

/**
 * Quote request, step by step: phone first, so a call back is possible even if someone stops
 * early. Used on the page (with prices, counts shared with the price cards) and in the popup
 * (no prices at all). Totals shown here are estimates; the server recalculates them.
 */
export function QuoteForm({
  variant,
  idPrefix,
  locale,
  t,
  offer,
  counts,
  onCounts,
}: {
  variant: 'page' | 'popup';
  idPrefix: string;
  locale: string;
  t: FormTexts;
  offer: OfferTexts;
  counts: VehicleCounts;
  onCounts: (c: VehicleCounts) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [tel, setTel] = useState('');
  const [who, setWho] = useState<Who>('');
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState('');
  const shownAt = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const moved = useRef(false);
  const isPage = variant === 'page';
  const quote = quoteFor(counts);

  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  // Tell the popup when someone has started the page's form.
  useEffect(() => {
    if (isPage) setPageFormStarted(tel.trim().length > 0);
  }, [isPage, tel]);

  // Keyboard and screen reader users land on the new step (not on first load).
  useEffect(() => {
    if (!moved.current) return;
    const el = form.current?.querySelector<HTMLElement>('.wiz-step input, .wiz-step button[aria-pressed], .wiz-step[tabindex="-1"]');
    el?.focus({ preventScroll: true });
  }, [step]);

  const go = (s: Step) => {
    moved.current = true;
    setError('');
    setStep(s);
  };

  async function send() {
    setBusy(true);
    setError('');
    let res: Response;
    try {
      res = await fetch('/api/public/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-winou-csrf': '1' },
        body: JSON.stringify({
          phone: tel,
          clientType: who,
          company: who === 'company' ? company : undefined,
          vehicles: counts,
          name,
          city,
          locale,
          website: (form.current?.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '',
          elapsedMs: Math.round(performance.now() - shownAt.current),
        }),
      });
    } catch {
      setBusy(false);
      setError(t.errors.network);
      return;
    }
    const json = (await res.json().catch(() => null)) as { saved?: boolean; code?: string; issues?: { path: string }[] } | null;
    setBusy(false);
    if ((res.status === 200 || res.status === 201) && json?.saved === true) {
      setThanks(interpolate(t.thanks, { name: name.trim() }));
      markRequestSubmitted();
      go(4);
      return;
    }
    // A field the server refused: go back to the step that has it.
    const path = json?.issues?.[0]?.path ?? '';
    if (path === 'phone') return void (go(1), setError(t.errors.phone));
    if (path === 'company') return void (go(2), setError(t.errors.company));
    if (path.startsWith('vehicles')) return void (go(2), setError(t.errors.vehicles));
    if (path === 'name') return setError(t.errors.name);
    if (path === 'city') return setError(t.errors.city);
    setError(
      res.status === 429 ? t.errors.rate : json?.code === 'reservation.too_fast' ? t.errors.tooFast : json?.code === 'reservation.rejected' ? t.errors.rejected : t.errors.server,
    );
  }

  function next(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step === 1) {
      if (tel.replace(/\D/g, '').length !== 8 || !normalizePhone(tel)) return setError(t.errors.phone);
      go(2);
    } else if (step === 2) {
      if (!who) return setError(t.errors.who);
      if (who === 'company' && !company.trim()) return setError(t.errors.company);
      if (quote.vehicles < 1) return setError(t.errors.vehicles);
      go(3);
    } else if (step === 3) {
      if (!/\p{L}/u.test(name)) return setError(t.errors.name);
      void send();
    }
  }

  const Title = isPage ? 'h3' : 'h2';
  const unit = offer.currency;
  const err = (
    <p className="wiz-err" role="alert">
      {error}
    </p>
  );

  return (
    <form ref={form} className="wiz" method="post" noValidate onSubmit={next} aria-labelledby={`${idPrefix}-t`} data-step={step}>
      <div className="wiz-top">
        <span className="wiz-count" aria-live="polite">
          {step > 3 ? t.sent : interpolate(t.step, { n: step })}
        </span>
        <div className="wiz-bar" aria-hidden="true">
          <i style={{ width: `${(Math.min(step, 3) / 3) * 100}%` }} />
        </div>
      </div>
      {/* Spam trap: hidden from people and assistive technology; bots tend to fill every field. */}
      <div className="hp" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {step === 1 && (
        <div className="wiz-step">
          <Title id={`${idPrefix}-t`}>{isPage ? t.titlePage : t.titlePopup}</Title>
          <p>{t.intro}</p>
          <label htmlFor={`${idPrefix}-tel`}>{t.phone}</label>
          <div className="tel" dir="ltr">
            <span aria-hidden="true">+216</span>
            <input
              id={`${idPrefix}-tel`}
              name="tel"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={11}
              placeholder={t.phonePlaceholder}
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${idPrefix}-e1`}
            />
          </div>
          <p className="wiz-err" id={`${idPrefix}-e1`} role="alert">
            {error}
          </p>
          <button className="btn" type="submit">
            {t.continue}
          </button>
          <p className="wiz-note">{t.privacy}</p>
        </div>
      )}

      {step === 2 && (
        <div className="wiz-step">
          <Title id={`${idPrefix}-t`}>{t.whoTitle}</Title>
          <div className="who-pick" role="group" aria-label={t.whoLabel}>
            {(['individual', 'company'] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={who === w}
                onClick={() => {
                  setWho(w);
                  setError('');
                }}
              >
                <strong>{t[w]}</strong>
                <span>{w === 'individual' ? t.individualText : t.companyText}</span>
              </button>
            ))}
          </div>
          {who === 'company' && (
            <div>
              <label htmlFor={`${idPrefix}-co`}>{t.companyName}</label>
              <input id={`${idPrefix}-co`} autoComplete="organization" maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          )}
          <div className="picker" role="group" aria-label={t.vehiclesLabel}>
            <p className="pick-t">{t.howMany}</p>
            {VEHICLE_KINDS.map((k) => (
              <div className="pick" key={k} data-kind={k}>
                <div>
                  <strong>{offer.kinds[k]}</strong>
                  {isPage && (
                    <span className="w-price">
                      <PriceTag kind={k} fleet={quote.fleet} locale={locale} unit={unit} />
                    </span>
                  )}
                </div>
                <Stepper
                  kind={k}
                  value={counts[k]}
                  offer={offer}
                  onChange={(n) => {
                    onCounts({ ...counts, [k]: n });
                    setError('');
                  }}
                />
              </div>
            ))}
            {isPage && quote.toFleet !== null && (
              <p className="w-hint" aria-live="polite">
                {quote.toFleet === 1 ? offer.hintOne : interpolate(offer.hintMany, { count: quote.toFleet })}
              </p>
            )}
            {isPage && quote.fleet && (
              <p className="w-save" aria-live="polite">
                {interpolate(offer.saved, { amount: money(quote.saved, locale, unit).replace(` ${unit}`, '') })}
              </p>
            )}
            {isPage && (
              <p className="w-total" aria-live="polite">
                <span>{offer.total}</span>
                <strong>{money(quote.total, locale, unit)}</strong>
              </p>
            )}
          </div>
          {err}
          <div className="wiz-nav">
            <button className="wiz-back" type="button" onClick={() => go(1)}>
              {t.back}
            </button>
            <button className="btn" type="submit">
              {t.continue}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wiz-step">
          <Title id={`${idPrefix}-t`}>{t.lastTitle}</Title>
          <div className="two">
            <div>
              <label htmlFor={`${idPrefix}-nm`}>{t.name}</label>
              <input id={`${idPrefix}-nm`} autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-ci`}>{t.city}</label>
              <input id={`${idPrefix}-ci`} autoComplete="address-level2" maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          {err}
          <div className="wiz-nav">
            <button className="wiz-back" type="button" onClick={() => go(2)} disabled={busy}>
              {t.back}
            </button>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? t.sending : t.submit}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="wiz-step" tabIndex={-1}>
          <Title id={`${idPrefix}-t`}>{t.doneTitle}</Title>
          <p>{thanks}</p>
        </div>
      )}
    </form>
  );
}
