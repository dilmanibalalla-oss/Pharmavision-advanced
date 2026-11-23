import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatDate, formatWhen, treatmentLabel } from '../format';

export function DispenseDesk({ onToast }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [prescribed, setPrescribed] = useState('');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load(search = query) {
    return Promise.all([
      api.prescriptions({ q: search.trim() }),
      api.dispensingHistory({ q: search.trim() }),
    ]).then(([queue, past]) => {
      setRows(queue.prescriptions || []);
      setHistory(past.dispensings || []);
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

  function choose(row) {
    setSelected(row);
    setPlan(null);
    setQuantity(String(row.remainingQuantity || row.prescribedQuantity || 1));
    setPrescribed(row.prescribedQuantity ? String(row.prescribedQuantity) : '');
  }

  async function preview(event) {
    event.preventDefault();
    setError('');
    try {
      const next = await api.dispensePlan(selected.medicine, quantity);
      setPlan(next);
      if (!next.enough) setError('There is not enough stock to dispense that quantity.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api.dispense({
        requestId: crypto.randomUUID(),
        patient: selected.patient,
        prescription: selected._id,
        quantity: Number(quantity),
        ...(prescribed ? { prescribedQuantity: Number(prescribed) } : {}),
      });
      onToast(saved.status === 'COMPLETED' ? 'Prescription fully dispensed.' : 'Partial quantity dispensed.');
      setPlan(null);
      await load();
      setSelected(null);
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
          <p className="kicker">Pharmacy</p>
          <h1>Dispensing</h1>
        </div>
      </header>
      <p className="lede">Each dispense is tied to the prescription line, the patient, the pharmacist, and the batches taken by earliest expiry.</p>
      <div className="filters">
        <label className="search">
          <span className="sr">Search prescriptions</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patient, patient ID, or prescription ID" />
        </label>
      </div>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {rows.length === 0 ? <p className="empty">No prescriptions match that search.</p> : (
        <ul className="feed">
          {rows.map((row) => (
            <li key={row._id}>
              <button type="button" className="text-btn" onClick={() => choose(row)}>
                {row.patientName}{row.patientCode ? ` · ${row.patientCode}` : ''} · {treatmentLabel(row)} · {row.status}
                {row.prescribedQuantity ? ` · ${row.dispensedQuantity}/${row.prescribedQuantity}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <form className="record-form" onSubmit={preview}>
          <h2 className="section-label wide">{selected.patientName} · {treatmentLabel(selected)}</h2>
          <p className="wide">Prescription {selected._id}. {selected.notes || 'No instructions on the line.'}</p>
          {selected.prescribedQuantity == null ? (
            <label>
              Prescribed quantity
              <input value={prescribed} onChange={(event) => setPrescribed(event.target.value)} inputMode="numeric" required />
            </label>
          ) : (
            <p>Still to dispense: {selected.remainingQuantity}</p>
          )}
          <label>
            Quantity to dispense now
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" required />
          </label>
          <div className="dialog-actions wide">
            <button type="submit" className="ghost">Check batches</button>
            <button type="button" className="solid" disabled={saving || !plan?.enough} onClick={submit}>Dispense</button>
          </div>
          {plan ? (
            <div className="wide">
              <p>{plan.enough ? 'Earliest expiry batches for this quantity.' : `Only ${plan.available} can be filled.`}</p>
              <ul className="feed">
                {plan.allocations.map((item) => (
                  <li key={item.batch}>{item.batchNumber} · expires {formatDate(item.expiryDate)} · take {item.quantity} from {item.storageLocation}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </form>
      ) : null}
      <h2 className="section-label">Dispensing history</h2>
      {history.length === 0 ? <p className="empty">No dispensing records yet.</p> : (
        <ul className="feed">
          {history.map((row) => (
            <li key={row._id}>
              {formatWhen(row.createdAt)} · {row.dispensingCode} · {row.patientName} · {row.medicineName} · {row.quantity} · {row.status} · {row.pharmacistName}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
