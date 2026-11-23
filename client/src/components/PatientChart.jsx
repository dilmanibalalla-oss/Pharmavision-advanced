import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatWhen, medicineLabel, treatmentLabel } from '../format';

export function PatientChart({ patient, medicines, onClose, onEdit, onUpdated, onToast, canWrite = true }) {
  const [medicineId, setMedicineId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    setMedicineId('');
    setNotes('');
  }, [patient._id, patient.visitCount]);

  const latest = patient.visits[patient.visits.length - 1];
  const canUndo = latest && latest.treatments.length === 0;
  const history = patient.visits.map((visit, index) => ({ ...visit, number: index + 1 })).reverse();

  async function addTreatment(event) {
    event.preventDefault();
    if (!medicineId) return;
    setSaving(true);
    try {
      const updated = await api.addTreatment(patient._id, { medicineId, notes });
      onUpdated(updated);
      setMedicineId('');
      setNotes('');
      onToast('Treatment saved from the medicine catalog.');
    } catch (error) {
      onToast(error.message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function removeTreatment(treatmentId) {
    try {
      const updated = await api.removeTreatment(patient._id, treatmentId);
      onUpdated(updated);
      onToast('Treatment removed from this visit.');
    } catch (error) {
      onToast(error.message, 'danger');
    }
  }

  async function undoVisit() {
    setUndoing(true);
    try {
      const updated = await api.undoVisit(patient._id);
      onUpdated(updated);
      onToast(`Visit undone. ${updated.name} has ${updated.visitCount} visits.`);
      onClose();
    } catch (error) {
      onToast(error.message, 'danger');
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="scrim chart-scrim" role="presentation" onMouseDown={onClose}>
      <aside
        className="chart"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="chart-top">
          <p className="kicker">Open chart</p>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
        <h2 id="chart-title">{patient.name}</h2>
        <dl className="facts">
          <div>
            <dt>Age</dt>
            <dd>{patient.age}</dd>
          </div>
          <div>
            <dt>Visits</dt>
            <dd>{patient.visitCount}</dd>
          </div>
          <div className="fact-wide">
            <dt>Address</dt>
            <dd>{patient.address}</dd>
          </div>
        </dl>

        <section className="allergy-panel">
          <h3>Allergy</h3>
          {patient.allergies.length === 0 ? (
            <p className="muted">No allergies recorded.</p>
          ) : (
            <div className="chips">
              {patient.allergies.map((allergy) => (
                <span className="chip chip-static" key={allergy}>{allergy}</span>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3>This visit</h3>
          <p className="hint">
            {latest
              ? `Latest consultation ${formatWhen(latest.visitedAt)}. Visit count is ${patient.visitCount}.`
              : 'No consultation has been recorded yet.'}
            {canWrite ? ' Choose the medicine from the catalog.' : ''}
          </p>
          {canWrite ? (
          <form onSubmit={addTreatment} className="stack">
            <label>
              Medicine
              <select value={medicineId} onChange={(event) => setMedicineId(event.target.value)} required>
                <option value="">Select from the catalog</option>
                {medicines.map((medicine) => (
                  <option key={medicine._id} value={medicine._id}>
                    {medicineLabel(medicine)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Instructions
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                maxLength={400}
                placeholder="Optional directions for this medicine"
              />
            </label>
            <button type="submit" className="solid" disabled={saving || medicines.length === 0}>
              {saving ? 'Saving…' : 'Add treatment'}
            </button>
          </form>
          ) : null}
          {latest?.treatments?.length ? (
            <ul className="treatment-list">
              {latest.treatments.map((treatment) => (
                <li key={treatment._id}>
                  <div>
                    <strong>{treatmentLabel(treatment)}</strong>
                    {treatment.notes ? <p>{treatment.notes}</p> : null}
                  </div>
                  {canWrite ? (
                    <button type="button" className="text-btn danger-text" onClick={() => removeTreatment(treatment._id)}>
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No medicine recorded for this visit yet.</p>
          )}
          {canWrite && canUndo ? (
            <button type="button" className="text-btn undo" onClick={undoVisit} disabled={undoing}>
              {undoing ? 'Undoing…' : 'Undo this visit'}
            </button>
          ) : null}
        </section>

        <section>
          <h3>Past treatment</h3>
          {history.slice(1).every((visit) => visit.treatments.length === 0) ? (
            <p className="muted">No earlier treatments.</p>
          ) : (
            <ol className="timeline">
              {history.slice(1).map((visit) => (
                <li key={visit._id}>
                  <p className="visit-kicker">Visit {visit.number} · {formatWhen(visit.visitedAt)}</p>
                  {visit.treatments.length === 0 ? (
                    <p className="muted">No medicine on this visit.</p>
                  ) : (
                    <ul className="treatment-list">
                      {visit.treatments.map((treatment) => (
                        <li key={treatment._id}>
                          <div>
                            <strong>{treatmentLabel(treatment)}</strong>
                            {treatment.notes ? <p>{treatment.notes}</p> : null}
                          </div>
                          {canWrite ? (
                            <button type="button" className="text-btn danger-text" onClick={() => removeTreatment(treatment._id)}>
                              Remove
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {canWrite ? (
          <div className="chart-footer">
            <button type="button" className="ghost" onClick={() => onEdit(patient)}>Edit details</button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
