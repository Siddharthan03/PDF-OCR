// src/components/OCRUpload.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../App.css";

/* ---------------------
   Small helpers / normalizers
   --------------------- */

function RenderMetaValue({ value }) {
  if (typeof value === "string" && value.startsWith("/signatures/")) {
    return (
      <a href={value} target="_blank" rel="noreferrer">
        <img src={value} alt="signature" className="signature-img" />
      </a>
    );
  }
  if (Array.isArray(value)) {
    return <div>{value.join(", ")}</div>;
  }
  if (typeof value === "object" && value !== null) {
    return <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(value)}</pre>;
  }
  return <span>{String(value ?? "")}</span>;
}

/* Show metadata vertically; optionally display combined counts for tables */
function MetadataVertical({ meta, combinedCounts = {} }) {
  if (!meta || Object.keys(meta).length === 0) return <div className="empty">No metadata</div>;
  return (
    <table className="metadata-vertical">
      <tbody>
        {Object.keys(meta).map((k) => (
          <tr key={k}>
            <th className="meta-key">{k}</th>
            <td className="meta-val">
              {(k === "Procedure / Billing (All Tables)" || k === "Procedure / Billing") &&
              combinedCounts.procsTotal !== undefined ? (
                <span>{combinedCounts.procsTotal} row(s) — shown in tables below</span>
              ) : (k === "Diagnosis (All Tables)" || k === "Diagnosis") &&
                combinedCounts.diagsTotal !== undefined ? (
                <span>{combinedCounts.diagsTotal} row(s) — shown in tables below</span>
              ) : (
                <RenderMetaValue value={meta[k]} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* Clean up common fee OCR artifacts into reasonable currency-looking strings */
function _cleanFeeString(s) {
  if (s === undefined || s === null) return "";
  let raw = String(s).trim();
  if (!raw) return "";
  raw = raw.replace(/\s+/g, " ");
  raw = raw.replace(/^[\|\[\(]+/, "");
  // patterns like "2 00.00" -> "200.00"
  raw = raw.replace(/(\d)\s+(\d{2}\.\d{2})$/, "$1$2");
  // "000.00" -> "0.00"
  raw = raw.replace(/^0+(\.\d{2})$/, "0$1");
  // digits without decimal (and len>2) -> assume last two digits are decimals
  if (/^\d+$/.test(raw) && raw.length > 2) {
    raw = raw.slice(0, raw.length - 2) + "." + raw.slice(-2);
  }
  // ensure two decimals
  if (/^\d+(\.\d+)?$/.test(raw) && !/\.\d{2}$/.test(raw)) {
    const parts = raw.split(".");
    if (parts.length === 1) raw = raw + ".00";
    else if (parts[1].length === 1) raw = raw + "0";
  }
  return raw;
}

/* Try to coerce various row shapes into [code,desc,fee] */
function normalizeProcRow(r) {
  if (!r) return ["", "", ""];
  if (Array.isArray(r)) {
    const code = r[0] ?? "";
    let desc = r[1] ?? "";
    let fee = r[2] ?? "";
    // if desc is obviously numeric artifact and fee is suspicious, try to swap/clean minimally
    if (/^[\d\s\|\-.,\/]{1,}$/.test(String(desc)) && String(fee).trim()) {
      // keep desc (OCR may have captured fragmented strings). We'll rely on cleaning.
    }
    return [String(code).trim(), String(desc).trim(), _cleanFeeString(fee)];
  }
  // object shape
  const code = r.Code ?? r.code ?? r.code_value ?? r[0] ?? "";
  let desc = r.Description ?? r.description ?? r.Desc ?? r.desc ?? r[1] ?? "";
  let fee = r.Fee ?? r.fee ?? r.Amount ?? r.amount ?? r.Price ?? r.price ?? r[2] ?? "";
  return [String(code).trim(), String(desc).trim(), _cleanFeeString(fee)];
}

/* Normalize diagnosis row into [type, code, diagnosis] */
function normalizeDiagRow(r) {
  if (!r) return ["ICD-10", "", ""];
  if (Array.isArray(r)) {
    return [r[0] ?? "ICD-10", r[1] ?? "", r[2] ?? ""];
  }
  const typ = r.Type ?? r.type ?? r[0] ?? "ICD-10";
  const code = r.Code ?? r.code ?? r[1] ?? "";
  const diag = r.Diagnosis ?? r.diagnosis ?? r.Description ?? r.description ?? r[2] ?? "";
  return [typ, String(code).trim(), String(diag).trim()];
}

/* Ensure a "tables" object is normalized: { section: rows[] } and rows is always an array */
function normalizeTables(tables) {
  const out = {};
  if (!tables) return out;
  // If tables is an array -> treat as a single unnamed section
  if (Array.isArray(tables)) {
    out["Procedures"] = tables;
    return out;
  }
  // If tables is an object whose values are not arrays, try to coerce
  Object.entries(tables).forEach(([sec, rows]) => {
    if (rows === null || rows === undefined) {
      out[sec] = [];
      return;
    }
    if (Array.isArray(rows)) {
      out[sec] = rows;
      return;
    }
    // sometimes rows can be single object, or an object keyed by index
    if (typeof rows === "object") {
      // if it's a keyed object like {0: {Code:...}, 1: {...}} -> convert to array
      const maybeArray = Object.keys(rows)
        .sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.localeCompare(b);
        })
        .map((k) => rows[k]);
      out[sec] = maybeArray;
      return;
    }
    // otherwise wrap single primitive into an array
    out[sec] = [rows];
  });
  return out;
}

/* ---------------------
   Procedure / Diagnosis components
   --------------------- */

function ProcedureTables({ tables }) {
  const normalized = normalizeTables(tables);
  if (!normalized || Object.keys(normalized).length === 0) {
    return <div className="empty">No procedure / billing tables found.</div>;
  }
  return (
    <div className="procedures-root">
      {Object.entries(normalized).map(([section, rows]) => {
        const safeRows = Array.isArray(rows) ? rows : [];
        return (
          <div className="table-block" key={section}>
            <h4 className="table-section-title">{section}</h4>
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {safeRows && safeRows.length > 0 ? (
                  safeRows.map((r, i) => {
                    const [code, desc, fee] = normalizeProcRow(r);
                    return (
                      <tr key={i}>
                        <td>{code}</td>
                        <td>{desc}</td>
                        <td>{fee}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center" }}>
                      No rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function DiagnosisTables({ tables, highlightCodes = new Set() }) {
  // normalize shape similar to procedures
  const normalized = normalizeTables(tables);
  if (!normalized || Object.keys(normalized).length === 0) {
    return <div className="empty">No diagnosis tables found.</div>;
  }
  return (
    <div className="diagnosis-root">
      {Object.entries(normalized).map(([section, rows]) => {
        const safeRows = Array.isArray(rows) ? rows : [];
        return (
          <div className="table-block" key={section}>
            <h4 className="table-section-title">{section}</h4>
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Code</th>
                  <th>Diagnosis</th>
                </tr>
              </thead>
              <tbody>
                {safeRows && safeRows.length > 0 ? (
                  safeRows.map((r, i) => {
                    const [type, code, desc] = normalizeDiagRow(r);
                    const isMatch = highlightCodes.has(String(code).trim());
                    return (
                      <tr key={i} className={isMatch ? "highlight-row" : ""}>
                        <td>{type}</td>
                        <td>{code}</td>
                        <td>{desc}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center" }}>
                      No rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------
   Patient block (dedupe + combined view)
   --------------------- */

function PatientBlock({ patient, procedureTables = {}, diagnosisTables = {} }) {
  // collect ICD-like tokens from patient fields for highlighting
  const icdRegex = /\b[A-Z][0-9]{2,3}(?:\.[0-9A-Z]+)?\b/g;
  const highlightCodes = new Set();
  Object.values(patient || {}).forEach((v) => {
    try {
      const str = String(v || "");
      const m = str.match(icdRegex);
      if (m) m.forEach((code) => highlightCodes.add(code.trim()));
    } catch (e) {
      // ignore
    }
  });

  // patient-specific mapped arrays (extractor may have attached these)
  const patientProcs = Array.isArray(patient["Procedure / Billing (All Tables)"]) ? patient["Procedure / Billing (All Tables)"] : Array.isArray(patient["Procedure / Billing"]) ? patient["Procedure / Billing"] : [];
  const patientDiags = Array.isArray(patient["Diagnosis (All Tables)"]) ? patient["Diagnosis (All Tables)"] : Array.isArray(patient["Diagnosis"]) ? patient["Diagnosis"] : [];

  // combined counts
  const totalProcsFromPatient = patientProcs.length;
  const totalDiagsFromPatient = patientDiags.length;
  const totalProcsFromGlobal = Object.values(normalizeTables(procedureTables)).reduce((s, a) => s + ((a && a.length) || 0), 0);
  const totalDiagsFromGlobal = Object.values(normalizeTables(diagnosisTables)).reduce((s, a) => s + ((a && a.length) || 0), 0);
  const procsTotal = totalProcsFromPatient + totalProcsFromGlobal;
  const diagsTotal = totalDiagsFromPatient + totalDiagsFromGlobal;

  // compose combined tables for display (patient-specific first)
  const combinedProcedureTables = {};
  if (patientProcs && patientProcs.length) combinedProcedureTables["Patient Procedures"] = patientProcs;
  Object.entries(normalizeTables(procedureTables)).forEach(([sec, rows]) => {
    combinedProcedureTables[sec] = (combinedProcedureTables[sec] || []).concat(rows || []);
  });

  const combinedDiagnosisTables = {};
  if (patientDiags && patientDiags.length) combinedDiagnosisTables["Patient Diagnosis"] = patientDiags;
  Object.entries(normalizeTables(diagnosisTables)).forEach(([sec, rows]) => {
    combinedDiagnosisTables[sec] = (combinedDiagnosisTables[sec] || []).concat(rows || []);
  });

  return (
    <div className="patient-block">
      <div className="patient-header">
        <h4>Patient: {patient["Patient Name"] ?? patient["Patient"] ?? "Unknown"}</h4>
        <div className="patient-sub">Preview of patient fields</div>
      </div>

      <div className="patient-meta-grid">
        <MetadataVertical meta={patient} combinedCounts={{ procsTotal, diagsTotal }} />
      </div>

      <div className="patient-tables">
        <h5 className="section-title">Procedure / Billing (All Tables)</h5>
        <ProcedureTables tables={combinedProcedureTables} />

        <h5 className="section-title" style={{ marginTop: 12 }}>
          Diagnosis (All Tables)
        </h5>
        <DiagnosisTables tables={combinedDiagnosisTables} highlightCodes={highlightCodes} />

        {highlightCodes.size > 0 && (
          <div className="matched-note">Highlighted diagnosis codes found in patient fields: {Array.from(highlightCodes).join(", ")}</div>
        )}
      </div>
    </div>
  );
}

/* ---------------------
   ResultBlock + main component
   --------------------- */

/* helper to dedupe/merge patient records from backend (prevents many NIL duplicates) */
function dedupeAndMergePatients(patients) {
  if (!Array.isArray(patients)) return [];
  const map = new Map();
  for (const p of patients) {
    // build a key that groups by meaningful identity
    const name = (p["Patient Name"] || p["Patient"] || "").toString().trim();
    const sub = (p["Subscriber ID"] || p["SubscriberId"] || p["Subscriber"] || "").toString().trim();
    const key = name || sub || JSON.stringify(p).slice(0, 80); // fallback to short fingerprint

    if (!map.has(key)) {
      // shallow clone to avoid mutating source
      const clone = { ...p };
      // ensure arrays exist for any pre-attached rows
      if (clone["Procedure / Billing (All Tables)"] && !Array.isArray(clone["Procedure / Billing (All Tables)"])) {
        clone["Procedure / Billing (All Tables)"] = [clone["Procedure / Billing (All Tables)"]];
      }
      if (clone["Diagnosis (All Tables)"] && !Array.isArray(clone["Diagnosis (All Tables)"])) {
        clone["Diagnosis (All Tables)"] = [clone["Diagnosis (All Tables)"]];
      }
      map.set(key, clone);
    } else {
      // merge into existing record: prefer non-empty fields, concatenate arrays
      const existing = map.get(key);
      for (const k of Object.keys(p)) {
        const val = p[k];
        if ((existing[k] === undefined || existing[k] === null || existing[k] === "NIL" || existing[k] === "") && val) {
          existing[k] = val;
        } else if (Array.isArray(existing[k]) && Array.isArray(val)) {
          existing[k] = existing[k].concat(val);
        } else if (Array.isArray(existing[k]) && val && !Array.isArray(val)) {
          existing[k] = existing[k].concat([val]);
        } else if (!Array.isArray(existing[k]) && Array.isArray(val)) {
          existing[k] = (existing[k] ? [existing[k]] : []).concat(val);
        }
      }
    }
  }
  return Array.from(map.values());
}

function ResultBlock({ item }) {
  // canonical shapes
  const rawPatients = Array.isArray(item.patients) ? item.patients : Array.isArray(item.patients_list) ? item.patients_list : [];
  const procedureTables =
    item.procedure_tables || item.procedureTables || item.medical_billing_codes || {};
  const diagnosisTables = item.diagnosis_tables || item.diagnosisTables || item.diagnosis_codes || {};

  // normalize legacy arrays into tables handled later
  let procTablesMutable = normalizeTables(procedureTables);
  let diagTablesMutable = normalizeTables(diagnosisTables);

  // if backend returned flat arrays (medical_billing_codes / diagnosis_codes)
  if (Object.keys(procTablesMutable).length === 0 && Array.isArray(item.medical_billing_codes) && item.medical_billing_codes.length) {
    procTablesMutable = { Procedures: item.medical_billing_codes };
  }
  if (Object.keys(diagTablesMutable).length === 0 && Array.isArray(item.diagnosis_codes) && item.diagnosis_codes.length) {
    diagTablesMutable = { Diagnosis: item.diagnosis_codes };
  }

  // dedupe/merge patients to reduce duplicates shown in UI
  const patients = dedupeAndMergePatients(rawPatients);

  const totalProcRows = Object.values(procTablesMutable).reduce((s, a) => s + ((a && a.length) || 0), 0);
  const totalDiagRows = Object.values(diagTablesMutable).reduce((s, a) => s + ((a && a.length) || 0), 0);

  return (
    <div className="result-block">
      <h2 className="file-title">{item.file_name || item.filename || "Uploaded file"}</h2>
      <div className="summary">
        {patients.length} patient(s) • {totalProcRows} procedure rows • {totalDiagRows} diagnosis rows
      </div>

      <section className="patients-list">
        {patients.length === 0 ? (
          <div className="empty">No patients found</div>
        ) : (
          patients.map((p, idx) => (
            <PatientBlock key={idx} patient={p} procedureTables={procTablesMutable} diagnosisTables={diagTablesMutable} />
          ))
        )}
      </section>

      <details style={{ marginTop: 12 }}>
        <summary>Raw response (debug)</summary>
        <pre style={{ maxHeight: 260, overflow: "auto", background: "#0b1220", color: "#cbd5e1", padding: 8 }}>
          {JSON.stringify(item, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/* ---------------------
   Main component (upload / auth)
   --------------------- */

const OCRUpload = ({ auth, setAuth, isAdmin = false }) => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";
  const api = axios.create({ baseURL: API_BASE });

  api.interceptors.request.use((config) => {
    if (auth?.token) config.headers.Authorization = `Bearer ${auth.token}`;
    return config;
  });
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if ([401, 403].includes(error.response?.status)) {
        localStorage.clear();
        setAuth(null);
        alert("⚠️ Session expired or access denied. Please log in again.");
      }
      return Promise.reject(error);
    }
  );

  useEffect(() => {
    if (auth?.token && !isAdmin) {
      navigate("/", { replace: true });
    }
    // eslint-disable-next-line
  }, [auth, isAdmin, navigate]);

  const handleSignup = async () => {
    try {
      const res = await api.post("/auth/signup", { username, password });
      setMessage(res.data.message || "Signup successful!");
      const loginRes = await api.post("/auth/login", { username, password });
      const { token, username: un, role } = loginRes.data;
      setAuth({ token, username: un, role });
      localStorage.setItem("auth", JSON.stringify({ token, username: un, role }));
    } catch (err) {
      setMessage("Signup failed: " + (err.response?.data?.error || err.message));
    }
  };

  const handleLogin = async () => {
    try {
      const res = await api.post("/auth/login", { username, password });
      if (res.data.token) {
        const { token, username: un, role } = res.data;
        setAuth({ token, username: un, role });
        localStorage.setItem("auth", JSON.stringify({ token, username: un, role }));
        setMessage("Login successful!");
      } else {
        setMessage("Invalid credentials");
      }
    } catch (err) {
      setMessage("Login failed: " + (err.response?.data?.error || err.message));
    }
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 10) {
      alert("⚠️ You can upload up to 10 files only.");
      return;
    }
    setFiles(selected);
    setResults([]);
  };

  const buildItemFromResponse = (resData, file) => {
    if (!resData) {
      return {
        file_name: file.name,
        patients: [],
        procedure_tables: {},
        diagnosis_tables: {},
        metadata: {},
      };
    }

    // canonical shape
    if (resData.patients || resData.procedure_tables || resData.diagnosis_tables) {
      return {
        file_name: resData.file_name || resData.filename || file.name,
        patients: Array.isArray(resData.patients) ? resData.patients : [],
        procedure_tables: resData.procedure_tables || resData.procedureTables || {},
        diagnosis_tables: resData.diagnosis_tables || resData.diagnosisTables || {},
        metadata: resData.metadata || {},
      };
    }

    // older shapes (flattened arrays)
    if (resData.medical_billing_codes || resData.diagnosis_codes) {
      const procedures = {
        Procedures: Array.isArray(resData.medical_billing_codes)
          ? resData.medical_billing_codes.map((r) => (Array.isArray(r) ? r : [r.Code ?? r.code ?? "", r.Description ?? r.description ?? "", r.Fee ?? r.fee ?? ""]))
          : [],
      };
      const diags = {
        Diagnosis: Array.isArray(resData.diagnosis_codes)
          ? resData.diagnosis_codes.map((d) => (Array.isArray(d) ? d : [d.Type ?? d.type ?? "ICD-10", d.Code ?? d.code ?? "", d.Diagnosis ?? d.diagnosis ?? d.Description ?? d.description ?? ""]))
          : [],
      };
      return {
        file_name: resData.file_name || resData.filename || file.name,
        patients: Array.isArray(resData.patients) ? resData.patients : [],
        procedure_tables: procedures,
        diagnosis_tables: diags,
        metadata: resData.metadata || {},
      };
    }

    // fallback
    const meta = resData.metadata || resData;
    if (!meta["File Name"]) meta["File Name"] = file.name;
    return {
      file_name: meta["File Name"],
      patients: [],
      procedure_tables: {},
      diagnosis_tables: {},
      metadata: meta,
    };
  };

  const handleUploadAll = async () => {
    if (!files.length) return;
    setLoading(true);
    try {
      const out = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.post("/api/ocr", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const item = buildItemFromResponse(res.data || {}, file);
        out.push(item);
      }
      setResults(out);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("⚠️ Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!auth?.token && !isAdmin) {
    return (
      <div className="container login-container">
        <div className="glass-card login-form">
          <h2>{isSignup ? "Signup" : "Login"}</h2>
          <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="glass-input" />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input" />
          {isSignup ? (
            <button className="glass-btn" onClick={handleSignup}>Signup</button>
          ) : (
            <button className="glass-btn" onClick={handleLogin}>Login</button>
          )}
          <button className="glass-btn" style={{ marginTop: 8 }} onClick={() => { setIsSignup(!isSignup); setMessage(""); }}>
            {isSignup ? "Already have an account? Login" : "No account? Signup"}
          </button>
          {message && <p className="message">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h2 className="main-heading">{isAdmin ? "📂 Admin OCR Upload Tool" : "📄 File OCR Extraction Tool"}</h2>
      </header>

      <section className="upload-section">
        <label htmlFor="file-upload" className="upload-label">Upload up to 10 files:</label>
        <input type="file" id="file-upload" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple onChange={handleFileChange} />
        <div className="button-row" style={{ marginTop: 8 }}>
          <button className="upload-btn" onClick={handleUploadAll} disabled={loading}>{loading ? "Processing..." : "Upload All"}</button>
        </div>
      </section>

      {files.length > 0 && (
        <section className="file-preview">
          <h3 className="section-heading">📁 Selected Files</h3>
          <ul className="file-list">{files.map((file, i) => <li key={i}>📎 {file.name}</li>)}</ul>
        </section>
      )}

      {loading && <p className="loading-text">⏳ Extracting tables...</p>}

      {results.length > 0 && (
        <section className="results-section">
          <h3 className="section-heading">📊 Parsed Tables</h3>
          {results.map((item, idx) => <ResultBlock key={idx} item={item} />)}
        </section>
      )}
    </div>
  );
};

export default OCRUpload;
