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
  return false;
}

export function loadShelfTracker(): ComponentType<TrackerProps> | null {
  return null;
}
