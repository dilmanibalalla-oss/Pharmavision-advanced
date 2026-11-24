import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HomeScreen from '@/app/(app)/(tabs)/index';
import InventoryScreen from '@/app/(app)/(tabs)/inventory';
import AlertsScreen from '@/app/(app)/(tabs)/alerts';
import MedicinesScreen from '@/app/(app)/medicines';
import { clinicApi } from '@/api/clinic';
import { operationsApi } from '@/api/operations';
import { useAuthStore } from '@/store/authStore';

jest.mock('@/api/clinic', () => ({
  clinicApi: {
    dashboard: jest.fn(),
    stats: jest.fn(),
    alerts: jest.fn(),
    inventoryAlerts: jest.fn(),
    health: jest.fn(),
  },
}));

jest.mock('@/api/operations', () => ({
  operationsApi: {
    scans: jest.fn(),
    stock: jest.fn(),
    inventoryAlerts: jest.fn(),
    medicines: jest.fn(),
  },
}));

const dashboard = clinicApi.dashboard as jest.Mock;
const stats = clinicApi.stats as jest.Mock;
const discrepancyAlerts = clinicApi.alerts as jest.Mock;
const clinicInventoryAlerts = clinicApi.inventoryAlerts as jest.Mock;
const scans = operationsApi.scans as jest.Mock;
const stock = operationsApi.stock as jest.Mock;
const inventoryAlerts = operationsApi.inventoryAlerts as jest.Mock;
const medicines = operationsApi.medicines as jest.Mock;

function signIn(role: string) {
  useAuthStore.setState({
    status: 'signedIn',
    error: '',
    user: { _id: 'user-1', name: 'Staff', email: 'staff@helio.local', role, active: true },
  });
}

const network = new Error('Cannot reach the clinic server. Check the API address and that the server is running.');

describe('patient and doctor data', () => {
  beforeEach(() => {
    dashboard.mockReset();
    stats.mockReset();
    scans.mockReset();
    scans.mockResolvedValue({ scans: [], page: 1, total: 0, pages: 0 });
  });

  it('shows server patient, doctor, and consultation counts for an admin', async () => {
    signIn('ADMIN');
    dashboard.mockResolvedValue({
      cards: {
        doctors: 2,
        patients: 12,
        consultations: 7,
        prescriptions: 4,
        medicines: 30,
        suppliers: 1,
        stockValue: 10,
        lowStock: 1,
        expiring: 0,
        pendingAlerts: 3,
      },
      recentPatients: [{ _id: 'p1', name: 'Nia Cole', age: 34, createdAt: '2026-11-01T09:00:00.000Z' }],
      recentConsultations: [{ _id: 'c1', name: 'Nia Cole', visitedAt: '2026-11-02T09:00:00.000Z', treatmentCount: 1 }],
      lowStock: [],
      expiring: [],
    });
    await render(<HomeScreen />);
    expect(screen.getAllByText('Nia Cole')).toHaveLength(2);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Recent patients')).toBeTruthy();
    expect(screen.getByText('Recent consultations')).toBeTruthy();
  });

  it('gives a doctor the shared stats and hides the admin patient list', async () => {
    signIn('DOCTOR');
    stats.mockResolvedValue({ patients: 12, medicines: 30, visits: 4 });
    await render(<HomeScreen />);
    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.queryByText('Recent patients')).toBeNull();
    expect(dashboard).not.toHaveBeenCalled();
  });

  it('shows the network failure and no invented counts', async () => {
    signIn('ADMIN');
    dashboard.mockRejectedValue(network);
    await render(<HomeScreen />);
    expect(await screen.findByText(network.message)).toBeTruthy();
    expect(screen.queryByText('Recent patients')).toBeNull();
  });
});

describe('inventory and alerts', () => {
  beforeEach(() => {
    stock.mockReset();
    inventoryAlerts.mockReset();
    discrepancyAlerts.mockReset();
    clinicInventoryAlerts.mockReset();
  });

  it('loads stock and expiry warnings from the server', async () => {
    signIn('PHARMACIST');
    stock.mockResolvedValue({
      stock: [{ medicine: 'm1', medicineName: 'Amoxicillin', onHand: 2, minimumStock: 10, low: true }],
    });
    inventoryAlerts.mockResolvedValue({
      lowStock: [{ medicine: 'm1', medicineName: 'Amoxicillin', strength: '500mg', form: 'Tablet', onHand: 2, minimumStock: 10 }],
      nearExpiry: [],
      expired: [],
    });
    await render(<InventoryScreen />);
    expect(await screen.findByText(/Amoxicillin · 2 on hand · minimum 10/)).toBeTruthy();
    expect(screen.getByText('Low stock lines: 1')).toBeTruthy();
  });

  it('hides stock from a doctor and reports a network failure', async () => {
    signIn('DOCTOR');
    const doctorInventory = await render(<InventoryScreen />);
    expect(screen.getByText('Medicine search')).toBeTruthy();
    expect(screen.queryByText('Shelves')).toBeNull();
    expect(stock).not.toHaveBeenCalled();
    await doctorInventory.unmount();

    signIn('PHARMACIST');
    stock.mockRejectedValue(network);
    inventoryAlerts.mockRejectedValue(network);
    await render(<InventoryScreen />);
    expect(await screen.findByText(network.message)).toBeTruthy();
  });

  it('loads discrepancy alerts and hides them from a doctor', async () => {
    signIn('SECURITY_OFFICER');
    discrepancyAlerts.mockResolvedValue({
      alerts: [
        {
          _id: 'a1',
          alertCode: 'ALT-1',
          kind: 'COUNT_DIFFERENCE',
          shelfName: 'Wall shelf',
          medicineName: 'Amoxicillin',
          status: 'PENDING',
          detectedAt: '2026-11-03T09:00:00.000Z',
          difference: -2,
        },
      ],
      total: 1,
      page: 1,
      pages: 1,
    });
    const securityAlerts = await render(<AlertsScreen />);
    expect(await screen.findByText('ALT-1')).toBeTruthy();
    expect(screen.getByText(/Amoxicillin · Wall shelf/)).toBeTruthy();
    await securityAlerts.unmount();

    signIn('DOCTOR');
    await render(<AlertsScreen />);
    expect(screen.getByText('No alert feed for this account')).toBeTruthy();
    expect(discrepancyAlerts).toHaveBeenCalledTimes(1);
  });
});

describe('medicine search', () => {
  beforeEach(() => medicines.mockReset());

  it('searches the catalog and blocks a role that cannot read it', async () => {
    signIn('SECURITY_OFFICER');
    const denied = await render(<MedicinesScreen />);
    expect(screen.getByText('Catalog is not available')).toBeTruthy();
    await denied.unmount();

    signIn('DOCTOR');
    medicines.mockResolvedValue([
      { _id: 'm1', name: 'Amoxicillin', medicineCode: 'MED-1', strength: '500mg', form: 'Tablet', active: true },
    ]);
    await render(<MedicinesScreen />);
    await fireEvent.changeText(screen.getByLabelText('Name, code, or strength'), 'Am');
    await fireEvent.press(screen.getByText('Search'));
    expect(await screen.findByText('Amoxicillin')).toBeTruthy();
    expect(medicines).toHaveBeenCalledWith('Am');

    medicines.mockRejectedValue(new Error('You do not have access to that'));
    await fireEvent.press(screen.getByText('Search'));
    expect(await screen.findByText('You do not have access to that')).toBeTruthy();
  });
});
