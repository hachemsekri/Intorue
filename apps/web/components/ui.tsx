'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { useI18n } from '@/lib/i18n';
import { ApiError } from '@/lib/api';
import { ThemeToggle } from './theme-toggle';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }>(
  function Button({ variant = 'primary', busy, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={cx(
          'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] transition-[transform,filter,background-color] disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:-translate-y-px',
          variant === 'primary' && 'min-h-12 bg-acc font-extrabold text-on-acc enabled:hover:brightness-110',
          variant === 'secondary' && 'bg-surface-2 font-bold text-ink',
          variant === 'ghost' && 'font-bold text-ink hover:bg-surface-2',
          variant === 'danger' && 'bg-surface-2 font-bold text-danger hover:bg-danger-bg',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export function Field({
  label,
  hint,
  error,
  children,
  optional,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const id = useId();
  const { t } = useI18n();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {optional && <span className="font-normal"> ({t('common.optional')})</span>}
      </label>
      {children({ id, 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined, 'aria-invalid': !!error || undefined })}
      {hint && (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  'min-h-12 w-full rounded-xl border-2 border-transparent bg-surface-2 px-3.5 text-[15px] font-medium text-ink focus:border-acc focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'pe-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Chip({ active, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        'min-h-11 rounded-full px-4 text-sm font-semibold transition-[transform,background-color,color] hover:-translate-y-px',
        active ? 'bg-ink text-canvas' : 'bg-surface-2 text-ink',
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

type Tone = 'moving' | 'stopped' | 'offline' | 'attention' | 'neutral' | 'danger';
export function Badge({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  const styles: Record<Tone, string> = {
    moving: 'bg-ok-bg text-moving',
    stopped: 'bg-info-bg text-stopped',
    offline: 'bg-surface-2 text-offline',
    attention: 'bg-attention-bg text-attention',
    neutral: 'bg-surface-2 text-muted',
    danger: 'bg-danger-bg text-danger',
  };
  const dots: Record<Tone, string> = {
    moving: 'bg-moving',
    stopped: 'bg-stopped',
    offline: 'bg-offline',
    attention: 'bg-attention',
    neutral: 'bg-muted',
    danger: 'bg-danger',
  };
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', styles[tone])}>
      {dot && <span aria-hidden className={cx('size-2 rounded-full', dots[tone])} />}
      {children}
    </span>
  );
}

/** Native <dialog>: focus trapping, Escape to close and inert background come for free. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-2xl"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-2">
            <h2 id={titleId} className="h-display text-2xl">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-[14px] text-muted hover:bg-surface-2" aria-label={t('common.close')}>
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="h-display text-[clamp(30px,3vw,44px)]">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <ThemeToggle desktopOnly />
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-[var(--radius-card)] bg-surface', className)}>{children}</div>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-2xl px-4 py-3 text-sm',
        tone === 'error' && 'bg-danger-bg text-danger',
        tone === 'success' && 'bg-ok-bg font-semibold text-moving',
        tone === 'info' && 'bg-info-bg text-ink',
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-[var(--radius-card)] bg-surface px-6 py-12 text-center text-muted">{children}</div>;
}

export function DemoBadge() {
  const { t } = useI18n();
  return <span className="rounded-md bg-attention-bg px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-attention">{t('common.demo')}</span>;
}

/** Turns an API error into translated top-level and per-field messages. */
export function useErrorText() {
  const { tx, t } = useI18n();
  return (e: unknown): { message: string; fields: Record<string, string> } => {
    if (e instanceof ApiError) {
      const fields: Record<string, string> = {};
      for (const i of e.issues ?? []) fields[i.path] ??= tx(`errors.${i.code}`, t('errors.validation'));
      const message = e.code === 'validation' ? t('errors.validation') : tx(`errors.${e.code}`, t('errors.generic'));
      return { message, fields };
    }
    return { message: t('errors.generic'), fields: {} };
  };
}

export { cx };
