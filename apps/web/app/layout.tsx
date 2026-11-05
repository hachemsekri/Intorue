import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Archivo, Noto_Kufi_Arabic } from 'next/font/google';
import { brand, THEME_BOOT_SCRIPT, THEMES, themeCss } from '@winou/config';
import { isRtl, messages, type SupportedLocale } from '@winou/i18n';
import { I18nProvider } from '@/lib/i18n';
import { LOCALE_COOKIE } from '@/lib/locale';
import './globals.css';

// Archivo (with its width axis) for Latin text, Noto Kufi Arabic for Arabic; shared by every page.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const kufi = Noto_Kufi_Arabic({ subsets: ['arabic'], variable: '--font-kufi', display: 'swap' });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: 'Suivi GPS de véhicules en Tunisie',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEMES.light.bg },
    { media: '(prefers-color-scheme: dark)', color: THEMES.dark.bg },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: SupportedLocale = raw && raw in messages ? (raw as SupportedLocale) : 'fr';
  return (
    // data-theme is set before paint by the boot script, so React must not complain about it.
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'} className={`${archivo.variable} ${kufi.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body className="min-h-dvh">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
