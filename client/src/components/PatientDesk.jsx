import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can } from '../access';
import { api } from '../api';
import { formatDate, formatWhen, treatmentLabel } from '../format';
import { PatientChart } from './PatientChart';

const GENDERS = ['Female', 'Male', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function dateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function consultationRows(patient) {
  if (Array.isArray(patient?.visits)) {
    return patient.visits.map((visit) => ({
      _id: visit._id,
      visitedAt: visit.visitedAt,
      treatmentCount: (visit.treatments || []).length,
    }));
  }
  return patient?.consultations || [];
}

function medicineRows(patient) {
  if (Array.isArray(patient?.visits)) {
    const rows = [];
    for (const visit of patient.visits) {
      for (const treatment of visit.treatments || []) {
        rows.push({ ...treatment, visitedAt: visit.visitedAt });
      }
    }
    return rows;
  }
  return patient?.treatments || patient?.prescriptions || [];
}

export function PatientDesk({ actor, onToast, onStats }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const canWrite = can(actor.role, 'patients', 'write');
  const clinical = can(actor.role, 'patients', 'clinical');
  const parts = pathname.split('/').filter(Boolean);
  const id = parts[1] || '';
  const action = parts[2] || '';
  const [chart, setChart] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!canWrite && (id === 'new' || action === 'edit')) navigate('/patients', { replace: true });
  }, [canWrite, id, action, navigate]);

  useEffect(() => {
    if (!chart || !can(actor.role, 'medicines', 'read')) return undefined;
    let ignore = false;
    api.medicines()
      .then((rows) => {
        if (!ignore) setMedicines(rows);
      })
      .catch(() => {
        if (!ignore) setMedicines([]);
      });
    return () => {
      ignore = true;
    };
  }, [chart, actor.role]);

  let page = <PatientList clinical={clinical} canWrite={canWrite} />;
  if (parts.length > 3) page = <p className="empty">That patient page is not available.</p>;
  else if (id === 'new') page = <PatientForm onToast={onToast} onStats={onStats} />;
  else if (id && action === 'edit') page = <PatientForm patientId={id} onToast={onToast} />;
  else if (id && action) page = <p className="empty">That patient page is not available.</p>;
  else if (id) {
    page = (
      <PatientProfile
        patientId={id}
        clinical={clinical}
        canWrite={canWrite}
        onToast={onToast}
        onStats={onStats}
        onChart={setChart}
        revision={revision}
      />
    );
  }

  return (
    <>
      {page}
      {chart ? (
        <PatientChart
          patient={chart}
          medicines={medicines}
          canWrite={canWrite}
          onToast={onToast}
          onClose={() => {
            setChart(null);
            setRevision((current) => current + 1);
          }}
          onEdit={() => {
            setChart(null);
            navigate(`/patients/${chart._id}/edit`);
          }}
          onUpdated={(updated) => {
            setChart(updated);
            setRevision((current) => current + 1);
            onStats?.().catch(() => {});
          }}
        />
      ) : null}
    </>
  );
}

function PatientList({ clinical, canWrite }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [gender, setGender] = useState('');
  const [active, setActive] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const filterKey = `${debounced}|${gender}|${active}|${bloodGroup}`;
  const [appliedFilter, setAppliedFilter] = useState(filterKey);
  if (appliedFilter !== filterKey) {
    setAppliedFilter(filterKey);
    if (page !== 1) setPage(1);
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onKey(event) {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (event.key === '/' && !typing) {
        event.preventDefault();
        document.getElementById('patient-search')?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api.patients({ q: debounced, gender, active, bloodGroup: clinical ? bloodGroup : '', page, limit: 10 })
      .then((list) => {
        if (ignore) return;
        setData(list);
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
  }, [debounced, gender, active, bloodGroup, clinical, page, retry]);

  const patients = data?.patients || [];
  const filtered = Boolean(debounced || gender || active || bloodGroup);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Registry</p>
          <h1>Patients</h1>
        </div>
        {canWrite ? (
          <button type="button" className="solid" onClick={() => navigate('/patients/new')}>Register patient</button>
        ) : null}
      </header>
      <div className="filters">
        <label className="search">
          <span className="sr">Search patients</span>
          <input
            id="patient-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, patient ID, or phone"
          />
        </label>
        <label>
          Gender
          <select value={gender} onChange={(event) => setGender(event.target.value)}>
            <option value="">All genders</option>
            {GENDERS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        {clinical ? (
          <label>
            Blood group
            <select value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)}>
              <option value="">All groups</option>
              {BLOOD_GROUPS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="banner" role="alert">
          {error}{' '}
          <button type="button" className="text-btn" onClick={() => setRetry((current) => current + 1)}>Try again</button>
        </p>
      ) : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && !error && patients.length === 0 ? (
        <p className="empty">{filtered ? 'No patients match that search.' : 'No patients are registered yet.'}</p>
      ) : null}
      {!loading && !error && patients.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Gender</th>
                  <th>Registered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient._id} className="is-clickable" onClick={() => navigate(`/patients/${patient._id}`)}>
                    <td>{patient.patientCode || '—'}</td>
                    <td className="name-cell">{patient.name}</td>
                    <td>{patient.phone || '—'}</td>
                    <td>{patient.gender || '—'}</td>
                    <td>{formatDate(patient.registeredAt) || '—'}</td>
                    <td>{patient.active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <p className="count">{data.total} patients</p>
            <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <p className="count">Page {data.page} of {Math.max(data.pages, 1)}</p>
            <button type="button" className="ghost" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function blankPatient() {
  return {
    name: '',
    dateOfBirth: '',
    age: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    emergencyName: '',
    emergencyPhone: '',
    emergencyRelationship: '',
    bloodGroup: '',
    allergies: [],
    conditions: [],
  };
}

function PatientForm({ patientId, onToast, onStats }) {
  const navigate = useNavigate();
  const editing = Boolean(patientId);
  const [form, setForm] = useState(editing ? null : blankPatient());
  const [allergyDraft, setAllergyDraft] = useState('');
  const [conditionDraft, setConditionDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!patientId) return undefined;
    let ignore = false;
    api.patient(patientId)
      .then((patient) => {
        if (ignore) return;
        setForm({
          name: patient.name || '',
          dateOfBirth: dateInput(patient.dateOfBirth),
          age: patient.age ?? '',
          gender: patient.gender || '',
          phone: patient.phone || '',
          email: patient.email || '',
          address: patient.address || '',
          emergencyName: patient.emergencyContact?.name || '',
          emergencyPhone: patient.emergencyContact?.phone || '',
          emergencyRelationship: patient.emergencyContact?.relationship || '',
          bloodGroup: patient.bloodGroup || '',
          allergies: patient.allergies || [],
          conditions: patient.conditions || [],
        });
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
  }, [patientId]);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function addItem(field, draft, setDraft) {
    const next = draft.trim().replace(/\s+/g, ' ');
    if (!next || !form) return;
    setForm((current) => {
      if (current[field].some((item) => item.toLowerCase() === next.toLowerCase())) return current;
      return { ...current, [field]: [...current[field], next].slice(0, 30) };
    });
    setDraft('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!form) return;
    const allergies = pendingList(form.allergies, allergyDraft);
    const conditions = pendingList(form.conditions, conditionDraft);
    const body = {
      name: form.name.trim(),
      gender: form.gender,
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      emergencyContact: {
        name: form.emergencyName.trim(),
        phone: form.emergencyPhone.trim(),
        relationship: form.emergencyRelationship.trim(),
      },
      bloodGroup: form.bloodGroup,
      allergies,
      conditions,
    };
    if (form.dateOfBirth) body.dateOfBirth = form.dateOfBirth;
    else body.age = form.age === '' ? '' : Number(form.age);
    setSaving(true);
    setError('');
    try {
      const patient = editing ? await api.updatePatient(patientId, body) : await api.createPatient(body);
      if (!editing) await onStats?.();
      onToast(editing ? 'Patient details saved.' : `${patient.name} is registered as ${patient.patientCode}.`);
      navigate(`/patients/${patient._id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{editing ? 'Update' : 'Register'}</p>
          <h1>{editing ? 'Edit patient' : 'Register a patient'}</h1>
        </div>
        <button type="button" className="ghost" onClick={() => navigate(editing ? `/patients/${patientId}` : '/patients')}>Back</button>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading || !form ? <p className="empty">Opening the daybook…</p> : (
        <form className="record-form" onSubmit={submit}>
          <label>
            Full name
            <input value={form.name} onChange={update('name')} required maxLength={120} autoFocus />
          </label>
          <label>
            Date of birth
            <input type="date" value={form.dateOfBirth} onChange={update('dateOfBirth')} required={!editing || Boolean(form.dateOfBirth)} />
          </label>
          {!form.dateOfBirth && editing ? (
            <label>
              Age
              <input type="number" min="0" max="120" step="1" value={form.age} onChange={update('age')} required />
            </label>
          ) : null}
          <label>
            Gender
            <select value={form.gender} onChange={update('gender')} required={!editing}>
              <option value="">Select</option>
              {GENDERS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={update('phone')} required={!editing} maxLength={30} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={update('email')} maxLength={160} />
          </label>
          <label>
            Blood group
            <select value={form.bloodGroup} onChange={update('bloodGroup')}>
              <option value="">Not recorded</option>
              {BLOOD_GROUPS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="wide">
            Address
            <textarea value={form.address} onChange={update('address')} required maxLength={300} rows={3} />
          </label>
          <label>
            Emergency contact
            <input value={form.emergencyName} onChange={update('emergencyName')} maxLength={120} />
          </label>
          <label>
            Emergency phone
            <input value={form.emergencyPhone} onChange={update('emergencyPhone')} maxLength={30} />
          </label>
          <label>
            Relationship
            <input value={form.emergencyRelationship} onChange={update('emergencyRelationship')} maxLength={80} />
          </label>
          <ItemList
            label="Known allergies"
            items={form.allergies}
            draft={allergyDraft}
            onDraft={setAllergyDraft}
            onAdd={() => addItem('allergies', allergyDraft, setAllergyDraft)}
            onRemove={(item) => setForm((current) => ({ ...current, allergies: current.allergies.filter((entry) => entry !== item) }))}
          />
          <ItemList
            label="Existing medical conditions"
            items={form.conditions}
            draft={conditionDraft}
            onDraft={setConditionDraft}
            onAdd={() => addItem('conditions', conditionDraft, setConditionDraft)}
            onRemove={(item) => setForm((current) => ({ ...current, conditions: current.conditions.filter((entry) => entry !== item) }))}
          />
          <div className="dialog-actions wide">
            <button type="submit" className="solid" disabled={saving}>{editing ? 'Save details' : 'Register patient'}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function ItemList({ label, items, draft, onDraft, onAdd, onRemove }) {
  return (
    <div className="wide">
      <span className="field-label">{label}</span>
      <div className="chips">
        {items.map((item) => (
          <button key={item} type="button" className="chip" onClick={() => onRemove(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="inline-field">
        <input
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onAdd();
            }
          }}
          maxLength={80}
          aria-label={label}
        />
        <button type="button" className="ghost" onClick={onAdd}>Add</button>
      </div>
    </div>
  );
}

function pendingList(items, draft) {
  const next = draft.trim().replace(/\s+/g, ' ');
  if (!next || items.some((item) => item.toLowerCase() === next.toLowerCase())) return items;
  return [...items, next].slice(0, 30);
}

function PatientProfile({ patientId, clinical, canWrite, onToast, onStats, onChart, revision }) {
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setPatient(null);
    api.patient(patientId)
      .then((next) => {
        if (ignore) return;
        setPatient(next);
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
  }, [patientId]);

  useEffect(() => {
    if (!revision) return undefined;
    let ignore = false;
    api.patient(patientId)
      .then((next) => {
        if (!ignore) setPatient(next);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [patientId, revision]);

  async function toggle() {
    setBusy(true);
    try {
      const next = await api.setPatientActive(patient._id, !patient.active);
      setPatient(next);
      onToast(next.active ? `${next.name} is active.` : `${next.name} is inactive.`);
    } catch (err) {
      onToast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function recordConsultation() {
    setBusy(true);
    try {
      const next = await api.recordVisit(patient._id);
      setPatient(next);
      onChart(next);
      await onStats?.();
      onToast(`Consultation recorded for ${next.name}.`);
    } catch (err) {
      onToast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  const consultations = consultationRows(patient).slice().reverse();
  const lines = medicineRows(patient).slice().reverse();

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{patient?.patientCode || 'Profile'}</p>
          <h1>{patient?.name || 'Patient'}</h1>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => navigate('/patients')}>All patients</button>
          {canWrite && patient ? <button type="button" className="ghost" onClick={() => navigate(`/patients/${patientId}/edit`)}>Edit</button> : null}
          {canWrite && patient ? (
            <button type="button" className="ghost" disabled={busy || !patient.active} onClick={recordConsultation}>Record consultation</button>
          ) : null}
          {canWrite && patient ? (
            <button type="button" className="solid" disabled={busy} onClick={toggle}>{patient.active ? 'Deactivate' : 'Activate'}</button>
          ) : null}
        </div>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && !error && patient ? (
        <>
          <dl className="fact-grid">
            <div><dt>Status</dt><dd>{patient.active ? 'Active' : 'Inactive'}</dd></div>
            <div><dt>Date of birth</dt><dd>{formatDate(patient.dateOfBirth) || '—'}</dd></div>
            <div><dt>Age</dt><dd>{patient.age}</dd></div>
            <div><dt>Gender</dt><dd>{patient.gender || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{patient.phone || '—'}</dd></div>
            <div><dt>Email</dt><dd>{patient.email || '—'}</dd></div>
            <div><dt>Registered</dt><dd>{formatDate(patient.registeredAt) || '—'}</dd></div>
            <div><dt>Consultations</dt><dd>{patient.visitCount || 0}</dd></div>
            <div className="wide"><dt>Address</dt><dd>{patient.address || '—'}</dd></div>
            <div className="wide">
              <dt>Emergency contact</dt>
              <dd>
                {patient.emergencyContact?.name
                  ? `${patient.emergencyContact.name}${patient.emergencyContact.relationship ? ` (${patient.emergencyContact.relationship})` : ''} · ${patient.emergencyContact.phone}`
                  : '—'}
              </dd>
            </div>
          </dl>
          {clinical ? (
            <>
              <h2 className="section-label">Blood group</h2>
              <p>{patient.bloodGroup || 'Not recorded'}</p>
              <h2 className="section-label">Known allergies</h2>
              <ChipList items={patient.allergies} empty="No allergies are recorded." />
              <h2 className="section-label">Existing medical conditions</h2>
              <ChipList items={patient.conditions} empty="No medical conditions are recorded." />
              <h2 className="section-label">Consultation history</h2>
              <HistoryList
                rows={consultations}
                empty="No consultations are recorded."
                render={(visit) => `${formatWhen(visit.visitedAt)} · ${visit.treatmentCount} medicine${visit.treatmentCount === 1 ? '' : 's'}`}
              />
              <h2 className="section-label">Treatment history</h2>
              <HistoryList
                rows={lines}
                empty="No treatments are recorded."
                render={(item) => `${formatWhen(item.recordedAt || item.visitedAt)} · ${treatmentLabel(item)}${item.notes ? ` · ${item.notes}` : ''}`}
              />
              <h2 className="section-label">Prescription history</h2>
              <HistoryList
                rows={lines}
                empty="No prescriptions are recorded."
                render={(item) => `${formatWhen(item.recordedAt || item.visitedAt)} · ${treatmentLabel(item)}`}
              />
            </>
          ) : (
            <p className="empty">Medical history stays with the clinical team.</p>
          )}
        </>
      ) : null}
    </section>
  );
}

function ChipList({ items, empty }) {
  if (!items?.length) return <p className="empty">{empty}</p>;
  return (
    <div className="chips">
      {items.map((item) => <span key={item} className="chip chip-static">{item}</span>)}
    </div>
  );
}

function HistoryList({ rows, empty, render }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="feed">
      {rows.map((row) => <li key={row._id}>{render(row)}</li>)}
    </ul>
  );
}
