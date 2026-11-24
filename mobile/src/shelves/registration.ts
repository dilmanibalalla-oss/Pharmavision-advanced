import { boundarySize, cornersValid } from '@/shelves/geometry';

export type RegistrationSection = { code: string; name: string; medicineIds?: string[] };

export type RegistrationFrame =
  | { kind: 'image'; corners: { x: number; y: number }[] }
  | {
      kind: 'world';
      points: { x: number; y: number; z: number }[];
      width: number;
      height: number;
      system: 'arcore' | 'arkit';
    };

export type ShelfDevice = {
  platform: string;
  os: string;
  model: string;
  appVersion: string;
};

export type PreparedShelf = {
  name: string;
  location: string;
  sections: { code: string; name: string; medicines: string[] }[];
  boundary: {
    unit: 'ratio' | 'm';
    width: number;
    height: number;
    depth: number;
    points: { x: number; y: number; z: number }[];
  };
  coordinateSystem: {
    name: string;
    handedness: 'right';
    up: 'y';
    unit: 'ratio' | 'm';
    origin: { x: number; y: number; z: number };
  };
  calibration: { status: 'MANUAL' | 'TRACKED'; method: string };
  device: ShelfDevice;
};

export function prepareShelfRegistration(input: {
  name: string;
  location: string;
  sections: RegistrationSection[];
  frame: RegistrationFrame;
  device: ShelfDevice;
}): { ok: false; error: string } | { ok: true; body: PreparedShelf } {
  const name = input.name.trim();
  const location = input.location.trim();
  if (!name || name.length > 120 || !location || location.length > 160) {
    return { ok: false, error: 'Shelf name and location are required' };
  }
  const codes = new Set<string>();
  const sections = [];
  for (const section of input.sections) {
    const code = section.code.trim().toUpperCase();
    const sectionName = section.name.trim();
    if (!code || !sectionName || code.length > 20 || sectionName.length > 80) {
      return { ok: false, error: 'Each section needs a code and a name' };
    }
    if (codes.has(code)) return { ok: false, error: 'Section codes must be unique on a shelf' };
    codes.add(code);
    sections.push({ code, name: sectionName, medicines: section.medicineIds ?? [] });
  }

  let size: { width: number; height: number };
  let points: { x: number; y: number; z: number }[];
  let systemName = 'image-normalized';
  let unit: 'ratio' | 'm' = 'ratio';
  let calibration: PreparedShelf['calibration'] = { status: 'MANUAL', method: 'image-plane' };

  if (input.frame.kind === 'world') {
    const frame = input.frame;
    size = { width: frame.width, height: frame.height };
    points = frame.points;
    systemName = frame.system;
    unit = 'm';
    calibration = { status: 'TRACKED', method: frame.system };
  } else {
    const frame = input.frame;
    const problem = cornersValid(frame.corners);
    if (problem) return { ok: false, error: problem };
    size = boundarySize(frame.corners);
    points = frame.corners.map((point) => ({ x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)), z: 0 }));
  }

  return {
    ok: true,
    body: {
      name,
      location,
      sections,
      boundary: { unit, width: size.width, height: size.height, depth: 0, points },
      coordinateSystem: {
        name: systemName,
        handedness: 'right',
        up: 'y',
        unit,
        origin: { x: 0, y: 0, z: 0 },
      },
      calibration,
      device: input.device,
    },
  };
}
