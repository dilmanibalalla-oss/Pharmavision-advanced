const TOKEN_KEY = 'helio.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
    });
  } catch {
    throw new Error('Cannot reach the clinic server. Leave this page open and check that the API is running.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'The clinic server rejected that request');
  }
  return data;
}

export const api = {
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/api/auth/me'),
  stats: () => request('/api/stats'),
  patients: (q = '') => request(`/api/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
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
