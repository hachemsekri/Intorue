import { priceVars } from '@winou/config';
import { interpolate, messages, type SupportedLocale } from '@winou/i18n';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { LOCALE_COOKIE } from '@/lib/locale';
import '@/app/home.css';

/** Privacy and terms: draft texts with placeholders, to be reviewed by a lawyer. No popup here. */
export async function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: SupportedLocale = raw && raw in messages ? (raw as SupportedLocale) : 'fr';
  const l = messages[locale].home.legal;
  const pv = priceVars();
  return (
    <div className="ih">
      <main className="legal wrap">
        <Link className="back" href="/">
          {l.back}
        </Link>
        <h1>{kind === 'privacy' ? l.privacyTitle : l.termsTitle}</h1>
        <p className="draft">{l.draft}</p>
        {l[kind].map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{interpolate(text!, pv)}</p>
          </section>
        ))}
      </main>
    </div>
  );
}

export async function legalTitle(kind: 'privacy' | 'terms') {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: SupportedLocale = raw && raw in messages ? (raw as SupportedLocale) : 'fr';
  const l = messages[locale].home.legal;
  return kind === 'privacy' ? l.privacyTitle : l.termsTitle;
}
