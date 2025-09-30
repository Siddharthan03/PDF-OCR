import { useState, useEffect } from "react";
import "./AdminLogs.css";

const logsData = [
  { id: 1, time: "2025-08-21 12:01", text: "User John uploaded a file." },
  { id: 2, time: "2025-08-21 12:05", text: "Jane logged in." },
  { id: 3, time: "2025-08-21 12:10", text: "Error: Failed upload attempt." },
  { id: 4, time: "2025-08-21 12:15", text: "System backup completed." },
  { id: 5, time: "2025-08-21 12:20", text: "Alice updated her profile." },
  { id: 6, time: "2025-08-21 12:25", text: "New user registered." },
];

export default function Logs() {
  const [loading, setLoading] = useState(true);
  const [logPage, setLogPage] = useState(1);
  const [search, setSearch] = useState("");
  const logsPerPage = 3;

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const filteredLogs = logsData.filter((log) =>
    log.text.toLowerCase().includes(search.toLowerCase())
  );

  const indexOfLastLog = logPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);

  const getLogType = (text) => (text.toLowerCase().includes("error") ? "error" : "info");

  return (
    <div className="logs-page">
      <h2 className="logs-title">System Logs</h2>

      {/* Search */}
      <div className="logs-controls">
        <input
          type="text"
          placeholder="Search logs..."
          className="logs-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="loading-text">Loading logs...</p>
      ) : currentLogs.length === 0 ? (
        <p className="loading-text">No logs found.</p>
      ) : (
        <div className="logs-container">
          <ul className="logs-list">
            {currentLogs.map((log) => (
              <li
                key={log.id}
                className={`log-item ${getLogType(log.text)}`}
              >
                <span className="log-time">[{log.time}]</span>
                <span className="log-text">{log.text}</span>
                <span className={`log-badge ${getLogType(log.text)}`}>
                  {getLogType(log.text).toUpperCase()}
                </span>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <div className="pagination">
            {Array.from(
              { length: Math.ceil(filteredLogs.length / logsPerPage) },
              (_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setLogPage(i + 1)}
                  className={`page-btn ${logPage === i + 1 ? "active-page" : ""}`}
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
