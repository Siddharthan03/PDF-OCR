import { useState, useEffect } from "react";
import "./AdminSettings.css";

export default function Settings() {
  const [systemName, setSystemName] = useState("PDF-OCR System");
  const [maintenance, setMaintenance] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    setFadeIn(true);
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    alert(
      `Settings Saved!\nSystem Name: ${systemName}\nMaintenance Mode: ${
        maintenance ? "On" : "Off"
      }`
    );
  };

  const handleReset = () => {
    setSystemName("PDF-OCR System");
    setMaintenance(false);
  };

  return (
    <div className={`settings-page ${fadeIn ? "fade-in" : ""}`}>
      <h2 className="settings-title">Admin Settings</h2>

      <form className="settings-form" onSubmit={handleSave}>
        {/* System Name */}
        <div className="form-group">
          <label className="form-label">System Name</label>
          <input
            type="text"
            className="form-input"
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            placeholder="Enter system name"
          />
          <p className="form-helper">Name displayed across the system interface.</p>
        </div>

        {/* Maintenance Mode */}
        <div className="form-group">
          <label className="form-label">Maintenance Mode</label>
          <div className="toggle-switch">
            <input
              type="checkbox"
              id="maintenance"
              checked={maintenance}
              onChange={() => setMaintenance(!maintenance)}
            />
            <label htmlFor="maintenance" className="switch-label">
              {maintenance ? "On" : "Off"}
            </label>
          </div>
          <p className="form-helper">Enable to temporarily restrict user access.</p>
        </div>

        {/* Buttons */}
        <div className="form-actions">
          <button type="submit" className="btn-save">
            Save Changes
          </button>
          <button type="button" className="btn-reset" onClick={handleReset}>
            Reset to Defaults
          </button>
        </div>
      </form>
    </div>
  );
}
