import { formatPlate, type LiveStatus, type PlateFormat } from '@winou/shared';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { Badge, statusColor, useTheme } from './ui';
import { useI18n } from '@/lib/i18n';

export function StatusBadge({ status, extra }: { status: LiveStatus; extra?: string }) {
  const { t } = useI18n();
  const { T } = useTheme();
  const bg: Record<LiveStatus, string> = { moving: T.okbg, stopped: T.infobg, offline: T.surf2, never: T.surf2, no_device: T.warnbg };
  return <Badge text={`${t(`map.statuses.${status}`)}${extra ? ` · ${extra}` : ''}`} color={status === 'no_device' ? T.warn : statusColor(T)[status]} bg={bg[status]} />;
}

export function PlateText({ plate, format, style }: { plate: string; format: PlateFormat; style?: StyleProp<TextStyle> }) {
  const { locale } = useI18n();
  return <Text style={[{ writingDirection: locale === 'ar' && format !== 'other' ? 'rtl' : 'ltr' }, style]}>{formatPlate(plate, format, locale)}</Text>;
}
