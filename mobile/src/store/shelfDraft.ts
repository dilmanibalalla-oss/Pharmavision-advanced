import { create } from 'zustand';
import { DEFAULT_CORNERS, type Point2 } from '@/shelves/geometry';

export type DraftSection = { code: string; name: string; medicineIds: string[] };

type Frame =
  | { kind: 'image'; corners: [Point2, Point2, Point2, Point2] }
  | { kind: 'world'; points: { x: number; y: number; z: number }[]; width: number; height: number; system: 'arcore' | 'arkit' };

type ShelfDraft = {
  name: string;
  location: string;
  photoUri: string | null;
  frame: Frame;
  sections: DraftSection[];
  setName: (name: string) => void;
  setLocation: (location: string) => void;
  setPhotoUri: (photoUri: string | null) => void;
  setCorners: (corners: [Point2, Point2, Point2, Point2]) => void;
  setWorld: (frame: Extract<Frame, { kind: 'world' }>) => void;
  setSections: (sections: DraftSection[]) => void;
  reset: () => void;
};

const initial = {
  name: '',
  location: '',
  photoUri: null as string | null,
  frame: { kind: 'image' as const, corners: DEFAULT_CORNERS },
  sections: [{ code: 'A', name: 'Top', medicineIds: [] as string[] }],
};

export const useShelfDraft = create<ShelfDraft>((set) => ({
  ...initial,
  frame: { kind: 'image', corners: DEFAULT_CORNERS.map((point) => ({ ...point })) as [Point2, Point2, Point2, Point2] },
  sections: [{ code: 'A', name: 'Top', medicineIds: [] }],
  setName: (name) => set({ name }),
  setLocation: (location) => set({ location }),
  setPhotoUri: (photoUri) => set({ photoUri }),
  setCorners: (corners) => set({ frame: { kind: 'image', corners } }),
  setWorld: (frame) => set({ frame }),
  setSections: (sections) => set({ sections }),
  reset: () =>
    set({
      name: '',
      location: '',
      photoUri: null,
      frame: { kind: 'image', corners: DEFAULT_CORNERS.map((point) => ({ ...point })) as [Point2, Point2, Point2, Point2] },
      sections: [{ code: 'A', name: 'Top', medicineIds: [] }],
    }),
}));
