'use client';

import { EmptyState, PageHeader } from './ui';
import { useI18n, type MessageKey } from '@/lib/i18n';

export function ComingSoon({ title }: { title: MessageKey }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t(title)} />
      <EmptyState>
        <p className="text-lg font-semibold text-ink">{t('common.comingSoon')}</p>
        <p className="mt-1">{t('common.comingSoonBody')}</p>
      </EmptyState>
    </>
  );
}
