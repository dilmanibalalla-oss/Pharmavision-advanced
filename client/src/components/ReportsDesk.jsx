import { useEffect, useState } from 'react';
import { api } from '../api';

export function ReportsDesk() {
  const [catalog, setCatalog] = useState([]);
  const [key, setKey] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.reportList().then((result) => {
      const reports = result.reports || [];
      setCatalog(reports);
      setKey((current) => current || reports[0]?.key || '');
    }).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!key) return undefined;
    let ignore = false;
    api.report(key, { from, to, q: query.trim(), page })
      .then((result) => {
        if (!ignore) setReport(result);
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [key, from, to, query, page]);

  const cards = report ? Object.entries(report.summary || {}).filter(([, value]) => typeof value === 'number') : [];
  const series = report?.summary?.series || [];

  async function download(format) {
    const response = await fetch(`/api/reports/${key}/export?format=${format}&from=${from}&to=${to}&q=${encodeURIComponent(query)}`, { credentials: 'include' });
    if (!response.ok) {
      setError('The report could not be exported');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${key}-report.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">PharmaVision</p>
          <h1>Reports</h1>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => download('csv')} disabled={!key}>CSV</button>
          <button type="button" className="ghost" onClick={() => download('pdf')} disabled={!key}>PDF</button>
        </div>
      </header>
      <p className="lede">Figures come from the clinic records for the dates you choose. Exported files use patient IDs and leave out contact details.</p>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      <div className="filters">
        <label>
          Report
          <select value={key} onChange={(event) => { setKey(event.target.value); setPage(1); }}>
            {catalog.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
          </select>
        </label>
        <label>From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label>To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
        <label className="search">
          Search
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        </label>
      </div>
      {cards.length > 0 ? (
        <div className="summary-cards">
          {cards.map(([name, value]) => (
            <article key={name} className="summary-card">
              <strong>{value}</strong>
              <span>{name}</span>
            </article>
          ))}
        </div>
      ) : null}
      {series.length > 0 ? <Bars items={series} /> : null}
      {report?.rows?.length ? (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>{report.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {report.rows.map((row, index) => (
                <tr key={index}>
                  {report.columns.map((column) => <td key={column.key}>{row[column.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="empty">Nothing was recorded in that range.</p>}
      {report && report.pages > 1 ? (
        <div className="pager">
          <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>{page} of {report.pages}</span>
          <button type="button" className="ghost" disabled={page >= report.pages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      ) : null}
    </section>
  );
}

function Bars({ items }) {
  const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
  return (
    <div className="bars" aria-label="Report chart">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span>{item.label}</span>
          <span className="bar"><span style={{ width: `${(Number(item.value) || 0) / max * 100}%` }} /></span>
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function daysAgo(days) {
  const date = new Date(Date.now() - days * 86400000);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
