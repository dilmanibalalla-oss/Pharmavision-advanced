import { useEffect, useState } from 'react';
import { can } from '../access';
import { api } from '../api';
import { formatWhen } from '../format';

export function ScanDesk({ actor, onToast }) {
  const canWrite = can(actor.role, 'scans', 'write');
  const [rows, setRows] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  function load(search = query) {
    return api.scans({ q: search.trim() }).then((result) => {
      setRows(result.scans || []);
      setConnected(result.recognitionConnected === true);
    });
  }

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      load(query).catch((err) => {
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
          <h1>Shelf scans</h1>
        </div>
      </header>
      <p className="disclaimer">
        {connected
          ? 'The detection service is configured. Results that come back are observations only and do not change stock.'
          : 'Image recognition is not connected. A scan can be stored and reviewed, but this desk will not invent medicines or counts.'}
      </p>
      <div className="filters">
        <label className="search">
          <span className="sr">Search scans</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Shelf name" />
        </label>
      </div>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {canWrite ? <ScanForm onToast={onToast} onSaved={load} /> : null}
      {rows.length === 0 ? <p className="empty">No scans have been stored.</p> : (
        <ul className="feed">
          {rows.map((row) => (
            <li key={row._id}>
              <button type="button" className="text-btn" onClick={() => api.scan(row._id).then(setSelected)}>
                {formatWhen(row.createdAt)} · {row.scanCode} · {row.shelfName} · {row.status}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? <ScanDetail scan={selected} /> : null}
    </section>
  );
}

function ScanForm({ onToast, onSaved }) {
  const [shelves, setShelves] = useState([]);
  const [shelf, setShelf] = useState('');
  const [section, setSection] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.shelves({ status: 'ACTIVE' }).then((result) => setShelves(result.shelves || [])).catch(() => setShelves([]));
  }, []);

  const chosen = shelves.find((item) => item._id === shelf);

  async function submit(event) {
    event.preventDefault();
    if (!file) return;
    setSaving(true);
    try {
      const data = await readFile(file);
      const saved = await api.createScan({
        requestId: crypto.randomUUID(),
        shelf,
        section,
        device: { platform: 'web', os: navigator.platform || '', model: 'browser', appVersion: 'web' },
        image: { mime: file.type, data },
      });
      onToast(saved.recognition?.performed ? 'Observations were stored. Stock was not changed.' : 'Scan stored. Recognition was not run.');
      setFile(null);
      await onSaved();
    } catch (error) {
      onToast(error.message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="record-form" onSubmit={submit}>
      <label>
        Shelf
        <select value={shelf} onChange={(event) => { setShelf(event.target.value); setSection(''); }} required>
          <option value="">Select a shelf</option>
          {shelves.map((item) => <option key={item._id} value={item._id}>{item.shelfCode} · {item.name}</option>)}
        </select>
      </label>
      <label>
        Section
        <select value={section} onChange={(event) => setSection(event.target.value)}>
          <option value="">Whole shelf</option>
          {(chosen?.sections || []).map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
        </select>
      </label>
      <label className="wide">
        Image
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
      </label>
      <div className="dialog-actions wide">
        <button type="submit" className="solid" disabled={saving}>Store scan</button>
      </div>
    </form>
  );
}

function ScanDetail({ scan }) {
  return (
    <div>
      <h2 className="section-label">{scan.scanCode}</h2>
      <p className="disclaimer">{scan.recognition?.message || 'No recognition result is stored.'}</p>
      <dl className="fact-grid">
        <div><dt>Shelf</dt><dd>{scan.shelfName}</dd></div>
        <div><dt>Section</dt><dd>{scan.section || '—'}</dd></div>
        <div><dt>Device</dt><dd>{scan.device?.platform || '—'} {scan.device?.model || ''}</dd></div>
        <div><dt>Requested by</dt><dd>{scan.userName || '—'}</dd></div>
      </dl>
      <h2 className="section-label">Observations</h2>
      {scan.observations.length === 0 ? <p className="empty">No products were detected. Stock was left unchanged.</p> : (
        <ul className="feed">
          {scan.observations.map((item) => (
            <li key={item._id}>
              {item.unknown ? 'Unknown product' : item.medicineName} · count {item.count} · confidence {item.confidence}
              {item.lowConfidence ? ' · low confidence' : ''}
              {item.section ? ` · section ${item.section}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('That image could not be read'));
    reader.readAsDataURL(file);
  });
}
