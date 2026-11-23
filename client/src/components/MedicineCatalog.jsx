import { useMemo, useState } from 'react';
import { api } from '../api';
import { MEDICINE_FORMS, medicineLabel } from '../format';

const EMPTY = { name: '', strength: '', form: 'Tablet' };

export function MedicineCatalog({ medicines, onRefresh, onToast, canWrite = true }) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return medicines;
    return medicines.filter((medicine) => medicineLabel(medicine).toLowerCase().includes(needle));
  }, [medicines, query]);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startEdit(medicine) {
    setEditingId(medicine._id);
    setDraft({ name: medicine.name, strength: medicine.strength, form: medicine.form });
  }

  function resetForm() {
    setEditingId('');
    setDraft(EMPTY);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.updateMedicine(editingId, draft);
        onToast('Medicine updated.');
      } else {
        await api.createMedicine(draft);
        onToast('Medicine added to the catalog.');
      }
      resetForm();
      await onRefresh();
    } catch (error) {
      onToast(error.message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await api.deleteMedicine(pendingDelete._id);
      if (editingId === pendingDelete._id) resetForm();
      setPendingDelete(null);
      await onRefresh();
      onToast('Medicine removed from the catalog. Past treatments keep the name that was recorded.');
    } catch (error) {
      onToast(error.message, 'danger');
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Catalog</p>
          <h1>Medicines</h1>
        </div>
        <p className="lede">
          Treatments are chosen from this list. Add a medicine here and it shows up in every patient chart.
        </p>
      </header>

      {canWrite ? (
      <form className="medicine-form" onSubmit={submit}>
        <label>
          Name
          <input value={draft.name} onChange={(event) => update('name', event.target.value)} required maxLength={80} />
        </label>
        <label>
          Strength
          <input value={draft.strength} onChange={(event) => update('strength', event.target.value)} maxLength={40} placeholder="500 mg" />
        </label>
        <label>
          Form
          <select value={draft.form} onChange={(event) => update('form', event.target.value)}>
            {MEDICINE_FORMS.map((form) => (
              <option key={form}>{form}</option>
            ))}
          </select>
        </label>
        <div className="dialog-actions medicine-actions">
          {editingId ? (
            <button type="button" className="ghost" onClick={resetForm}>Cancel</button>
          ) : null}
          <button type="submit" className="solid" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save medicine' : 'Add medicine'}
          </button>
        </div>
      </form>
      ) : null}

      <div className="toolbar">
        <label className="search">
          <span className="sr">Search medicines</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the catalog"
          />
        </label>
        <p className="count">{shown.length} shown</p>
      </div>

      {shown.length === 0 ? (
        <p className="empty">No medicines match that search.</p>
      ) : (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Name</th>
                <th>Strength</th>
                <th>Form</th>
                <th><span className="sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((medicine) => (
                <tr key={medicine._id}>
                  <td className="name-cell">{medicine.name}</td>
                  <td>{medicine.strength || <span className="muted">—</span>}</td>
                  <td>{medicine.form}</td>
                  <td className="row-actions">
                    {canWrite ? (
                      <>
                        <button type="button" className="text-btn" onClick={() => startEdit(medicine)}>Edit</button>
                        <button type="button" className="text-btn danger-text" onClick={() => setPendingDelete(medicine)}>Delete</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingDelete ? (
        <div className="scrim" role="presentation" onMouseDown={() => setPendingDelete(null)}>
          <div
            className="dialog dialog-narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-medicine-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="delete-medicine-title">Remove {pendingDelete.name}?</h2>
            <p>New treatments will no longer offer it. Charts already written keep the recorded name.</p>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setPendingDelete(null)}>Keep</button>
              <button type="button" className="danger" onClick={confirmDelete}>Remove medicine</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
