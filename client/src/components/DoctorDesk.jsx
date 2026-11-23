import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can } from '../access';
import { api } from '../api';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function blankDoctor() {
  return {
    name: '',
    email: '',
    password: '',
    confirm: '',
    specialization: '',
    qualifications: [],
    registrationNumber: '',
    registrationBody: '',
    phone: '',
    address: '',
  };
}

function doctorPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  return { parts, id: parts[1] || '', action: parts[2] || '' };
}

export function DoctorDesk({ actor, onToast }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const canWrite = can(actor.role, 'doctors', 'write');
  const { parts, id, action } = doctorPath(pathname);

  useEffect(() => {
    if (!canWrite && (id === 'new' || action === 'edit')) {
      navigate('/doctors', { replace: true });
    }
  }, [canWrite, id, action, navigate]);

  if (parts.length > 3) return <p className="empty">That doctor page is not available.</p>;
  if (id === 'new') return <DoctorForm onToast={onToast} />;
  if (id && action === 'edit') return <DoctorForm doctorId={id} onToast={onToast} />;
  if (id && action === 'schedule') return <DoctorSchedule doctorId={id} canWrite={canWrite} onToast={onToast} />;
  if (id && action) return <p className="empty">That doctor page is not available.</p>;
  if (id) return <DoctorProfile doctorId={id} canWrite={canWrite} onToast={onToast} />;
  return <DoctorList canWrite={canWrite} onToast={onToast} />;
}

function DoctorList({ canWrite, onToast }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [specializations, setSpecializations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [renameFrom, setRenameFrom] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [renaming, setRenaming] = useState(false);
  const filterKey = `${debounced}|${specialization}|${active}`;
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
    let ignore = false;
    api.doctorSpecializations()
      .then((catalog) => {
        if (!ignore) setSpecializations(catalog.specializations || []);
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [retry]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api.doctors({ q: debounced, specialization, active, page, limit: 10 })
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
  }, [debounced, specialization, active, page, retry]);

  async function renameSpecialization(event) {
    event.preventDefault();
    setRenaming(true);
    try {
      const result = await api.renameSpecialization({ from: renameFrom, to: renameTo });
      setRenameTo('');
      setSpecialization('');
      setRetry((current) => current + 1);
      onToast(result.updated ? `Updated ${result.updated} doctor${result.updated === 1 ? '' : 's'}.` : 'Specialization saved.');
    } catch (err) {
      onToast(err.message, 'danger');
    } finally {
      setRenaming(false);
    }
  }

  const filtered = Boolean(debounced || specialization || active);
  const doctors = data?.doctors || [];

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Clinic</p>
          <h1>Doctors</h1>
        </div>
        {canWrite ? (
          <button type="button" className="solid" onClick={() => navigate('/doctors/new')}>
            Register doctor
          </button>
        ) : null}
      </header>
      <div className="filters">
        <label className="search">
          <span className="sr">Search doctors</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, phone, qualification, or registration"
          />
        </label>
        <label>
          Specialization
          <select
            value={specialization}
            onChange={(event) => setSpecialization(event.target.value)}
          >
            <option value="">All specializations</option>
            {specializations.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
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
      </div>
      {canWrite && specializations.length > 0 ? (
        <form className="filters" onSubmit={renameSpecialization}>
          <label>
            Rename specialization
            <select value={renameFrom} onChange={(event) => setRenameFrom(event.target.value)} required>
              <option value="">Choose one</option>
              {specializations.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            New name
            <input value={renameTo} onChange={(event) => setRenameTo(event.target.value)} maxLength={80} required />
          </label>
          <button type="submit" className="ghost" disabled={renaming}>Rename</button>
        </form>
      ) : null}
      {error ? (
        <p className="banner" role="alert">
          {error}{' '}
          <button type="button" className="text-btn" onClick={() => setRetry((current) => current + 1)}>Try again</button>
        </p>
      ) : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && !error && doctors.length === 0 ? (
        <p className="empty">
          {filtered ? 'No doctors match that search.' : 'No doctors are registered yet.'}
        </p>
      ) : null}
      {!loading && !error && doctors.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Specialization</th>
                  <th>Registration</th>
                  <th>Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((doctor) => (
                  <tr key={doctor._id} className="is-clickable" onClick={() => navigate(`/doctors/${doctor._id}`)}>
                    <td className="name-cell">{doctor.name}</td>
                    <td>{doctor.specialization || '—'}</td>
                    <td>{doctor.registrationNumber || '—'}</td>
                    <td>{doctor.phone || '—'}</td>
                    <td>{doctor.active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <p className="count">{data.total} doctors</p>
            <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Previous
            </button>
            <p className="count">Page {data.page} of {Math.max(data.pages, 1)}</p>
            <button type="button" className="ghost" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>
              Next
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function DoctorForm({ doctorId, onToast }) {
  const navigate = useNavigate();
  const editing = Boolean(doctorId);
  const [form, setForm] = useState(editing ? null : blankDoctor());
  const [specializations, setSpecializations] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    const doctorPromise = doctorId ? api.doctor(doctorId) : Promise.resolve(null);
    Promise.all([doctorPromise, api.doctorSpecializations()])
      .then(([result, catalog]) => {
        if (ignore) return;
        if (result?.doctor) {
          const doctor = result.doctor;
          setForm({
            name: doctor.name || '',
            email: doctor.email || '',
            password: '',
            confirm: '',
            specialization: doctor.specialization || '',
            qualifications: doctor.qualifications || [],
            registrationNumber: doctor.registrationNumber || '',
            registrationBody: doctor.registrationBody || '',
            phone: doctor.phone || '',
            address: doctor.address || '',
          });
        }
        setSpecializations(catalog.specializations || []);
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
  }, [doctorId]);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function addQualification() {
    const next = draft.trim().replace(/\s+/g, ' ');
    if (!next || !form) return;
    setForm((current) => {
      if (current.qualifications.some((item) => item.toLowerCase() === next.toLowerCase())) return current;
      return { ...current, qualifications: [...current.qualifications, next].slice(0, 12) };
    });
    setDraft('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!form) return;
    const pending = draft.trim().replace(/\s+/g, ' ');
    const qualifications = pending && !form.qualifications.some((item) => item.toLowerCase() === pending.toLowerCase())
      ? [...form.qualifications, pending]
      : form.qualifications;
    if (qualifications.length > 12) {
      setError('Keep qualifications to 12 entries');
      return;
    }
    if (!editing && form.password !== form.confirm) {
      setError('Enter the same password twice');
      return;
    }
    const body = {
      name: form.name.trim(),
      email: form.email.trim(),
      specialization: form.specialization.trim(),
      qualifications,
      registrationNumber: form.registrationNumber.trim(),
      registrationBody: form.registrationBody.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
    };
    setSaving(true);
    setError('');
    try {
      const result = editing
        ? await api.updateDoctor(doctorId, body)
        : await api.createDoctor({ ...body, password: form.password });
      onToast(editing ? 'Doctor details saved.' : `${result.doctor.name} can sign in.`);
      navigate(`/doctors/${result.doctor._id}`);
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
          <h1>{editing ? 'Edit doctor' : 'Register a doctor'}</h1>
        </div>
        <button type="button" className="ghost" onClick={() => navigate(editing ? `/doctors/${doctorId}` : '/doctors')}>
          Back
        </button>
      </header>
      {editing ? null : <p className="lede">This opens a doctor sign-in on the existing account list. It does not create a second record.</p>}
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading || !form ? <p className="empty">Opening the daybook…</p> : (
        <form className="doctor-form" onSubmit={submit}>
          <label>
            Name
            <input value={form.name} onChange={update('name')} required maxLength={120} autoFocus />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={update('email')} required maxLength={160} />
          </label>
          {editing ? null : (
            <>
              <label>
                Password
                <input type="password" value={form.password} onChange={update('password')} required minLength={8} maxLength={200} autoComplete="new-password" />
              </label>
              <label>
                Confirm password
                <input type="password" value={form.confirm} onChange={update('confirm')} required minLength={8} maxLength={200} autoComplete="new-password" />
              </label>
            </>
          )}
          <label>
            Specialization
            <input list="doctor-specializations" value={form.specialization} onChange={update('specialization')} required maxLength={80} />
            <datalist id="doctor-specializations">
              {specializations.map((name) => <option key={name} value={name} />)}
            </datalist>
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={update('phone')} maxLength={30} />
          </label>
          <label>
            Registration number
            <input value={form.registrationNumber} onChange={update('registrationNumber')} maxLength={40} />
          </label>
          <label>
            Registration body
            <input value={form.registrationBody} onChange={update('registrationBody')} maxLength={120} />
          </label>
          <label className="wide">
            Address
            <textarea value={form.address} onChange={update('address')} maxLength={300} rows={3} />
          </label>
          <div className="wide">
            <span className="field-label">Qualifications</span>
            <div className="chips">
              {form.qualifications.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="chip"
                  onClick={() => setForm((current) => ({
                    ...current,
                    qualifications: current.qualifications.filter((entry) => entry !== item),
                  }))}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="inline-field">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addQualification();
                  }
                }}
                maxLength={120}
                placeholder="Add a qualification"
              />
              <button type="button" className="ghost" onClick={addQualification}>Add</button>
            </div>
          </div>
          <div className="dialog-actions wide">
            <button type="submit" className="solid" disabled={saving}>{editing ? 'Save details' : 'Register doctor'}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function DoctorProfile({ doctorId, canWrite, onToast }) {
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api.doctor(doctorId)
      .then((result) => {
        if (ignore) return;
        setDoctor(result.doctor);
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
  }, [doctorId]);

  async function toggle() {
    setBusy(true);
    try {
      const result = await api.setDoctorActive(doctor._id, !doctor.active);
      setDoctor(result.doctor);
      onToast(result.doctor.active ? `${result.doctor.name} can sign in again.` : `${result.doctor.name} is deactivated.`);
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
          <p className="kicker">Profile</p>
          <h1>{doctor?.name || 'Doctor'}</h1>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => navigate('/doctors')}>All doctors</button>
          {doctor ? (
            <button type="button" className="ghost" onClick={() => navigate(`/doctors/${doctorId}/schedule`)}>Schedule</button>
          ) : null}
          {canWrite && doctor ? (
            <button type="button" className="ghost" onClick={() => navigate(`/doctors/${doctorId}/edit`)}>Edit</button>
          ) : null}
          {canWrite && doctor ? (
            <button type="button" className="solid" disabled={busy} onClick={toggle}>
              {doctor.active ? 'Deactivate' : 'Activate'}
            </button>
          ) : null}
        </div>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && !error && doctor ? (
        <>
          <dl className="fact-grid">
            <div>
              <dt>Status</dt>
              <dd>{doctor.active ? 'Active' : 'Inactive'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{doctor.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{doctor.phone || '—'}</dd>
            </div>
            <div>
              <dt>Specialization</dt>
              <dd>{doctor.specialization || '—'}</dd>
            </div>
            <div>
              <dt>Registration</dt>
              <dd>{doctor.registrationNumber || '—'}</dd>
            </div>
            <div>
              <dt>Registration body</dt>
              <dd>{doctor.registrationBody || '—'}</dd>
            </div>
            <div className="wide">
              <dt>Address</dt>
              <dd>{doctor.address || '—'}</dd>
            </div>
          </dl>
          <h2 className="section-label">Qualifications</h2>
          {doctor.qualifications.length === 0 ? (
            <p className="empty">No qualifications are recorded.</p>
          ) : (
            <div className="chips">
              {doctor.qualifications.map((item) => (
                <span key={item} className="chip chip-static">{item}</span>
              ))}
            </div>
          )}
          <h2 className="section-label">Availability</h2>
          <ScheduleList schedule={doctor.schedule} />
        </>
      ) : null}
    </section>
  );
}

function DoctorSchedule({ doctorId, canWrite, onToast }) {
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [slots, setSlots] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    api.doctor(doctorId)
      .then((result) => {
        if (ignore) return;
        setDoctor(result.doctor);
        setSlots(result.doctor.schedule || []);
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
  }, [doctorId]);

  function changeDraft(day, field, value) {
    setDrafts((current) => ({
      ...current,
      [day]: { start: '', end: '', location: '', ...current[day], [field]: value },
    }));
  }

  function addSlot(day) {
    const draft = drafts[day] || {};
    const start = clock(draft.start);
    const end = clock(draft.end);
    const location = (draft.location || '').trim().replace(/\s+/g, ' ');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end) {
      setError('Each session needs an end time after the start');
      return;
    }
    const overlaps = slots.some((slot) => slot.day === day && start < slot.end && end > slot.start);
    if (overlaps) {
      setError('Sessions on the same day cannot overlap');
      return;
    }
    setSlots((current) => [...current, { day, start, end, location }].sort(bySession));
    setDrafts((current) => ({ ...current, [day]: { start: '', end: '', location: '' } }));
    setError('');
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const result = await api.updateDoctorSchedule(doctorId, slots);
      setDoctor(result.doctor);
      setSlots(result.doctor.schedule || []);
      onToast('Schedule saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Availability</p>
          <h1>{doctor ? `${doctor.name}'s schedule` : 'Schedule'}</h1>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => navigate(`/doctors/${doctorId}`)}>Profile</button>
          {canWrite ? (
            <button type="button" className="solid" disabled={saving || loading || Boolean(error && !doctor)} onClick={save}>
              Save schedule
            </button>
          ) : null}
        </div>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && doctor ? (
        WEEKDAYS.map((day) => {
          const daySlots = slots.filter((slot) => slot.day === day);
          const draft = drafts[day] || { start: '', end: '', location: '' };
          return (
            <section key={day} className="day-block">
              <h2>{day}</h2>
              {daySlots.length === 0 ? <p className="muted">No sessions</p> : null}
              {daySlots.map((slot, index) => (
                <div key={`${slot.start}-${slot.end}-${index}`} className="slot-row">
                  <p>{slot.start}–{slot.end}</p>
                  <p>{slot.location || 'Clinic'}</p>
                  {canWrite ? (
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => setSlots((current) => current.filter((item) => item !== slot))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
              {canWrite ? (
                <div className="slot-row">
                  <label>
                    Start
                    <input type="time" value={draft.start} onChange={(event) => changeDraft(day, 'start', event.target.value)} />
                  </label>
                  <label>
                    End
                    <input type="time" value={draft.end} onChange={(event) => changeDraft(day, 'end', event.target.value)} />
                  </label>
                  <label>
                    Place
                    <input value={draft.location} onChange={(event) => changeDraft(day, 'location', event.target.value)} maxLength={80} />
                  </label>
                  <button type="button" className="ghost" onClick={() => addSlot(day)}>Add</button>
                </div>
              ) : null}
            </section>
          );
        })
      ) : null}
    </section>
  );
}

function ScheduleList({ schedule }) {
  if (!schedule?.length) return <p className="empty">No sessions are recorded.</p>;
  return WEEKDAYS.map((day) => {
    const daySlots = schedule.filter((slot) => slot.day === day);
    if (daySlots.length === 0) return null;
    return (
      <section key={day} className="day-block">
        <h2>{day}</h2>
        {daySlots.map((slot, index) => (
          <p key={`${slot.start}-${index}`}>{slot.start}–{slot.end}{slot.location ? ` · ${slot.location}` : ''}</p>
        ))}
      </section>
    );
  });
}

function clock(value) {
  const text = String(value || '');
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return text;
  if (/^([01]\d|2[0-3]):[0-5]\d:/.test(text)) return text.slice(0, 5);
  return text;
}

function bySession(left, right) {
  const order = WEEKDAYS.indexOf(left.day) - WEEKDAYS.indexOf(right.day);
  if (order !== 0) return order;
  return left.start.localeCompare(right.start);
}
