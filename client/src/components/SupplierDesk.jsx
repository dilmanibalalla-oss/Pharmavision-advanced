import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can } from '../access';
import { api } from '../api';
import { formatDate } from '../format';

const EMPTY = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  registration: '',
  notes: '',
};

export function SupplierDesk({ actor, onToast }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const canWrite = can(actor.role, 'suppliers', 'write');
  const parts = pathname.split('/').filter(Boolean);
  const id = parts[1] || '';
  const action = parts[2] || '';

  useEffect(() => {
    if (!canWrite && (id === 'new' || action === 'edit')) navigate('/suppliers', { replace: true });
  }, [canWrite, id, action, navigate]);

  if (id === 'new') return <SupplierForm onToast={onToast} />;
  if (id && action === 'edit') return <SupplierForm supplierId={id} onToast={onToast} />;
  if (id) return <SupplierView supplierId={id} canWrite={canWrite} onToast={onToast} />;
  return <SupplierList canWrite={canWrite} />;
}

function SupplierList({ canWrite }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      api.suppliers({ q: query.trim(), status })
        .then((result) => {
          if (!ignore) setRows(result.suppliers || []);
        })
        .catch((err) => {
          if (!ignore) setError(err.message);
        });
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, status]);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Purchasing</p>
          <h1>Suppliers</h1>
        </div>
        {canWrite ? <button type="button" className="solid" onClick={() => navigate('/suppliers/new')}>Register supplier</button> : null}
      </header>
      <div className="filters">
        <label className="search">
          <span className="sr">Search suppliers</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, ID, contact, phone, or email" />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </div>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {rows.length === 0 ? <p className="empty">No suppliers match that search.</p> : (
        <div className="table-wrap plan-table">
          <table className="ledger">
            <thead>
              <tr>
                <th>ID</th>
                <th>Supplier</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="is-clickable" onClick={() => navigate(`/suppliers/${row._id}`)}>
                  <td>{row.supplierCode}</td>
                  <td className="name-cell">{row.name}</td>
                  <td>{row.contactPerson}</td>
                  <td>{row.phone || row.email}</td>
                  <td>{row.status === 'ACTIVE' ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="plan-cards">
        {rows.map((row) => (
          <button key={row._id} type="button" className="plan-card" onClick={() => navigate(`/suppliers/${row._id}`)}>
            <strong>{row.name}</strong>
            <span>{row.supplierCode} · {row.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
            <span>{row.contactPerson} · {row.phone || row.email}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SupplierForm({ supplierId, onToast }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(Boolean(supplierId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supplierId) return undefined;
    let ignore = false;
    api.supplier(supplierId)
      .then((record) => {
        if (ignore) return;
        setForm({
          name: record.name,
          contactPerson: record.contactPerson,
          phone: record.phone,
          email: record.email,
          address: record.address,
          registration: record.registration,
          notes: record.notes,
        });
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [supplierId]);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = supplierId ? await api.updateSupplier(supplierId, form) : await api.createSupplier(form);
      onToast(supplierId ? 'Supplier saved.' : 'Supplier registered.');
      navigate(`/suppliers/${saved._id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{supplierId ? 'Update' : 'Register'}</p>
          <h1>{supplierId ? 'Edit supplier' : 'New supplier'}</h1>
        </div>
        <button type="button" className="ghost" onClick={() => navigate(supplierId ? `/suppliers/${supplierId}` : '/suppliers')}>Back</button>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading ? <p className="empty">Opening the daybook…</p> : (
        <form className="record-form" onSubmit={submit}>
          <label>Supplier name<input value={form.name} onChange={update('name')} required maxLength={160} /></label>
          <label>Contact person<input value={form.contactPerson} onChange={update('contactPerson')} required maxLength={120} /></label>
          <label>Phone<input value={form.phone} onChange={update('phone')} maxLength={30} /></label>
          <label>Email<input value={form.email} onChange={update('email')} type="email" maxLength={160} /></label>
          <label className="wide">Address<textarea value={form.address} onChange={update('address')} rows={2} required maxLength={300} /></label>
          <label className="wide">Registration details<input value={form.registration} onChange={update('registration')} maxLength={200} /></label>
          <label className="wide">Notes<textarea value={form.notes} onChange={update('notes')} rows={3} maxLength={2000} /></label>
          <div className="dialog-actions wide">
            <button type="submit" className="solid" disabled={saving}>{supplierId ? 'Save supplier' : 'Register supplier'}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function SupplierView({ supplierId, canWrite, onToast }) {
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    Promise.all([api.supplier(supplierId), api.supplierPurchases(supplierId)])
      .then(([supplier, history]) => {
        if (ignore) return;
        setRecord(supplier);
        setPurchases(history.purchases || []);
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [supplierId]);

  async function toggle() {
    try {
      const next = await api.setSupplierStatus(supplierId, record.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      setRecord(next);
      onToast(next.status === 'ACTIVE' ? `${next.name} is active.` : `${next.name} is inactive.`);
    } catch (err) {
      onToast(err.message, 'danger');
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{record?.supplierCode || 'Supplier'}</p>
          <h1>{record?.name || 'Supplier'}</h1>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => navigate('/suppliers')}>All suppliers</button>
          {canWrite && record ? <button type="button" className="ghost" onClick={() => navigate(`/suppliers/${supplierId}/edit`)}>Edit</button> : null}
          {canWrite && record ? <button type="button" className="solid" onClick={toggle}>{record.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button> : null}
        </div>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {record ? (
        <>
          <dl className="fact-grid">
            <div><dt>Status</dt><dd>{record.status === 'ACTIVE' ? 'Active' : 'Inactive'}</dd></div>
            <div><dt>Contact</dt><dd>{record.contactPerson}</dd></div>
            <div><dt>Phone</dt><dd>{record.phone || '—'}</dd></div>
            <div><dt>Email</dt><dd>{record.email || '—'}</dd></div>
            <div className="wide"><dt>Address</dt><dd>{record.address}</dd></div>
            <div className="wide"><dt>Registration</dt><dd>{record.registration || '—'}</dd></div>
            <div className="wide"><dt>Notes</dt><dd>{record.notes || '—'}</dd></div>
          </dl>
          <h2 className="section-label">Purchase history</h2>
          {purchases.length === 0 ? <p className="empty">No purchase orders are linked to this supplier.</p> : (
            <ul className="feed">
              {purchases.map((order) => (
                <li key={order._id}>
                  <button type="button" className="text-btn" onClick={() => navigate(`/purchases/${order._id}`)}>
                    {order.orderCode} · {formatDate(order.orderDate)} · {order.status} · {order.totalAmount}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
