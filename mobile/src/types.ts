export type ClinicUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};

export type SessionResponse = {
  user: ClinicUser;
  accessToken?: string;
  refreshToken?: string;
};

export type ClinicStats = {
  patients: number;
  medicines: number;
  visits: number;
};

export type DashboardCard = {
  doctors: number;
  patients: number;
  consultations: number;
  prescriptions: number;
  medicines: number;
  suppliers: number;
  stockValue: number | null;
  lowStock: number | null;
  expiring: number | null;
  pendingAlerts: number;
};

export type DashboardPatient = {
  _id: string;
  name: string;
  age?: number;
  createdAt?: string;
};

export type DashboardConsultation = {
  _id: string;
  name: string;
  visitedAt?: string;
  treatmentCount?: number;
};

export type DashboardMedicine = {
  _id: string;
  name: string;
  strength?: string;
  form?: string;
  quantity?: number;
  reorderLevel?: number;
  expiresAt?: string;
};

export type DashboardResponse = {
  cards: DashboardCard;
  recentPatients: DashboardPatient[];
  recentConsultations: DashboardConsultation[];
  lowStock: DashboardMedicine[];
  expiring: DashboardMedicine[];
};

export type DiscrepancyAlert = {
  _id: string;
  alertCode: string;
  kind: string;
  shelfName: string;
  medicineName: string;
  status: string;
  detectedAt: string;
  difference: number;
};

export type DiscrepancyPage = {
  alerts: DiscrepancyAlert[];
  total: number;
  page: number;
  pages: number;
};

export type StockAlert = {
  medicine: string;
  medicineName: string;
  strength: string;
  form: string;
  onHand: number;
  minimumStock: number;
};

export type BatchAlert = {
  _id: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  remainingQuantity: number;
};

export type InventoryAlertReport = {
  lowStock: StockAlert[];
  nearExpiry: BatchAlert[];
  expired: BatchAlert[];
};

export type HealthReport = {
  ok: boolean;
  database: string;
};

export type ShelfPoint = { x: number; y: number; z: number };

export type ShelfSection = {
  _id?: string;
  code: string;
  name: string;
  medicines?: { medicine: string; medicineName: string }[];
};

export type ShelfRecord = {
  _id: string;
  shelfCode: string;
  name: string;
  location: string;
  sections: ShelfSection[];
  boundary: { unit: string; width: number; height: number; depth: number; points: ShelfPoint[] };
  coordinateSystem: { name: string; handedness?: string; up?: string; unit: string };
  device?: { platform?: string; os?: string; model?: string; appVersion?: string };
  calibration?: { status: string; method: string };
  status: string;
  createdByName?: string;
  lastScanAt?: string | null;
  createdAt?: string;
  scans?: ScanRecord[];
};

export type Observation = {
  _id: string;
  medicine: string | null;
  medicineName: string;
  label: string;
  section: string;
  count: number;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  unknown: boolean;
  lowConfidence: boolean;
};

export type ScanRecord = {
  _id: string;
  scanCode: string;
  requestId: string;
  shelf: string;
  shelfCode: string;
  shelfName: string;
  section: string;
  status: string;
  recognition: { connected: boolean; performed: boolean; message: string };
  observations: Observation[];
  imageStored?: boolean;
  imageMime?: string;
  imageSize?: number;
  userName?: string;
  review?: { status: string; note: string; reviewedByName?: string; reviewedAt?: string | null };
  createdAt?: string;
  stockChanged?: boolean;
};

export type ScanPage = {
  scans: ScanRecord[];
  page: number;
  total: number;
  pages: number;
  recognitionConnected?: boolean;
};

export type MedicineRecord = {
  _id: string;
  medicineCode: string;
  name: string;
  strength: string;
  form: string;
  active: boolean;
};

export type StockRow = {
  medicine: string;
  medicineName: string;
  strength?: string;
  form?: string;
  onHand: number;
  minimumStock: number;
  low?: boolean;
  nearestExpiry?: string | null;
};

export type AlertDetail = DiscrepancyAlert & {
  section: string;
  expectedQuantity: number;
  observedQuantity: number;
  notes: { at?: string; name?: string; text: string }[];
  evidence: { kind?: string; label?: string }[];
  resolution: string;
  statement: string;
  investigator: string | null;
  investigatorName: string;
  movements: string[];
  scan: string | null;
  closedAt?: string | null;
};
