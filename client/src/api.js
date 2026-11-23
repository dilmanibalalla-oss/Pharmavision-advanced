localStorage.removeItem('helio.token');

async function request(path, options = {}, allowRefresh = true) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new Error('Cannot reach the clinic server. Leave this page open and check that the API is running.');
  }

  if (response.status === 401 && allowRefresh && !path.startsWith('/api/auth/')) {
    const refreshed = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refreshed.ok) return request(path, options, false);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'The clinic server rejected that request');
  }
  return data;
}

export const api = {
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }, false),
  refresh: () => request('/api/auth/refresh', { method: 'POST' }, false),
  logout: () => request('/api/auth/logout', { method: 'POST' }, false),
  me: () => request('/api/auth/me', {}, false),
  updateProfile: (body) => request('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (body) => request('/api/auth/password', { method: 'POST', body: JSON.stringify(body) }),
  users: () => request('/api/users'),
  doctors: (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    });
    const query = search.toString();
    return request(`/api/doctors${query ? `?${query}` : ''}`);
  },
  doctorSpecializations: () => request('/api/doctors/specializations'),
  renameSpecialization: (body) => request('/api/doctors/specializations', { method: 'PATCH', body: JSON.stringify(body) }),
  doctor: (id) => request(`/api/doctors/${id}`),
  createDoctor: (body) => request('/api/doctors', { method: 'POST', body: JSON.stringify(body) }),
  updateDoctor: (id, body) => request(`/api/doctors/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  updateDoctorSchedule: (id, schedule) => request(`/api/doctors/${id}/schedule`, { method: 'PUT', body: JSON.stringify({ schedule }) }),
  setDoctorActive: (id, active) => request(`/api/doctors/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  setUserActive: (id, active) => request(`/api/users/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  stats: () => request('/api/stats'),
  dashboard: () => request('/api/dashboard'),
  patients: (params = {}) => {
    const search = new URLSearchParams();
    const source = typeof params === 'string' ? { q: params } : params;
    Object.entries(source).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    });
    const query = search.toString();
    return request(`/api/patients${query ? `?${query}` : ''}`);
  },
  patient: (id) => request(`/api/patients/${id}`),
  setPatientActive: (id, active) => request(`/api/patients/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  createPatient: (body) => request('/api/patients', { method: 'POST', body: JSON.stringify(body) }),
  updatePatient: (id, body) => request(`/api/patients/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePatient: (id) => request(`/api/patients/${id}`, { method: 'DELETE' }),
  recordVisit: (id) => request(`/api/patients/${id}/visit`, { method: 'POST' }),
  undoVisit: (id) => request(`/api/patients/${id}/visit/undo`, { method: 'POST' }),
  addTreatment: (id, body) => request(`/api/patients/${id}/treatments`, { method: 'POST', body: JSON.stringify(body) }),
  removeTreatment: (id, treatmentId) => request(`/api/patients/${id}/treatments/${treatmentId}`, { method: 'DELETE' }),
  medicines: (q = '') => request(`/api/medicines${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createMedicine: (body) => request('/api/medicines', { method: 'POST', body: JSON.stringify(body) }),
  updateMedicine: (id, body) => request(`/api/medicines/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteMedicine: (id) => request(`/api/medicines/${id}`, { method: 'DELETE' }),
};
