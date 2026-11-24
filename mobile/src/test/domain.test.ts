import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { can, roleLabel } from '@/access';
import { apiBaseUrl, apiUrlProblem, deviceApiWarning } from '@/config';
import { imageProblem, createRequestId, MAX_IMAGE_BYTES } from '@/media/images';
import { DEFAULT_CORNERS, boundarySize, cornersValid } from '@/shelves/geometry';
import { prepareShelfRegistration } from '@/shelves/registration';
import { hasErrors, validateLogin, validatePasswordChange } from '@/validation';

const device = { platform: 'android', os: 'android 14', model: 'Pixel', appVersion: '1.0.0' };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('access', () => {
  it('lets a doctor read patients through medicines and blocks inventory writes', () => {
    expect(can('DOCTOR', 'medicines')).toBe(true);
    expect(can('DOCTOR', 'inventory')).toBe(false);
    expect(can('DOCTOR', 'shelfWrite')).toBe(false);
    expect(can('DOCTOR', 'dashboard')).toBe(false);
    expect(can('DOCTOR', 'alerts')).toBe(false);
  });

  it('lets inventory staff read stock and register shelves, and keeps alert closure with security', () => {
    expect(can('INVENTORY_MANAGER', 'inventory')).toBe(true);
    expect(can('INVENTORY_MANAGER', 'shelfWrite')).toBe(true);
    expect(can('INVENTORY_MANAGER', 'alerts')).toBe(true);
    expect(can('INVENTORY_MANAGER', 'alertWrite')).toBe(false);
    expect(can('SECURITY_OFFICER', 'alertWrite')).toBe(true);
    expect(can('PHARMACIST', 'scanWrite')).toBe(true);
    expect(can('DISPENSARY_STAFF', 'shelfWrite')).toBe(false);
    expect(can(undefined, 'medicines')).toBe(false);
    expect(roleLabel('INVENTORY_MANAGER')).toBe('Inventory Manager');
  });
});

describe('shelf geometry and registration', () => {
  it('accepts the default photo corners and builds a manual image-plane shelf', () => {
    expect(cornersValid(DEFAULT_CORNERS)).toBe('');
    const size = boundarySize(DEFAULT_CORNERS);
    expect(size.width).toBeGreaterThan(0.05);
    expect(size.height).toBeGreaterThan(0.05);
    const prepared = prepareShelfRegistration({
      name: ' Wall shelf ',
      location: 'Dispensary west',
      sections: [
        { code: 'a', name: ' Top ', medicineIds: [] },
        { code: 'B', name: 'Bottom' },
      ],
      frame: { kind: 'image', corners: DEFAULT_CORNERS },
      device,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.body.name).toBe('Wall shelf');
    expect(prepared.body.sections.map((section) => section.code)).toEqual(['A', 'B']);
    expect(prepared.body.boundary.unit).toBe('ratio');
    expect(prepared.body.boundary.points).toHaveLength(4);
    expect(prepared.body.boundary.points.every((point) => point.z === 0)).toBe(true);
    expect(prepared.body.coordinateSystem).toMatchObject({ name: 'image-normalized', unit: 'ratio' });
    expect(prepared.body.calibration).toEqual({ status: 'MANUAL', method: 'image-plane' });
  });

  it('builds tracked corners in meters without claiming the plane was detected', () => {
    const prepared = prepareShelfRegistration({
      name: 'Tracked shelf',
      location: 'Aisle 2',
      sections: [{ code: 'A', name: 'Face' }],
      frame: {
        kind: 'world',
        system: 'arcore',
        width: 0.8,
        height: 0.4,
        points: [
          { x: 0, y: 0.2, z: -1 },
          { x: 0.8, y: 0.2, z: -1 },
          { x: 0.8, y: -0.2, z: -1 },
          { x: 0, y: -0.2, z: -1 },
        ],
      },
      device,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.body.boundary.unit).toBe('m');
    expect(prepared.body.calibration).toEqual({ status: 'TRACKED', method: 'arcore' });
    expect(prepared.body.coordinateSystem.name).toBe('arcore');
  });

  it('rejects a shelf that is not ready to save', () => {
    expect(prepareShelfRegistration({ name: '', location: 'Room', sections: [], frame: { kind: 'image', corners: DEFAULT_CORNERS }, device }).ok).toBe(false);
    expect(
      prepareShelfRegistration({
        name: 'Shelf',
        location: 'Room',
        sections: [
          { code: 'A', name: 'One' },
          { code: 'a', name: 'Again' },
        ],
        frame: { kind: 'image', corners: DEFAULT_CORNERS },
        device,
      }).ok
    ).toBe(false);
    expect(cornersValid([{ x: 0.1, y: 0.1 }, { x: 0.12, y: 0.1 }, { x: 0.12, y: 0.5 }, { x: 0.1, y: 0.5 }])).toMatch(/large enough/);
  });
});

describe('images', () => {
  it('accepts a PNG signature and rejects the wrong type, a mismatch, and an oversized photo', () => {
    expect(imageProblem('image/png', PNG)).toBe('');
    expect(imageProblem('image/gif', PNG)).toMatch(/JPEG, PNG, or WebP/);
    expect(imageProblem('image/jpeg', PNG)).toMatch(/does not match/);
    const oversized = `/9j${'A'.repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3))}`;
    expect(imageProblem('image/jpeg', oversized)).toMatch(/under 5 MB/);
    expect(createRequestId().startsWith('scn-')).toBe(true);
    expect(createRequestId().length).toBeGreaterThanOrEqual(8);
  });
});

describe('login validation', () => {
  it('requires an email and a password, and a different new password', () => {
    expect(hasErrors(validateLogin('not-an-email', ''))).toBe(true);
    expect(validateLogin('ada@clinic.example', 'secret').email).toBeUndefined();
    expect(validatePasswordChange('same-password', 'same-password').newPassword).toMatch(/different/);
    expect(hasErrors(validatePasswordChange('current-password', 'new-password'))).toBe(false);
  });
});

describe('API address', () => {
  const original = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = original;
  });

  it('reads the public API address and rejects a missing or invalid one', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:5000/';
    expect(apiBaseUrl()).toBe('http://127.0.0.1:5000');
    expect(apiUrlProblem()).toBeNull();
    process.env.EXPO_PUBLIC_API_URL = '';
    expect(apiUrlProblem()).toMatch(/EXPO_PUBLIC_API_URL/);
    process.env.EXPO_PUBLIC_API_URL = 'ftp://clinic.example';
    expect(apiUrlProblem()).toMatch(/http/);
  });

  it('warns a physical phone that localhost is unreachable', () => {
    const device = Device as { isDevice: boolean };
    const previous = device.isDevice;
    const previousHost = Constants.expoConfig?.hostUri;
    device.isDevice = true;
    if (Constants.expoConfig) Constants.expoConfig.hostUri = '192.168.1.35:8081';
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:5000';
    expect(deviceApiWarning()).toMatch(/192\.168\.1\.35:5000/);
    device.isDevice = previous;
    if (Constants.expoConfig && previousHost) Constants.expoConfig.hostUri = previousHost;
  });
});
