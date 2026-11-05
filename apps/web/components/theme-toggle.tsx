'use client';

import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { ThemeIcon } from './icons';

/** Light / dark switch. The choice is saved; until then the device setting is followed. */
export function ThemeToggle({ className, desktopOnly }: { className?: string; desktopOnly?: boolean }) {
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? t('common.themeToLight') : t('common.themeToDark');
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`${desktopOnly ? 'hidden lg:grid' : 'grid'} size-11 shrink-0 place-items-center rounded-[14px] bg-surface text-ink transition-colors hover:bg-surface-2 ${className ?? ''}`}
    >
      <ThemeIcon />
    </button>
  );
}
