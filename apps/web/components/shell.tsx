'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { brand } from '@winou/config';
import { Icon, type IconName } from './icons';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';
import { cx } from './ui';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';

interface NavItem {
  href: string;
  label: MessageKey;
  icon: IconName;
  /** other routes that belong to this item */
  also?: string[];
  permission?: 'members.read';
  /** shown in the phone tab bar (the rest go under "More") */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { href: '/map', label: 'mobile.tabs.map', icon: 'map', primary: true },
  { href: '/trips', label: 'nav.trips', icon: 'trips', primary: true },
  { href: '/alerts', label: 'nav.alerts', icon: 'alerts', primary: true },
  { href: '/vehicles', label: 'nav.vehicles', icon: 'car', also: ['/devices'], primary: true },
  { href: '/members', label: 'nav.members', icon: 'team', permission: 'members.read' },
  { href: '/settings', label: 'nav.settings', icon: 'settings' },
];

const isActive = (n: NavItem, path: string) => [n.href, ...(n.also ?? [])].some((h) => path === h || path.startsWith(`${h}/`));

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('ltr-isolate font-black tracking-[-0.045em] [font-stretch:114%]', className)} aria-label={brand.name}>
      <span aria-hidden>{brand.wordmark[0]}</span>
      <span aria-hidden className="text-acc-text">
        {brand.wordmark[1]}
      </span>
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  const openAlerts = useOpenAlerts();

  return (
    <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2">
        {t('common.skipToContent')}
      </a>

      {/* Desktop side menu */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 px-3 py-5 lg:flex">
        <Link href="/map" className="mb-4 rounded-xl px-3.5 text-[28px] leading-none">
          <Wordmark />
        </Link>
        <nav aria-label={t('common.menu')} className="flex flex-col gap-1">
          <NavLinks openAlerts={openAlerts} />
        </nav>
        <div className="mt-auto">
          <Account />
        </div>
      </aside>

      {/* Phone and tablet top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-canvas/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link href="/map" className="flex min-h-11 items-center text-[24px] leading-none">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main id="main" tabIndex={-1} className="min-w-0 px-4 pt-2 pb-28 outline-none lg:py-4 lg:ps-1 lg:pe-4 lg:pb-4">
        <OfflineBanner />
        {children}
      </main>

      {/* Phone and tablet tab bar */}
      <nav aria-label={t('common.menu')} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          <NavLinks openAlerts={openAlerts} compact />
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            aria-controls="more-sheet"
            className={cx('flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold', more ? 'text-ink' : 'text-navtxt')}
          >
            <Icon name="more" />
            {t('common.more')}
          </button>
        </div>
      </nav>
      {more && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMore(false)} />
          <div id="more-sheet" role="dialog" aria-label={t('common.more')} className="fade-in fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 rounded-[20px] bg-surface p-3 shadow-2xl lg:hidden">
            <nav aria-label={t('common.more')} className="flex flex-col gap-1">
              <NavLinks openAlerts={openAlerts} only="secondary" />
            </nav>
            <div className="mt-2">
              <Account />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NavLinks({ openAlerts, compact, only }: { openAlerts: number; compact?: boolean; only?: 'secondary' }) {
  const { t } = useI18n();
  const { can } = useSession();
  const pathname = usePathname();
  const items = NAV.filter((n) => (!n.permission || can(n.permission)) && (compact ? n.primary : only === 'secondary' ? !n.primary : true));
  return (
    <>
      {items.map((n) => {
        const active = isActive(n, pathname);
        const badge = n.href === '/alerts' && openAlerts > 0 ? (openAlerts > 99 ? '99+' : String(openAlerts)) : null;
        if (compact)
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={cx('relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold', active ? 'text-ink' : 'text-navtxt')}
            >
              <span className={cx('grid h-8 w-14 place-items-center rounded-full', active && 'bg-ink text-canvas')}>
                <Icon name={n.icon} />
              </span>
              {t(n.label)}
              {badge && (
                <span className="absolute top-1.5 start-[calc(50%+8px)] min-w-5 rounded-full bg-acc px-1.5 text-center text-[11px] font-extrabold text-on-acc">
                  {badge}
                  <span className="sr-only"> {t('alerts.toHandle')}</span>
                </span>
              )}
            </Link>
          );
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex min-h-[46px] items-center gap-3 rounded-[13px] px-3.5 text-[15px] font-semibold transition-colors',
              active ? 'bg-ink text-canvas' : 'text-navtxt hover:bg-surface-2 hover:text-ink',
            )}
          >
            <Icon name={n.icon} />
            <span className="flex-1">{t(n.label)}</span>
            {badge && (
              <span className="rounded-full bg-acc px-2 text-[13px] font-extrabold text-on-acc">
                {badge}
                <span className="sr-only"> {t('alerts.toHandle')}</span>
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}

/** Organization, user, language, theme and sign-out. */
function Account() {
  const { t } = useI18n();
  const { me, org, switchOrg, signOut } = useSession();
  const orgSelectId = useId();
  const initials = org.orgName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="grid size-[38px] shrink-0 place-items-center rounded-full bg-acc font-extrabold text-on-acc">
          {initials || '·'}
        </span>
        <div className="min-w-0">
          <strong className="block truncate">
            <bdi>{org.orgName}</bdi>
          </strong>
          <span className="block truncate text-[13px] text-muted">
            {me.name} · {t(`members.roles.${org.role}`)}
          </span>
        </div>
      </div>
      {me.memberships.length > 1 && (
        <div className="flex flex-col gap-1">
          <label htmlFor={orgSelectId} className="text-[13px] font-semibold text-muted">
            {t('common.organization')}
          </label>
          <select
            id={orgSelectId}
            value={org.orgId}
            onChange={(e) => switchOrg(e.target.value)}
            className="min-h-11 rounded-xl border-2 border-transparent bg-surface-2 px-2 text-sm text-ink focus:border-acc"
          >
            {me.memberships.map((m) => (
              <option key={m.orgId} value={m.orgId}>
                {m.orgName}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <LocaleSwitcher />
        </div>
        <ThemeToggle className="bg-surface-2 hover:brightness-95" />
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-start text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        <Icon name="signout" size={18} />
        {t('nav.signOut')}
      </button>
    </div>
  );
}

/** Open alerts: refreshed every 30 s while the page is visible, and when it becomes visible again. */
function useOpenAlerts(): number {
  const { org } = useSession();
  const [n, setN] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ open: number }>(`/orgs/${org.orgId}/alerts/count`)
        .then((r) => alive && setN(r.open))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    document.addEventListener('visibilitychange', load);
    window.addEventListener('intorue:alerts-changed', load);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', load);
      window.removeEventListener('intorue:alerts-changed', load);
    };
  }, [org.orgId, pathname]);
  return n;
}

function OfflineBanner() {
  const { t } = useI18n();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    on();
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="mb-3 rounded-2xl bg-attention-bg px-4 py-3 text-sm font-semibold text-attention">
      {t('common.offline')}
    </div>
  );
}
