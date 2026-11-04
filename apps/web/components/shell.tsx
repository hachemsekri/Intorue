'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Wordmark } from './brand';
import { LocaleSwitcher } from './locale-switcher';
import { cx } from './ui';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useSession } from '@/lib/session';

interface NavItem {
  href: string;
  label: MessageKey;
  soon?: boolean;
  permission?: 'members.read' | 'org.update';
}

const NAV: NavItem[] = [
  { href: '/map', label: 'nav.map', soon: true },
  { href: '/trips', label: 'nav.trips', soon: true },
  { href: '/alerts', label: 'nav.alerts', soon: true },
  { href: '/vehicles', label: 'nav.vehicles' },
  { href: '/devices', label: 'nav.devices' },
  { href: '/members', label: 'nav.members', permission: 'members.read' },
  { href: '/settings', label: 'nav.settings' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[300px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        {t('common.skipToContent')}
      </a>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy px-4 py-3 lg:hidden">
        <Wordmark className="!text-[22px]" />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="sidebar"
          className="grid size-11 place-items-center rounded-lg text-white hover:bg-navy-soft"
          aria-label={t('common.menu')}
        >
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>

      <aside
        id="sidebar"
        className={cx(
          'fixed inset-y-0 start-0 z-40 w-[300px] max-w-[85vw] flex-col bg-navy px-5 pt-8 pb-6 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:max-w-none',
          open ? 'flex' : 'hidden',
        )}
      >
        <div className="mb-10 hidden ps-3 lg:block">
          <Wordmark />
        </div>
        <SidebarNav />
        <SidebarFooter />
      </aside>
      {open && <button aria-hidden tabIndex={-1} className="fixed inset-0 z-30 bg-navy-deep/40 lg:hidden" onClick={() => setOpen(false)} />}

      <main id="main" tabIndex={-1} className="min-w-0 px-4 py-6 sm:px-8 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}

function SidebarNav() {
  const { t } = useI18n();
  const { can } = useSession();
  const pathname = usePathname();
  return (
    <nav aria-label={t('common.menu')} className="flex flex-1 flex-col gap-1.5">
      {NAV.filter((n) => !n.permission || can(n.permission)).map((n) => {
        const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex min-h-12 items-center justify-between rounded-xl px-4 text-[17px] transition-colors',
              active ? 'bg-white font-semibold text-navy' : 'text-white/90 hover:bg-navy-soft',
            )}
          >
            {t(n.label)}
            {n.soon && (
              <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', active ? 'bg-canvas text-muted' : 'bg-navy-soft text-white/60')}>
                {t('common.soon')}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const { t } = useI18n();
  const { me, org, switchOrg, signOut } = useSession();
  const orgSelectId = useId();
  return (
    <div className="mt-6 flex flex-col gap-4 border-t border-white/15 pt-5 ps-3">
      {me.memberships.length > 1 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={orgSelectId} className="text-xs text-white/60">
            {t('common.organization')}
          </label>
          <select
            id={orgSelectId}
            value={org.orgId}
            onChange={(e) => switchOrg(e.target.value)}
            className="min-h-10 rounded-lg bg-navy-soft px-2 text-sm text-white"
          >
            {me.memberships.map((m) => (
              <option key={m.orgId} value={m.orgId}>
                {m.orgName}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <p className="font-medium">{org.orgName}</p>
        </div>
      )}
      <p className="-mt-2 text-sm text-white/70">
        {me.name} · {t(`members.roles.${org.role}`)}
      </p>
      <LocaleSwitcher tone="light" />
      <button type="button" onClick={() => void signOut()} className="min-h-10 self-start rounded-lg px-0 text-start text-sm font-semibold text-teal hover:underline">
        {t('nav.signOut')}
      </button>
    </div>
  );
}
