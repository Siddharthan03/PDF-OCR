// src/components/Signup.jsx
import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

export default function Signup({ onSignupSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [inviteValid, setInviteValid] = useState(null);
  const navigate = useNavigate();

  const handleInviteBlur = async () => {
    if (!inviteCode) {
      setInviteValid(null);
      return;
    }
    setCheckingInvite(true);
    try {
      const res = await axios.post(`${API_BASE}/auth/invite/validate`, {
        username,
        invite_code: inviteCode,
      });
      setInviteValid(res.data.valid);
      setMessage(res.data.valid ? `Invite valid! Role: ${res.data.role}` : "Invalid or expired invite code.");
    } catch (err) {
      console.error(err);
      setInviteValid(false);
      setMessage("Error validating invite code.");
    } finally {
      setCheckingInvite(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setMessage("");

    if (inviteCode && inviteValid === false) {
      setMessage("Cannot use an invalid invite code.");
      return;
    }

    try {
      const res = await axios.post(`${API_BASE}/auth/signup`, {
        username,
        password,
        invite_code: inviteCode,
      });

      const normalizedRole = res.data.role?.toLowerCase() || "user";

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", normalizedRole);
      localStorage.setItem("username", res.data.username);

      if (onSignupSuccess) onSignupSuccess();

      // auto-login and redirect
      navigate(normalizedRole === "admin" ? "/admin/overview" : "/");
    } catch (err) {
      console.error("Signup error:", err);
      setMessage(err.response?.data?.error || "Signup failed");
    }
  };

  return (
    <div className="glass-container" style={{ marginTop: "200px", marginBottom: 20 }}>
      <h2>Sign up</h2>
      {message && (
        <div className={`message ${message.toLowerCase().includes("failed") || message.toLowerCase().includes("invalid") ? "error" : "success"}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSignup}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Email / Username"
          required
          className="glass-input glass-username"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
          required
          className="glass-input"
        />
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          onBlur={handleInviteBlur}
          placeholder="Admin Invite Code (optional)"
          className="glass-input"
        />
        {checkingInvite && <p style={{ fontSize: "0.9em" }}>Checking invite code...</p>}

        <button type="submit" className="glass-btn">
          Sign up
        </button>
      </form>

      <p>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
