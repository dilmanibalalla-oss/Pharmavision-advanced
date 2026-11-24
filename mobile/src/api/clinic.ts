import { get } from '@/api/client';
import type {
  ClinicStats,
  DashboardResponse,
  DiscrepancyPage,
  HealthReport,
  InventoryAlertReport,
} from '@/types';

export const clinicApi = {
  health: () => get<HealthReport>('/api/health'),
  stats: () => get<ClinicStats>('/api/stats'),
  dashboard: () => get<DashboardResponse>('/api/dashboard'),
  alerts: () => get<DiscrepancyPage>('/api/alerts?limit=30'),
  inventoryAlerts: () => get<InventoryAlertReport>('/api/inventory/alerts'),
};
