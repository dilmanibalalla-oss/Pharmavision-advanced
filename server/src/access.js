export const USER_ROLES = [
  'ADMIN',
  'DOCTOR',
  'PHARMACIST',
  'INVENTORY_MANAGER',
  'SECURITY_OFFICER',
  'DISPENSARY_STAFF',
];

const LEGACY_ROLES = {
  admin: 'ADMIN',
  doctor: 'DOCTOR',
  pharmacist: 'PHARMACIST',
  receptionist: 'DISPENSARY_STAFF',
};

export const PATIENT_READ = ['ADMIN', 'DOCTOR', 'PHARMACIST', 'SECURITY_OFFICER', 'DISPENSARY_STAFF'];
export const PATIENT_WRITE = ['ADMIN', 'DOCTOR'];
export const PATIENT_CLINICAL = ['ADMIN', 'DOCTOR', 'PHARMACIST', 'DISPENSARY_STAFF'];
export const MEDICINE_READ = ['ADMIN', 'DOCTOR', 'PHARMACIST', 'INVENTORY_MANAGER', 'DISPENSARY_STAFF'];
export const MEDICINE_WRITE = ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'];
export const USER_READ = ['ADMIN', 'SECURITY_OFFICER'];
export const USER_WRITE = ['ADMIN'];
export const DASHBOARD_READ = ['ADMIN'];
export const DOCTOR_STORED_ROLES = ['DOCTOR', 'doctor'];
export const DOCTOR_READ = ['ADMIN', 'SECURITY_OFFICER', 'DOCTOR'];
export const DOCTOR_WRITE = ['ADMIN'];
export const CONSULTATION_READ = ['ADMIN', 'DOCTOR'];
export const CONSULTATION_WRITE = ['ADMIN', 'DOCTOR'];

export function canonicalRole(role) {
  if (USER_ROLES.includes(role)) return role;
  return LEGACY_ROLES[role] || '';
}
