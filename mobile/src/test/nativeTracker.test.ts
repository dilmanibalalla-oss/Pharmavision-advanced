import Constants from 'expo-constants';
import { loadShelfTracker, nativeArInThisRuntime } from '@/ar/nativeTracker';

describe('native shelf tracker', () => {
  const runtime = Constants as { executionEnvironment?: string };

  afterEach(() => {
    runtime.executionEnvironment = 'storeClient';
  });

  it('stays unloaded in Expo Go', () => {
    runtime.executionEnvironment = 'storeClient';
    expect(nativeArInThisRuntime()).toBe(false);
    expect(loadShelfTracker()).toBeNull();
  });

  it('selects the native module outside Expo Go without running plane detection', () => {
    runtime.executionEnvironment = 'bare';
    expect(nativeArInThisRuntime()).toBe(true);
    const tracker = loadShelfTracker();
    expect(typeof tracker).toBe('function');
  });
});
