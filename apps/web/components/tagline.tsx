'use client';

import { useI18n } from '@/lib/i18n';

export function Tagline() {
  const { t } = useI18n();
  return <p className="relative max-w-sm text-lg text-white/80">{t('auth.tagline')}</p>;
}
