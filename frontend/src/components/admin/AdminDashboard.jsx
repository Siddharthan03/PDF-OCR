// src/components/admin/AdminDashboard.jsx
import React from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import Overview from "./AdminOverview";
import Users from "./AdminUsers";
import Logs from "./AdminLogs";
import Settings from "./AdminSettings";
import OCRUpload from "../OCRUpload"; // ✅ Use the same OCRUpload component
import "./AdminDashboard.css";

export default function AdminDashboard({ auth, setAuth }) {
  // Only admins can access
  if (!auth || auth.role.toLowerCase() !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="admin-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <h2 className="sidebar-title">Admin Panel</h2>
        <nav className="nav-links">
          <NavLink
            to="/admin/overview"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Overview
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Users
          </NavLink>
          <NavLink
            to="/admin/logs"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Logs
          </NavLink>
          <NavLink
            to="/admin/settings"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Settings
          </NavLink>
          <NavLink
            to="/admin/ocr-upload"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            OCR Upload
          </NavLink>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="users" element={<Users />} />
          <Route path="logs" element={<Logs />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="ocr-upload"
            element={<OCRUpload auth={auth} setAuth={setAuth} isAdmin={true} />}
          />
        </Routes>
      </main>
    </div>
  );
}
