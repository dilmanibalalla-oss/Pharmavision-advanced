import Constants from 'expo-constants';
import type { ComponentType } from 'react';
import { NativeModules, TurboModuleRegistry } from 'react-native';

export type WorldPlane = {
  points: { x: number; y: number; z: number }[];
  width: number;
  height: number;
  system: 'arcore' | 'arkit';
};

type TrackerProps = {
  onPlane: (plane: WorldPlane) => void;
};

function viroNativeReady() {
  if (NativeModules.VRTMaterialManager) return true;
  try {
    return Boolean(TurboModuleRegistry.get('VRTMaterialManager'));
  } catch {
    return false;
  }
}

export function nativeArInThisRuntime() {
  return Constants.executionEnvironment !== 'storeClient' && viroNativeReady();
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
