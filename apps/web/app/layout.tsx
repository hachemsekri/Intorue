import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google';
import { brand } from '@winou/config';
import { isRtl, messages, type SupportedLocale } from '@winou/i18n';
import { I18nProvider } from '@/lib/i18n';
import { LOCALE_COOKIE } from '@/lib/locale';
import './globals.css';

const latin = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-arabic', display: 'swap' });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: 'Suivi GPS de véhicules en Tunisie',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: brand.colors.navy, width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: SupportedLocale = raw && raw in messages ? (raw as SupportedLocale) : 'fr';
  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'} className={`${latin.variable} ${arabic.variable}`}>
      <body className="min-h-dvh">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
