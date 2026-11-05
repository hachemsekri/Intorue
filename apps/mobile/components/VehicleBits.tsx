import { formatPlate, type LiveStatus, type PlateFormat } from '@winou/shared';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { Badge } from './ui';
import { useI18n } from '@/lib/i18n';
import { STATUS_COLOR } from '@/lib/live';

const BG: Record<LiveStatus, string> = { moving: '#E3F5F3', stopped: '#E8EEF7', offline: '#F3F6F9', never: '#F3F6F9', no_device: '#FDEFE3' };

export function StatusBadge({ status, extra }: { status: LiveStatus; extra?: string }) {
  const { t } = useI18n();
  return <Badge text={`${t(`map.statuses.${status}`)}${extra ? ` · ${extra}` : ''}`} color={status === 'no_device' ? '#B34A07' : STATUS_COLOR[status]} bg={BG[status]} />;
}

export function PlateText({ plate, format, style }: { plate: string; format: PlateFormat; style?: StyleProp<TextStyle> }) {
  const { locale } = useI18n();
  return <Text style={[{ writingDirection: locale === 'ar' && format !== 'other' ? 'rtl' : 'ltr' }, style]}>{formatPlate(plate, format, locale)}</Text>;
}
