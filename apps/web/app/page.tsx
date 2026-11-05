import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Archivo, Noto_Kufi_Arabic } from 'next/font/google';
import Link from 'next/link';
import { brand } from '@winou/config';
import { messages, type SupportedLocale } from '@winou/i18n';
import { AlertsScene } from '@/components/home/alerts-scene';
import { HomeLang, MegaWordmark, StepsTrack, ToTop } from '@/components/home/bits';
import { FollowScene } from '@/components/home/follow-scene';
import { HeroCity } from '@/components/home/hero-city';
import { ReservationForm } from '@/components/home/reservation-form';
import { Reveal } from '@/components/home/reveal';
import { LOCALE_COOKIE } from '@/lib/locale';
import './home.css';

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const kufi = Noto_Kufi_Arabic({ subsets: ['arabic'], variable: '--font-kufi', display: 'swap' });

async function current(): Promise<{ locale: SupportedLocale; signedIn: boolean }> {
  const c = await cookies();
  const raw = c.get(LOCALE_COOKIE)?.value;
  return { locale: raw && raw in messages ? (raw as SupportedLocale) : 'fr', signedIn: c.has('winou_session') };
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await current();
  const h = messages[locale].home;
  return { title: { absolute: h.metaTitle }, description: h.metaDescription, robots: { index: true, follow: true } };
}

const Wm = ({ className = '' }: { className?: string }) => (
  <>
    {brand.wordmark[0]}
    <span className={className}>{brand.wordmark[1]}</span>
  </>
);

export default async function Home() {
  const { locale, signedIn } = await current();
  const m = messages[locale];
  const h = m.home;
  const types = m.alerts.types;

  return (
    <div className={`ih ${archivo.variable} ${kufi.variable}`}>
      <Reveal />
      <a className="skip" href="#main">
        {m.common.skipToContent}
      </a>

      <header className="hero" id="top">
        <nav className="nav wrap" aria-label={h.nav.label}>
          <a className="logo wm enter" id="ih-logo" href="#top" aria-label={h.nav.home}>
            <Wm />
          </a>
          <a className="l sec enter" style={{ '--i': 1 } as React.CSSProperties} href="#suivi">
            {h.nav.follow}
          </a>
          <a className="l sec enter" style={{ '--i': 2 } as React.CSSProperties} href="#alertes">
            {h.nav.alerts}
          </a>
          <a className="l sec enter" style={{ '--i': 3 } as React.CSSProperties} href="#offre">
            {h.nav.offer}
          </a>
          <span className="enter" style={{ '--i': 4 } as React.CSSProperties}>
            <HomeLang />
          </span>
          {signedIn ? (
            <Link className="l signin enter" style={{ '--i': 5 } as React.CSSProperties} href="/map">
              {h.nav.open}
            </Link>
          ) : (
            <>
              <Link className="l signin enter" style={{ '--i': 5 } as React.CSSProperties} href="/login">
                {h.nav.signIn}
              </Link>
              <Link className="l signup enter" style={{ '--i': 6 } as React.CSSProperties} href="/signup">
                {h.nav.signUp}
              </Link>
            </>
          )}
          <a className="btn reserve enter" style={{ '--i': 7 } as React.CSSProperties} href="#reserver">
            {h.nav.reserve}
          </a>
        </nav>
        <HeroCity />
        <div className="hero-copy wrap">
          <h1 aria-label={`${h.hero.line1} ${h.hero.line2}`}>
            <span aria-hidden="true">
              <i>{h.hero.line1}</i>
            </span>
            <span aria-hidden="true">
              <i>{h.hero.line2}</i>
            </span>
          </h1>
          <div className="hero-sub">
            <p className="enter" style={{ '--i': 8 } as React.CSSProperties}>
              {h.hero.lead}
            </p>
            <a className="btn enter" style={{ '--i': 9 } as React.CSSProperties} href="#reserver">
              {h.hero.cta}
            </a>
          </div>
        </div>
        <span className="note">{h.hero.note}</span>
      </header>

      <main id="main">
        <FollowScene locale={locale} t={{ ...h.follow, alertTypes: types }} />

        <AlertsScene
          locale={locale}
          wordmark={brand.wordmark}
          t={{ ...h.alerts, alertTypes: types, vehicles: h.follow.vehicles }}
        />

        <section className="steps wrap" id="fonctionnement" aria-labelledby="etapes-h">
          <h2 id="etapes-h" data-reveal="0">
            {h.steps.title}
          </h2>
          <div className="step-row">
            <StepsTrack />
            {h.steps.list.map(([title, text], i) => (
              <div key={i} data-reveal={i + 1}>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="who wrap" id="clients" aria-labelledby="who-h">
          <h2 id="who-h" data-reveal="0">
            {h.who.title}
          </h2>
          <div className="who-list">
            {h.who.rows.map(([title, text], i) => (
              <div key={i} data-reveal={i + 1}>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="offer wrap" id="offre" aria-labelledby="offre-h">
          <div>
            <h2 id="offre-h" data-reveal="0">
              {h.offer.title}
            </h2>
            <div className="signs">
              {h.offer.items.map(([label, price], i) => (
                <div className="plaque" key={i} data-reveal={i + 1}>
                  <small>{label}</small>
                  <em>{price}</em>
                </div>
              ))}
            </div>
            <p className="lead">{h.offer.note}</p>
          </div>
          <ReservationForm locale={locale} t={h.form} />
        </section>
      </main>

      <footer className="wrap">
        <div className="fl" data-reveal="0">
          <span>{h.footer.tagline}</span>
          <nav aria-label={brand.name}>
            {signedIn ? (
              <Link href="/map">{h.nav.open}</Link>
            ) : (
              <>
                <Link href="/login">{h.nav.signIn}</Link>
                <Link href="/signup">{h.nav.signUp}</Link>
              </>
            )}
            <a href="#reserver">{h.nav.reserve}</a>
          </nav>
          <span>{h.footer.note}</span>
        </div>
        <MegaWordmark parts={brand.wordmark} />
      </footer>

      <ToTop label={h.footer.toTop} />
    </div>
  );
}
