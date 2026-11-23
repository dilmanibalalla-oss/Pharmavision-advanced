const ACCESS = {
  patients: {
    read: ['ADMIN', 'DOCTOR', 'PHARMACIST', 'SECURITY_OFFICER', 'DISPENSARY_STAFF'],
    write: ['ADMIN', 'DOCTOR'],
    clinical: ['ADMIN', 'DOCTOR', 'PHARMACIST', 'DISPENSARY_STAFF'],
  },
  medicines: {
    read: ['ADMIN', 'DOCTOR', 'PHARMACIST', 'INVENTORY_MANAGER', 'DISPENSARY_STAFF'],
    write: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'],
  },
  users: {
    read: ['ADMIN', 'SECURITY_OFFICER'],
    write: ['ADMIN'],
  },
  dashboard: {
    read: ['ADMIN'],
  },
  doctors: {
    read: ['ADMIN', 'SECURITY_OFFICER', 'DOCTOR'],
    write: ['ADMIN'],
  },
  consultations: {
    read: ['ADMIN', 'DOCTOR'],
    write: ['ADMIN', 'DOCTOR'],
  },
  treatments: {
    read: ['ADMIN', 'DOCTOR'],
    write: ['ADMIN', 'DOCTOR'],
  },
  suppliers: {
    read: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST'],
    write: ['ADMIN', 'INVENTORY_MANAGER'],
  },
  purchases: {
    read: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST'],
    write: ['ADMIN', 'INVENTORY_MANAGER'],
  },
  inventory: {
    read: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST', 'DISPENSARY_STAFF'],
    write: ['ADMIN', 'INVENTORY_MANAGER'],
  },
  dispensing: {
    read: ['ADMIN', 'PHARMACIST'],
    write: ['ADMIN', 'PHARMACIST'],
  },
  shelves: {
    read: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST', 'SECURITY_OFFICER'],
    write: ['ADMIN', 'INVENTORY_MANAGER'],
  },
  scans: {
    read: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST', 'SECURITY_OFFICER'],
    write: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST'],
  },
  alerts: {
    read: ['ADMIN', 'SECURITY_OFFICER', 'INVENTORY_MANAGER'],
    write: ['ADMIN', 'SECURITY_OFFICER'],
  },
  reports: {
    read: ['ADMIN', 'DOCTOR', 'PHARMACIST', 'INVENTORY_MANAGER', 'SECURITY_OFFICER'],
  },
  audit: {
    read: ['ADMIN', 'SECURITY_OFFICER'],
  },
};

export function can(role, area, action) {
  return Boolean(ACCESS[area]?.[action]?.includes(role));
}

export function roleLabel(role) {
  return String(role || '').toLowerCase().replaceAll('_', ' ');
}

export function homePath(role) {
  if (can(role, 'dashboard', 'read')) return '/dashboard';
  if (can(role, 'patients', 'read')) return '/patients';
  if (can(role, 'medicines', 'read')) return '/medicines';
  return '/profile';
}

export function sectionAllowed(role, pathname) {
  if (pathname.startsWith('/dashboard')) return can(role, 'dashboard', 'read');
  if (pathname.startsWith('/doctors')) return can(role, 'doctors', 'read');
  if (pathname.startsWith('/patients')) return can(role, 'patients', 'read');
  if (pathname.startsWith('/consultations')) return can(role, 'consultations', 'read');
  if (pathname.startsWith('/treatment-plans')) return can(role, 'treatments', 'read');
  if (pathname.startsWith('/medicines')) return can(role, 'medicines', 'read');
  if (pathname.startsWith('/suppliers')) return can(role, 'suppliers', 'read');
  if (pathname.startsWith('/purchases')) return can(role, 'purchases', 'read');
  if (pathname.startsWith('/inventory')) return can(role, 'inventory', 'read');
  if (pathname.startsWith('/dispensing')) return can(role, 'dispensing', 'read');
  if (pathname.startsWith('/shelves')) return can(role, 'shelves', 'read');
  if (pathname.startsWith('/scans')) return can(role, 'scans', 'read');
  if (pathname.startsWith('/alerts')) return can(role, 'alerts', 'read');
  if (pathname.startsWith('/reports')) return can(role, 'reports', 'read');
  if (pathname.startsWith('/audit')) return can(role, 'audit', 'read');
  if (pathname.startsWith('/users')) return can(role, 'users', 'read');
  if (pathname.startsWith('/profile')) return true;
  return false;
}
