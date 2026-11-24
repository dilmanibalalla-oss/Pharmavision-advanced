import { useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/AppText';
import { CORNER_LABELS, clamp01, type Point2 } from '@/shelves/geometry';
import { colors, space } from '@/theme';

type Props = {
  uri: string;
  corners: [Point2, Point2, Point2, Point2];
  onChange: (corners: [Point2, Point2, Point2, Point2]) => void;
};

export function CornerEditor({ uri, corners, onChange }: Props) {
  const size = useRef({ width: 1, height: 1 });
  const cornersRef = useRef(corners);
  cornersRef.current = corners;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function place(index: number, x: number, y: number) {
    const next = cornersRef.current.map((point, pointIndex) => (pointIndex === index ? { x, y } : point)) as [
      Point2,
      Point2,
      Point2,
      Point2,
    ];
    onChangeRef.current(next);
  }

  return (
    <View
      style={styles.frame}
      onLayout={(event) => {
        size.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
      }}
    >
      <Image source={{ uri }} style={styles.photo} contentFit="cover" />
      {corners.map((corner, index) => (
        <Handle key={CORNER_LABELS[index]} label={CORNER_LABELS[index]} x={corner.x} y={corner.y} onPlace={(x, y) => place(index, x, y)} size={size} />
      ))}
    </View>
  );
}

function Handle({
  label,
  x,
  y,
  onPlace,
  size,
}: {
  label: string;
  x: number;
  y: number;
  onPlace: (x: number, y: number) => void;
  size: { current: { width: number; height: number } };
}) {
  const point = useRef({ x, y });
  point.current = { x, y };
  const grant = useRef({ x, y });
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grant.current = { ...point.current };
      },
      onPanResponderMove: (_event, gesture) => {
        const width = size.current.width || 1;
        const height = size.current.height || 1;
        onPlace(clamp01(grant.current.x + gesture.dx / width), clamp01(grant.current.y + gesture.dy / height));
      },
    })
  ).current;

  return (
    <View accessibilityLabel={label} {...responder.panHandlers} style={[styles.handle, { left: `${x * 100}%`, top: `${y * 100}%` }]}>
      <AppText variant="caption" tone="inverse">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 420, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.rail },
  photo: { width: '100%', height: '100%' },
  handle: {
    position: 'absolute',
    marginLeft: -36,
    marginTop: -16,
    backgroundColor: colors.sage,
    borderRadius: 8,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
});
