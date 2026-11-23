import { useEffect, useState } from 'react';
import { api } from '../api';
import { can, roleLabel } from '../access';

export function UserAdmin({ actor, onToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canChange = can(actor.role, 'users', 'write');

  useEffect(() => {
    let ignore = false;
    api.users()
      .then((rows) => {
        if (!ignore) setUsers(rows);
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

  async function toggle(account) {
    try {
      const result = await api.setUserActive(account._id, !account.active);
      setUsers((rows) => rows.map((row) => (row._id === result.user._id ? result.user : row)));
      onToast(result.user.active ? `${result.user.name} can sign in again.` : `${result.user.name} is deactivated.`);
    } catch (err) {
      onToast(err.message, 'danger');
    }
  }

  return (
    <section>
      <header className="stage-head">
        <div>
          <p className="kicker">Access</p>
          <h1>Accounts</h1>
        </div>
      </header>
      {error ? <p className="banner" role="alert">{error}</p> : null}
      {loading ? <p className="empty">Opening the daybook…</p> : null}
      {!loading && users.length > 0 ? (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                {canChange ? <th><span className="sr">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((account) => (
                <tr key={account._id}>
                  <td className="name-cell">{account.name}</td>
                  <td>{account.email}</td>
                  <td className="role-label">{roleLabel(account.role)}</td>
                  <td>{account.active ? 'Active' : 'Inactive'}</td>
                  {canChange ? (
                    <td className="row-actions">
                      {account._id === actor._id ? (
                        <span className="muted">You</span>
                      ) : (
                        <button type="button" className="text-btn" onClick={() => toggle(account)}>
                          {account.active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
