import React, { useState } from "react";
import axios from "axios";

export default function AdminLogin({ setAuth }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.post("http://localhost:5000/api/admin-login", {
        username,
        password,
      });

      localStorage.setItem("adminToken", res.data.token);
      setAuth(true);
      setMessage("✅ Login successful");
    } catch (err) {
      setMessage("❌ " + (err.response?.data?.message || "Login failed"));
    }
  };

  return (
    <div style={{ maxWidth: "400px", margin: "auto", marginTop: "100px" }}>
      <h2>Admin Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          style={{ display: "block", width: "100%", margin: "10px 0" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ display: "block", width: "100%", margin: "10px 0" }}
        />
        <button type="submit" style={{ width: "100%" }}>Login</button>
      </form>
      <p>{message}</p>
    </div>
  );
}
