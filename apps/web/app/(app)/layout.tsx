'use client';

import { Shell } from '@/components/shell';
import { useI18n } from '@/lib/i18n';
import { SessionProvider } from '@/lib/session';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <SessionProvider
      fallback={
        <div className="grid min-h-dvh place-items-center text-muted" role="status">
          {t('common.loading')}
        </div>
      }
    >
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
