'use client';

import { formatPlate, type AlertDto } from '@winou/shared';
import { useI18n } from '@/lib/i18n';

/** Title ("Excès de vitesse · Renault Clio") and one-line description for an alert. */
export function useAlertText() {
  const { t, locale, formatDateTime } = useI18n();
  return (a: AlertDto) => {
    const d = a.details as Record<string, string | number | undefined>;
    const plate = formatPlate(a.vehicle.plate, /TUN/.test(a.vehicle.plate) ? 'tn_standard' : 'other', locale);
    const vars: Record<string, string | number> = {
      plate,
      speed: d.speedKmh ?? '',
      limit: d.limitKmh ?? '',
      zone: d.geofenceName ?? '',
      time: d.localTime ?? '',
      pct: d.batteryPct ?? '',
      since: typeof d.lastSeenAt === 'string' ? formatDateTime(d.lastSeenAt) : '',
    };
    return {
      title: `${t(`alerts.types.${a.type}`)} · ${a.vehicle.name}`,
      type: t(`alerts.types.${a.type}`),
      desc: t(`alerts.desc.${a.type}`, vars),
    };
  };
}
