'use client';

import { EMPTY_COUNTS, perDayUnder, PRICING, priceVars, quoteFor, VEHICLE_KINDS, type VehicleCounts } from '@winou/config';
import { interpolate } from '@winou/i18n';
import { useState } from 'react';
import { money, PriceTag, QuoteForm, Stepper, type FormTexts, type OfferTexts } from './quote-form';

const LOCALE_TAG: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN-u-nu-latn' };

/**
 * Price cards, live total and the page's quote form. The one vehicle count lives here, so a
 * change on a card shows in the form's step 2 and the other way round.
 */
export function PriceSection({ locale, offer, form }: { locale: string; offer: OfferTexts; form: FormTexts }) {
  const [counts, setCounts] = useState<VehicleCounts>(EMPTY_COUNTS);
  const quote = quoteFor(counts);
  const unit = offer.currency;
  const pv = priceVars();
  const perDay = (price: number) => new Intl.NumberFormat(LOCALE_TAG[locale] ?? 'fr-FR', { minimumFractionDigits: 2 }).format(perDayUnder(price));
  const message = quote.fleet
    ? interpolate(offer.saved, { amount: money(quote.saved, locale, unit).replace(` ${unit}`, '') })
    : quote.toFleet === null
      ? null
      : quote.toFleet === 1
        ? offer.hintOne
        : interpolate(offer.hintMany, { count: quote.toFleet });

  return (
    <section className="offer wrap" id="offre" aria-labelledby="offre-h">
      <div className="off-top">
        <h2 id="offre-h">{offer.title}</h2>
        <p className="off-sub">{offer.sub}</p>
      </div>

      <div className="calc">
        <div className="calc-cards">
          {VEHICLE_KINDS.map((k) => (
            <div className={`pcard-v${counts[k] > 0 ? ' on' : ''}`} key={k} data-calc={k}>
              <div>
                <h3>{offer.kinds[k]}</h3>
                <p className="pv">
                  <PriceTag kind={k} fleet={quote.fleet} locale={locale} unit={unit} />
                </p>
                <p className="pd">{interpolate(offer.perDay, { amount: perDay(PRICING.items[k].price) })}</p>
              </div>
              <Stepper kind={k} value={counts[k]} offer={offer} onChange={(n) => setCounts((c) => ({ ...c, [k]: n }))} />
            </div>
          ))}
        </div>
        <div className="calc-bar">
          <div className="calc-sum" aria-live="polite">
            <span>{quote.vehicles ? offer.total : offer.addVehicle}</span>
            {quote.vehicles > 0 && <strong>{money(quote.total, locale, unit)}</strong>}
          </div>
          {message && (
            <p className={`calc-msg${quote.fleet ? '' : ' hint'}`} aria-live="polite">
              {message}
            </p>
          )}
          <a className="btn" href="#reserver">
            {offer.requestQuote}
          </a>
        </div>
      </div>

      <div className="off-left">
        <div className="incl">
          <h3>{offer.includedTitle}</h3>
          <ul>
            {offer.included.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="after">
          <h3>{offer.afterTitle}</h3>
          <div>
            <span>{offer.firstMonths}</span>
            <strong>{interpolate(offer.firstMonthsValue, pv)}</strong>
          </div>
          <div>
            <span>{offer.nextYears}</span>
            <strong>{interpolate(offer.nextYearsValue, pv)}</strong>
          </div>
        </div>
        <p className="promo">
          <strong>{interpolate(offer.promoStrong, pv)}</strong> {interpolate(offer.promo, pv)}
        </p>
        <p className="lead">{offer.note}</p>
      </div>

      <div id="reserver">
        <QuoteForm variant="page" idPrefix="page" locale={locale} t={form} offer={offer} counts={counts} onCounts={setCounts} />
      </div>
    </section>
  );
}
