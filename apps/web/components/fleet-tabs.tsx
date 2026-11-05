'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { Icon } from './icons';

/** "Véhicules | Boîtiers": both lists live under one menu item. */
export function FleetTabs() {
  const { t } = useI18n();
  const path = usePathname();
  const tabs = [
    { href: '/vehicles', label: t('nav.vehicles'), icon: 'car' as const },
    { href: '/devices', label: t('nav.devices'), icon: 'device' as const },
  ];
  return (
    <nav aria-label={t('vehicles.pageTitle')} className="mb-3.5 flex gap-1 self-start rounded-full bg-surface p-1">
      {tabs.map((tab) => {
        const on = path === tab.href || path.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors ${on ? 'bg-ink text-canvas' : 'text-ink hover:bg-surface-2'}`}
          >
            <Icon name={tab.icon} size={18} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
