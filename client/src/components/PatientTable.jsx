import { treatmentLines } from '../format';

const COLUMNS = [
  ['name', 'Name'],
  ['age', 'Age'],
  ['address', 'Address'],
  ['visitCount', 'Visits'],
  ['allergies', 'Allergy'],
  ['treatments', 'Past treatment'],
];

function Summary({ items }) {
  if (!items.length) return <span className="muted">None</span>;
  const shown = items.slice(0, 2);
  const extra = items.length - shown.length;
  return (
    <span title={items.join(', ')}>
      {shown.join(', ')}
      {extra > 0 ? ` +${extra}` : ''}
    </span>
  );
}

export function PatientTable({
  patients,
  loading,
  query,
  sort,
  onSort,
  onOpen,
  onEdit,
  onDelete,
  busyId,
  selectedId,
  canWrite = true,
}) {
  if (loading && patients.length === 0) {
    return <p className="empty">Opening the daybook…</p>;
  }

  if (!loading && patients.length === 0) {
    return (
      <p className="empty">
        {query
          ? `No charts match “${query}”.`
          : 'No patients yet. Add a chart, then select it when they come in. Each selection records a visit.'}
      </p>
    );
  }

  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead>
          <tr>
            {COLUMNS.map(([key, label]) => {
              const active = sort.key === key;
              const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
              return (
                <th key={key} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="sort" onClick={() => onSort(key)}>
                    {label}
                    <span className="sort-arrow">{arrow}</span>
                  </button>
                </th>
              );
            })}
            <th>
              <span className="sr">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => {
            const recording = busyId === patient._id;
            return (
              <tr
                key={patient._id}
                className={selectedId === patient._id ? 'is-selected is-clickable' : 'is-clickable'}
                tabIndex={0}
                onClick={() => onOpen(patient)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen(patient);
                  }
                }}
              >
                <td className="name-cell">{patient.name}</td>
                <td className="num">{patient.age}</td>
                <td className="address-cell" title={patient.address}>{patient.address}</td>
                <td className="num">
                  <span className="visit-stamp">{recording ? '…' : patient.visitCount}</span>
                </td>
                <td>
                  <Summary items={patient.allergies} />
                </td>
                <td>
                  <Summary items={treatmentLines(patient)} />
                </td>
                <td className="row-actions">
                  {canWrite ? (
                    <>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(patient);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-btn danger-text"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(patient);
                        }}
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
