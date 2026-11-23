import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can, homePath, roleLabel, sectionAllowed } from './access';
import { api } from './api';
import { treatmentLines } from './format';
import { LoginScreen } from './components/LoginScreen';
import { MedicineCatalog } from './components/MedicineCatalog';
import { PatientChart } from './components/PatientChart';
import { PatientForm } from './components/PatientForm';
import { PatientTable } from './components/PatientTable';
import { ProfileScreen } from './components/ProfileScreen';
import { UserAdmin } from './components/UserAdmin';
import { AdminDashboard } from './components/AdminDashboard';
import { DoctorDesk } from './components/DoctorDesk';

function sortValue(patient, key) {
  if (key === 'allergies') return patient.allergies.join(', ');
  if (key === 'treatments') return treatmentLines(patient).join(', ');
  return patient[key] ?? '';
}

function sectionFromPath(pathname) {
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/doctors')) return 'doctors';
  if (pathname.startsWith('/medicines')) return 'medicines';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/users')) return 'users';
  return 'patients';
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const section = sectionFromPath(location.pathname);
  const [patients, setPatients] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [stats, setStats] = useState({ patients: 0, visits: 0, medicines: 0 });
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [session, setSession] = useState('checking');
  const [user, setUser] = useState(null);
  const layer = useRef({ form: null, pending: null });
  const queryRef = useRef('');
  const opening = useRef(false);

  layer.current = { form, pending: pendingDelete };
  queryRef.current = debouncedQuery;

  const notify = useCallback((text, tone = 'ok') => {
    setToast({ text, tone, id: Date.now() });
  }, []);

  const loadStats = useCallback(async () => {
    setStats(await api.stats());
  }, []);

  const loadMedicines = useCallback(async () => {
    const rows = await api.medicines();
    setMedicines(rows);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const data = await api.me();
        if (ignore) return;
        setUser(data.user);
        setSession('in');
      } catch {
        try {
          const data = await api.refresh();
          if (ignore) return;
          setUser(data.user);
          setSession('in');
        } catch {
          if (ignore) return;
          setUser(null);
          setSession('out');
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (session === 'checking') return undefined;
    if (session === 'out') {
      if (location.pathname !== '/login') navigate('/login', { replace: true });
      return undefined;
    }
    if (!user || sectionAllowed(user.role, location.pathname)) return undefined;
    navigate(homePath(user.role), { replace: true });
    return undefined;
  }, [session, user, location.pathname, navigate]);

  useEffect(() => {
    if (session !== 'in' || !can(user?.role, 'patients', 'read')) return undefined;
    let ignore = false;
    setLoading(true);
    api.patients(debouncedQuery)
      .then((rows) => {
        if (ignore) return;
        setPatients(rows);
        setError('');
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [debouncedQuery, session, user]);

  useEffect(() => {
    if (session !== 'in') return undefined;
    let ignore = false;
    api.stats()
      .then((nextStats) => {
        if (!ignore) setStats(nextStats);
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [session]);

  useEffect(() => {
    if (session !== 'in' || !can(user?.role, 'medicines', 'read')) return undefined;
    let ignore = false;
    api.medicines()
      .then((rows) => {
        if (!ignore) setMedicines(rows);
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [session, user]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onKey(event) {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (event.key === '/' && !typing && section === 'patients') {
        event.preventDefault();
        document.getElementById('patient-search')?.focus();
      }
      if (event.key === 'Escape') {
        if (layer.current.pending) setPendingDelete(null);
        else if (layer.current.form) setForm(null);
        else setSelected(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [section]);

  const sortedPatients = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...patients].sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
      return String(left).localeCompare(String(right), undefined, { sensitivity: 'base', numeric: true }) * dir;
    });
  }, [patients, sort]);

  function syncPatient(updated) {
    setSelected((current) => (current && current._id === updated._id ? updated : current));
    setPatients((rows) => rows.map((row) => (row._id === updated._id ? updated : row)));
  }

  function changeSort(key) {
    setSort((current) => {
      if (current.key === key) {
        return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  }

  async function signOut() {
    try {
      await api.logout();
    } catch {
      // The screen still returns to login if the server is unreachable.
    }
    setUser(null);
    setSession('out');
    setSelected(null);
    setForm(null);
    setPendingDelete(null);
    navigate('/login', { replace: true });
  }

  function switchSection(next) {
    const paths = {
      dashboard: '/dashboard',
      doctors: '/doctors',
      patients: '/patients',
      medicines: '/medicines',
      users: '/users',
      profile: '/profile',
    };
    navigate(paths[next] || '/profile');
    setSelected(null);
    setForm(null);
  }

  async function openPatient(patient) {
    if (opening.current) return;
    opening.current = true;
    setBusyId(patient._id);
    try {
      const writePatients = can(user?.role, 'patients', 'write');
      const catalogPromise = can(user?.role, 'medicines', 'read')
        ? api.medicines().catch(() => null)
        : Promise.resolve(null);
      const [updated, catalog] = await Promise.all([
        writePatients ? api.recordVisit(patient._id) : api.patient(patient._id),
        catalogPromise,
      ]);
      if (catalog) setMedicines(catalog);
      syncPatient(updated);
      setSelected(updated);
      if (writePatients) {
        await loadStats();
        notify(`Visit recorded for ${updated.name}. Visits are now ${updated.visitCount}.`);
      }
    } catch (err) {
      notify(err.message, 'danger');
    } finally {
      opening.current = false;
      setBusyId('');
    }
  }

  async function savePatient(body) {
    if (form?.mode === 'edit') {
      const updated = await api.updatePatient(form.patient._id, body);
      syncPatient(updated);
      setPatients(await api.patients(queryRef.current));
      notify('Chart details saved.');
    } else {
      await api.createPatient(body);
      setQuery('');
      setDebouncedQuery('');
      setPatients(await api.patients(''));
      notify('Patient chart created. Select the row when they arrive to record a visit.');
    }
    await loadStats();
    setForm(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await api.deletePatient(pendingDelete._id);
      setPatients((rows) => rows.filter((row) => row._id !== pendingDelete._id));
      setSelected((current) => (current?._id === pendingDelete._id ? null : current));
      setPendingDelete(null);
      await loadStats();
      notify('Chart removed.');
    } catch (err) {
      notify(err.message, 'danger');
    }
  }

  async function refreshCatalog() {
    await loadMedicines();
    await loadStats();
  }

  const readPatients = can(user?.role, 'patients', 'read');
  const writePatients = can(user?.role, 'patients', 'write');
  const readMedicines = can(user?.role, 'medicines', 'read');
  const writeMedicines = can(user?.role, 'medicines', 'write');
  const readUsers = can(user?.role, 'users', 'read');
  const readDashboard = can(user?.role, 'dashboard', 'read');
  const readDoctors = can(user?.role, 'doctors', 'read');
  const onAllowedPage = Boolean(user && sectionAllowed(user.role, location.pathname));

  if (session !== 'in') {
    return (
      <div className="shell login-shell">
        {session === 'checking' ? (
          <p className="empty">Opening the daybook…</p>
        ) : (
          <LoginScreen
            onSuccess={(nextUser) => {
              setUser(nextUser);
              setSession('in');
            }}
          />
        )}
      </div>
    );
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <div className="shell">
        <aside className="rail">
          <div className="brand">
            <span className="mark" aria-hidden="true" />
            <div>
              <p className="brand-name">Helio Practice</p>
              <p className="brand-sub">Patient desk</p>
            </div>
          </div>
          <p className="today">{today}</p>
          <nav className="nav" aria-label="Practice">
            {readDashboard ? (
              <button type="button" className={section === 'dashboard' ? 'is-on' : undefined} onClick={() => switchSection('dashboard')}>
                Dashboard
              </button>
            ) : null}
            {readDoctors ? (
              <button type="button" className={section === 'doctors' ? 'is-on' : undefined} onClick={() => switchSection('doctors')}>
                Doctors
              </button>
            ) : null}
            {readPatients ? (
              <button type="button" className={section === 'patients' ? 'is-on' : undefined} onClick={() => switchSection('patients')}>
                Patients
              </button>
            ) : null}
            {readMedicines ? (
              <button type="button" className={section === 'medicines' ? 'is-on' : undefined} onClick={() => switchSection('medicines')}>
                Medicines
              </button>
            ) : null}
            {readUsers ? (
              <button type="button" className={section === 'users' ? 'is-on' : undefined} onClick={() => switchSection('users')}>
                Accounts
              </button>
            ) : null}
            <button type="button" className={section === 'profile' ? 'is-on' : undefined} onClick={() => switchSection('profile')}>
              Profile
            </button>
          </nav>
          <dl className="rail-stats">
            <div>
              <dt>Patients</dt>
              <dd>{stats.patients}</dd>
            </div>
            <div>
              <dt>Visits</dt>
              <dd>{stats.visits}</dd>
            </div>
            <div>
              <dt>Medicines</dt>
              <dd>{stats.medicines}</dd>
            </div>
          </dl>
          {writePatients ? (
            <p className="rail-note">Selecting a patient records a visit and adds one to their visit count.</p>
          ) : null}
          {user ? (
            <div className="who">
              <p className="who-name">{user.name}</p>
              <p className="who-role">{roleLabel(user.role)}</p>
            </div>
          ) : null}
          <button type="button" className="rail-signout" onClick={signOut}>Sign out</button>
        </aside>

        <main className="stage">
          {error ? (
            <p className="banner" role="alert">{error}</p>
          ) : null}

          {!onAllowedPage ? (
            <p className="empty">Opening the daybook…</p>
          ) : section === 'dashboard' ? (
            <AdminDashboard />
          ) : section === 'doctors' ? (
            <DoctorDesk actor={user} onToast={notify} />
          ) : section === 'patients' ? (
            <section>
              <header className="stage-head">
                <div>
                  <p className="kicker">Registry</p>
                  <h1>Patients</h1>
                </div>
                {writePatients ? (
                  <button type="button" className="solid" onClick={() => setForm({ mode: 'create' })}>
                    Add patient
                  </button>
                ) : null}
              </header>
              <div className="toolbar">
                <label className="search">
                  <span className="sr">Search patients</span>
                  <input
                    id="patient-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name, age, address, allergy, or treatment"
                  />
                </label>
                <p className="count">{sortedPatients.length} shown</p>
              </div>
              <PatientTable
                patients={sortedPatients}
                loading={loading}
                query={debouncedQuery}
                sort={sort}
                onSort={changeSort}
                onOpen={openPatient}
                onEdit={(patient) => setForm({ mode: 'edit', patient })}
                onDelete={setPendingDelete}
                busyId={busyId}
                selectedId={selected?._id}
                canWrite={writePatients}
              />
            </section>
          ) : section === 'medicines' ? (
            <MedicineCatalog medicines={medicines} onRefresh={refreshCatalog} onToast={notify} canWrite={writeMedicines} />
          ) : section === 'users' ? (
            <UserAdmin actor={user} onToast={notify} />
          ) : (
            <ProfileScreen user={user} onUser={setUser} onToast={notify} />
          )}
        </main>
      </div>

      {selected ? (
        <PatientChart
          patient={selected}
          medicines={medicines}
          onClose={() => setSelected(null)}
          onEdit={(patient) => setForm({ mode: 'edit', patient })}
          onUpdated={(updated) => {
            syncPatient(updated);
            loadStats().catch(() => {});
          }}
          onToast={notify}
          canWrite={writePatients}
        />
      ) : null}

      {form ? (
        <PatientForm
          initial={form.mode === 'edit' ? form.patient : null}
          onClose={() => setForm(null)}
          onSave={savePatient}
        />
      ) : null}

      {pendingDelete ? (
        <div className="scrim" role="presentation" onMouseDown={() => setPendingDelete(null)}>
          <div
            className="dialog dialog-narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-patient-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="delete-patient-title">Remove {pendingDelete.name}&apos;s chart?</h2>
            <p>The address, allergies, visit count, and past treatments will be deleted.</p>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setPendingDelete(null)}>Keep chart</button>
              <button type="button" className="danger" onClick={confirmDelete}>Delete chart</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`toast toast-${toast.tone}`} role="status">{toast.text}</div>
      ) : null}
    </>
  );
}
