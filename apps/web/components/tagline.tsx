'use client';

import { useI18n } from '@/lib/i18n';

export function Tagline() {
  const { t } = useI18n();
  return <p className="max-w-md text-2xl leading-snug font-semibold text-white">{t('auth.tagline')}</p>;
}
