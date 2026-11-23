import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatWhen } from '../format';

export function AuditDesk() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      api.auditLog({ page, action: action.trim(), entity: entity.trim(), q: query.trim() })
        .then((result) => {
          if (ignore) return;
          setRows(result.entries || []);
          setPages(result.pages || 0);
        })
        .catch((err) => {
          if (!ignore) setError(err.message);
        });
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [page, action, entity, query]);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Security</p>
          <h1>Audit log</h1>
        </div>
      </header>
      <p className="lede">Sign-in, record changes, stock movements and shelf scans are listed here. Passwords and session tokens are not stored.</p>
      <div className="filters">
        <label>Action<input value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} /></label>
        <label>Record type<input value={entity} onChange={(event) => { setEntity(event.target.value); setPage(1); }} /></label>
        <label className="search">
          Summary
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        </label>
      </div>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {rows.length === 0 ? <p className="empty">No audit records match that filter.</p> : (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Summary</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td>{formatWhen(row.createdAt)}</td>
                  <td>{row.userName || '—'}</td>
                  <td>{row.action}</td>
                  <td>{row.entityType}</td>
                  <td>{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <div className="pager">
          <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>{page} of {pages}</span>
          <button type="button" className="ghost" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      ) : null}
    </section>
  );
}
