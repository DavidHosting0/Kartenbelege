import { useEffect, useState } from "react";
import { api } from "../api/client";
import { AppNav } from "../components/AppNav";
import { useAuth } from "../contexts/AuthContext";

type ManagedUser = {
  id: string;
  username: string;
  role: "admin" | "user";
  created_at: string;
};

export const AdminUsersPage = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadUsers = async () => {
    setError(null);
    const data = await api.get<{ users: ManagedUser[] }>("/api/auth/users");
    setUsers(data.users);
  };

  useEffect(() => {
    loadUsers().catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"));
  }, []);

  const onCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await api.post<{ user: ManagedUser }>("/api/auth/users", { username, password, role });
      setUsername("");
      setPassword("");
      setRole("user");
      setMessage("User created.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  const onDeleteUser = async (userId: string) => {
    const confirmed = window.confirm("Delete this user?");
    if (!confirmed) return;
    setError(null);
    setMessage(null);
    try {
      await api.delete<{ ok: true }>(`/api/auth/users/${userId}`);
      setMessage("User deleted.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  return (
    <main className="page">
      <AppNav />
      <header className="topbar">
        <h1>User Management</h1>
        <p className="muted">Create and manage application users</p>
      </header>
      <section className="card">
        <form onSubmit={onCreateUser}>
          <label>
            Username
            <input onChange={(event) => setUsername(event.target.value)} required value={username} />
          </label>
          <label>
            Password
            <input minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <label>
            Role
            <select onChange={(event) => setRole(event.target.value as "admin" | "user")} value={role}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          {message && <p>{message}</p>}
          <button disabled={loading} type="submit">
            {loading ? "Creating..." : "Create User"}
          </button>
        </form>
      </section>
      <section className="card">
        <h2>Existing Users</h2>
        <div className="user-list">
          {users.map((user) => (
            <div className="user-row" key={user.id}>
              <span>{user.username}</span>
              <span>{user.role}</span>
              <button
                className="ghost compact"
                disabled={currentUser?.id === user.id}
                onClick={() => onDeleteUser(user.id)}
                type="button"
              >
                Delete
              </button>
            </div>
          ))}
          {users.length === 0 && <p>No users found.</p>}
        </div>
      </section>
    </main>
  );
};
