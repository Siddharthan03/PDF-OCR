// src/components/admin/AdminOCRUpload.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import OCRUpload from "../OCRUpload";

export default function AdminOCRUpload({ auth, setAuth }) {
  // Guard: Only admins can access this page
  if (!auth || auth.role.toLowerCase() !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="admin-ocr-upload">
      <h2 className="section-heading">📂 Admin OCR Upload</h2>
      <OCRUpload auth={auth} setAuth={setAuth} isAdmin={true} />
    </div>
  );
}
