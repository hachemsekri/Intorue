'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Wordmark } from '@/components/shell';
import { ThemeToggle } from '@/components/theme-toggle';
import { useI18n } from '@/lib/i18n';

// The map loads after the form, so signing in is never held up by it.
const AuthMap = dynamic(() => import('@/components/auth-map').then((m) => m.AuthMap), { ssr: false });

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="fade-in flex min-h-dvh flex-wrap bg-canvas text-ink lg:flex-nowrap">
      <section className="relative min-h-[260px] min-w-0 flex-[1_1_520px] overflow-hidden bg-[var(--map-land)] max-sm:min-h-[200px] lg:sticky lg:top-0 lg:h-dvh">
        <AuthMap />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent" />
        <p className="h-display absolute inset-x-6 bottom-6 text-[clamp(36px,4.8vw,74px)] sm:inset-x-8 sm:bottom-9">{t('home.hero.line1')} {t('home.hero.line2')}</p>
      </section>
      <main id="main" className="flex min-w-0 flex-[1_1_440px] flex-col px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-[27px] leading-none" aria-label="Intorue">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-36">
              <LocaleSwitcher inline />
            </div>
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
