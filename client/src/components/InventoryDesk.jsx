import { useEffect, useState } from 'react';
import { can } from '../access';
import { api } from '../api';
import { formatDate } from '../format';

const TYPES = [
  ['DAMAGED', 'Damaged'],
  ['RETURN', 'Returned'],
  ['AUTHORIZED_ADJUSTMENT', 'Authorized adjustment'],
  ['TRANSFER', 'Transfer'],
  ['EXPIRED', 'Expired'],
];

export function InventoryDesk({ actor, onToast }) {
  const canWrite = can(actor.role, 'inventory', 'write');
  const [view, setView] = useState('stock');
  const [query, setQuery] = useState('');
  const [stock, setStock] = useState([]);
  const [batches, setBatches] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [movements, setMovements] = useState([]);
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      const stockCall = api.inventoryStock({ q: query.trim(), low: view === 'low' ? 'true' : '' });
      const batchCall = api.inventoryBatches({ expiry, onHand: 'true', batchNumber: query.trim() });
      const alertCall = api.inventoryAlerts();
      const movementCall = api.inventoryMovements({ q: query.trim() });
      Promise.all([stockCall, batchCall, alertCall, movementCall])
        .then(([stockRows, batchRows, alertRows, movementRows]) => {
          if (ignore) return;
          setStock(stockRows.stock || []);
          setBatches(batchRows.batches || []);
          setAlerts(alertRows);
          setMovements(movementRows.movements || []);
          setError('');
        })
        .catch((err) => {
          if (!ignore) setError(err.message);
        });
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, expiry, view, revision]);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Pharmacy</p>
          <h1>Inventory</h1>
        </div>
      </header>
      <p className="lede">On-hand quantity is the sum of batch balances. A catalog row does not hold the stock.</p>
      <div className="segment" role="group" aria-label="Inventory views">
        <button type="button" className={view === 'stock' ? 'ghost is-on' : 'ghost'} onClick={() => setView('stock')}>By medicine</button>
        <button type="button" className={view === 'batches' ? 'ghost is-on' : 'ghost'} onClick={() => setView('batches')}>By batch</button>
        <button type="button" className={view === 'alerts' ? 'ghost is-on' : 'ghost'} onClick={() => setView('alerts')}>Alerts</button>
        <button type="button" className={view === 'movements' ? 'ghost is-on' : 'ghost'} onClick={() => setView('movements')}>Movements</button>
      </div>
      <div className="filters">
        <label className="search">
          <span className="sr">Search stock</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Medicine or batch" />
        </label>
        {view === 'batches' ? (
          <label>
            Expiry
            <select value={expiry} onChange={(event) => setExpiry(event.target.value)}>
              <option value="">All dates</option>
              <option value="near">Near expiry</option>
              <option value="expired">Expired</option>
            </select>
          </label>
        ) : null}
      </div>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {view === 'alerts' && alerts ? (
        <>
          <h2 className="section-label">Low stock</h2>
          {alerts.lowStock.length === 0 ? <p className="empty">No medicine is at or below its minimum.</p> : (
            <ul className="feed">{alerts.lowStock.map((row) => <li key={row.medicine}>{row.medicineName} · {row.onHand} on hand · minimum {row.minimumStock}</li>)}</ul>
          )}
          <h2 className="section-label">Near expiry</h2>
          {alerts.nearExpiry.length === 0 ? <p className="empty">No batch expires in the next 30 days.</p> : (
            <ul className="feed">{alerts.nearExpiry.map((row) => <li key={row._id}>{row.medicineName} · {row.batchNumber} · {formatDate(row.expiryDate)} · {row.remainingQuantity} left</li>)}</ul>
          )}
          <h2 className="section-label">Expired</h2>
          {alerts.expired.length === 0 ? <p className="empty">No expired quantity is still on hand.</p> : (
            <ul className="feed">{alerts.expired.map((row) => <li key={row._id}>{row.medicineName} · {row.batchNumber} · {formatDate(row.expiryDate)} · {row.remainingQuantity} left</li>)}</ul>
          )}
        </>
      ) : null}
      {view === 'stock' ? <StockTable rows={stock} /> : null}
      {view === 'batches' ? <BatchTable rows={batches} /> : null}
      {view === 'movements' ? (
        <>
          <MovementTable rows={movements} />
          {canWrite ? (
            <MovementForm
              onToast={onToast}
              revision={revision}
              onSaved={() => setRevision((current) => current + 1)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function StockTable({ rows }) {
  if (rows.length === 0) return <p className="empty">No stock is on hand.</p>;
  return (
    <div className="table-wrap plan-table">
      <table className="ledger">
        <thead>
          <tr><th>Medicine</th><th>On hand</th><th>Minimum</th><th>Nearest expiry</th><th>Batches</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.medicine}>
              <td className="name-cell">{row.medicineName} · {row.strength}</td>
              <td>{row.onHand}{row.low ? ' · low' : ''}</td>
              <td>{row.minimumStock}</td>
              <td>{formatDate(row.nearestExpiry)}</td>
              <td>{row.batches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchTable({ rows }) {
  if (rows.length === 0) return <p className="empty">No batches match that filter.</p>;
  return (
    <div className="table-wrap plan-table">
      <table className="ledger">
        <thead>
          <tr><th>Batch</th><th>Medicine</th><th>Expiry</th><th>Remaining</th><th>Location</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id}>
              <td>{row.batchNumber}</td>
              <td className="name-cell">{row.medicineName}</td>
              <td>{formatDate(row.expiryDate)}</td>
              <td>{row.remainingQuantity}</td>
              <td>{row.storageLocation}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementTable({ rows }) {
  if (rows.length === 0) return <p className="empty">No stock movements are recorded.</p>;
  return (
    <ul className="feed">
      {rows.map((row) => (
        <li key={row._id}>
          {formatDate(row.createdAt)} · {row.type} · {row.medicineName} · {row.batchNumber} · {row.direction} {row.quantity}
          {row.reason ? ` · ${row.reason}` : ''} · {row.userName}
        </li>
      ))}
    </ul>
  );
}

function MovementForm({ onToast, onSaved, revision }) {
  const [choices, setChoices] = useState([]);
  const [type, setType] = useState('DAMAGED');
  const [batch, setBatch] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [direction, setDirection] = useState('OUT');
  const [toLocation, setToLocation] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    api.inventoryBatches({ onHand: 'true' })
      .then((result) => {
        if (!ignore) setChoices(result.batches || []);
      })
      .catch(() => {
        if (!ignore) setChoices([]);
      });
    return () => {
      ignore = true;
    };
  }, [revision]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.postMovement({
        requestId: crypto.randomUUID(),
        type,
        batch,
        quantity: Number(quantity),
        direction: type === 'RETURN' || type === 'AUTHORIZED_ADJUSTMENT' ? direction : undefined,
        toLocation: type === 'TRANSFER' ? toLocation : undefined,
        reason,
      });
      onToast('Stock movement recorded.');
      setReason('');
      onSaved?.();
    } catch (error) {
      onToast(error.message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="record-form" onSubmit={submit}>
      <h2 className="section-label wide">Record a movement</h2>
      <label>
        Type
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>
        Batch
        <select value={batch} onChange={(event) => setBatch(event.target.value)} required>
          <option value="">Select a batch</option>
          {choices.map((item) => (
            <option key={item._id} value={item._id}>{item.batchNumber} · {item.medicineName} · {item.remainingQuantity}</option>
          ))}
        </select>
      </label>
      <label>Quantity<input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" required /></label>
      {type === 'RETURN' || type === 'AUTHORIZED_ADJUSTMENT' ? (
        <label>
          Direction
          <select value={direction} onChange={(event) => setDirection(event.target.value)}>
            <option value="OUT">Out of stock</option>
            <option value="IN">Back into stock</option>
          </select>
        </label>
      ) : null}
      {type === 'TRANSFER' ? (
        <label>New location<input value={toLocation} onChange={(event) => setToLocation(event.target.value)} required /></label>
      ) : null}
      <label className="wide">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} required maxLength={500} /></label>
      <div className="dialog-actions wide">
        <button type="submit" className="solid" disabled={saving}>Record movement</button>
      </div>
    </form>
  );
}
