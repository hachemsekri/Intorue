'use client';

import { useI18n } from '@/lib/i18n';
import { Button } from './ui';

/** A request failed: say so plainly (offline or server) and offer to try again. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-[20px] bg-surface px-6 py-12 text-center">
      <p className="h-display text-2xl">{offline ? t('common.offlineTitle') : t('common.loadFailed')}</p>
      <p className="max-w-md text-muted">{offline ? t('common.offline') : t('common.loadFailedHint')}</p>
      <Button onClick={onRetry}>{t('common.retry')}</Button>
    </div>
  );
}
