import { cookies } from 'next/headers';
import Link from 'next/link';
import { messages, type SupportedLocale } from '@winou/i18n';
import { LOCALE_COOKIE } from '@/lib/locale';

export default async function NotFound() {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: SupportedLocale = raw && raw in messages ? (raw as SupportedLocale) : 'fr';
  const t = messages[locale].common;
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5 text-ink">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="h-display text-[clamp(40px,6vw,64px)]">404</p>
        <p className="h-display text-2xl">{t.notFound}</p>
        <Link href="/map" className="inline-flex min-h-12 items-center rounded-full bg-acc px-6 font-extrabold text-on-acc">
          {t.backToApp}
        </Link>
      </div>
    </main>
  );
}
