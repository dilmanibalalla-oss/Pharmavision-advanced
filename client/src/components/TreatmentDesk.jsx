import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can } from '../access';
import { api } from '../api';
import { formatDate, formatWhen, treatmentLabel } from '../format';

const STATUSES = [
  ['PLANNED', 'Planned'],
  ['ACTIVE', 'Active'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
  ['ON_HOLD', 'On hold'],
];

const AUDIT_LABELS = {
  patient: 'patient',
  doctor: 'doctor',
  consultation: 'consultation',
  diagnosis: 'diagnosis',
  description: 'treatment description',
  instructions: 'instructions',
  startDate: 'start date',
  endDate: 'end date',
  followUpDate: 'follow-up date',
  status: 'status',
  prescriptions: 'prescriptions',
};

function statusLabel(status) {
  return STATUSES.find(([value]) => value === status)?.[1] || status || '—';
}

function todayInput() {
  const date = new Date();
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function blank(patientId = '', consultationId = '') {
  return {
    patient: patientId,
    doctor: '',
    consultation: consultationId,
    diagnosis: '',
    description: '',
    instructions: '',
    startDate: todayInput(),
    endDate: '',
    followUpDate: '',
    status: 'PLANNED',
    prescriptions: [],
  };
}

export function TreatmentDesk({ actor, onToast }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const canWrite = can(actor.role, 'treatments', 'write');
  const parts = pathname.split('/').filter(Boolean);
  const id = parts[1] || '';
  const action = parts[2] || '';
  const params = new URLSearchParams(search);
  const presetPatient = params.get('patient') || '';
  const presetConsultation = params.get('consultation') || '';

  useEffect(() => {
    if (!canWrite && (id === 'new' || action === 'edit')) navigate('/treatment-plans', { replace: true });
  }, [canWrite, id, action, navigate]);

  if (parts.length > 3) return <p className="empty">That treatment page is not available.</p>;
  if (id === 'new') {
    return (
      <TreatmentForm
        actor={actor}
        presetPatient={presetPatient}
        presetConsultation={presetConsultation}
        onToast={onToast}
      />
    );
  }
  if (id && action === 'edit') return <TreatmentForm actor={actor} planId={id} onToast={onToast} />;
  if (id && action) return <p className="empty">That treatment page is not available.</p>;
  if (id) return <TreatmentView actor={actor} planId={id} onToast={onToast} />;
  return <TreatmentList actor={actor} canWrite={canWrite} />;
}

function PlanRows({ rows, onOpen }) {
  return (
    <>
      <div className="table-wrap plan-table">
        <table className="ledger">
          <thead>
            <tr>
              <th>Start</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Diagnosis</th>
              <th>Status</th>
              <th>Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record._id} className="is-clickable" onClick={() => onOpen(record._id)}>
                <td>{formatDate(record.startDate)}</td>
                <td className="name-cell">{record.patientName}</td>
                <td>{record.doctorName}</td>
                <td>{record.diagnosis || '—'}</td>
                <td>{statusLabel(record.status)}</td>
                <td>{formatDate(record.followUpDate) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="plan-cards">
        {rows.map((record) => (
          <button key={record._id} type="button" className="plan-card" onClick={() => onOpen(record._id)}>
            <strong>{record.patientName}</strong>
            <span>{formatDate(record.startDate)} · {statusLabel(record.status)}</span>
            <span>{record.diagnosis || record.description}</span>
            <span>
              {record.doctorName}
              {record.followUpDate ? ` · Follow-up ${formatDate(record.followUpDate)}` : ''}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function PlanGroup({ title, rows, total, empty, onOpen, onShowAll }) {
  return (
    <section>
      <h2 className="section-label">{title}</h2>
      {rows.length === 0 ? <p className="empty">{empty}</p> : <PlanRows rows={rows} onOpen={onOpen} />}
      {onShowAll ? (
        <div className="pager">
          <p className="count">Showing {rows.length} of {total}</p>
          <button type="button" className="ghost" onClick={onShowAll}>Show every {title.toLowerCase()}</button>
        </div>
      ) : total > 0 ? (
        <p className="count">{total} {title.toLowerCase()}</p>
      ) : null}
    </section>
  );
}

function TreatmentList({ actor, canWrite }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [doctor, setDoctor] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [doctors, setDoctors] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState('all');
  const [overview, setOverview] = useState(null);
  const filterKey = `${debounced}|${doctor}|${status}|${from}|${to}|${view}`;
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
    if (view === 'board') return undefined;
    let ignore = false;
    setLoading(true);
    api.treatmentPlans({
      q: debounced,
      doctor,
      status: view === 'all' ? status : '',
      from,
      to,
      due: view === 'due' ? 'true' : '',
      page,
      limit: 10,
    })
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
  }, [debounced, doctor, status, from, to, page, retry, view]);

  useEffect(() => {
    if (view !== 'board') return undefined;
    let ignore = false;
    setLoading(true);
    api.treatmentOverview({ q: debounced, doctor, from, to })
      .then((result) => {
        if (ignore) return;
        setOverview(result);
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
  }, [debounced, doctor, from, to, retry, view]);

  const rows = data?.treatmentPlans || [];
  const filtered = Boolean(debounced || doctor || status || from || to || view === 'due');
  const empty = view === 'due'
    ? 'No follow-ups are due.'
    : filtered
      ? 'No treatment plans match that search.'
      : 'No treatment plans are recorded yet.';

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Care plans</p>
          <h1>Treatment plans</h1>
        </div>
        {canWrite ? (
          <button type="button" className="solid" onClick={() => navigate('/treatment-plans/new')}>New treatment plan</button>
        ) : null}
      </header>
      <div className="segment" role="group" aria-label="Treatment views">
        <button type="button" className={view === 'all' ? 'ghost is-on' : 'ghost'} onClick={() => setView('all')}>All plans</button>
        <button type="button" className={view === 'board' ? 'ghost is-on' : 'ghost'} onClick={() => setView('board')}>Active and completed</button>
        <button type="button" className={view === 'due' ? 'ghost is-on' : 'ghost'} onClick={() => setView('due')}>Follow-ups due</button>
      </div>
      <div className="filters">
        <label className="search">
          <span className="sr">Search treatment plans</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patient, doctor, or diagnosis" />
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
              <option value={actor._id}>My treatment plans</option>
            </select>
          </label>
        )}
        {view === 'all' ? (
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        ) : null}
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
      {view === 'due' ? (
        <p className="lede">These plans are planned, active, or on hold, and the follow-up date is today or earlier.</p>
      ) : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && !error && view === 'board' && overview ? (
        <>
          <PlanGroup
            title="Active treatments"
            rows={overview.active.treatmentPlans}
            total={overview.active.total}
            empty="No active treatments."
            onOpen={(id) => navigate(`/treatment-plans/${id}`)}
            onShowAll={overview.active.total > overview.active.treatmentPlans.length ? () => { setStatus('ACTIVE'); setView('all'); } : null}
          />
          <PlanGroup
            title="Completed treatments"
            rows={overview.completed.treatmentPlans}
            total={overview.completed.total}
            empty="No completed treatments."
            onOpen={(id) => navigate(`/treatment-plans/${id}`)}
            onShowAll={overview.completed.total > overview.completed.treatmentPlans.length ? () => { setStatus('COMPLETED'); setView('all'); } : null}
          />
        </>
      ) : null}
      {!loading && !error && view !== 'board' && rows.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : null}
      {!loading && !error && view !== 'board' && rows.length > 0 ? (
        <>
          <PlanRows rows={rows} onOpen={(id) => navigate(`/treatment-plans/${id}`)} />
          <div className="pager">
            <p className="count">{data.total} treatment plans</p>
            <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <p className="count">Page {data.page} of {Math.max(data.pages, 1)}</p>
            <button type="button" className="ghost" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function TreatmentForm({ actor, planId, presetPatient, presetConsultation, onToast }) {
  const navigate = useNavigate();
  const editing = Boolean(planId);
  const [form, setForm] = useState(editing ? null : blank(presetPatient, presetConsultation));
  const [patientLabel, setPatientLabel] = useState('');
  const [matches, setMatches] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [chartLines, setChartLines] = useState([]);
  const [savedLinks, setSavedLinks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(editing || Boolean(presetPatient || presetConsultation));
  const [saving, setSaving] = useState(false);
  const lockedPatient = editing && actor.role !== 'ADMIN';

  useEffect(() => {
    let ignore = false;
    const recordPromise = planId ? api.treatmentPlan(planId) : Promise.resolve(null);
    const consultPromise = !planId && presetConsultation ? api.consultation(presetConsultation) : Promise.resolve(null);
    const patientPromise = !planId && !presetConsultation && presetPatient ? api.patient(presetPatient) : Promise.resolve(null);
    const doctorPromise = actor.role === 'ADMIN' ? api.doctors({ active: 'true', limit: 50 }) : Promise.resolve({ doctors: [] });
    Promise.all([recordPromise, consultPromise, patientPromise, doctorPromise])
      .then(([record, consultation, patient, roster]) => {
        if (ignore) return;
        const rosterDoctors = roster.doctors || [];
        if (record) {
          if (actor.role === 'ADMIN' && !rosterDoctors.some((doctor) => doctor._id === record.doctor)) {
            rosterDoctors.unshift({ _id: record.doctor, name: record.doctorName });
          }
          setForm({
            patient: record.patient,
            doctor: record.doctor,
            consultation: record.consultation || '',
            diagnosis: record.diagnosis,
            description: record.description,
            instructions: record.instructions,
            startDate: dateInput(record.startDate),
            endDate: dateInput(record.endDate),
            followUpDate: dateInput(record.followUpDate),
            status: record.status,
            prescriptions: (record.prescriptions || []).map((item) => String(item._id)),
          });
          setSavedLinks((record.prescriptions || []).map((item) => ({
            _id: String(item._id),
            medicineName: item.medicineName,
            strength: item.strength || '',
            form: item.form || '',
          })));
          setPatientLabel(`${record.patientName}${record.patientCode ? ` · ${record.patientCode}` : ''}`);
        } else if (consultation) {
          setForm((current) => ({
            ...current,
            patient: consultation.patient,
            consultation: consultation._id,
          }));
          setPatientLabel(`${consultation.patientName}${consultation.patientCode ? ` · ${consultation.patientCode}` : ''}`);
        } else if (patient) {
          setPatientLabel(`${patient.name}${patient.patientCode ? ` · ${patient.patientCode}` : ''}`);
        }
        setDoctors(rosterDoctors);
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
  }, [actor.role, planId, presetConsultation, presetPatient]);

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

  useEffect(() => {
    if (!form?.patient) return undefined;
    let ignore = false;
    Promise.all([
      api.consultations({ patient: form.patient, limit: 20 }),
      api.patient(form.patient),
    ])
      .then(([notes, patient]) => {
        if (ignore) return;
        setConsultations(notes.consultations || []);
        setChartLines(patient.prescriptions || []);
      })
      .catch(() => {
        if (ignore) return;
        setConsultations([]);
        setChartLines([]);
      });
    return () => {
      ignore = true;
    };
  }, [form?.patient]);

  useEffect(() => {
    const selected = form?.consultation;
    if (!selected || consultations.some((item) => item._id === selected)) return undefined;
    let ignore = false;
    api.consultation(selected)
      .then((note) => {
        if (ignore || !note?._id) return;
        setConsultations((current) => (current.some((item) => item._id === note._id) ? current : [note, ...current]));
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [form?.consultation, consultations]);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function togglePrescription(id) {
    setForm((current) => {
      const selected = current.prescriptions.includes(id);
      return {
        ...current,
        prescriptions: selected
          ? current.prescriptions.filter((item) => item !== id)
          : [...current.prescriptions, id],
      };
    });
  }

  const extraLinks = savedLinks.filter((item) => !chartLines.some((line) => String(line._id) === item._id));
  const prescriptionChoices = [
    ...chartLines.map((item) => ({ ...item, _id: String(item._id) })),
    ...extraLinks,
  ];
  const selectedConsultation = consultations.find((item) => item._id === form?.consultation);
  const consultationDiagnosis = selectedConsultation?.diagnosis || '';

  async function submit(event) {
    event.preventDefault();
    if (!form?.patient) {
      setError('Choose a patient');
      return;
    }
    const body = {
      patient: form.patient,
      doctor: actor.role === 'ADMIN' ? form.doctor : actor._id,
      consultation: form.consultation || null,
      diagnosis: form.diagnosis.trim(),
      description: form.description.trim(),
      instructions: form.instructions.trim(),
      startDate: form.startDate,
      endDate: form.endDate || null,
      followUpDate: form.followUpDate || null,
      status: form.status,
      prescriptions: form.prescriptions,
    };
    setSaving(true);
    setError('');
    try {
      const saved = editing
        ? await api.updateTreatmentPlan(planId, body)
        : await api.createTreatmentPlan(body);
      onToast(editing ? 'Treatment plan saved.' : 'Treatment plan recorded.');
      navigate(`/treatment-plans/${saved._id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{editing ? 'Update' : 'Plan'}</p>
          <h1>{editing ? 'Edit treatment plan' : 'New treatment plan'}</h1>
        </div>
        <button type="button" className="ghost" onClick={() => navigate(editing ? `/treatment-plans/${planId}` : '/treatment-plans')}>Back</button>
      </header>
      <p className="lede">Write the plan yourself. Saving it does not create or change a prescription.</p>
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
                    setForm((current) => ({ ...current, patient: '', consultation: '', prescriptions: [] }));
                    setSavedLinks([]);
                    setConsultations([]);
                    setChartLines([]);
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
                          setForm((current) => ({
                            ...current,
                            patient: patient._id,
                            consultation: '',
                            prescriptions: [],
                          }));
                          setSavedLinks([]);
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
            Consultation
            <select value={form.consultation} onChange={update('consultation')}>
              <option value="">No consultation</option>
              {consultations.map((item) => (
                <option key={item._id} value={item._id}>
                  {formatWhen(item.consultedAt)} · {item.chiefComplaint}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={form.status} onChange={update('status')}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Start date
            <input type="date" value={form.startDate} onChange={update('startDate')} required />
          </label>
          <label>
            End date
            <input type="date" value={form.endDate} onChange={update('endDate')} />
          </label>
          <label>
            Follow-up date
            <input type="date" value={form.followUpDate} onChange={update('followUpDate')} />
          </label>
          <label className="wide">
            Diagnosis
            <textarea value={form.diagnosis} onChange={update('diagnosis')} rows={2} maxLength={500} />
          </label>
          {consultationDiagnosis ? (
            <div className="wide">
              <button
                type="button"
                className="ghost"
                onClick={() => setForm((current) => ({ ...current, diagnosis: consultationDiagnosis }))}
              >
                Use the consultation diagnosis
              </button>
            </div>
          ) : null}
          <label className="wide">
            Treatment description
            <textarea value={form.description} onChange={update('description')} rows={3} maxLength={2000} required />
          </label>
          <label className="wide">
            Instructions
            <textarea value={form.instructions} onChange={update('instructions')} rows={3} maxLength={2000} />
          </label>
          <div className="wide">
            <p className="field-label">Prescriptions on this chart</p>
            {prescriptionChoices.length === 0 ? (
              <p className="empty">No prescriptions are on this chart. The plan can be saved without one.</p>
            ) : (
              <div className="checks">
                {prescriptionChoices.map((item) => (
                  <label key={item._id}>
                    <input
                      type="checkbox"
                      checked={form.prescriptions.includes(String(item._id))}
                      onChange={() => togglePrescription(String(item._id))}
                    />
                    <span>
                      {treatmentLabel(item)}
                      {item.notes ? ` · ${item.notes}` : ''}
                      {extraLinks.some((link) => link._id === String(item._id)) ? ' · no longer on the chart' : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="dialog-actions wide">
            <button type="submit" className="solid" disabled={saving}>{editing ? 'Save treatment plan' : 'Record treatment plan'}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function TreatmentView({ actor, planId, onToast }) {
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [followDate, setFollowDate] = useState('');
  const [followNote, setFollowNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = actor.role === 'ADMIN' || (record && String(record.doctor) === String(actor._id));

  useEffect(() => {
    let ignore = false;
    api.treatmentPlan(planId)
      .then((next) => {
        if (ignore) return;
        setRecord(next);
        setFollowDate(dateInput(next.followUpDate));
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
  }, [planId]);

  async function saveProgress(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await api.recordProgress(planId, {
        note: note.trim(),
        ...(nextStatus ? { status: nextStatus } : {}),
      });
      setRecord(saved);
      setNote('');
      setNextStatus('');
      onToast('Progress recorded.');
    } catch (err) {
      onToast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function saveFollowUp(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await api.scheduleFollowUp(planId, {
        followUpDate: followDate,
        note: followNote.trim(),
      });
      setRecord(saved);
      setFollowDate(dateInput(saved.followUpDate));
      setFollowNote('');
      onToast('Follow-up scheduled.');
    } catch (err) {
      onToast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Treatment plan</p>
          <h1>{record?.patientName || 'Treatment plan'}</h1>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => navigate('/treatment-plans')}>All treatment plans</button>
          {record ? (
            <button type="button" className="ghost" onClick={() => navigate(`/patients/${record.patient}`)}>Patient</button>
          ) : null}
          {record?.consultation ? (
            <button type="button" className="ghost" onClick={() => navigate(`/consultations/${record.consultation}`)}>Consultation</button>
          ) : null}
          {canEdit && record ? (
            <button type="button" className="solid" onClick={() => navigate(`/treatment-plans/${planId}/edit`)}>Edit</button>
          ) : null}
        </div>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && record ? (
        <>
          <dl className="fact-grid">
            <div><dt>Status</dt><dd>{statusLabel(record.status)}</dd></div>
            <div><dt>Doctor</dt><dd>{record.doctorName}</dd></div>
            <div><dt>Patient ID</dt><dd>{record.patientCode || '—'}</dd></div>
            <div><dt>Start</dt><dd>{formatDate(record.startDate)}</dd></div>
            <div><dt>End</dt><dd>{formatDate(record.endDate) || '—'}</dd></div>
            <div><dt>Follow-up</dt><dd>{formatDate(record.followUpDate) || '—'}</dd></div>
            <div className="wide"><dt>Diagnosis</dt><dd>{record.diagnosis || '—'}</dd></div>
            <div className="wide"><dt>Treatment description</dt><dd>{record.description}</dd></div>
            <div className="wide"><dt>Instructions</dt><dd>{record.instructions || '—'}</dd></div>
          </dl>
          <h2 className="section-label">Linked prescriptions</h2>
          {record.prescriptions.length === 0 ? <p className="empty">No prescriptions are linked. Prescription records stay on the patient chart.</p> : (
            <ul className="feed">
              {record.prescriptions.map((item) => (
                <li key={item._id}>{treatmentLabel(item)}</li>
              ))}
            </ul>
          )}
          <h2 className="section-label">Progress</h2>
          <ul className="feed">
            {[...record.progress].reverse().map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                {formatWhen(entry.at)} · {entry.name} · {statusLabel(entry.status)}
                {entry.kind === 'follow-up' && entry.followUpDate ? ` · follow-up ${formatDate(entry.followUpDate)}` : ''}
                {entry.note ? ` · ${entry.note}` : ''}
              </li>
            ))}
          </ul>
          {canEdit ? (
            <form className="record-form" onSubmit={saveProgress}>
              <label className="wide">
                Progress note
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={500} />
              </label>
              <label>
                New status
                <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                  <option value="">Keep {statusLabel(record.status)}</option>
                  {STATUSES.filter(([value]) => value !== record.status).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="dialog-actions wide">
                <button type="submit" className="solid" disabled={busy}>Record progress</button>
              </div>
            </form>
          ) : null}
          <h2 className="section-label">Follow-up</h2>
          {canEdit ? (
            <form className="record-form" onSubmit={saveFollowUp}>
              <label>
                Follow-up date
                <input type="date" value={followDate} onChange={(event) => setFollowDate(event.target.value)} required />
              </label>
              <label className="wide">
                Follow-up note
                <textarea value={followNote} onChange={(event) => setFollowNote(event.target.value)} rows={2} maxLength={500} />
              </label>
              <div className="dialog-actions wide">
                <button type="submit" className="ghost" disabled={busy}>Schedule follow-up</button>
              </div>
            </form>
          ) : (
            <p>{formatDate(record.followUpDate) || 'No follow-up is scheduled.'}</p>
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
