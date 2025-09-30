// src/App.jsx
import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import OCRUpload from "./components/OCRUpload";
import Login from "./components/Login";
import Signup from "./components/Signup";
import AdminDashboard from "./components/admin/AdminDashboard";

function App() {
  const [auth, setAuth] = useState(null);

  // Load auth from localStorage
  useEffect(() => {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    const role = localStorage.getItem("role");
    if (token && username && role) {
      setAuth({ token, username, role });
    }
  }, []);

  const handleLoginSuccess = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("username", data.username);
    localStorage.setItem("role", data.role);
    setAuth(data);
  };

  const handleLogout = () => {
    localStorage.clear();
    setAuth(null);
  };

  return (
    <>
      {auth && (
        <button
          onClick={handleLogout}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            padding: "8px 12px",
            zIndex: 1000,
          }}
        >
          Logout
        </button>
      )}

      <Routes>
        {/* Homepage: OCRUpload for normal users only */}
        <Route
          path="/"
          element={
            auth ? (
              auth.role === "admin" ? (
                <Navigate to="/admin/overview" replace />
              ) : (
                <OCRUpload auth={auth} setAuth={setAuth} />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Login & Signup */}
        <Route
          path="/login"
          element={<Login onLoginSuccess={handleLoginSuccess} />}
        />
        <Route path="/signup" element={<Signup />} />

        {/* Admin routes with sidebar */}
        <Route
          path="/admin/*"
          element={
            auth?.role === "admin" ? (
              <AdminDashboard auth={auth} setAuth={setAuth} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Fallback for any unknown route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
