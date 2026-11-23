import { useEffect, useState } from 'react';
import { api } from '../api';
import { MEDICINE_FORMS, medicineLabel } from '../format';

const CATEGORIES = [
  'Analgesic', 'Antibiotic', 'Antihistamine', 'Antacid', 'Antihypertensive',
  'Antidiabetic', 'Vitamin', 'Respiratory', 'Dermatological', 'Other',
];

const EMPTY = {
  brandName: '',
  genericName: '',
  activeIngredient: '',
  strength: '',
  form: 'Tablet',
  category: '',
  manufacturer: '',
  barcode: '',
  description: '',
  storageInstructions: '',
  prescriptionRequired: false,
  minimumStock: '0',
};

function splitCsv(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else current += char;
  }
  cells.push(current);
  return cells;
}

function rowsFromText(text) {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : parsed.medicines || [];
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const headers = splitCsv(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, splitCsv(line)[index] || ''])));
}

export function MedicineCatalog({ onRefresh, onToast, canWrite = true }) {
  const [query, setQuery] = useState('');
  const [generic, setGeneric] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState('');
  const [active, setActive] = useState('true');
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      setLoading(true);
      api.medicines({
        q: query.trim(),
        generic: generic.trim(),
        barcode: barcode.trim(),
        category,
        form,
        active: active === 'true' ? '' : active,
      })
        .then((list) => {
          if (!ignore) setRows(list);
        })
        .catch((error) => {
          if (!ignore) onToast(error.message, 'danger');
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, generic, barcode, category, form, active, onToast]);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startEdit(medicine) {
    setEditingId(medicine._id);
    setDraft({
      brandName: medicine.brandName || medicine.name,
      genericName: medicine.genericName || '',
      activeIngredient: medicine.activeIngredient || '',
      strength: medicine.strength || '',
      form: medicine.form,
      category: medicine.category || '',
      manufacturer: medicine.manufacturer || '',
      barcode: medicine.barcode || '',
      description: medicine.description || '',
      storageInstructions: medicine.storageInstructions || '',
      prescriptionRequired: medicine.prescriptionRequired === true,
      minimumStock: String(medicine.minimumStock ?? 0),
    });
  }

  function resetForm() {
    setEditingId('');
    setDraft(EMPTY);
  }

  async function reload() {
    const list = await api.medicines({
      q: query.trim(),
      generic: generic.trim(),
      barcode: barcode.trim(),
      category,
      form,
      active: active === 'true' ? '' : active,
    });
    setRows(list);
    await onRefresh?.();
  }

  async function submit(event) {
    event.preventDefault();
    const body = {
      ...draft,
      minimumStock: Number(draft.minimumStock || 0),
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.updateMedicine(editingId, body);
        onToast('Medicine updated.');
      } else {
        await api.createMedicine(body);
        onToast('Medicine added to the catalog.');
      }
      resetForm();
      await reload();
    } catch (error) {
      onToast(error.message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function confirmActive() {
    if (!pending) return;
    try {
      await api.setMedicineActive(pending._id, !pending.active);
      setPending(null);
      await reload();
      onToast(pending.active ? `${pending.name} is inactive.` : `${pending.name} is active.`);
    } catch (error) {
      onToast(error.message, 'danger');
    }
  }

  async function exportCatalog() {
    try {
      const response = await fetch('/api/medicines/export', { credentials: 'include' });
      if (!response.ok) throw new Error('The catalog could not be exported');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'medicine-catalog.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onToast(error.message, 'danger');
    }
  }

  async function importCatalog(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const medicines = rowsFromText(text).map((row) => ({
        ...row,
        brandName: row.brandName || row.name,
        prescriptionRequired: row.prescriptionRequired === true || row.prescriptionRequired === 'true',
        minimumStock: row.minimumStock === '' || row.minimumStock == null ? 0 : Number(row.minimumStock),
      }));
      const result = await api.importMedicines(medicines);
      await reload();
      onToast(`Imported ${result.created}. ${result.skipped.length} duplicates or invalid rows were skipped.`);
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
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={exportCatalog}>Export</button>
          {canWrite ? (
            <label className="ghost file-btn">
              Import
              <input className="sr" type="file" accept=".csv,.json,text/csv,application/json" onChange={importCatalog} />
            </label>
          ) : null}
        </div>
      </header>
      <p className="lede">Batch quantities stay on the stock records. This catalog stores the medicine itself, including the minimum level that raises a low-stock alert.</p>

      {canWrite ? (
        <form className="record-form" onSubmit={submit}>
          <label>
            Brand name
            <input value={draft.brandName} onChange={(event) => update('brandName', event.target.value)} required maxLength={80} />
          </label>
          <label>
            Generic name
            <input value={draft.genericName} onChange={(event) => update('genericName', event.target.value)} maxLength={80} />
          </label>
          <label>
            Active ingredient
            <input value={draft.activeIngredient} onChange={(event) => update('activeIngredient', event.target.value)} maxLength={80} />
          </label>
          <label>
            Strength
            <input value={draft.strength} onChange={(event) => update('strength', event.target.value)} maxLength={40} placeholder="500 mg" />
          </label>
          <label>
            Dosage form
            <select value={draft.form} onChange={(event) => update('form', event.target.value)}>
              {MEDICINE_FORMS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Category
            <select value={draft.category} onChange={(event) => update('category', event.target.value)}>
              <option value="">No category</option>
              {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Manufacturer
            <input value={draft.manufacturer} onChange={(event) => update('manufacturer', event.target.value)} maxLength={120} />
          </label>
          <label>
            Barcode
            <input value={draft.barcode} onChange={(event) => update('barcode', event.target.value)} maxLength={40} />
          </label>
          <label>
            Minimum stock
            <input value={draft.minimumStock} onChange={(event) => update('minimumStock', event.target.value)} inputMode="numeric" min="0" />
          </label>
          <label>
            Prescription
            <select value={draft.prescriptionRequired ? 'yes' : 'no'} onChange={(event) => update('prescriptionRequired', event.target.value === 'yes')}>
              <option value="no">Not required</option>
              <option value="yes">Required</option>
            </select>
          </label>
          <label className="wide">
            Description
            <textarea value={draft.description} onChange={(event) => update('description', event.target.value)} rows={2} maxLength={2000} />
          </label>
          <label className="wide">
            Storage instructions
            <textarea value={draft.storageInstructions} onChange={(event) => update('storageInstructions', event.target.value)} rows={2} maxLength={500} />
          </label>
          <div className="dialog-actions wide">
            {editingId ? <button type="button" className="ghost" onClick={resetForm}>Cancel</button> : null}
            <button type="submit" className="solid" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save medicine' : 'Add medicine'}</button>
          </div>
        </form>
      ) : null}

      <div className="filters">
        <label className="search">
          <span className="sr">Search by medicine name</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Brand name or medicine ID" />
        </label>
        <label>
          Generic name
          <input value={generic} onChange={(event) => setGeneric(event.target.value)} />
        </label>
        <label>
          Barcode
          <input value={barcode} onChange={(event) => setBarcode(event.target.value)} />
        </label>
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Dosage form
          <select value={form} onChange={(event) => setForm(event.target.value)}>
            <option value="">All forms</option>
            {MEDICINE_FORMS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && rows.length === 0 ? <p className="empty">No medicines match that search.</p> : null}
      {!loading && rows.length > 0 ? (
        <>
          <div className="table-wrap plan-table">
            <table className="ledger">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Brand</th>
                  <th>Generic</th>
                  <th>Strength</th>
                  <th>Form</th>
                  <th>Category</th>
                  <th>Minimum</th>
                  <th><span className="sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((medicine) => (
                  <tr key={medicine._id}>
                    <td>{medicine.medicineCode || '—'}</td>
                    <td className="name-cell">{medicineLabel(medicine)}</td>
                    <td>{medicine.genericName || '—'}</td>
                    <td>{medicine.strength || '—'}</td>
                    <td>{medicine.form}</td>
                    <td>{medicine.category || '—'}</td>
                    <td>{medicine.minimumStock}</td>
                    <td className="row-actions">
                      {canWrite ? (
                        <>
                          <button type="button" className="text-btn" onClick={() => startEdit(medicine)}>Edit</button>
                          <button type="button" className="text-btn" onClick={() => setPending(medicine)}>
                            {medicine.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="plan-cards">
            {rows.map((medicine) => (
              <article key={medicine._id} className="plan-card">
                <strong>{medicine.brandName || medicine.name}</strong>
                <span>{medicine.medicineCode} · {medicine.genericName || 'No generic name'}</span>
                <span>{medicine.strength || '—'} · {medicine.form} · {medicine.category || 'Uncategorised'}</span>
                {canWrite ? (
                  <span className="dialog-actions">
                    <button type="button" className="text-btn" onClick={() => startEdit(medicine)}>Edit</button>
                    <button type="button" className="text-btn" onClick={() => setPending(medicine)}>
                      {medicine.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}

      {pending ? (
        <div className="scrim" role="presentation" onMouseDown={() => setPending(null)}>
          <div className="dialog dialog-narrow" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <h2>{pending.active ? 'Deactivate' : 'Activate'} {pending.name}?</h2>
            <p>{pending.active ? 'New prescriptions and orders will no longer offer it. Stock already received stays on its batches.' : 'It will show in the catalog and on new orders again.'}</p>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className="solid" onClick={confirmActive}>{pending.active ? 'Deactivate' : 'Activate'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
