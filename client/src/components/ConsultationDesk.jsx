import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can } from '../access';
import { api } from '../api';
import { formatWhen } from '../format';

const AUDIT_LABELS = {
  patient: 'patient',
  doctor: 'doctor',
  consultedAt: 'date and time',
  chiefComplaint: 'chief complaint',
  symptoms: 'symptoms',
  medicalHistory: 'medical history',
  examination: 'examination',
  vitals: 'vital signs',
  diagnosis: 'diagnosis',
  investigations: 'investigations',
  notes: 'notes',
  followUp: 'follow-up',
};

const VITALS = [
  ['systolic', 'Systolic', 'mmHg'],
  ['diastolic', 'Diastolic', 'mmHg'],
  ['pulse', 'Pulse', 'bpm'],
  ['temperature', 'Temperature', '°C'],
  ['respiratoryRate', 'Respiratory rate', 'breaths/min'],
  ['oxygenSaturation', 'Oxygen saturation', '%'],
  ['weightKg', 'Weight', 'kg'],
  ['heightCm', 'Height', 'cm'],
];

function localInput(value) {
  const date = value ? new Date(value) : new Date();
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function blank(patientId = '') {
  return {
    patient: patientId,
    doctor: '',
    consultedAt: localInput(),
    chiefComplaint: '',
    symptoms: '',
    medicalHistory: '',
    examination: '',
    diagnosis: '',
    followUp: '',
    notes: '',
    investigations: [],
    vitals: {},
  };
}

export function ConsultationDesk({ actor, onToast }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const canWrite = can(actor.role, 'consultations', 'write');
  const parts = pathname.split('/').filter(Boolean);
  const id = parts[1] || '';
  const action = parts[2] || '';
  const presetPatient = new URLSearchParams(search).get('patient') || '';

  useEffect(() => {
    if (!canWrite && (id === 'new' || action === 'edit')) navigate('/consultations', { replace: true });
  }, [canWrite, id, action, navigate]);

  if (parts.length > 3) return <p className="empty">That consultation page is not available.</p>;
  if (id === 'new') return <ConsultationForm actor={actor} presetPatient={presetPatient} onToast={onToast} />;
  if (id && action === 'edit') return <ConsultationForm actor={actor} consultationId={id} onToast={onToast} />;
  if (id && action) return <p className="empty">That consultation page is not available.</p>;
  if (id) return <ConsultationView actor={actor} consultationId={id} />;
  return <ConsultationList actor={actor} canWrite={canWrite} />;
}

function ConsultationList({ actor, canWrite }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [doctor, setDoctor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [doctors, setDoctors] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const filterKey = `${debounced}|${doctor}|${from}|${to}`;
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
    if (actor.role !== 'ADMIN') return undefined;
    let ignore = false;
    api.doctors({ active: 'true', limit: 50 })
      .then((result) => {
        if (!ignore) setDoctors(result.doctors || []);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [actor.role]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api.consultations({ q: debounced, doctor, from, to, page, limit: 10 })
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
  }, [debounced, doctor, from, to, page, retry]);

  const rows = data?.consultations || [];
  const filtered = Boolean(debounced || doctor || from || to);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Clinical notes</p>
          <h1>Consultations</h1>
        </div>
        {canWrite ? (
          <button type="button" className="solid" onClick={() => navigate('/consultations/new')}>New consultation</button>
        ) : null}
      </header>
      <div className="filters">
        <label className="search">
          <span className="sr">Search consultations</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patient, doctor, complaint, or diagnosis" />
        </label>
        {actor.role === 'ADMIN' ? (
          <label>
            Doctor
            <select value={doctor} onChange={(event) => setDoctor(event.target.value)}>
              <option value="">All doctors</option>
              {doctors.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </label>
        ) : (
          <label>
            Doctor
            <select value={doctor} onChange={(event) => setDoctor(event.target.value)}>
              <option value="">All doctors</option>
              <option value={actor._id}>My consultations</option>
            </select>
          </label>
        )}
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      {error ? (
        <p className="banner" role="alert">
          {error}{' '}
          <button type="button" className="text-btn" onClick={() => setRetry((current) => current + 1)}>Try again</button>
        </p>
      ) : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="empty">{filtered ? 'No consultations match that search.' : 'No consultations are recorded yet.'}</p>
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Chief complaint</th>
                  <th>Diagnosis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => (
                  <tr key={record._id} className="is-clickable" onClick={() => navigate(`/consultations/${record._id}`)}>
                    <td>{formatWhen(record.consultedAt)}</td>
                    <td className="name-cell">{record.patientName}</td>
                    <td>{record.doctorName}</td>
                    <td>{record.chiefComplaint}</td>
                    <td>{record.diagnosis || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <p className="count">{data.total} consultations</p>
            <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <p className="count">Page {data.page} of {Math.max(data.pages, 1)}</p>
            <button type="button" className="ghost" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ConsultationForm({ actor, consultationId, presetPatient, onToast }) {
  const navigate = useNavigate();
  const editing = Boolean(consultationId);
  const [form, setForm] = useState(editing ? null : blank(presetPatient));
  const [patientLabel, setPatientLabel] = useState('');
  const [matches, setMatches] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [investigation, setInvestigation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(editing || Boolean(presetPatient));
  const [saving, setSaving] = useState(false);
  const lockedPatient = editing && actor.role !== 'ADMIN';

  useEffect(() => {
    let ignore = false;
    const recordPromise = consultationId ? api.consultation(consultationId) : Promise.resolve(null);
    const patientPromise = !consultationId && presetPatient ? api.patient(presetPatient) : Promise.resolve(null);
    const doctorPromise = actor.role === 'ADMIN' ? api.doctors({ active: 'true', limit: 50 }) : Promise.resolve({ doctors: [] });
    Promise.all([recordPromise, patientPromise, doctorPromise])
      .then(([record, patient, roster]) => {
        if (ignore) return;
        setDoctors(roster.doctors || []);
        if (record) {
          setForm({
            patient: record.patient,
            doctor: record.doctor,
            consultedAt: localInput(record.consultedAt),
            chiefComplaint: record.chiefComplaint,
            symptoms: record.symptoms,
            medicalHistory: record.medicalHistory,
            examination: record.examination,
            diagnosis: record.diagnosis,
            followUp: record.followUp,
            notes: record.notes,
            investigations: record.investigations || [],
            vitals: Object.fromEntries(Object.entries(record.vitals || {}).filter(([, value]) => value != null)),
          });
          setPatientLabel(`${record.patientName}${record.patientCode ? ` · ${record.patientCode}` : ''}`);
        } else if (patient) {
          setPatientLabel(`${patient.name}${patient.patientCode ? ` · ${patient.patientCode}` : ''}`);
        }
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
  }, [actor.role, consultationId, presetPatient]);

  useEffect(() => {
    if (lockedPatient || !patientLabel.trim() || form?.patient) return undefined;
    let ignore = false;
    const timer = setTimeout(() => {
      api.patients({ q: patientLabel.trim(), limit: 8 })
        .then((result) => {
          if (!ignore) setMatches(result.patients || []);
        })
        .catch(() => {
          if (!ignore) setMatches([]);
        });
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [patientLabel, lockedPatient, form?.patient]);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function updateVital(key, value) {
    setForm((current) => ({ ...current, vitals: { ...current.vitals, [key]: value } }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form?.patient) {
      setError('Choose a patient');
      return;
    }
    const vitals = {};
    Object.entries(form.vitals).forEach(([key, value]) => {
      if (value !== '' && value != null) vitals[key] = Number(value);
    });
    const body = {
      patient: form.patient,
      doctor: actor.role === 'ADMIN' ? form.doctor : actor._id,
      consultedAt: new Date(form.consultedAt).toISOString(),
      chiefComplaint: form.chiefComplaint.trim(),
      symptoms: form.symptoms.trim(),
      medicalHistory: form.medicalHistory.trim(),
      examination: form.examination.trim(),
      diagnosis: form.diagnosis.trim(),
      notes: form.notes.trim(),
      followUp: form.followUp.trim(),
      investigations: form.investigations,
      vitals,
    };
    setSaving(true);
    setError('');
    try {
      const saved = editing
        ? await api.updateConsultation(consultationId, body)
        : await api.createConsultation(body);
      onToast(editing ? 'Consultation saved.' : 'Consultation recorded.');
      navigate(`/consultations/${saved._id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{editing ? 'Update' : 'Record'}</p>
          <h1>{editing ? 'Edit consultation' : 'New consultation'}</h1>
        </div>
        <button type="button" className="ghost" onClick={() => navigate(editing ? `/consultations/${consultationId}` : '/consultations')}>Back</button>
      </header>
      <p className="lede">Write the findings yourself. The form saves only what you enter.</p>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading || !form ? <p className="empty">Opening the daybook…</p> : (
        <form className="record-form" onSubmit={submit}>
          <label className="wide">
            Patient
            {lockedPatient && patientLabel ? (
              <input value={patientLabel} readOnly />
            ) : (
              <>
                <input
                  value={patientLabel}
                  onChange={(event) => {
                    setPatientLabel(event.target.value);
                    setForm((current) => ({ ...current, patient: '' }));
                  }}
                  placeholder="Search by name, patient ID, or phone"
                  required
                />
                {matches.length > 0 ? (
                  <div className="chips">
                    {matches.map((patient) => (
                      <button
                        key={patient._id}
                        type="button"
                        className="chip chip-static"
                        onClick={() => {
                          setForm((current) => ({ ...current, patient: patient._id }));
                          setPatientLabel(`${patient.name}${patient.patientCode ? ` · ${patient.patientCode}` : ''}`);
                          setMatches([]);
                        }}
                      >
                        {patient.name}{patient.patientCode ? ` · ${patient.patientCode}` : ''}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </label>
          {actor.role === 'ADMIN' ? (
            <label>
              Doctor
              <select value={form.doctor} onChange={update('doctor')} required>
                <option value="">Select a doctor</option>
                {doctors.map((doctor) => <option key={doctor._id} value={doctor._id}>{doctor.name}</option>)}
              </select>
            </label>
          ) : (
            <label>
              Doctor
              <input value={actor.name} readOnly />
            </label>
          )}
          <label>
            Date and time
            <input type="datetime-local" value={form.consultedAt} onChange={update('consultedAt')} required />
          </label>
          <label className="wide">
            Chief complaint
            <input value={form.chiefComplaint} onChange={update('chiefComplaint')} required maxLength={300} />
          </label>
          <label className="wide">
            Symptoms
            <textarea value={form.symptoms} onChange={update('symptoms')} rows={3} maxLength={2000} />
          </label>
          <label className="wide">
            Medical history
            <textarea value={form.medicalHistory} onChange={update('medicalHistory')} rows={3} maxLength={2000} />
          </label>
          <label className="wide">
            Examination findings
            <textarea value={form.examination} onChange={update('examination')} rows={3} maxLength={2000} />
          </label>
          {VITALS.map(([key, label, unit]) => (
            <label key={key}>
              {label} <span className="muted">({unit})</span>
              <input
                type="number"
                step="0.1"
                value={form.vitals[key] ?? ''}
                onChange={(event) => updateVital(key, event.target.value)}
              />
            </label>
          ))}
          <label className="wide">
            Diagnosis
            <input value={form.diagnosis} onChange={update('diagnosis')} maxLength={500} />
          </label>
          <div className="wide">
            <span className="field-label">Investigations</span>
            <div className="chips">
              {form.investigations.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="chip"
                  onClick={() => setForm((current) => ({
                    ...current,
                    investigations: current.investigations.filter((entry) => entry !== item),
                  }))}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="inline-field">
              <input
                value={investigation}
                onChange={(event) => setInvestigation(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const next = investigation.trim().replace(/\s+/g, ' ');
                    if (!next) return;
                    setForm((current) => (
                      current.investigations.some((item) => item.toLowerCase() === next.toLowerCase())
                        ? current
                        : { ...current, investigations: [...current.investigations, next].slice(0, 20) }
                    ));
                    setInvestigation('');
                  }
                }}
                maxLength={160}
                aria-label="Investigations"
              />
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const next = investigation.trim().replace(/\s+/g, ' ');
                  if (!next) return;
                  setForm((current) => (
                    current.investigations.some((item) => item.toLowerCase() === next.toLowerCase())
                      ? current
                      : { ...current, investigations: [...current.investigations, next].slice(0, 20) }
                  ));
                  setInvestigation('');
                }}
              >
                Add
              </button>
            </div>
          </div>
          <label className="wide">
            Doctor&apos;s notes
            <textarea value={form.notes} onChange={update('notes')} rows={3} maxLength={2000} />
          </label>
          <label className="wide">
            Follow-up recommendation
            <textarea value={form.followUp} onChange={update('followUp')} rows={2} maxLength={500} />
          </label>
          <div className="dialog-actions wide">
            <button type="submit" className="solid" disabled={saving}>{editing ? 'Save consultation' : 'Record consultation'}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function ConsultationView({ actor, consultationId }) {
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canEdit = actor.role === 'ADMIN' || (record && String(record.doctor) === String(actor._id));

  useEffect(() => {
    let ignore = false;
    api.consultation(consultationId)
      .then((next) => {
        if (ignore) return;
        setRecord(next);
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
  }, [consultationId]);

  const vitals = VITALS.filter(([key]) => record?.vitals?.[key] != null);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Consultation</p>
          <h1>{record?.patientName || 'Consultation'}</h1>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => navigate('/consultations')}>All consultations</button>
          {record ? (
            <button type="button" className="ghost" onClick={() => navigate(`/patients/${record.patient}`)}>Patient</button>
          ) : null}
          {canEdit && record ? (
            <button type="button" className="solid" onClick={() => navigate(`/consultations/${consultationId}/edit`)}>Edit</button>
          ) : null}
        </div>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && record ? (
        <>
          <dl className="fact-grid">
            <div><dt>When</dt><dd>{formatWhen(record.consultedAt)}</dd></div>
            <div><dt>Doctor</dt><dd>{record.doctorName}</dd></div>
            <div><dt>Patient ID</dt><dd>{record.patientCode || '—'}</dd></div>
            <div className="wide"><dt>Chief complaint</dt><dd>{record.chiefComplaint}</dd></div>
            <div className="wide"><dt>Symptoms</dt><dd>{record.symptoms || '—'}</dd></div>
            <div className="wide"><dt>Medical history</dt><dd>{record.medicalHistory || '—'}</dd></div>
            <div className="wide"><dt>Examination</dt><dd>{record.examination || '—'}</dd></div>
            <div className="wide"><dt>Diagnosis</dt><dd>{record.diagnosis || '—'}</dd></div>
            <div className="wide"><dt>Follow-up</dt><dd>{record.followUp || '—'}</dd></div>
            <div className="wide"><dt>Notes</dt><dd>{record.notes || '—'}</dd></div>
          </dl>
          <h2 className="section-label">Vital signs</h2>
          {vitals.length === 0 ? <p className="empty">No vital signs are recorded.</p> : (
            <dl className="fact-grid">
              {vitals.map(([key, label, unit]) => (
                <div key={key}><dt>{label}</dt><dd>{record.vitals[key]} {unit}</dd></div>
              ))}
            </dl>
          )}
          <h2 className="section-label">Investigations</h2>
          {record.investigations.length === 0 ? <p className="empty">No investigations are recorded.</p> : (
            <ul className="feed">{record.investigations.map((item) => <li key={item}>{item}</li>)}</ul>
          )}
          <h2 className="section-label">Audit history</h2>
          <ul className="feed">
            {record.audit.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                {formatWhen(entry.at)} · {entry.name} {entry.action}
                {entry.fields?.length ? ` · ${entry.fields.map((field) => AUDIT_LABELS[field] || field).join(', ')}` : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
