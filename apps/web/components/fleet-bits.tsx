'use client';

import { formatPlate, type DeviceStatus, type PlateFormat } from '@winou/shared';
import { Badge } from './ui';
import { useI18n } from '@/lib/i18n';

export function Plate({ plate, format }: { plate: string; format: PlateFormat }) {
  const { locale } = useI18n();
  // In Arabic, Tunisian plates read right-to-left like the physical plate (serial on the right).
  const rtl = locale === 'ar' && format !== 'other';
  return (
    <span dir={rtl ? 'rtl' : 'ltr'} className="font-medium tabular-nums [unicode-bidi:isolate]">
      {formatPlate(plate, format, locale)}
    </span>
  );
}

const TONE: Record<DeviceStatus, 'moving' | 'offline' | 'neutral'> = { online: 'moving', offline: 'offline', never: 'neutral' };

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const { t } = useI18n();
  return <Badge tone={TONE[status]}>{t(`devices.statuses.${status}`)}</Badge>;
}

export function LastSeen({ at }: { at: string | null }) {
  const { formatRelative, formatDateTime, t } = useI18n();
  if (!at) return <span className="text-muted">{t('common.none')}</span>;
  return (
    <time dateTime={at} title={formatDateTime(at)} className="text-sm text-muted">
      {formatRelative(at)}
    </time>
  );
}

export function Kpi({ value, label, tone = 'default' }: { value: number; label: string; tone?: 'default' | 'attention' }) {
  return (
    <div className={`rounded-[20px] px-5 py-4 ${tone === 'attention' ? 'bg-attention-bg text-attention' : 'bg-surface'}`}>
      <p className="text-3xl font-extrabold tabular-nums">{value}</p>
      <p className={`text-sm ${tone === 'attention' ? '' : 'text-muted'}`}>{label}</p>
    </div>
  );
}
