import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { CameraCapture } from '@/components/CameraCapture';
import RegisterShelfScreen from '@/app/(app)/shelves/register';
import ScanDetailScreen from '@/app/(app)/scans/[id]';
import { operationsApi } from '@/api/operations';
import { cameraMock } from '@/test/cameraState';
import { useShelfDraft } from '@/store/shelfDraft';
import { useAuthStore } from '@/store/authStore';
import type { ScanRecord } from '@/types';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    executionEnvironment: 'storeClient',
    expoConfig: { version: '1.0.0', hostUri: '127.0.0.1:8081' },
  },
}));

jest.mock('@/api/operations', () => ({
  operationsApi: {
    createShelf: jest.fn(),
    scan: jest.fn(),
    scanImageUri: jest.fn(),
    reviewScan: jest.fn(),
  },
}));

const createShelf = operationsApi.createShelf as jest.Mock;
const scan = operationsApi.scan as jest.Mock;
const scanImageUri = operationsApi.scanImageUri as jest.Mock;
const reviewScan = operationsApi.reviewScan as jest.Mock;

function observedScan(status = 'OBSERVED'): ScanRecord {
  return {
    _id: 'scan-1',
    scanCode: 'SCN-1',
    requestId: 'scn-test-request',
    shelf: 'shelf-1',
    shelfCode: 'SHF-1',
    shelfName: 'Wall shelf',
    section: 'A',
    status,
    recognition: {
      connected: status === 'OBSERVED',
      performed: status === 'OBSERVED',
      message:
        status === 'OBSERVED'
          ? 'Detections are observations. Stock was not changed.'
          : 'The medicine detection service is not connected. This image was stored for review and was not recognized. Stock was not changed.',
    },
    observations:
      status === 'OBSERVED'
        ? [
            {
              _id: 'obs-1',
              medicine: 'm1',
              medicineName: 'Amoxicillin',
              label: 'Amoxicillin',
              section: 'A',
              count: 2,
              confidence: 0.91,
              boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
              unknown: false,
              lowConfidence: false,
            },
            {
              _id: 'obs-2',
              medicine: null,
              medicineName: '',
              label: 'Blue box',
              section: 'A',
              count: 1,
              confidence: 0.42,
              boundingBox: { x: 0.5, y: 0.2, width: 0.2, height: 0.2 },
              unknown: true,
              lowConfidence: true,
            },
          ]
        : [],
    review: { status: 'UNREVIEWED', note: '' },
    createdAt: '2026-11-04T09:00:00.000Z',
  };
}

describe('camera permissions and capture', () => {
  beforeEach(() => {
    cameraMock.permission = null;
    cameraMock.requestPermission.mockClear();
    cameraMock.takePictureAsync.mockReset();
    cameraMock.takePictureAsync.mockResolvedValue({ uri: 'file://shelf.jpg', base64: '/9jphoto' });
  });

  it('asks for permission and returns the captured photo', async () => {
    const onCapture = jest.fn();
    const view = await render(<CameraCapture onCapture={onCapture} />);
    expect(screen.getByText('Checking camera permission')).toBeTruthy();

    cameraMock.permission = { granted: false };
    await view.rerender(<CameraCapture onCapture={onCapture} />);
    await fireEvent.press(screen.getByText('Allow camera'));
    expect(cameraMock.requestPermission).toHaveBeenCalled();

    cameraMock.permission = { granted: true };
    await view.rerender(<CameraCapture onCapture={onCapture} />);
    await fireEvent.press(screen.getByLabelText('Take photo'));
    await waitFor(() => expect(onCapture).toHaveBeenCalledWith({ uri: 'file://shelf.jpg', base64: '/9jphoto' }));
  });
});

describe('shelf registration', () => {
  beforeEach(() => {
    (Constants as { executionEnvironment: string }).executionEnvironment = 'storeClient';
    cameraMock.permission = { granted: true };
    useShelfDraft.getState().reset();
    createShelf.mockReset();
    (useRouter().replace as jest.Mock).mockClear();
  });

  it('saves photo corners through the clinic API in Expo Go', async () => {
    createShelf.mockResolvedValue({ _id: 'shelf-1' });
    await render(<RegisterShelfScreen />);
    expect(screen.getByText(/Expo Go cannot run ARCore or ARKit/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Take photo'));
    expect(await screen.findByText('Top-left')).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirm corners'));
    await fireEvent.changeText(screen.getByLabelText('Shelf name'), 'Wall shelf');
    await fireEvent.changeText(screen.getByLabelText('Location'), 'Dispensary west');
    await fireEvent.press(screen.getByText('Save shelf'));
    await waitFor(() => expect(createShelf).toHaveBeenCalled());
    const body = createShelf.mock.calls[0][0];
    expect(body.calibration).toEqual({ status: 'MANUAL', method: 'image-plane' });
    expect(body.coordinateSystem.name).toBe('image-normalized');
    expect(body.boundary.points).toHaveLength(4);
    expect(body.device.platform).toEqual(expect.any(String));
    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith('/shelves/shelf-1'));
  });
});

describe('AI detection responses', () => {
  beforeEach(() => {
    scan.mockReset();
    scanImageUri.mockReset();
    reviewScan.mockReset();
    scanImageUri.mockResolvedValue('data:image/png;base64,iVBOR');
    useAuthStore.setState({
      status: 'signedIn',
      error: '',
      user: { _id: 'user-2', name: 'Pharmacist', email: 'pharma@helio.local', role: 'PHARMACIST', active: true },
    });
  });

  it('shows names, quantities, confidence, unknown products, and boxes without changing stock', async () => {
    scan.mockResolvedValue(observedScan());
    reviewScan.mockResolvedValue({
      ...observedScan(),
      review: { status: 'CONFIRMED', note: 'Checked the shelf', reviewedByName: 'Pharmacist' },
      stockChanged: false,
    });
    await render(<ScanDetailScreen />);
    expect(await screen.findByText('Amoxicillin')).toBeTruthy();
    expect(screen.getByText(/Count 2 · confidence 91%/)).toBeTruthy();
    expect(screen.getByText('Blue box')).toBeTruthy();
    expect(screen.getByText(/low confidence/)).toBeTruthy();
    expect(screen.getByText(/not in the catalog/)).toBeTruthy();
    expect(screen.getByTestId('observation-obs-1')).toBeTruthy();
    expect(screen.getByText(/Observations do not change stock/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirm observations'));
    await waitFor(() => expect(reviewScan).toHaveBeenCalledWith('scan-1', ''));
    expect(await screen.findByText('Reviewed by Pharmacist. Stock was not changed.')).toBeTruthy();
  });

  it('shows the disconnected detection message and no confirm action', async () => {
    scan.mockResolvedValue(observedScan('RECEIVED'));
    await render(<ScanDetailScreen />);
    expect(await screen.findByText(/detection service is not connected/)).toBeTruthy();
    expect(screen.getByText('No medicines were returned for this photo.')).toBeTruthy();
    expect(screen.queryByText('Confirm observations')).toBeNull();
  });
});
