const ACCESS = {
  dashboard: ['ADMIN'],
  alerts: ['ADMIN', 'SECURITY_OFFICER', 'INVENTORY_MANAGER'],
  alertWrite: ['ADMIN', 'SECURITY_OFFICER'],
  inventory: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST', 'DISPENSARY_STAFF'],
  medicines: ['ADMIN', 'DOCTOR', 'PHARMACIST', 'INVENTORY_MANAGER', 'DISPENSARY_STAFF'],
  shelves: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST', 'SECURITY_OFFICER'],
  shelfWrite: ['ADMIN', 'INVENTORY_MANAGER'],
  scans: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST', 'SECURITY_OFFICER'],
  scanWrite: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST'],
  users: ['ADMIN', 'SECURITY_OFFICER'],
} as const;

export type AccessArea = keyof typeof ACCESS;

export function can(role: string | undefined, area: AccessArea) {
  if (!role) return false;
  return (ACCESS[area] as readonly string[]).includes(role);
}

export function roleLabel(role: string | undefined) {
  if (!role) return 'Staff';
  return role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
