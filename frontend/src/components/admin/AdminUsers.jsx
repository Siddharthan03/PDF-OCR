import { useState, useEffect } from "react";
import "./AdminUsers.css";

const sampleUsers = [
  { id: 1, name: "John Doe", email: "john@example.com", role: "User" },
  { id: 2, name: "Jane Smith", email: "jane@example.com", role: "Admin" },
  { id: 3, name: "Alice Johnson", email: "alice@example.com", role: "User" },
  { id: 4, name: "Bob Brown", email: "bob@example.com", role: "Suspended" },
  { id: 5, name: "Charlie White", email: "charlie@example.com", role: "User" },
  { id: 6, name: "Daisy Blue", email: "daisy@example.com", role: "User" },
];

export default function Users() {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const usersPerPage = 5;

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const filteredUsers = sampleUsers.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = filterRole === "All" || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);

  const toggleSelectUser = (id) => {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((uid) => uid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedUsers.length === currentUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(currentUsers.map((u) => u.id));
    }
  };

  const handleBulkDelete = () => {
    alert(`Deleting users: ${selectedUsers.join(", ")}`);
    setSelectedUsers([]);
  };

  return (
    <div className="users-page">
      <h2 className="users-title">Manage Users</h2>

      {/* Controls */}
      <div className="users-controls">
        <input
          type="text"
          placeholder="Search by name or email..."
          className="users-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="users-filter"
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
        >
          <option>All</option>
          <option>User</option>
          <option>Admin</option>
          <option>Suspended</option>
        </select>
        {selectedUsers.length > 0 && (
          <button className="btn bulk-btn" onClick={handleBulkDelete}>
            Delete Selected ({selectedUsers.length})
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="loading-text">Loading users...</p>
      ) : currentUsers.length === 0 ? (
        <p className="loading-text">No users found.</p>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    onChange={toggleSelectAll}
                    checked={
                      selectedUsers.length === currentUsers.length &&
                      currentUsers.length > 0
                    }
                  />
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => toggleSelectUser(user.id)}
                    />
                  </td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`role-badge role-${user.role.toLowerCase()}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button className="btn promote-btn">Promote</button>
                    <button className="btn delete-btn">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="pagination">
            {Array.from(
              { length: Math.ceil(filteredUsers.length / usersPerPage) },
              (_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`page-btn ${
                    currentPage === i + 1 ? "active-page" : ""
                  }`}
                >
                  {i + 1}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
