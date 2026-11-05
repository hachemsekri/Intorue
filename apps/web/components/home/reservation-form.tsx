'use client';

import { normalizePhone, RESERVATION_VEHICLES, type ReservationVehicle } from '@winou/shared';
import { useEffect, useId, useRef, useState } from 'react';

export interface FormTexts {
  title: string;
  name: string;
  phone: string;
  phoneHint: string;
  vehicle: string;
  vehicles: Record<ReservationVehicle, string>;
  city: string;
  submit: string;
  sending: string;
  success: string;
  privacy: string;
  errors: Record<'name' | 'phone' | 'city' | 'rate' | 'server' | 'network' | 'tooFast' | 'rejected', string>;
}

type Field = 'name' | 'phone' | 'city';
type Status = { kind: 'idle' | 'sending' } | { kind: 'ok' } | { kind: 'error'; message: string };

/**
 * Tracker reservation (a call-back request). The success message only shows once the API has
 * confirmed the reservation is saved. The button stays disabled until the script is running, so
 * an early click can never send the details anywhere else (such as into the page address).
 */
export function ReservationForm({ t, locale }: { t: FormTexts; locale: string }) {
  const id = useId();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const shownAt = useRef(0);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    shownAt.current = performance.now();
    setReady(true);
  }, []);

  const focusFirst = (e: Partial<Record<Field, string>>) => {
    const first = (['name', 'phone', 'city'] as Field[]).find((f) => e[f]);
    if (first) form.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  };

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (status.kind === 'sending') return;
    const data = new FormData(ev.currentTarget);
    const body = {
      name: String(data.get('name') ?? ''),
      phone: String(data.get('phone') ?? ''),
      vehicleType: String(data.get('vehicleType') ?? 'car'),
      city: String(data.get('city') ?? ''),
      locale,
      website: String(data.get('website') ?? ''),
      elapsedMs: Math.round(performance.now() - shownAt.current),
    };
    const local: Partial<Record<Field, string>> = {};
    if (!/\p{L}/u.test(body.name.trim())) local.name = t.errors.name;
    if (!normalizePhone(body.phone)) local.phone = t.errors.phone;
    if (body.city.trim().length > 80) local.city = t.errors.city;
    setErrors(local);
    if (Object.keys(local).length) {
      setStatus({ kind: 'idle' });
      focusFirst(local);
      return;
    }

    setStatus({ kind: 'sending' });
    let res: Response;
    try {
      res = await fetch('/api/public/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-winou-csrf': '1' },
        body: JSON.stringify(body),
      });
    } catch {
      setStatus({ kind: 'error', message: t.errors.network });
      return;
    }
    const json = (await res.json().catch(() => null)) as { saved?: boolean; code?: string; issues?: { path: string; code: string }[] } | null;
    if ((res.status === 200 || res.status === 201) && json?.saved === true) {
      setStatus({ kind: 'ok' });
      setErrors({});
      form.current?.reset();
      return;
    }
    if (res.status === 400 && json?.issues?.length) {
      const server: Partial<Record<Field, string>> = {};
      for (const i of json.issues) if (i.path === 'name' || i.path === 'phone' || i.path === 'city') server[i.path] = t.errors[i.path];
      if (Object.keys(server).length) {
        setErrors(server);
        setStatus({ kind: 'idle' });
        focusFirst(server);
        return;
      }
    }
    const message =
      res.status === 429
        ? t.errors.rate
        : json?.code === 'reservation.too_fast'
          ? t.errors.tooFast
          : json?.code === 'reservation.rejected'
            ? t.errors.rejected
            : t.errors.server;
    setStatus({ kind: 'error', message });
  }

  const field = (name: Field, label: string, input: React.InputHTMLAttributes<HTMLInputElement>, hint?: string) => {
    const err = errors[name];
    const describedBy = [hint ? `${id}-${name}-hint` : '', err ? `${id}-${name}-err` : ''].filter(Boolean).join(' ') || undefined;
    return (
      <label htmlFor={`${id}-${name}`}>
        {label}
        <input id={`${id}-${name}`} name={name} aria-invalid={err ? true : undefined} aria-describedby={describedBy} {...input} />
        {hint && (
          <span className="hint" id={`${id}-${name}-hint`}>
            {hint}
          </span>
        )}
        {err && (
          <span className="err" id={`${id}-${name}-err`}>
            {err}
          </span>
        )}
      </label>
    );
  };

  const sending = status.kind === 'sending';
  return (
    <form ref={form} className="form" id="reserver" aria-labelledby={`${id}-h`} noValidate method="post" onSubmit={onSubmit} data-reveal="1">
      <h3 id={`${id}-h`}>{t.title}</h3>
      {field('name', t.name, { autoComplete: 'name', required: true, maxLength: 100 })}
      {field('phone', t.phone, { type: 'tel', autoComplete: 'tel', inputMode: 'tel', required: true, maxLength: 30, dir: 'ltr' }, t.phoneHint)}
      <label htmlFor={`${id}-vehicle`}>
        {t.vehicle}
        <select id={`${id}-vehicle`} name="vehicleType" defaultValue="car">
          {RESERVATION_VEHICLES.map((v) => (
            <option key={v} value={v}>
              {t.vehicles[v]}
            </option>
          ))}
        </select>
      </label>
      {field('city', t.city, { autoComplete: 'address-level2', maxLength: 80 })}
      {/* Spam trap: hidden from people and assistive technology; bots tend to fill every field. */}
      <div className="hp" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <button className="btn" type="submit" disabled={!ready || sending} aria-disabled={!ready || sending}>
        {sending ? t.sending : t.submit}
      </button>
      <p className={`msg full${status.kind === 'ok' ? ' ok' : status.kind === 'error' ? ' bad' : ''}`} role="status" aria-live="polite">
        {status.kind === 'ok' ? t.success : status.kind === 'error' ? status.message : ''}
      </p>
      <p className="privacy full">{t.privacy}</p>
    </form>
  );
}
