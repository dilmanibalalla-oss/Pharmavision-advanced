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
  if (pathname.startsWith('/medicines')) return can(role, 'medicines', 'read');
  if (pathname.startsWith('/users')) return can(role, 'users', 'read');
  if (pathname.startsWith('/profile')) return true;
  return false;
}
