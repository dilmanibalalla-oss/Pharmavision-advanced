import { useEffect, useState } from 'react';
import { api } from '../api';

function shortDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function dayLabel(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function amount(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ label, value, note }) {
  return (
    <article className="stat-card">
      <p className="kicker">{label}</p>
      <p className="stat-value">{value}</p>
      {note ? <p className="hint">{note}</p> : null}
    </article>
  );
}

function ActivityChart({ title, series, empty }) {
  const peak = Math.max(...series.map((point) => point.count), 0);
  return (
    <section className="dash-panel">
      <h2>{title}</h2>
      <p className="hint">Last 14 days, counted in UTC.</p>
      {peak === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="bar-chart" role="img" aria-label={title}>
          {series.map((point) => (
            <div className="bar-col" key={point.date}>
              <span className="bar-count">{point.count}</span>
              <div className="bar-track">
                <div className="bar" style={{ height: `${Math.max(4, (point.count / peak) * 100)}%` }} />
              </div>
              <span className="bar-label">{dayLabel(point.date)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Feed({ title, items, empty, renderItem }) {
  return (
    <section className="dash-panel">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul className="feed">
          {items.map((item) => (
            <li key={item._id}>{renderItem(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminDashboard() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    setError('');
    api.dashboard()
      .then((next) => {
        setReport(next);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }

  useEffect(() => {
    let ignore = false;
    api.dashboard()
      .then((next) => {
        if (ignore) return;
        setReport(next);
        setError('');
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
  }, []);

  if (loading) return <p className="empty">Opening the daybook…</p>;
  if (error) {
    return (
      <section>
        <p className="banner" role="alert">{error}</p>
        <button type="button" className="ghost" onClick={load}>Try again</button>
      </section>
    );
  }
  if (!report) return <p className="empty">The dashboard has no figures yet.</p>;

  const { cards, tracking } = report;

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Administration</p>
          <h1>Dashboard</h1>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard label="Doctors" value={cards.doctors} />
        <StatCard label="Patients" value={cards.patients} />
        <StatCard label="Consultations" value={cards.consultations} note="Recorded visits" />
        <StatCard label="Prescriptions" value={cards.prescriptions} note="Medicines recorded on visits" />
        <StatCard label="Medicines" value={cards.medicines} />
        <StatCard label="Suppliers" value={cards.suppliers} />
        <StatCard
          label="Stock value"
          value={tracking.stockValue ? amount(cards.stockValue) : '—'}
          note={tracking.stockValue ? 'Quantity × unit cost' : 'No medicine has both quantity and unit cost'}
        />
        <StatCard
          label="Low stock"
          value={tracking.lowStock ? cards.lowStock : '—'}
          note={tracking.lowStock ? 'At or below reorder level' : 'Reorder levels are not stored yet'}
        />
        <StatCard
          label="Expiring"
          value={tracking.expiring ? cards.expiring : '—'}
          note={tracking.expiring ? 'Expiry date within 30 days' : 'Expiry dates are not stored yet'}
        />
        <StatCard label="Pending alerts" value={cards.pendingAlerts} note="Open inventory alerts" />
      </div>

      <div className="dash-split">
        <ActivityChart
          title="Consultation activity"
          series={report.consultationActivity}
          empty="No visits were recorded in the last 14 days."
        />
        <ActivityChart
          title="Prescription activity"
          series={report.prescriptionActivity}
          empty="No visit medicines were recorded in the last 14 days."
        />
      </div>

      <section className="dash-panel">
        <h2>Inventory overview</h2>
        <dl className="inventory-facts">
          <div>
            <dt>Medicines</dt>
            <dd>{cards.medicines}</dd>
          </div>
          <div>
            <dt>Suppliers</dt>
            <dd>{cards.suppliers}</dd>
          </div>
          <div>
            <dt>Stock value</dt>
            <dd>{tracking.stockValue ? amount(cards.stockValue) : 'Not stored'}</dd>
          </div>
          <div>
            <dt>Low stock</dt>
            <dd>{tracking.lowStock ? cards.lowStock : 'Not stored'}</dd>
          </div>
          <div>
            <dt>Expiring</dt>
            <dd>{tracking.expiring ? cards.expiring : 'Not stored'}</dd>
          </div>
        </dl>
      </section>

      <div className="dash-split">
        <Feed
          title="Recent patient registrations"
          items={report.recentPatients}
          empty="No patients have been registered."
          renderItem={(patient) => (
            <>
              <strong>{patient.name}</strong>
              <p>Age {patient.age} · {shortDate(patient.createdAt)}</p>
            </>
          )}
        />
        <Feed
          title="Recent consultations"
          items={report.recentConsultations}
          empty="No visits have been recorded."
          renderItem={(visit) => (
            <>
              <strong>{visit.name}</strong>
              <p>{shortDate(visit.visitedAt)} · {visit.treatmentCount} medicine{visit.treatmentCount === 1 ? '' : 's'}</p>
            </>
          )}
        />
      </div>

      <div className="dash-split">
        <Feed
          title="Low-stock notifications"
          items={tracking.lowStock ? report.lowStock : []}
          empty={tracking.lowStock ? 'No medicines are at or below their reorder level.' : 'Quantity and reorder level are not stored on medicines yet.'}
          renderItem={(medicine) => (
            <>
              <strong>{[medicine.name, medicine.strength, medicine.form].filter(Boolean).join(' · ')}</strong>
              <p>{medicine.quantity} on hand · reorder at {medicine.reorderLevel}</p>
            </>
          )}
        />
        <Feed
          title="Expiry notifications"
          items={tracking.expiring ? report.expiring : []}
          empty={tracking.expiring ? 'No stored expiry dates fall within 30 days.' : 'Expiry dates are not stored on medicines yet.'}
          renderItem={(medicine) => (
            <>
              <strong>{[medicine.name, medicine.strength].filter(Boolean).join(' ')}</strong>
              <p>Expires {shortDate(medicine.expiresAt)}</p>
            </>
          )}
        />
      </div>

      <div className="dash-split">
        <Feed
          title="Recent stock movements"
          items={report.stockMovements}
          empty="No stock movements have been recorded."
          renderItem={(movement) => (
            <>
              <strong>{movement.medicineName || 'Movement'}</strong>
              <p>
                {[movement.type, movement.quantity == null ? '' : `Qty ${movement.quantity}`, shortDate(movement.at)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </>
          )}
        />
        <Feed
          title="Pending discrepancy investigations"
          items={report.investigations}
          empty="No investigations are pending."
          renderItem={(item) => (
            <>
              <strong>{item.title || 'Investigation'}</strong>
              <p>{[item.status, shortDate(item.at)].filter(Boolean).join(' · ')}</p>
            </>
          )}
        />
      </div>
    </section>
  );
}
