import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import MockAdapter from 'axios-mock-adapter';
import RootLayout from '@/app/_layout';
import LoginScreen from '@/app/login';
import SettingsScreen from '@/app/(app)/settings';
import { SplashView } from '@/components/SplashView';
import { client, get } from '@/api/client';
import { clinicApi } from '@/api/clinic';
import { authService } from '@/auth/service';
import { useAuthStore } from '@/store/authStore';

jest.mock('@/auth/service', () => ({
  authService: {
    login: jest.fn(),
    logout: jest.fn(),
    restore: jest.fn(),
  },
}));

jest.mock('@/api/clinic', () => ({
  clinicApi: {
    health: jest.fn(),
    stats: jest.fn(),
    dashboard: jest.fn(),
    alerts: jest.fn(),
    inventoryAlerts: jest.fn(),
  },
}));

const loginMock = authService.login as jest.Mock;
const health = clinicApi.health as jest.Mock;

const admin = {
  _id: 'user-1',
  name: 'Clinic admin',
  email: 'admin@helio.local',
  role: 'ADMIN',
  active: true,
};

describe('startup and protected navigation', () => {
  it('shows the splash, then login, then the app only after a session exists', async () => {
    const http = new MockAdapter(client);
    const splash = await render(<SplashView />);
    expect(screen.getByText('PharmaVision')).toBeTruthy();
    expect(screen.getByText('Clinic and dispensary')).toBeTruthy();
    await splash.unmount();

    await render(<RootLayout />);
    expect(screen.getByText('screen:login')).toBeTruthy();
    expect(screen.queryByText('screen:(app)')).toBeNull();

    useAuthStore.setState({ status: 'signedIn', user: admin, error: '' });
    await waitFor(() => expect(screen.getByText('screen:(app)')).toBeTruthy());
    expect(screen.queryByText('screen:login')).toBeNull();

    http.onGet('/api/shelves').reply(401, { message: 'Sign in to continue' });
    await expect(get('/api/shelves')).rejects.toThrow(/Sign in to continue/);
    await waitFor(() => expect(screen.getByText('screen:login')).toBeTruthy());
    http.restore();
  });
});

describe('login screen', () => {
  beforeEach(() => {
    loginMock.mockReset();
    useAuthStore.setState({ status: 'signedOut', user: null, error: '' });
  });

  it('validates the form, signs in, and shows a server or network failure', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByText('Sign in'));
    expect(screen.getByText('Enter the email address for your clinic account')).toBeTruthy();
    expect(loginMock).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@helio.local');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-password');
    loginMock.mockResolvedValue(admin);
    await fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('ada@helio.local', 'correct-password'));
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signedIn'));

    useAuthStore.setState({ status: 'signedOut', user: null, error: '' });
    loginMock.mockRejectedValue(new Error('Cannot reach the clinic server. Check the API address and that the server is running.'));
    await fireEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText(/Cannot reach the clinic server/)).toBeTruthy();
  });
});

describe('settings', () => {
  beforeEach(() => {
    health.mockReset();
    useAuthStore.setState({
      status: 'signedIn',
      user: admin,
      error: '',
      logout: jest.fn(async () => {
        useAuthStore.setState({ status: 'signedOut', user: null, error: '' });
      }),
    });
  });

  it('checks API connectivity and signs out', async () => {
    const { Alert } = require('react-native');
    jest.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => {
      const buttons = args[2] as { text?: string; onPress?: () => void }[] | undefined;
      buttons?.find((button) => button.text === 'Sign out')?.onPress?.();
    });
    health.mockResolvedValueOnce({ ok: true, database: 'connected' });
    await render(<SettingsScreen />);
    expect(screen.getByText('http://127.0.0.1:5000')).toBeTruthy();
    await fireEvent.press(screen.getByText('Check connection'));
    expect(await screen.findByText('Connected. Database connected.')).toBeTruthy();

    health.mockRejectedValueOnce(new Error('Cannot reach the clinic server. Check the API address and that the server is running.'));
    await fireEvent.press(screen.getByText('Check connection'));
    expect(await screen.findByText(/Cannot reach the clinic server/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Sign out'));
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signedOut'));
  });
});
