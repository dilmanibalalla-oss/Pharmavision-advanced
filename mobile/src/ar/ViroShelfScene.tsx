import type { ComponentType, ReactElement, ReactNode } from 'react';
import { Platform } from 'react-native';
import type { WorldPlane } from '@/ar/nativeTracker';

type Anchor = {
  position?: number[];
  center?: number[];
  width?: number;
  height?: number;
  vertices?: number[][];
};

type TrackerProps = {
  onPlane: (plane: WorldPlane) => void;
};

function cornersFromAnchor(anchor: Anchor): WorldPlane | null {
  const system = Platform.OS === 'ios' ? 'arkit' : 'arcore';
  if (anchor.vertices && anchor.vertices.length >= 3) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let z = 0;
    for (const vertex of anchor.vertices) {
      minX = Math.min(minX, vertex[0]);
      maxX = Math.max(maxX, vertex[0]);
      minY = Math.min(minY, vertex[1]);
      maxY = Math.max(maxY, vertex[1]);
      z += vertex[2] || 0;
    }
    z /= anchor.vertices.length;
    return {
      width: maxX - minX,
      height: maxY - minY,
      system,
      points: [
        { x: minX, y: maxY, z },
        { x: maxX, y: maxY, z },
        { x: maxX, y: minY, z },
        { x: minX, y: minY, z },
      ],
    };
  }
  const position = anchor.position || anchor.center;
  if (!position || position.length < 3) return null;
  const [x, y, z] = position;
  const halfWidth = Math.max(0.05, Number(anchor.width || 0.6) / 2);
  const halfHeight = Math.max(0.05, Number(anchor.height || 0.4) / 2);
  return {
    width: halfWidth * 2,
    height: halfHeight * 2,
    system,
    points: [
      { x: x - halfWidth, y: y + halfHeight, z },
      { x: x + halfWidth, y: y + halfHeight, z },
      { x: x + halfWidth, y: y - halfHeight, z },
      { x: x - halfWidth, y: y - halfHeight, z },
    ],
  };
}

function Scene({ onPlane }: TrackerProps) {
  const viro = require('@reactvision/react-viro') as {
    ViroARScene: ComponentType<{ children?: ReactNode }>;
    ViroARPlaneSelector: ComponentType<{ onPlaneSelected?: (anchor: Anchor) => void }>;
  };
  const { ViroARScene, ViroARPlaneSelector } = viro;
  return (
    <ViroARScene>
      <ViroARPlaneSelector
        onPlaneSelected={(anchor) => {
          const plane = cornersFromAnchor(anchor);
          if (plane) onPlane(plane);
        }}
      />
    </ViroARScene>
  );
}

export function ShelfTracker({ onPlane }: TrackerProps) {
  const viro = require('@reactvision/react-viro') as {
    ViroARSceneNavigator: ComponentType<{ autofocus?: boolean; initialScene: { scene: () => ReactElement } }>;
  };
  const { ViroARSceneNavigator } = viro;
  return <ViroARSceneNavigator autofocus initialScene={{ scene: () => <Scene onPlane={onPlane} /> }} />;
}
