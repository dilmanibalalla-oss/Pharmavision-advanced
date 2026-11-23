import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can, homePath, roleLabel, sectionAllowed } from './access';
import { api } from './api';
import { LoginScreen } from './components/LoginScreen';
import { MedicineCatalog } from './components/MedicineCatalog';
import { ProfileScreen } from './components/ProfileScreen';
import { UserAdmin } from './components/UserAdmin';
import { AdminDashboard } from './components/AdminDashboard';
import { DoctorDesk } from './components/DoctorDesk';
import { PatientDesk } from './components/PatientDesk';
import { ConsultationDesk } from './components/ConsultationDesk';
import { TreatmentDesk } from './components/TreatmentDesk';
import { SupplierDesk } from './components/SupplierDesk';
import { PurchaseDesk } from './components/PurchaseDesk';
import { InventoryDesk } from './components/InventoryDesk';
import { DispenseDesk } from './components/DispenseDesk';

function sectionFromPath(pathname) {
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/doctors')) return 'doctors';
  if (pathname.startsWith('/medicines')) return 'medicines';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/users')) return 'users';
  if (pathname.startsWith('/consultations')) return 'consultations';
  if (pathname.startsWith('/treatment-plans')) return 'treatment-plans';
  if (pathname.startsWith('/suppliers')) return 'suppliers';
  if (pathname.startsWith('/purchases')) return 'purchases';
  if (pathname.startsWith('/inventory')) return 'inventory';
  if (pathname.startsWith('/dispensing')) return 'dispensing';
  return 'patients';
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const section = sectionFromPath(location.pathname);
  const [medicines, setMedicines] = useState([]);
  const [stats, setStats] = useState({ patients: 0, visits: 0, medicines: 0 });
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [session, setSession] = useState('checking');
  const [user, setUser] = useState(null);

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

  async function signOut() {
    try {
      await api.logout();
    } catch {
      // The screen still returns to login if the server is unreachable.
    }
    setUser(null);
    setSession('out');
    navigate('/login', { replace: true });
  }

  function switchSection(next) {
    const paths = {
      dashboard: '/dashboard',
      doctors: '/doctors',
      patients: '/patients',
      consultations: '/consultations',
      'treatment-plans': '/treatment-plans',
      suppliers: '/suppliers',
      purchases: '/purchases',
      inventory: '/inventory',
      dispensing: '/dispensing',
      medicines: '/medicines',
      users: '/users',
      profile: '/profile',
    };
    navigate(paths[next] || '/profile');
  }

  async function refreshCatalog() {
    await loadMedicines();
    await loadStats();
  }

  const readPatients = can(user?.role, 'patients', 'read');
  const readConsultations = can(user?.role, 'consultations', 'read');
  const readTreatments = can(user?.role, 'treatments', 'read');
  const readSuppliers = can(user?.role, 'suppliers', 'read');
  const readPurchases = can(user?.role, 'purchases', 'read');
  const readInventory = can(user?.role, 'inventory', 'read');
  const readDispensing = can(user?.role, 'dispensing', 'read');
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
            {readConsultations ? (
              <button type="button" className={section === 'consultations' ? 'is-on' : undefined} onClick={() => switchSection('consultations')}>
                Consultations
              </button>
            ) : null}
            {readTreatments ? (
              <button type="button" className={section === 'treatment-plans' ? 'is-on' : undefined} onClick={() => switchSection('treatment-plans')}>
                Treatment plans
              </button>
            ) : null}
            {readDispensing ? (
              <button type="button" className={section === 'dispensing' ? 'is-on' : undefined} onClick={() => switchSection('dispensing')}>
                Dispensing
              </button>
            ) : null}
            {readInventory ? (
              <button type="button" className={section === 'inventory' ? 'is-on' : undefined} onClick={() => switchSection('inventory')}>
                Inventory
              </button>
            ) : null}
            {readPurchases ? (
              <button type="button" className={section === 'purchases' ? 'is-on' : undefined} onClick={() => switchSection('purchases')}>
                Purchases
              </button>
            ) : null}
            {readSuppliers ? (
              <button type="button" className={section === 'suppliers' ? 'is-on' : undefined} onClick={() => switchSection('suppliers')}>
                Suppliers
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
            <p className="rail-note">Recording a visit adds one to the patient’s visit count.</p>
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
          ) : section === 'consultations' ? (
            <ConsultationDesk actor={user} onToast={notify} />
          ) : section === 'treatment-plans' ? (
            <TreatmentDesk actor={user} onToast={notify} />
          ) : section === 'suppliers' ? (
            <SupplierDesk actor={user} onToast={notify} />
          ) : section === 'purchases' ? (
            <PurchaseDesk actor={user} onToast={notify} />
          ) : section === 'inventory' ? (
            <InventoryDesk actor={user} onToast={notify} />
          ) : section === 'dispensing' ? (
            <DispenseDesk onToast={notify} />
          ) : section === 'patients' ? (
            <PatientDesk actor={user} onToast={notify} onStats={loadStats} />
          ) : section === 'medicines' ? (
            <MedicineCatalog onRefresh={refreshCatalog} onToast={notify} canWrite={writeMedicines} />
          ) : section === 'users' ? (
            <UserAdmin actor={user} onToast={notify} />
          ) : (
            <ProfileScreen user={user} onUser={setUser} onToast={notify} />
          )}
        </main>
      </div>

      {toast ? (
        <div className={`toast toast-${toast.tone}`} role="status">{toast.text}</div>
      ) : null}
    </>
  );
}
