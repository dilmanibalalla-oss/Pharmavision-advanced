import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can } from '../access';
import { api } from '../api';
import { formatDate, medicineLabel } from '../format';

function todayInput() {
  const date = new Date();
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function PurchaseDesk({ actor, onToast }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const canWrite = can(actor.role, 'purchases', 'write');
  const id = pathname.split('/').filter(Boolean)[1] || '';
  if (id === 'new') return canWrite ? <OrderForm onToast={onToast} /> : <p className="empty">That purchase page is not available.</p>;
  if (id) return <OrderView orderId={id} canWrite={canWrite} onToast={onToast} />;
  return <OrderList canWrite={canWrite} />;
}

function OrderList({ canWrite }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      api.purchaseOrders({ q: query.trim(), status })
        .then((result) => {
          if (!ignore) setRows(result.purchaseOrders || []);
        })
        .catch(() => {
          if (!ignore) setRows([]);
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
          <h1>Purchase orders</h1>
        </div>
        {canWrite ? <button type="button" className="solid" onClick={() => navigate('/purchases/new')}>New purchase order</button> : null}
      </header>
      <div className="filters">
        <label className="search">
          <span className="sr">Search purchase orders</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order ID or supplier" />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      {rows.length === 0 ? <p className="empty">No purchase orders match that search.</p> : (
        <div className="table-wrap plan-table">
          <table className="ledger">
            <thead>
              <tr><th>Order</th><th>Supplier</th><th>Date</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="is-clickable" onClick={() => navigate(`/purchases/${row._id}`)}>
                  <td>{row.orderCode}</td>
                  <td className="name-cell">{row.supplierName}</td>
                  <td>{formatDate(row.orderDate)}</td>
                  <td>{row.totalAmount}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="plan-cards">
        {rows.map((row) => (
          <button key={row._id} type="button" className="plan-card" onClick={() => navigate(`/purchases/${row._id}`)}>
            <strong>{row.orderCode}</strong>
            <span>{row.supplierName}</span>
            <span>{formatDate(row.orderDate)} · {row.status} · {row.totalAmount}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function OrderForm({ onToast }) {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [supplier, setSupplier] = useState('');
  const [orderDate, setOrderDate] = useState(todayInput());
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [items, setItems] = useState([{ medicine: '', quantity: '1', unitCost: '0' }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.suppliers({ status: 'ACTIVE', limit: 50 }), api.medicines()])
      .then(([roster, catalog]) => {
        setSuppliers(roster.suppliers || []);
        setMedicines(catalog || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  function updateItem(index, field, value) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await api.createPurchaseOrder({
        supplier,
        orderDate,
        expectedDelivery: expectedDelivery || null,
        items: items.filter((item) => item.medicine).map((item) => ({
          medicine: item.medicine,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
        })),
      });
      onToast('Purchase order recorded.');
      navigate(`/purchases/${saved._id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Order</p>
          <h1>New purchase order</h1>
        </div>
        <button type="button" className="ghost" onClick={() => navigate('/purchases')}>Back</button>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      <form className="record-form" onSubmit={submit}>
        <label>
          Supplier
          <select value={supplier} onChange={(event) => setSupplier(event.target.value)} required>
            <option value="">Select a supplier</option>
            {suppliers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </label>
        <label>Order date<input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} required /></label>
        <label>Expected delivery<input type="date" value={expectedDelivery} onChange={(event) => setExpectedDelivery(event.target.value)} /></label>
        <div className="wide">
          <p className="field-label">Medicine items</p>
          {items.map((item, index) => (
            <div key={index} className="slot-row">
              <select value={item.medicine} onChange={(event) => updateItem(index, 'medicine', event.target.value)} required>
                <option value="">Medicine</option>
                {medicines.map((medicine) => <option key={medicine._id} value={medicine._id}>{medicineLabel(medicine)}</option>)}
              </select>
              <input value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} inputMode="numeric" aria-label="Ordered quantity" />
              <input value={item.unitCost} onChange={(event) => updateItem(index, 'unitCost', event.target.value)} inputMode="decimal" aria-label="Unit cost" />
            </div>
          ))}
          <button type="button" className="ghost" onClick={() => setItems((current) => [...current, { medicine: '', quantity: '1', unitCost: '0' }])}>Add medicine</button>
        </div>
        <div className="dialog-actions wide">
          <button type="submit" className="solid" disabled={saving}>Record order</button>
        </div>
      </form>
    </section>
  );
}

function OrderView({ orderId, canWrite, onToast }) {
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    return api.purchaseOrder(orderId).then((record) => {
      setOrder(record);
      setBatches((record.items || []).filter((item) => item.outstanding > 0).map((item) => ({
        medicine: item.medicine,
        medicineName: item.medicineName,
        outstanding: item.outstanding,
        batchNumber: '',
        manufacturingDate: '',
        expiryDate: '',
        quantity: String(item.outstanding),
        storageLocation: 'Main pharmacy',
      })));
    });
  }

  useEffect(() => {
    let ignore = false;
    load().catch((err) => {
      if (!ignore) setError(err.message);
    });
    return () => {
      ignore = true;
    };
  }, [orderId]);

  function updateBatch(index, field, value) {
    setBatches((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  async function receive(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.receivePurchase(orderId, {
        requestId: crypto.randomUUID(),
        batches: batches.filter((item) => Number(item.quantity) > 0).map((item) => ({
          medicine: item.medicine,
          batchNumber: item.batchNumber,
          manufacturingDate: item.manufacturingDate,
          expiryDate: item.expiryDate,
          quantity: Number(item.quantity),
          storageLocation: item.storageLocation,
        })),
      });
      onToast('Batches received. Stock was created once for this receipt.');
      await load();
    } catch (err) {
      onToast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    try {
      const next = await api.setPurchaseStatus(orderId, 'CANCELLED');
      setOrder(next);
      onToast('Purchase order cancelled.');
    } catch (err) {
      onToast(err.message, 'danger');
    }
  }

  const open = order && ['ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status);

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">{order?.orderCode || 'Order'}</p>
          <h1>{order?.supplierName || 'Purchase order'}</h1>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => navigate('/purchases')}>All orders</button>
          {order ? <button type="button" className="ghost" onClick={() => navigate(`/suppliers/${order.supplier}`)}>Supplier</button> : null}
          {canWrite && order && order.status !== 'RECEIVED' && order.status !== 'CANCELLED' ? (
            <button type="button" className="ghost" onClick={cancel}>Cancel order</button>
          ) : null}
        </div>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {order ? (
        <>
          <dl className="fact-grid">
            <div><dt>Status</dt><dd>{order.status}</dd></div>
            <div><dt>Order date</dt><dd>{formatDate(order.orderDate)}</dd></div>
            <div><dt>Expected</dt><dd>{formatDate(order.expectedDelivery) || '—'}</dd></div>
            <div><dt>Total</dt><dd>{order.totalAmount}</dd></div>
          </dl>
          <h2 className="section-label">Items</h2>
          <ul className="feed">
            {order.items.map((item) => (
              <li key={item._id}>{item.medicineName} · {item.strength} · ordered {item.quantity} · received {item.receivedQuantity} · {item.unitCost}</li>
            ))}
          </ul>
          {canWrite && open && batches.length > 0 ? (
            <form className="record-form" onSubmit={receive}>
              <h2 className="section-label wide">Receive batches</h2>
              {batches.map((item, index) => (
                <div key={item.medicine} className="wide">
                  <p>{item.medicineName} · {item.outstanding} still on order</p>
                  <div className="receive-row">
                    <input value={item.batchNumber} onChange={(event) => updateBatch(index, 'batchNumber', event.target.value)} placeholder="Batch number" required />
                    <input type="date" value={item.manufacturingDate} onChange={(event) => updateBatch(index, 'manufacturingDate', event.target.value)} required aria-label="Manufacturing date" />
                    <input type="date" value={item.expiryDate} onChange={(event) => updateBatch(index, 'expiryDate', event.target.value)} required aria-label="Expiry date" />
                    <input value={item.quantity} onChange={(event) => updateBatch(index, 'quantity', event.target.value)} inputMode="numeric" aria-label="Received quantity" />
                    <input value={item.storageLocation} onChange={(event) => updateBatch(index, 'storageLocation', event.target.value)} aria-label="Storage location" />
                  </div>
                </div>
              ))}
              <div className="dialog-actions wide">
                <button type="submit" className="solid" disabled={saving}>Receive order</button>
              </div>
            </form>
          ) : null}
          <h2 className="section-label">Receiving history</h2>
          {(order.receipts || []).length === 0 ? <p className="empty">Nothing has been received.</p> : (
            <ul className="feed">
              {order.receipts.map((receipt) => (
                <li key={receipt._id}>{formatDate(receipt.at)} · {receipt.name} · {receipt.lines.map((line) => `${line.batchNumber} × ${line.quantity}`).join(', ')}</li>
              ))}
            </ul>
          )}
          <h2 className="section-label">Audit</h2>
          <ul className="feed">
            {(order.audit || []).map((entry, index) => (
              <li key={`${entry.at}-${index}`}>{formatDate(entry.at)} · {entry.name} · {entry.action}{entry.note ? ` · ${entry.note}` : ''}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
