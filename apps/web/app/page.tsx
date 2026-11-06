import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { brand, priceVars } from '@winou/config';
import { interpolate, messages, type SupportedLocale } from '@winou/i18n';
import { AlertsScene } from '@/components/home/alerts-scene';
import { HomeLang, MegaWordmark, StepsTrack, ToTop } from '@/components/home/bits';
import { STREETS } from '@/components/home/city';
import { FloatingCta } from '@/components/home/floating-cta';
import { FollowScene } from '@/components/home/follow-scene';
import { HeroCity } from '@/components/home/hero-city';
import { PriceSection } from '@/components/home/price-section';
import { QuotePopup } from '@/components/home/quote-popup';
import { Reveal } from '@/components/home/reveal';
import { LOCALE_COOKIE } from '@/lib/locale';
import { MAP_CREDITS } from '@/lib/map-credits';
import './home.css';

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
  const f = h.features;
  const pv = priceVars();

  return (
    <div className="ih">
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
          <a className="l sec sec2 enter" style={{ '--i': 2 } as React.CSSProperties} href="#fonctions">
            {h.nav.features}
          </a>
          <a className="l sec enter" style={{ '--i': 2 } as React.CSSProperties} href="#alertes">
            {h.nav.alerts}
          </a>
          <a className="l sec sec2 enter" style={{ '--i': 3 } as React.CSSProperties} href="#questions">
            {h.nav.faq}
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
            <div className="hero-cta enter" style={{ '--i': 9 } as React.CSSProperties}>
              <a className="btn" href="#reserver">
                {h.hero.cta}
              </a>
              <span className="hero-from">{interpolate(h.hero.from, pv)}</span>
            </div>
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

        <section className="feat wrap" id="fonctions" aria-labelledby="fonctions-h">
          <h2 id="fonctions-h" data-reveal="0">
            {f.title}
          </h2>
          <div className="bento">
            <article className="t t-w" data-reveal="1">
              <div>
                <h3>{f.where.title}</h3>
                <p>{f.where.text}</p>
              </div>
              <div className="ui" aria-hidden="true">
                <div className="plaque">
                  <b>{STREETS.bourguiba.ar}</b>
                  <em>{STREETS.bourguiba.fr}</em>
                </div>
                <div className="ui-row">
                  <span>Renault Clio</span>
                  <strong>42 km/h</strong>
                </div>
              </div>
            </article>
            <article className="t t-a" data-reveal="2">
              <div>
                <h3>{f.moved.title}</h3>
                <p>{f.moved.text}</p>
              </div>
              <div className="ui ui-push" aria-hidden="true">
                <strong>{f.moved.demoTitle}</strong>
                <span>{f.moved.demoText}</span>
              </div>
            </article>
            <article className="t t-b" data-reveal="3">
              <h3>{f.went.title}</h3>
              <p>{f.went.text}</p>
            </article>
            <article className="t t-d" data-reveal="4">
              <h3>{f.access.title}</h3>
              <p>{f.access.text}</p>
            </article>
            <article className="t t-d" data-reveal="5">
              <h3>{f.proof.title}</h3>
              <p>{f.proof.text}</p>
            </article>
            <article className="t t-sim" data-reveal="6">
              <div>
                <h3>{f.sim.title}</h3>
                <p>{interpolate(f.sim.text, pv)}</p>
              </div>
              <div className="sim-rows" aria-hidden="true">
                <div>
                  <span>{f.sim.card}</span>
                  <strong>{f.sim.cardValue}</strong>
                </div>
                <div>
                  <span>{f.sim.first}</span>
                  <strong>{f.sim.firstValue}</strong>
                </div>
                <div>
                  <span>{f.sim.next}</span>
                  <strong>{interpolate(f.sim.nextValue, pv)}</strong>
                </div>
              </div>
            </article>
          </div>
        </section>

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

        <PriceSection locale={locale} offer={h.offer} form={h.form} />

        <section className="faq wrap" id="questions" aria-labelledby="faq-h">
          <h2 id="faq-h" data-reveal="0">
            {h.faq.title}
          </h2>
          <div className="faq-list">
            {h.faq.items.map(([q, answer], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}</summary>
                <p>{interpolate(answer!, pv)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="closer wrap" aria-labelledby="closer-h">
          <h2 id="closer-h">{h.closer.title}</h2>
          <a className="btn" href="#reserver">
            {h.closer.cta}
          </a>
        </section>
      </main>

      <footer className="wrap">
        <div className="fl" data-reveal="0">
          <span>{h.footer.tagline}</span>
          <nav aria-label={brand.name}>
            <Link href="/confidentialite">{h.legal.privacyLink}</Link>
            <Link href="/conditions">{h.legal.termsLink}</Link>
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
          <span className="credits">
            {h.footer.note}. {h.footer.maps}{' '}
            {MAP_CREDITS.map((c, i) => (
              <span key={c.href}>
                {i > 0 && ', '}
                <a href={c.href} target="_blank" rel="noopener noreferrer">
                  {c.label}
                </a>
              </span>
            ))}
          </span>
        </div>
        <MegaWordmark parts={brand.wordmark} />
      </footer>

      <FloatingCta label={h.closer.cta} text={h.closer.title} />
      <QuotePopup locale={locale} t={h.form} offer={h.offer} />
      <ToTop label={h.footer.toTop} />
    </div>
  );
}
