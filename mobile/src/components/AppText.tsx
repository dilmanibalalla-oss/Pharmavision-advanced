import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, typeface } from '@/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'button';

type Props = TextProps & {
  variant?: Variant;
  tone?: 'ink' | 'soft' | 'rail' | 'inverse' | 'danger' | 'sage';
};

const toneColor = {
  ink: colors.ink,
  soft: colors.inkSoft,
  rail: colors.rail,
  inverse: colors.railInk,
  danger: colors.rose,
  sage: colors.sage,
};

const variantStyle: Record<Variant, TextStyle> = {
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 14, lineHeight: 18 },
  caption: { fontSize: 13, lineHeight: 18 },
  button: { fontSize: 16, lineHeight: 20 },
};

const variantFace: Record<Variant, { role: Parameters<typeof typeface>[0]; weight: TextStyle['fontWeight'] }> = {
  display: { role: 'display', weight: '600' },
  title: { role: 'display', weight: '600' },
  heading: { role: 'displayMedium', weight: '500' },
  body: { role: 'body', weight: '400' },
  label: { role: 'medium', weight: '500' },
  caption: { role: 'body', weight: '400' },
  button: { role: 'semibold', weight: '600' },
};

export function AppText({ variant = 'body', tone = 'ink', style, ...props }: Props) {
  const face = variantFace[variant];
  return (
    <Text
      {...props}
      style={[variantStyle[variant], typeface(face.role, face.weight), { color: toneColor[tone] }, style]}
    />
  );
}
