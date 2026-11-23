import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can } from '../access';
import { api } from '../api';
import { formatDate, medicineLabel } from '../format';

const EMPTY = {
  name: '',
  location: '',
  width: '1',
  height: '2',
  depth: '0.4',
  sections: [{ code: 'A', name: 'Top', medicine: '' }],
};

export function ShelfDesk({ actor, onToast }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const canWrite = can(actor.role, 'shelves', 'write');
  const parts = pathname.split('/').filter(Boolean);
  const id = parts[1] || '';
  const action = parts[2] || '';
  if (id === 'new') return canWrite ? <ShelfForm onToast={onToast} /> : <p className="empty">That shelf page is not available.</p>;
  if (id && action === 'edit') return canWrite ? <ShelfForm shelfId={id} onToast={onToast} /> : <p className="empty">That shelf page is not available.</p>;
  if (id) return <ShelfView shelfId={id} canWrite={canWrite} />;
  return <ShelfList canWrite={canWrite} />;
}

function ShelfList({ canWrite }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      api.shelves({ q: query.trim() })
        .then((result) => {
          if (!ignore) setRows(result.shelves || []);
        })
        .catch((err) => {
          if (!ignore) setError(err.message);
        });
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">PharmaVision</p>
          <h1>Shelves</h1>
        </div>
        {canWrite ? <button type="button" className="solid" onClick={() => navigate('/shelves/new')}>Register shelf</button> : null}
      </header>
      <p className="lede">Shelf records keep the name, location, sections and boundary for a later Flutter camera app. This desk does not scan the room.</p>
      <div className="filters">
        <label className="search">
          <span className="sr">Search shelves</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, shelf ID, or location" />
        </label>
      </div>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {rows.length === 0 ? <p className="empty">No shelves are registered.</p> : (
        <div className="table-wrap plan-table">
          <table className="ledger">
            <thead>
              <tr><th>Shelf ID</th><th>Name</th><th>Location</th><th>Sections</th><th>Last scan</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="is-clickable" onClick={() => navigate(`/shelves/${row._id}`)}>
                  <td>{row.shelfCode}</td>
                  <td className="name-cell">{row.name}</td>
                  <td>{row.location}</td>
                  <td>{row.sections.length}</td>
                  <td>{formatDate(row.lastScanAt) || 'No scan yet'}</td>
                  <td>{row.status === 'ACTIVE' ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        <div className="plan-cards">
          {rows.map((row) => (
            <button key={row._id} type="button" className="plan-card" onClick={() => navigate(`/shelves/${row._id}`)}>
              <strong>{row.name}</strong>
              <span>{row.shelfCode} · {row.location}</span>
              <span>{row.sections.length} sections · {row.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
              <span>{formatDate(row.lastScanAt) || 'No scan yet'}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ShelfForm({ shelfId, onToast }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [medicines, setMedicines] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(!shelfId);

  useEffect(() => {
    api.medicines().then(setMedicines).catch((err) => setError(err.message));
    if (!shelfId) return undefined;
    let ignore = false;
    api.shelf(shelfId).then((shelf) => {
      if (ignore) return;
      const sections = shelf.sections.length ? shelf.sections.map((section) => ({
        code: section.code,
        name: section.name,
        medicine: section.medicines[0]?.medicine || '',
      })) : [{ code: 'A', name: 'Top', medicine: '' }];
      setForm({
        name: shelf.name,
        location: shelf.location,
        width: String(shelf.boundary?.width ?? 1),
        height: String(shelf.boundary?.height ?? 2),
        depth: String(shelf.boundary?.depth ?? 0.4),
        sections,
      });
      setReady(true);
    }).catch((err) => {
      if (!ignore) setError(err.message);
    });
    return () => {
      ignore = true;
    };
  }, [shelfId]);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: form.name,
      location: form.location,
      boundary: { unit: 'm', width: Number(form.width), height: Number(form.height), depth: Number(form.depth), points: [] },
      coordinateSystem: { name: 'shelf-local', handedness: 'right', up: 'y', unit: 'm', origin: { x: 0, y: 0, z: 0 } },
      sections: form.sections.map((section) => ({
        code: section.code,
        name: section.name,
        medicines: section.medicine ? [section.medicine] : [],
      })),
    };
    try {
      const saved = shelfId ? await api.updateShelf(shelfId, body) : await api.createShelf(body);
      onToast(shelfId ? 'Shelf updated.' : 'Shelf registered.');
      navigate(`/shelves/${saved._id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{shelfId ? 'Update' : 'Register'}</p>
          <h1>{shelfId ? 'Edit shelf' : 'New shelf'}</h1>
        </div>
        <button type="button" className="ghost" onClick={() => navigate(shelfId ? `/shelves/${shelfId}` : '/shelves')}>Back</button>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {ready ? (
      <form className="record-form" onSubmit={submit}>
        <label>Shelf name<input value={form.name} onChange={update('name')} required maxLength={120} /></label>
        <label>Location<input value={form.location} onChange={update('location')} required maxLength={160} /></label>
        <label>Width (m)<input value={form.width} onChange={update('width')} inputMode="decimal" /></label>
        <label>Height (m)<input value={form.height} onChange={update('height')} inputMode="decimal" /></label>
        <label>Depth (m)<input value={form.depth} onChange={update('depth')} inputMode="decimal" /></label>
        <div className="wide">
          <p className="field-label">Sections</p>
          {form.sections.map((section, index) => (
            <div key={index} className="receive-row">
              <input value={section.code} aria-label="Section code" onChange={(event) => setForm((current) => ({
                ...current,
                sections: current.sections.map((item, itemIndex) => (itemIndex === index ? { ...item, code: event.target.value } : item)),
              }))} required />
              <input value={section.name} aria-label="Section name" onChange={(event) => setForm((current) => ({
                ...current,
                sections: current.sections.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)),
              }))} required />
              <select value={section.medicine} aria-label="Section medicine" onChange={(event) => setForm((current) => ({
                ...current,
                sections: current.sections.map((item, itemIndex) => (itemIndex === index ? { ...item, medicine: event.target.value } : item)),
              }))}>
                <option value="">No medicine</option>
                {medicines.map((medicine) => <option key={medicine._id} value={medicine._id}>{medicineLabel(medicine)}</option>)}
              </select>
            </div>
          ))}
          <button type="button" className="ghost" onClick={() => setForm((current) => ({
            ...current,
            sections: [...current.sections, { code: '', name: '', medicine: '' }],
          }))}>Add section</button>
        </div>
        <div className="dialog-actions wide">
          <button type="submit" className="solid" disabled={saving}>{shelfId ? 'Save shelf' : 'Register shelf'}</button>
        </div>
      </form>
      ) : <p className="empty">Loading shelf…</p>}
    </section>
  );
}

function ShelfView({ shelfId, canWrite }) {
  const navigate = useNavigate();
  const [shelf, setShelf] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    api.shelf(shelfId).then((record) => {
      if (!ignore) setShelf(record);
    }).catch((err) => {
      if (!ignore) setError(err.message);
    });
    return () => {
      ignore = true;
    };
  }, [shelfId]);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{shelf?.shelfCode || 'Shelf'}</p>
          <h1>{shelf?.name || 'Shelf'}</h1>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => navigate('/shelves')}>All shelves</button>
          {canWrite ? <button type="button" className="solid" onClick={() => navigate(`/shelves/${shelfId}/edit`)}>Edit</button> : null}
        </div>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {shelf ? (
        <>
          <dl className="fact-grid">
            <div><dt>Location</dt><dd>{shelf.location}</dd></div>
            <div><dt>Status</dt><dd>{shelf.status === 'ACTIVE' ? 'Active' : 'Inactive'}</dd></div>
            <div><dt>Last scan</dt><dd>{formatDate(shelf.lastScanAt) || 'No scan yet'}</dd></div>
            <div><dt>Coordinates</dt><dd>{shelf.coordinateSystem?.name} · {shelf.coordinateSystem?.unit}</dd></div>
            <div><dt>Boundary</dt><dd>{shelf.boundary?.width} × {shelf.boundary?.height} × {shelf.boundary?.depth} {shelf.boundary?.unit}</dd></div>
            <div><dt>Registered by</dt><dd>{shelf.createdByName || '—'}</dd></div>
          </dl>
          <h2 className="section-label">Sections</h2>
          <ul className="feed">
            {shelf.sections.map((section) => (
              <li key={section._id || section.code}>
                {section.code} · {section.name}
                {section.medicines.length ? ` · ${section.medicines.map((item) => item.medicineName).join(', ')}` : ' · no medicine assigned'}
              </li>
            ))}
          </ul>
          <h2 className="section-label">Scan history</h2>
          {(shelf.scans || []).length === 0 ? <p className="empty">No scans have been stored for this shelf.</p> : (
            <ul className="feed">
              {shelf.scans.map((scan) => (
                <li key={scan._id}>{formatDate(scan.createdAt)} · {scan.scanCode} · {scan.status} · {scan.observations.length} observations</li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
