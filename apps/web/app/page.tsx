import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { brand } from '@winou/config';
import { messages, type SupportedLocale } from '@winou/i18n';
import { Wordmark } from '@/components/brand';
import { HomeDemo, HomePhoneMap } from '@/components/home/islands';
import { Reveal } from '@/components/home/reveal';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LOCALE_COOKIE } from '@/lib/locale';
import credits from '@/public/home/credits.json';

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

const wrap = 'mx-auto w-full max-w-[1440px] px-[clamp(16px,4vw,56px)]';
const h2 = 'text-[clamp(36px,4.6vw,68px)] leading-[1.02] font-extrabold tracking-[-0.03em]';
const lead = 'text-[clamp(18px,1.35vw,21px)] leading-[1.55]';

type Credit = { title: string; page: string; licence: string; artist: string };
const PHOTOS = credits as Record<string, Credit>;
const USED = ['avenue', 'a1-airport', 'sidibou-door', 'tunis-street', 'plaque', 'goulette'] as const;

export default async function Home() {
  const { locale, signedIn } = await current();
  const h = messages[locale].home;
  const m = messages[locale];
  const primaryHref = signedIn ? '/map' : '/signup';
  const primaryLabel = signedIn ? h.nav.open : h.hero.primary;

  return (
    <div className="bg-white text-navy">
      <Reveal />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        {m.common.skipToContent}
      </a>

      {/* Navigation: wordmark, a few links, one action */}
      <header className={`${wrap} flex min-h-20 items-center justify-between gap-6`}>
        <Link href="/" aria-label={brand.name} className="shrink-0">
          <Wordmark tone="dark" className="!text-[28px]" />
        </Link>
        <nav aria-label={m.common.menu} className="hidden items-center gap-7 text-[16px] font-medium lg:flex">
          <a href="#demo" className="hover:text-teal-dark">{h.nav.live}</a>
          <a href="#fleet" className="hover:text-teal-dark">{h.nav.fleet}</a>
          <a href="#trips" className="hover:text-teal-dark">{h.nav.trips}</a>
          <a href="#alerts" className="hover:text-teal-dark">{h.nav.alerts}</a>
          <a href="#faq" className="hover:text-teal-dark">{h.nav.faq}</a>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block">
            <LocaleSwitcher />
          </span>
          {!signedIn && (
            <Link href="/login" className="hidden min-h-11 items-center px-2 font-semibold hover:text-teal-dark sm:inline-flex">
              {h.nav.signIn}
            </Link>
          )}
          <Link href={primaryHref} className="inline-flex min-h-11 items-center rounded-full bg-navy px-5 font-semibold text-white transition-colors hover:bg-teal-dark">
            {signedIn ? h.nav.open : h.nav.signUp}
          </Link>
        </div>
      </header>

      <main id="main">
        {/* Hero: the title across the page, then the product's live map */}
        <section aria-labelledby="hero-title" className={`${wrap} pt-[clamp(28px,6vw,88px)]`}>
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <h1 id="hero-title" data-reveal="0" className="text-[clamp(46px,7.6vw,124px)] leading-[0.95] font-extrabold tracking-[-0.04em] lg:col-span-8">
              {h.hero.title}
            </h1>
            <div className="lg:col-span-4 lg:pb-3">
              <p data-reveal="1" className={lead}>
                {h.hero.lead}
              </p>
              <div data-reveal="2" className="mt-7 flex flex-wrap gap-3">
                <Link href={primaryHref} className="inline-flex min-h-13 items-center rounded-full bg-teal-dark px-7 text-[17px] font-bold text-white transition-[background-color,transform] hover:bg-navy active:scale-[0.98]">
                  {primaryLabel}
                </Link>
                {!signedIn && (
                  <Link href="/login" className="inline-flex min-h-13 items-center rounded-full bg-[#E4EAF0] px-7 text-[17px] font-bold transition-colors hover:bg-[#D7DFE8]">
                    {h.hero.secondary}
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div id="demo" className="mt-[clamp(32px,4vw,56px)] scroll-mt-6" data-reveal="3">
            <HomeDemo locale={locale} />
          </div>
        </section>

        {/* Fleet */}
        <section id="fleet" aria-labelledby="fleet-title" className={`${wrap} mt-[clamp(96px,11vw,200px)] grid gap-10 lg:grid-cols-12 lg:items-center`}>
          <div className="lg:col-span-5">
            <h2 id="fleet-title" data-reveal="0" className={h2}>
              {h.fleet.title}
            </h2>
            <p data-reveal="1" className={`${lead} mt-6`}>
              {h.fleet.text}
            </p>
            <ul data-reveal="2" className="mt-8 flex flex-col gap-4 text-[18px]">
              {h.fleet.points.map((p) => (
                <li key={p} className="flex gap-3">
                  <span aria-hidden className="mt-2.5 size-2.5 shrink-0 rounded-full bg-teal" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative lg:col-span-7" data-reveal="1">
            <Image src="/home/avenue.jpg" alt={h.fleet.photoAlt} width={1536} height={1024} sizes="(min-width: 1024px) 58vw, 100vw" className="h-auto w-full object-cover" />
            <FleetFragment locale={locale} />
          </div>
        </section>

        {/* Trips: picture to the edge, the trip report beside it */}
        <section id="trips" aria-labelledby="trips-title" className="mt-[clamp(96px,11vw,200px)] bg-[#EEF2F6] py-[clamp(64px,8vw,128px)]">
          <div className={`${wrap} grid gap-10 lg:grid-cols-12 lg:items-center`}>
            <div className="lg:col-span-6" data-reveal="1">
              <Image src="/home/a1-airport.jpg" alt={h.trips.photoAlt} width={1600} height={1200} sizes="(min-width: 1024px) 50vw, 100vw" className="h-auto w-full object-cover" />
            </div>
            <div className="lg:col-span-6 lg:ps-6">
              <h2 id="trips-title" data-reveal="0" className={h2}>
                {h.trips.title}
              </h2>
              <p data-reveal="1" className={`${lead} mt-6`}>
                {h.trips.text}
              </p>
              <TripFragment locale={locale} />
            </div>
          </div>
        </section>

        {/* Alerts: a navy field */}
        <section id="alerts" aria-labelledby="alerts-title" className="bg-navy py-[clamp(80px,10vw,160px)] text-white">
          <div className={`${wrap} grid gap-12 lg:grid-cols-12`}>
            <div className="lg:col-span-7">
              <h2 id="alerts-title" data-reveal="0" className={h2}>
                {h.alerts.title}
              </h2>
              <p data-reveal="1" className={`${lead} mt-6 max-w-2xl text-white`}>
                {h.alerts.text}
              </p>
              <dl className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {h.alerts.list.map(([term, def], i) => (
                  <div key={term} data-reveal={String(i % 2)}>
                    <dt className="text-[22px] font-bold text-teal">{term}</dt>
                    <dd className="mt-1.5 text-[17px] leading-[1.55] text-white">{def}</dd>
                  </div>
                ))}
              </dl>
              <p data-reveal="0" className="mt-12 max-w-2xl text-[18px] text-white">
                {h.alerts.inbox}
              </p>
            </div>
            <div className="lg:col-span-5" data-reveal="1">
              <Image src="/home/sidibou-door.jpg" alt={h.alerts.photoAlt} width={1197} height={1600} sizes="(min-width: 1024px) 38vw, 100vw" className="h-full max-h-[880px] w-full object-cover" />
            </div>
          </div>
        </section>

        {/* Who: one picture, three rows */}
        <section aria-labelledby="who-title" className={`${wrap} mt-[clamp(96px,11vw,200px)]`}>
          <h2 id="who-title" data-reveal="0" className={`${h2} max-w-4xl`}>
            {h.who.title}
          </h2>
          <div className="mt-12 grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5" data-reveal="1">
              <Image src="/home/tunis-street.jpg" alt={h.who.photoAlt} width={1600} height={1067} sizes="(min-width: 1024px) 40vw, 100vw" className="h-full w-full object-cover object-[82%_50%]" />
            </div>
            <ul className="flex flex-col gap-3 lg:col-span-7">
              {h.who.rows.map(([name, text], i) => (
                <li key={name} data-reveal={String(i)} className="bg-[#F3F6F9] p-[clamp(24px,3vw,40px)]">
                  <h3 className="text-[clamp(26px,2.4vw,36px)] font-extrabold tracking-[-0.02em]">{name}</h3>
                  <p className="mt-3 text-[18px] leading-[1.55]">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Mobile */}
        <section aria-labelledby="mobile-title" className={`${wrap} mt-[clamp(96px,11vw,200px)] grid gap-12 lg:grid-cols-12 lg:items-center`}>
          <div className="order-2 flex justify-center lg:order-1 lg:col-span-5" data-reveal="1">
            <PhoneFragment locale={locale} />
          </div>
          <div className="order-1 lg:order-2 lg:col-span-7">
            <h2 id="mobile-title" data-reveal="0" className={h2}>
              {h.mobile.title}
            </h2>
            <p data-reveal="1" className={`${lead} mt-6 max-w-2xl`}>
              {h.mobile.text}
            </p>
            <p data-reveal="2" className="mt-4 text-[16px] text-muted">
              {h.mobile.note}
            </p>
          </div>
        </section>

        {/* Privacy: statements, set large */}
        <section aria-labelledby="privacy-title" className="mt-[clamp(96px,11vw,200px)] bg-[#E3F5F3] py-[clamp(72px,9vw,140px)]">
          <div className={wrap}>
            <h2 id="privacy-title" data-reveal="0" className={h2}>
              {h.privacy.title}
            </h2>
            <ul className="mt-12 grid gap-x-14 gap-y-10 md:grid-cols-2">
              {h.privacy.list.map((p, i) => (
                <li key={p} data-reveal={String(i % 2)}>
                  <p className="text-[clamp(21px,1.9vw,28px)] leading-[1.35] font-semibold tracking-[-0.01em]">{p}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The name: the street plate */}
        <section aria-labelledby="name-title" className={`${wrap} mt-[clamp(96px,11vw,200px)] grid gap-10 lg:grid-cols-12 lg:items-center`}>
          <div className="lg:col-span-7" data-reveal="1">
            <Image src="/home/plaque.jpg" alt={h.name.photoAlt} width={1600} height={1200} sizes="(min-width: 1024px) 58vw, 100vw" className="h-auto w-full object-cover" />
          </div>
          <div className="lg:col-span-5">
            <h2 id="name-title" data-reveal="0" className={h2}>
              {h.name.title}
            </h2>
            <p data-reveal="1" className={`${lead} mt-6`}>
              {h.name.text}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className={`${wrap} mt-[clamp(96px,11vw,200px)] grid gap-10 lg:grid-cols-12`}>
          <h2 id="faq-title" data-reveal="0" className={`${h2} lg:col-span-4`}>
            {h.faq.title}
          </h2>
          <div className="flex flex-col gap-3 lg:col-span-8">
            {h.faq.items.map(([q, a], i) => (
              <details key={q} data-reveal={String(i % 3)} className="group bg-[#F3F6F9] px-6 py-5 open:bg-[#EEF2F6]">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 text-[20px] font-bold [&::-webkit-details-marker]:hidden">
                  {q}
                  <span aria-hidden className="text-2xl font-normal transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl pb-1 text-[18px] leading-[1.55]">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Call to action on La Goulette */}
        <section aria-labelledby="cta-title" className="relative mt-[clamp(96px,11vw,200px)] overflow-hidden text-white">
          <Image src="/home/goulette.jpg" alt={h.cta.photoAlt} fill sizes="100vw" className="home-drift object-cover" />
          <div className="absolute inset-0 bg-[rgb(11_36_64/0.55)]" aria-hidden />
          <div className={`${wrap} relative flex min-h-[min(80vh,760px)] flex-col justify-end py-[clamp(56px,7vw,112px)]`}>
            <h2 id="cta-title" data-reveal="0" className="max-w-4xl text-[clamp(40px,6vw,96px)] leading-[0.98] font-extrabold tracking-[-0.035em]">
              {h.cta.title}
            </h2>
            <p data-reveal="1" className={`${lead} mt-6 max-w-xl text-white`}>
              {h.cta.text}
            </p>
            <div data-reveal="2" className="mt-8">
              <Link href={primaryHref} className="inline-flex min-h-13 items-center rounded-full bg-teal px-7 text-[17px] font-bold text-navy-deep transition-[background-color,transform] hover:bg-white active:scale-[0.98]">
                {primaryLabel}
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer: the name returns at full width */}
      <footer className="bg-navy-deep pt-[clamp(56px,7vw,104px)] pb-10 text-white">
        <div className={wrap}>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-bold">{h.footer.product}</p>
              <ul className="mt-3 flex flex-col gap-2 text-white/85">
                <li><a href="#demo" className="hover:text-teal">{h.nav.live}</a></li>
                <li><a href="#fleet" className="hover:text-teal">{h.nav.fleet}</a></li>
                <li><a href="#trips" className="hover:text-teal">{h.nav.trips}</a></li>
                <li><a href="#alerts" className="hover:text-teal">{h.nav.alerts}</a></li>
              </ul>
            </div>
            <div>
              <p className="font-bold">{h.footer.account}</p>
              <ul className="mt-3 flex flex-col gap-2 text-white/85">
                <li><Link href="/signup" className="hover:text-teal">{h.nav.signUp}</Link></li>
                <li><Link href="/login" className="hover:text-teal">{h.nav.signIn}</Link></li>
              </ul>
            </div>
            <div className="sm:col-span-2">
              <p className="font-bold">{h.footer.photos}</p>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-white/75">
                {USED.map((k) => {
                  const c = PHOTOS[k]!;
                  return (
                    <li key={k}>
                      <a href={c.page} target="_blank" rel="noopener" className="hover:text-teal">
                        {c.title.replace(/\.(jpe?g|png)$/i, '')}
                      </a>{' '}
                      · {c.artist} · {c.licence} · Wikimedia Commons
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-sm text-white/75">
                {h.footer.mapData} {h.footer.rights}
              </p>
            </div>
          </div>
          <p aria-hidden className="mt-[clamp(48px,6vw,96px)] text-[clamp(72px,19vw,300px)] leading-[0.8] font-extrabold tracking-[-0.06em]">
            {brand.wordmark[0]}
            <span className="text-teal">{brand.wordmark[1]}</span>
          </p>
          <div className="mt-8 sm:hidden">
            <LocaleSwitcher tone="light" />
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------- Interface fragments: real pieces of the product, built in HTML ----------

function FleetFragment({ locale }: { locale: SupportedLocale }) {
  const m = messages[locale];
  const rows: [string, string, string, string, string][] = [
    ['Renault Clio', locale === 'ar' ? '245 تونس 7812' : '245 TUN 7812', 'moving', '42 km/h', '#0E8A87'],
    ['Moto Yamaha', locale === 'ar' ? '77 تونس 2106' : '77 TUN 2106', 'moving', '38 km/h', '#0E8A87'],
    ['Kia Picanto', locale === 'ar' ? '220 تونس 9087' : '220 TUN 9087', 'stopped', '2 min', '#3F6EA8'],
    ['Trottinette 014', 'TR-014', 'offline', '18 min', '#6B7785'],
  ];
  return (
    <div data-ui className="relative z-10 -mt-24 ms-auto w-[min(92%,440px)] bg-white p-5 text-navy sm:-mt-40 sm:me-6">
      <div className="grid grid-cols-3 gap-2">
        {(['moving', 'stopped', 'offline'] as const).map((k, i) => (
          <div key={k} className={`rounded-xl px-3 py-2.5 ${k === 'offline' ? 'bg-attention-bg text-attention' : 'bg-[#F3F6F9]'}`}>
            <p className="text-2xl font-extrabold tabular-nums">{[2, 1, 1][i]}</p>
            <p className="text-[13px]">{m.map.kpis[k]}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3">
        {rows.map(([name, plate, status, value, color]) => (
          <li key={name} className="flex items-center gap-3 py-2.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{name}</span>
              <span className="block text-sm text-muted [unicode-bidi:isolate]">{plate}</span>
            </span>
            <span className="text-end">
              <span className="block text-sm font-semibold" style={{ color }}>
                {m.map.statuses[status as 'moving']}
              </span>
              <span className="block text-sm text-muted tabular-nums">{value}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TripFragment({ locale }: { locale: SupportedLocale }) {
  const h = messages[locale].home.trips;
  const m = messages[locale];
  const warn = (title: string) => /128|Sortie|Left|خروج|تجاوز|Excès|Speeding/.test(title);
  return (
    <div data-ui data-reveal="2" className="mt-10 bg-white p-6 text-navy">
      <p className="font-bold">{h.sample}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            [m.trips.distance, h.kpis.distance],
            [m.trips.drivingTime, h.kpis.driving],
            [m.trips.maxSpeed, h.kpis.max],
            [m.trips.events, h.kpis.events],
          ] as const
        ).map(([label, value], i) => (
          <div key={label} className={`rounded-xl px-4 py-3 ${i === 3 ? 'bg-attention-bg text-attention' : 'bg-[#F3F6F9]'}`}>
            <p className="text-[13px]">{label}</p>
            <p className="text-xl font-extrabold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <ol className="mt-5 flex flex-col gap-3">
        {h.timeline.map(([time, title, place]) => (
          <li key={time} className="grid grid-cols-[52px_1fr] gap-3">
            <span className="pt-0.5 text-sm font-semibold text-muted tabular-nums">{time}</span>
            <span>
              <span className={`block font-bold ${warn(title) ? 'text-attention' : ''}`}>{title}</span>
              <span className="block text-sm text-muted">{place}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PhoneFragment({ locale }: { locale: SupportedLocale }) {
  const m = messages[locale];
  return (
    <div data-ui className="w-[min(100%,340px)] rounded-[44px] bg-navy-deep p-3">
      <div className="relative h-[640px] overflow-hidden rounded-[34px] bg-[#EEF2F6]">
        <div className="absolute inset-0">
          <HomePhoneMap locale={locale} />
        </div>
        <div className="absolute inset-x-3 top-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3">
          <Wordmark tone="dark" className="!text-[20px]" />
          <span className="grid size-8 place-items-center rounded-lg bg-attention-bg text-sm font-bold text-attention">3</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-5 pt-3 pb-4">
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-[#DDE3EA]" />
          <p className="text-xl font-extrabold">Renault Clio</p>
          <p className="text-sm text-muted [unicode-bidi:isolate]">{locale === 'ar' ? '245 تونس 7812' : '245 TUN 7812'}</p>
          <span className="mt-2 inline-block rounded-full bg-attention-bg px-3 py-1 text-xs font-semibold text-attention">
            {m.alerts.types.speeding}
          </span>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <p>
              <span className="block text-muted">{m.map.speed}</span>
              <span className="font-bold">96 km/h</span>
            </p>
            <p>
              <span className="block text-muted">{m.map.lastUpdate}</span>
              <span className="font-bold">12 s</span>
            </p>
          </div>
          <p className="mt-3 rounded-xl bg-navy py-2.5 text-center text-sm font-bold text-white">{m.map.viewTrip}</p>
          <div className="mt-3 flex justify-between px-1 text-xs font-semibold text-muted">
            <span className="text-navy">{m.mobile.tabs.map}</span>
            <span>{m.mobile.tabs.fleet}</span>
            <span>{m.mobile.tabs.alerts}</span>
            <span>{m.mobile.tabs.account}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
