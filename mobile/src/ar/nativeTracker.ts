import Constants from 'expo-constants';
import type { ComponentType } from 'react';

export type WorldPlane = {
  points: { x: number; y: number; z: number }[];
  width: number;
  height: number;
  system: 'arcore' | 'arkit';
};

type TrackerProps = {
  onPlane: (plane: WorldPlane) => void;
};

export function nativeArInThisRuntime() {
  return Constants.executionEnvironment !== 'storeClient';
}

export function loadShelfTracker(): ComponentType<TrackerProps> | null {
  if (!nativeArInThisRuntime()) return null;
  try {
    const loaded = require('./ViroShelfScene') as { ShelfTracker?: ComponentType<TrackerProps> };
    return loaded.ShelfTracker ?? null;
  } catch {
    return null;
  }
}
