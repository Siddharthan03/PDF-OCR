// src/components/Login.jsx
import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import "../App.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { username, password });

      const normalizedRole = res.data.role?.toLowerCase() || "user";

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", normalizedRole);
      localStorage.setItem("username", res.data.username);

      onLoginSuccess({
        token: res.data.token,
        role: normalizedRole,
        username: res.data.username,
      });

      if (normalizedRole === "admin") navigate("/admin/overview");
      else navigate("/");
    } catch (err) {
      console.error("Login error:", err);
      setError(err.response?.data?.error || "Server error. Try again later.");
    }
  };

  return (
    <div className="login-container">
      <div className="glass-card">
        <h2 style={{ textAlign: "center", marginBottom: 20 }}>🔐 Login</h2>
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleLogin} className="login-form">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            required
          />
          <button type="submit">Login</button>
        </form>

        <p style={{ marginTop: 15, textAlign: "center" }}>
          Don’t have an account? <Link to="/signup" style={{ color: "#00ffcc" }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
