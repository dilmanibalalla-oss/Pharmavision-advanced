import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can } from '../access';
import { api } from '../api';
import { formatDate } from '../format';

export function AlertDesk({ actor, onToast }) {
  const { pathname } = useLocation();
  const id = pathname.split('/').filter(Boolean)[1] || '';
  if (id) return <AlertDetail alertId={id} actor={actor} onToast={onToast} />;
  return <AlertList />;
}

function AlertList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    api.alerts({ status, q: query.trim() })
      .then((result) => {
        if (ignore) return;
        setRows(result.alerts || []);
        setCounts(result.counts || {});
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [status, query]);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Security</p>
          <h1>Discrepancies</h1>
        </div>
      </header>
      <p className="disclaimer">A difference between batch stock and a shelf observation is a review item. It is not evidence that a person took or moved stock.</p>
      <div className="summary-cards">
        {['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'].map((item) => (
          <button key={item} type="button" className="summary-card" onClick={() => setStatus(status === item ? '' : item)}>
            <strong>{counts[item] || 0}</strong>
            <span>{item.replace('_', ' ')}</span>
          </button>
        ))}
      </div>
      <div className="filters">
        <label className="search">
          <span className="sr">Search alerts</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Alert, shelf, or medicine" />
        </label>
      </div>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {rows.length === 0 ? <p className="empty">No discrepancies match that filter.</p> : (
        <div className="table-wrap plan-table">
          <table className="ledger">
            <thead>
              <tr><th>Alert</th><th>Shelf</th><th>Medicine</th><th>Expected</th><th>Observed</th><th>Difference</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="is-clickable" onClick={() => navigate(`/alerts/${row._id}`)}>
                  <td>{row.alertCode}</td>
                  <td>{row.shelfName}</td>
                  <td>{row.medicineName || 'Unrecognized product'}</td>
                  <td>{row.expectedQuantity}</td>
                  <td>{row.observedQuantity}</td>
                  <td>{row.difference}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        <div className="plan-cards">
          {rows.map((row) => (
            <button key={row._id} type="button" className="plan-card" onClick={() => navigate(`/alerts/${row._id}`)}>
              <strong>{row.alertCode}</strong>
              <span>{row.shelfName} · {row.medicineName || 'Unrecognized product'}</span>
              <span>Expected {row.expectedQuantity} · Observed {row.observedQuantity} · {row.difference}</span>
              <span>{row.status}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AlertDetail({ alertId, actor, onToast }) {
  const navigate = useNavigate();
  const canWrite = can(actor.role, 'alerts', 'write');
  const [alert, setAlert] = useState(null);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState('');

  function load() {
    return api.alert(alertId).then(setAlert);
  }

  useEffect(() => {
    let ignore = false;
    load().catch((err) => {
      if (!ignore) setError(err.message);
    });
    return () => {
      ignore = true;
    };
  }, [alertId]);

  async function save(body, success) {
    try {
      const next = await api.updateAlert(alertId, body);
      setAlert(next);
      onToast(success);
    } catch (err) {
      onToast(err.message, 'danger');
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{alert?.alertCode || 'Alert'}</p>
          <h1>{alert?.shelfName || 'Discrepancy'}</h1>
        </div>
        <button type="button" className="ghost" onClick={() => navigate('/alerts')}>All alerts</button>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {alert ? (
        <>
          <p className="disclaimer">{alert.statement}</p>
          <dl className="fact-grid">
            <div><dt>Detected</dt><dd>{formatDate(alert.detectedAt)}</dd></div>
            <div><dt>Status</dt><dd>{alert.status}</dd></div>
            <div><dt>Medicine</dt><dd>{alert.medicineName || 'Unrecognized product'}</dd></div>
            <div><dt>Expected</dt><dd>{alert.expectedQuantity}</dd></div>
            <div><dt>Observed</dt><dd>{alert.observedQuantity}</dd></div>
            <div><dt>Difference</dt><dd>{alert.difference}</dd></div>
            <div><dt>Investigator</dt><dd>{alert.investigatorName || 'Unassigned'}</dd></div>
          </dl>
          <h2 className="section-label">Evidence</h2>
          {alert.evidence.length === 0 ? <p className="empty">No evidence references yet.</p> : (
            <ul className="feed">
              {alert.evidence.map((item) => <li key={item._id}>{item.kind} · {item.label}</li>)}
            </ul>
          )}
          <h2 className="section-label">Notes</h2>
          {alert.notes.length === 0 ? <p className="empty">No investigation notes yet.</p> : (
            <ul className="feed">
              {alert.notes.map((item, index) => <li key={`${item.at}-${index}`}>{formatDate(item.at)} · {item.name} · {item.text}</li>)}
            </ul>
          )}
          {alert.resolution ? <p>Resolution: {alert.resolution}</p> : null}
          {canWrite && alert.status !== 'RESOLVED' && alert.status !== 'DISMISSED' ? (
            <form className="record-form" onSubmit={async (event) => {
              event.preventDefault();
              try {
                const next = await api.addAlertNote(alertId, note);
                setAlert(next);
                setNote('');
                onToast('Note saved.');
              } catch (err) {
                onToast(err.message, 'danger');
              }
            }}
            >
              <label className="wide">Investigation note<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label>
              <div className="dialog-actions wide">
                <button type="button" className="ghost" onClick={() => save({ investigator: actor._id, status: 'UNDER_REVIEW' }, 'Review started.')}>Start review</button>
                <button type="submit" className="ghost">Save note</button>
              </div>
              <label className="wide">Resolution<textarea value={resolution} onChange={(event) => setResolution(event.target.value)} rows={3} /></label>
              <div className="dialog-actions wide">
                <button type="button" className="solid" onClick={() => save({ status: 'RESOLVED', resolution }, 'Alert resolved.')}>Resolve</button>
                <button type="button" className="ghost" onClick={() => save({ status: 'DISMISSED', resolution }, 'Alert dismissed.')}>Dismiss</button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
