'use client';

import type { SupportedLocale } from '@winou/i18n';
import dynamic from 'next/dynamic';

/** Client-only map islands for the server-rendered home page. */
export const HomeDemo = dynamic<{ locale: SupportedLocale }>(() => import('./demo-map').then((m) => m.DemoMap), {
  ssr: false,
  loading: () => <div className="h-[min(64vh,660px)] min-h-[440px] bg-[#EEF2F6]" />,
});

export const HomePhoneMap = dynamic<{ locale: string }>(() => import('./phone-map').then((m) => m.PhoneMap), { ssr: false });
