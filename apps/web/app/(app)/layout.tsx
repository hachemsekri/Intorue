'use client';

import { Shell, Wordmark } from '@/components/shell';
import { useI18n } from '@/lib/i18n';
import { SessionProvider } from '@/lib/session';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <SessionProvider
      fallback={
        <div className="grid min-h-dvh place-items-center bg-canvas text-ink" role="status">
          <div className="flex flex-col items-center gap-3">
            <span className="text-[32px] leading-none">
              <Wordmark />
            </span>
            <span className="text-muted">{t('common.loading')}</span>
          </div>
        </div>
      }
    >
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
