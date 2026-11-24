import { Platform, type TextStyle } from 'react-native';

export const colors = {
  ink: '#1b2826',
  inkSoft: '#5c6b66',
  paper: '#f3f0e8',
  paper2: '#fffdf8',
  rail: '#1a3330',
  railInk: '#e7f1ee',
  railDim: '#b7ccc6',
  line: '#e3dacb',
  copper: '#c4623a',
  sage: '#2f6f62',
  sageWash: '#e5f2ee',
  rose: '#8d3b32',
  roseWash: '#f8e6e1',
  white: '#ffffff',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 28,
};

const brand = {
  display: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  body: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
} as const;

let brandFonts = false;

export function setBrandFonts(enabled: boolean) {
  brandFonts = enabled;
}

export function typeface(
  role: keyof typeof brand,
  weight: TextStyle['fontWeight'] = '400'
): TextStyle {
  if (brandFonts) return { fontFamily: brand[role] };
  if (role === 'display' || role === 'displayMedium') {
    return {
      fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
      fontWeight: weight,
    };
  }
  return {
    fontFamily: Platform.select({ android: 'sans-serif', default: undefined }),
    fontWeight: weight,
  };
}
