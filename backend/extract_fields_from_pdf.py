# extract_fields_from_pdf.py
"""
Extract patient header fields and ONLY the EVALUATION AND MANAGEMENT (NEW PATIENT)
procedure rows from a PDF.

Usage:
    python extract_fields_from_pdf.py /path/to/file.pdf

Notes:
- Uses PyMuPDF for text extraction by default. Optionally uses Google Vision OCR if desired.
- Returns only E&M rows parsed under EVALUATION AND MANAGEMENT headers.
"""

import re
import fitz
import logging
from bisect import bisect_right

# optional import; script runs without Vision
try:
    from google.cloud import vision
    _HAS_VISION = True
except Exception:
    _HAS_VISION = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SEPARATOR = "\n\n---PAGE---\n\n"
CURRENT_CENTURY_CUTOFF = 25

# -----------------------
# Small helpers (dates/names)
# -----------------------
def _first_match(pattern, text, flags=0):
    m = re.search(pattern, text, flags)
    return m.group(1).strip() if m else None

def _expand_two_digit_year(s):
    m = re.match(r"^(\d{1,2}/\d{1,2}/)(\d{2})$", s)
    if not m:
        return s
    yy = int(m.group(2))
    yyyy = 2000 + yy if yy <= CURRENT_CENTURY_CUTOFF else 1900 + yy
    return m.group(1) + str(yyyy)

def _normalize_date_token(tok):
    if not tok:
        return None
    tok = tok.strip()
    tok = re.sub(r"[^\d/]", "", tok)
    if re.match(r"^\d{1,2}/\d{1,2}/\d{2}$", tok):
        return _expand_two_digit_year(tok)
    if re.match(r"^\d{1,2}/\d{1,2}/\d{4}$", tok):
        return tok
    return tok

def _strip_dob_and_date_tokens(name):
    if not name:
        return name
    s = str(name).strip()
    s = re.sub(r"(?i)\bDOB[:\s-]*", " ", s)
    s = re.sub(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b", " ", s)
    s = re.sub(r"[\/\-\:\,\s]+$", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _normalize_name(n):
    if n is None:
        return ""
    s = str(n).strip()
    s = _strip_dob_and_date_tokens(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _base_name(name):
    if not name:
        return ""
    s = _normalize_name(name)
    s = s.upper()
    s = re.sub(r"[^\w,\s\'\-]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _is_noise_name(name):
    if not name:
        return True
    up = name.strip().upper()
    if up in ("NIL", "NAME", "PATIENT", "-", "--", "N/A", "NA"):
        return True
    if any(x in up for x in ("PPO", "MEDICARE", "INSURANCE", "PLAN", "AETNA", "CIGNA", "MEDICAID", "GROUP")):
        return True
    alpha_chars = re.findall(r"[A-Za-z]", name)
    if len(alpha_chars) < 2:
        return True
    tokens = [t for t in re.split(r"\s+", name.strip()) if t]
    if len(tokens) == 1 and len(tokens[0]) <= 2:
        return True
    return False

# -----------------------
# segmentation
# -----------------------
def _find_positions(text):
    starts = []
    for m in re.finditer(r"(?i)Patient(?: Full)? Name[:\s]", text):
        starts.append(m.start())
    for m in re.finditer(r"(?i)Patient[:\s]", text):
        starts.append(m.start())
    for m in re.finditer(r"(?i)Subscriber ID[:\s]", text):
        starts.append(m.start())
    for m in re.finditer(r"\b([A-Z][A-Z'`.\-]{1,}[,]\s+[A-Z][A-Z'`.\-]{1,})", text):
        starts.append(m.start())
    for m in re.finditer(r"\bDOB[:\s]*\d{1,2}/\d{1,2}/\d{2,4}", text, re.I):
        starts.append(m.start())
    starts = sorted(set(starts))
    return starts

def _split_segments(text):
    starts = _find_positions(text)
    if not starts:
        blocks = [b.strip() for b in re.split(r"\n{2,}", text) if b.strip()]
        segs = []
        offset = 0
        for b in blocks:
            start = text.find(b, offset)
            end = start + len(b)
            segs.append({"text": b, "start": start, "end": end})
            offset = end
        return segs if segs else [{"text": text.strip(), "start": 0, "end": len(text)}]
    starts.append(len(text))
    segments = []
    for i in range(len(starts)-1):
        seg = text[starts[i]:starts[i+1]].strip()
        if seg:
            segments.append({"text": seg, "start": starts[i], "end": starts[i+1]})
    if segments and not re.search(r"(?i)patient(?: full)? name|subscriber id|dob", segments[0]["text"][:120]):
        if len(segments) > 1:
            segments[1]["text"] = segments[0]["text"] + "\n" + segments[1]["text"]
            segments[1]["start"] = segments[0]["start"]
            segments.pop(0)
    return segments

# -----------------------
# merging / dedupe
# -----------------------
def _merge_patients(patients, combined_text):
    for p in patients:
        p["Patient Name"] = _normalize_name(p.get("Patient Name", "") or "")
        p["Base Name"] = _base_name(p.get("Patient Name", "") or "")
        p["Subscriber ID"] = (p.get("Subscriber ID") or "").strip()
        p["Date of Birth"] = p.get("Date of Birth") or "NIL"
        p["Primary Insurance"] = p.get("Primary Insurance") or "NIL"

    for p in patients:
        if _is_noise_name(p["Patient Name"]) and (p["Subscriber ID"] or (p["Date of Birth"] and p["Date of Birth"] != "NIL")):
            mname = re.search(r"\b([A-Z][A-Z'`.\-]{1,}[,]\s+[A-Z][A-Z'`.\-]{1,}(?:[A-Z ,.'\-\(\)]*)?)\b", combined_text)
            if mname:
                cand = mname.group(1).strip()
                if not _is_noise_name(cand):
                    p["Patient Name"] = _normalize_name(cand)
                    p["Base Name"] = _base_name(cand)

    merged_by_sub = {}
    for p in patients:
        sub = p["Subscriber ID"]
        if sub:
            if sub not in merged_by_sub:
                merged_by_sub[sub] = dict(p)
            else:
                ex = merged_by_sub[sub]
                for k in ("Patient Name", "Date of Birth", "Primary Insurance", "Date of Service"):
                    ev = ex.get(k, "NIL")
                    nv = p.get(k, "NIL")
                    if (not ev or ev in ("", "NIL")) and nv and nv not in ("", "NIL"):
                        ex[k] = nv

    by_name = {}
    for p in patients:
        if p["Subscriber ID"]:
            continue
        base = p.get("Base Name") or ""
        if not base:
            if _is_noise_name(p.get("Patient Name")) and (not p.get("Date of Birth") or p.get("Date of Birth") == "NIL"):
                continue
            base = p.get("Patient Name").upper()
        if base not in by_name:
            by_name[base] = dict(p)
        else:
            ex = by_name[base]
            for k in ("Patient Name", "Date of Birth", "Primary Insurance", "Subscriber ID", "Date of Service"):
                ev = ex.get(k, "NIL")
                nv = p.get(k, "NIL")
                if (not ev or ev in ("", "NIL")) and nv and nv not in ("", "NIL"):
                    ex[k] = nv

    final = []
    for rec in merged_by_sub.values():
        final.append(rec)
    existing_subs = set([rec.get("Subscriber ID") for rec in final if rec.get("Subscriber ID")])
    for rec in by_name.values():
        if rec.get("Subscriber ID") and rec.get("Subscriber ID") in existing_subs:
            for f in final:
                if f.get("Subscriber ID") == rec.get("Subscriber ID"):
                    for k in ("Patient Name", "Date of Birth", "Primary Insurance", "Date of Service"):
                        ev = f.get(k, "NIL")
                        nv = rec.get(k, "NIL")
                        if (not ev or ev in ("", "NIL")) and nv and nv not in ("", "NIL"):
                            f[k] = nv
                    break
            continue
        if _is_noise_name(rec.get("Patient Name")) and (not rec.get("Date of Birth") or rec.get("Date of Birth") == "NIL") and (not rec.get("Subscriber ID")):
            continue
        final.append(rec)

    collapsed = []
    seen = {}
    for rec in final:
        base = rec.get("Base Name") or _base_name(rec.get("Patient Name") or "")
        if base in seen:
            target = seen[base]
            for k in ("Patient Name", "Date of Birth", "Subscriber ID", "Primary Insurance", "Date of Service"):
                ev = target.get(k, "NIL")
                nv = rec.get(k, "NIL")
                if (not ev or ev in ("", "NIL")) and nv and nv not in ("", "NIL"):
                    target[k] = nv
        else:
            seen[base] = dict(rec)
            collapsed.append(seen[base])

    output = []
    for r in collapsed:
        if _is_noise_name(r.get("Patient Name")) and (not r.get("Date of Birth") or r.get("Date of Birth") == "NIL") and (not r.get("Subscriber ID") or r.get("Subscriber ID") == ""):
            continue
        output.append(r)

    return output

# -----------------------
# procedure parsing helpers (E&M only)
# -----------------------
def _normalize_fee(raw):
    if raw is None:
        return ""
    s = str(raw).strip()
    if not s:
        return ""
    s = s.replace("\u00A0", " ")
    s = re.sub(r"[^\d\.,]", "", s)
    s = s.replace(",", "")
    if not s:
        return ""
    if re.fullmatch(r"\d{3,}", s):
        s = s + ".00"
    if re.fullmatch(r"\d+", s):
        s = s + ".00"
    if re.fullmatch(r"\d+\.\d$", s):
        s = s + "0"
    m = re.search(r"(\d+\.\d{2})", raw)
    if m:
        return m.group(1)
    return s

def _cleanup_description(desc: str) -> str:
    if desc is None:
        return ""
    s = re.sub(r"\s+", " ", str(desc).strip())
    s = s.strip(" \t\n\r.,;:-")
    if not s:
        return ""
    tokens = s.split()
    cleaned_tokens = []
    for t in tokens:
        if re.search(r"[A-Za-z]", t):
            cleaned_tokens.append(t)
        elif re.fullmatch(r"\d{3,}", t):
            cleaned_tokens.append(t)
        elif re.fullmatch(r"\d{2}", t):
            cleaned_tokens.append(t)
        else:
            continue
    if not cleaned_tokens:
        return s
    return " ".join(cleaned_tokens)

def split_line_into_candidate_subrows(line):
    if not line:
        return []
    rows = []
    code_matches = list(re.finditer(r"\b[0-9]{2,6}\b", line))
    fee_matches = list(re.finditer(r"(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d{3,}|\d+\.\d{2})", line))
    for cm in code_matches:
        cstart, cend = cm.start(), cm.end()
        fee_match = None
        for fm in fee_matches:
            if fm.start() > cend:
                fee_match = fm
                break
        if fee_match:
            fee_raw = fee_match.group(1)
            mid = line[cend:fee_match.start()]
            desc = _cleanup_description(mid)
            rows.append([cm.group(0), desc, fee_raw])
    if rows:
        return rows
    parts = re.split(r"\s{2,}|\t|\s*\|\s*", line)
    parts = [p.strip() for p in parts if p and p.strip()]
    if len(parts) >= 3:
        code = parts[0]
        fee = parts[-1]
        desc = " ".join(parts[1:-1])
        fee_val = _normalize_fee(fee)
        desc = _cleanup_description(desc)
        return [[code, desc, fee_val]]
    m = re.search(r"([0-9]{2,6})\s+(.+?)\s+(\d+\.\d{2})\s*$", line)
    if m:
        desc = _cleanup_description(m.group(2).strip())
        rows.append([m.group(1), desc, m.group(3)])
    return rows

def extract_em_sections_from_page_text(page_text):
    if not page_text:
        return []
    lines = page_text.splitlines()
    em_blocks = []
    em_header_re = re.compile(r"(?i)(Evaluation\s+and\s+Management|EVALUATION\s+AND\s+MANAGEMENT).{0,60}(New\s+Patient|\bNEW\s+PATIENT\b|\(.*NEW\s+PATIENT.*\))?", re.I)
    stop_re = re.compile(r"(?i)^(?:Code\s+Description\s+Fee|Procedures|Consultation|Counseling|Cash\s+Payment|ANNUAL\s+WELLNESS|DIAGNOSIS|Patient\s+Diagnosis|Patient\s+Procedures|COUNSELING/SCREENING/PREVENTION)", re.I)
    for idx, ln in enumerate(lines):
        if em_header_re.search(ln):
            header = ln.strip()
            j = idx + 1
            raw_lines = []
            parsed_rows = []
            while j < len(lines):
                cur = lines[j].rstrip()
                if not cur.strip():
                    j += 1
                    continue
                if stop_re.search(cur):
                    break
                raw_lines.append(cur)
                cand_rows = split_line_into_candidate_subrows(cur)
                for cr in cand_rows:
                    code = cr[0] if len(cr) > 0 else ""
                    desc = cr[1] if len(cr) > 1 else ""
                    fee = _normalize_fee(cr[2] if len(cr) > 2 else "")
                    parsed_rows.append((code, desc, fee))
                j += 1
            em_blocks.append({"header": header, "raw_lines": raw_lines, "parsed_rows": parsed_rows})
    return em_blocks

def assign_em_rows_to_patients(em_by_page, page_texts, patients, combined_text):
    page_patient_bases = {}
    for i, ptxt in enumerate(page_texts):
        page_patient_bases[i] = []
        for p in patients:
            base = p.get("Base Name") or _base_name(p.get("Patient Name") or "")
            if not base:
                continue
            if re.search(re.escape(base), ptxt, re.I):
                page_patient_bases[i].append(base)
    patient_em = {p.get("Base Name") or _base_name(p.get("Patient Name") or ""): [] for p in patients}
    for page_idx, blocks in em_by_page.items():
        bases_here = page_patient_bases.get(page_idx, [])
        assigned_base = None
        if bases_here:
            assigned_base = bases_here[0]
        else:
            offsets = []
            cumul = 0
            for ptxt in page_texts:
                offsets.append(cumul)
                cumul += len(ptxt) + len(SEPARATOR)
            page_abs_start = offsets[page_idx] if page_idx < len(offsets) else 0
            best_base = None
            best_dist = None
            for p in patients:
                base = p.get("Base Name") or _base_name(p.get("Patient Name") or "")
                if not base:
                    continue
                for m in re.finditer(re.escape(base), combined_text, re.I):
                    pos = m.start()
                    dist = abs(pos - page_abs_start)
                    if best_dist is None or dist < best_dist:
                        best_dist = dist
                        best_base = base
            assigned_base = best_base or next(iter(patient_em.keys()), None)
        if not assigned_base:
            continue
        for b in blocks:
            for code, desc, fee in b.get("parsed_rows", []):
                patient_em.setdefault(assigned_base, []).append({"Code": code, "Description": desc, "Fee": fee})
    return patient_em

# -----------------------
# aggressive recovery helper (this was missing previously)
# -----------------------
def _score_subscriber_candidate(tok, window):
    if not tok:
        return -1000
    t = tok.strip()
    if re.match(r"^\d{1,2}/\d{1,2}/\d{2,4}$", t):
        return -1000
    if re.fullmatch(r"\d{1,6}", t):
        return -500
    score = 0
    if re.search(r"[A-Za-z]", t) and re.search(r"[0-9]", t):
        score += 50
    if "-" in t:
        score += 5
    if len(t) >= 8:
        score += 10
    if len(t) >= 10:
        score += 5
    subpos = window.lower().find("subscriber")
    if subpos >= 0:
        win_idx = window.find(t)
        if win_idx != -1 and abs(win_idx - subpos) <= 80:
            score += 20
    if re.fullmatch(r"[A-Za-z\-]{3,}", t):
        score -= 10
    if len(t) < 6:
        score -= 5
    return score

def _best_subscriber_from_window(window):
    msub = re.search(r"Subscriber(?: ID)?[:\s]*([A-Za-z0-9\-]{5,20})", window, re.I)
    if msub:
        cand = msub.group(1).strip()
        if not re.fullmatch(r"\d{1,6}", cand):
            return cand
    tokens = re.findall(r"\b([A-Z0-9\-]{5,20})\b", window, re.I)
    best = None
    best_score = -10**9
    for t in tokens:
        sc = _score_subscriber_candidate(t, window)
        if sc > best_score:
            best_score = sc
            best = t
    if best_score > 0 and best:
        return best
    return None

def _detect_page_level_subscribers(page_texts):
    page_level_subs = {}
    for idx, ptxt in enumerate(page_texts):
        if not ptxt:
            continue
        for m in re.finditer(r"Subscriber(?: ID)?[:\s]*([A-Za-z0-9\-]{5,20})", ptxt, re.I):
            cand = m.group(1).strip()
            if not re.fullmatch(r"\d{1,6}", cand):
                page_level_subs[idx] = cand
                break
        if idx not in page_level_subs:
            best = None
            best_score = -10**9
            tokens = re.findall(r"\b([A-Z0-9\-]{6,20})\b", ptxt, re.I)
            for t in tokens:
                sc = _score_subscriber_candidate(t, ptxt)
                if sc > best_score:
                    best_score = sc
                    best = t
            if best_score > 0:
                page_level_subs[idx] = best
    return page_level_subs

def _recover_missing_fields_aggressive(cleaned, combined_text, page_texts, page_level_dos=None, page_level_subs=None):
    """
    Fill missing DOB/DOS/Subscriber/Insurance by searching windows near the patient's base name.
    Conservative: avoids setting DOS equal to DOB; prefers labeled fields.
    """
    if page_level_dos is None:
        page_level_dos = {}
    if page_level_subs is None:
        page_level_subs = _detect_page_level_subscribers(page_texts)

    page_offsets = []
    offset = 0
    for ptxt in page_texts:
        page_offsets.append(offset)
        offset += len(ptxt) + len(SEPARATOR)
    page_offsets.append(offset)

    def _extract_from_window(window):
        found = {}
        mdob_label = re.search(r"\bDOB[:\s]*([0-9]{1,2}/[0-9]{1,2}/(?:[0-9]{4}|\d{2}))", window, re.I)
        if mdob_label:
            found["Date of Birth"] = _normalize_date_token(mdob_label.group(1).strip())
        mdos_label = re.search(r"(?:Date\s+of\s+Service|Visit\s+Date|Order\s+Date|DOS)[:\s]*([0-9]{1,2}/[0-9]{1,2}/(?:[0-9]{4}|\d{2}))", window, re.I)
        if mdos_label:
            found["Date of Service"] = _normalize_date_token(mdos_label.group(1).strip())
        date_tokens = re.findall(r"([0-9]{1,2}/[0-9]{1,2}/(?:[0-9]{4}|\d{2}))", window)
        normalized_dates = [_normalize_date_token(d) for d in date_tokens]
        four_digit = [d for d in normalized_dates if d and re.match(r".*/.*/\d{4}$", d)]
        two_digit = [d for d in normalized_dates if d and re.match(r".*/.*/\d{2}$", d)]
        if "Date of Birth" not in found:
            if four_digit:
                found["Date of Birth"] = four_digit[0]
            elif two_digit:
                found["Date of Birth"] = _expand_two_digit_year(two_digit[0]) if two_digit else None
        if "Date of Service" not in found:
            candidate = None
            for d in four_digit:
                if "Date of Birth" in found and d == found.get("Date of Birth"):
                    continue
                candidate = d
                break
            if candidate is None:
                for d in two_digit:
                    dnorm = _expand_two_digit_year(d)
                    if "Date of Birth" in found and dnorm == found.get("Date of Birth"):
                        continue
                    candidate = dnorm
                    break
            if candidate:
                found["Date of Service"] = candidate
        msub = re.search(r"Subscriber(?: ID)?[:\s]*([A-Za-z0-9\-]{5,20})", window, re.I)
        if msub:
            cand = msub.group(1).strip()
            if not re.fullmatch(r"\d{1,6}", cand):
                found["Subscriber ID"] = cand
        else:
            cand = _best_subscriber_from_window(window)
            if cand:
                found["Subscriber ID"] = cand
        mins = re.search(r"(?:Primary\s+Insurance|Primary\s+Payor|Payor|Insurance)[:\s]*([^\n\r]{3,80})", window, re.I)
        if mins:
            val = mins.group(1).strip().splitlines()[0].strip()
            val = re.sub(r"\s{2,}", " ", val)
            found["Primary Insurance"] = val
        return found

    for p in cleaned:
        base = p.get("Base Name") or _base_name(p.get("Patient Name") or "")
        if not base:
            continue
        need = {
            "Date of Birth": (not p.get("Date of Birth") or p.get("Date of Birth") in ("", "NIL")),
            "Date of Service": (not p.get("Date of Service") or p.get("Date of Service") in ("", "NIL")),
            "Subscriber ID": (not p.get("Subscriber ID") or p.get("Subscriber ID") in ("", "NIL", "")),
            "Primary Insurance": (not p.get("Primary Insurance") or p.get("Primary Insurance") in ("", "NIL")),
        }
        if not any(need.values()):
            continue
        # page-level
        for page_index, page_text in enumerate(page_texts):
            if re.search(re.escape(base), page_text, re.I):
                page_sub = page_level_subs.get(page_index)
                if page_sub and need["Subscriber ID"]:
                    p["Subscriber ID"] = page_sub
                    need["Subscriber ID"] = False
                page_dos = page_level_dos.get(page_index)
                if page_dos and need["Date of Service"]:
                    if p.get("Date of Birth") not in (None, "", "NIL") and _normalize_date_token(p.get("Date of Birth")) == _normalize_date_token(page_dos):
                        pass
                    else:
                        p["Date of Service"] = page_dos
                        need["Date of Service"] = False
                if not any(need.values()):
                    break
        if not any(need.values()):
            continue
        # windowed search around each occurrence of base on each page
        for page_index, page_text in enumerate(page_texts):
            for m in re.finditer(re.escape(base), page_text, re.I):
                start = max(0, m.start() - 600)
                end = min(len(page_text), m.end() + 600)
                window = page_text[start:end]
                found = _extract_from_window(window)
                if "Date of Birth" in found and need["Date of Birth"]:
                    p["Date of Birth"] = found["Date of Birth"]
                    need["Date of Birth"] = False
                if "Date of Service" in found and need["Date of Service"]:
                    if found["Date of Service"] != p.get("Date of Birth"):
                        p["Date of Service"] = found["Date of Service"]
                        need["Date of Service"] = False
                if "Subscriber ID" in found and need["Subscriber ID"]:
                    p["Subscriber ID"] = found["Subscriber ID"]
                    need["Subscriber ID"] = False
                if "Primary Insurance" in found and need["Primary Insurance"]:
                    p["Primary Insurance"] = found["Primary Insurance"]
                    need["Primary Insurance"] = False
                if not any(need.values()):
                    break
            if not any(need.values()):
                break
        # fallback combined_text
        if any(need.values()):
            for m in re.finditer(re.escape(base), combined_text, re.I):
                start = max(0, m.start() - 1000)
                end = min(len(combined_text), m.end() + 1000)
                window = combined_text[start:end]
                found = _extract_from_window(window)
                if "Date of Birth" in found and need["Date of Birth"]:
                    p["Date of Birth"] = found["Date of Birth"]
                    need["Date of Birth"] = False
                if "Date of Service" in found and need["Date of Service"]:
                    if found["Date of Service"] != p.get("Date of Birth"):
                        p["Date of Service"] = found["Date of Service"]
                        need["Date of Service"] = False
                if "Subscriber ID" in found and need["Subscriber ID"]:
                    p["Subscriber ID"] = found["Subscriber ID"]
                    need["Subscriber ID"] = False
                if "Primary Insurance" in found and need["Primary Insurance"]:
                    p["Primary Insurance"] = found["Primary Insurance"]
                    need["Primary Insurance"] = False
                if not any(need.values()):
                    break
    for p in cleaned:
        if not p.get("Primary Insurance") or p.get("Primary Insurance") in ("", "NIL"):
            p["Primary Insurance"] = p.get("Primary Insurance", "NIL") or "NIL"
    return cleaned

# -----------------------
# Main extractor
# -----------------------
def extract_fields_from_pdf(file_obj, vision_enabled=True):
    vision_client = None
    if vision_enabled and _HAS_VISION:
        try:
            vision_client = vision.ImageAnnotatorClient()
        except Exception as e:
            logger.info("Vision client init failed: %s (falling back to PyMuPDF)", e)
            vision_client = None

    try:
        file_obj.seek(0)
    except Exception:
        pass
    pdf_bytes = file_obj.read()
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        logger.error("Failed to open PDF: %s", e)
        return {"patients": [], "procedure_tables": {}, "patient_procedures": {}, "file_name": getattr(file_obj, "name", None)}

    page_texts = []
    for page in doc:
        try:
            txt = ""
            if vision_client:
                try:
                    pix = page.get_pixmap(dpi=300)
                    img_bytes = pix.tobytes("png")
                    resp = vision_client.document_text_detection(image=vision.Image(content=img_bytes))
                    if getattr(resp, "full_text_annotation", None) and resp.full_text_annotation.text:
                        txt = resp.full_text_annotation.text
                except Exception:
                    txt = page.get_text("text") or ""
            else:
                txt = page.get_text("text") or ""
            page_texts.append(txt or "")
        except Exception as e:
            logger.warning("Page text extraction error: %s", e)
            page_texts.append("")

    combined_text = SEPARATOR.join(page_texts).strip()
    if not combined_text or all(len(p.strip()) == 0 for p in page_texts):
        logger.info("No text extracted.")
        return {"patients": [], "procedure_tables": {}, "patient_procedures": {}, "file_name": getattr(file_obj, "name", None)}

    # build candidate patient segments
    segments = _split_segments(combined_text)
    candidates = []
    for seg in segments:
        text = seg["text"]
        patient_name = _first_match(r"(?i)Patient(?:\s+Full|\s+Name)?[:\s]*([A-Za-z0-9 ,.'\-]+|NIL)\b", text)
        if not patient_name:
            patient_name = _first_match(r"\b([A-Z][A-Z'`.\-]{1,}[,]\s+[A-Z][A-Z'`.\-]{1,}(?:[A-Z ,.'\-\(\)]*)?)\b", text)
        if not patient_name or patient_name.strip().upper() == "NIL":
            lines = [ln.rstrip() for ln in text.splitlines()]
            found = False
            for i, ln in enumerate(lines):
                m = re.match(r"(?i)^\s*Patient(?:\s+Full|\s+Name)?\s*[:\-\s]\s*(.*)$", ln)
                if m:
                    tail = m.group(1).strip()
                    if tail and tail.upper() != "NIL":
                        patient_name = tail
                        found = True
                        break
                    for j in range(i+1, len(lines)):
                        cand = lines[j].strip()
                        if cand:
                            if cand.upper() != "NIL":
                                patient_name = cand
                                found = True
                                break
                            else:
                                break
                    if found:
                        break
            if not found and (not patient_name or patient_name.strip().upper() == "NIL"):
                for ln in lines:
                    if re.match(r"^[A-Z][A-Z'`.\-]{1,}[,]\s+[A-Z][A-Z'`.\-]{1,}(?:[A-Z ,.'\-\(\)]*)?$", ln.strip()):
                        candidate = ln.strip()
                        if candidate.upper() != "NIL":
                            patient_name = candidate
                            break

        patient_name = _normalize_name(patient_name) if patient_name else "NIL"
        dob = _first_match(r"\bDOB[:\s]*([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})", text, re.I)
        if not dob and patient_name and patient_name != "NIL":
            pos = text.find(patient_name)
            if pos >= 0:
                window = text[pos: pos + 300]
                m3 = re.search(r"([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})", window)
                if m3:
                    dob = m3.group(1).strip()
        subscriber = _first_match(r"Subscriber(?: ID)?[:\s]*([A-Za-z0-9\-]{5,20})", text, re.I) or ""
        if subscriber and re.fullmatch(r"\d{1,6}", subscriber):
            subscriber = ""
        insurance = _first_match(r"(?:Primary\s+Insurance|Primary\s+Payor|Payor|Insurance)[:\s]*([^\n\r]+)", text, re.I)
        dos = _first_match(r"(?:Date\s+of\s+Service|Order\s+Date|Visit\s+Date|DOS)[:\s]*([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})", text, re.I)

        candidates.append({
            "Patient Name": patient_name if patient_name else "NIL",
            "Date of Birth": dob.strip() if dob else "NIL",
            "Subscriber ID": subscriber.strip() if subscriber else "",
            "Primary Insurance": insurance.strip() if insurance else "NIL",
            "Date of Service": dos.strip() if dos else "NIL",
        })

    cleaned = _merge_patients(candidates, combined_text)

    # page-level DOS and subscribers
    page_level_dos = {}
    dos_label_re = re.compile(r"(?:Date\s+of\s+Service|Visit\s+Date|Order\s+Date|DOS)[:\s]*([0-9]{1,2}/[0-9]{1,2}/(?:\d{4}|\d{2}))", re.I)
    for idx, ptxt in enumerate(page_texts):
        if not ptxt:
            continue
        m = dos_label_re.search(ptxt)
        if m:
            dos_raw = m.group(1).strip()
            dos_norm = _normalize_date_token(dos_raw)
            if dos_norm:
                page_level_dos[idx] = dos_norm

    page_level_subs = _detect_page_level_subscribers(page_texts)

    # recover missing fields
    cleaned = _recover_missing_fields_aggressive(cleaned, combined_text, page_texts, page_level_dos, page_level_subs)

    # Extract E&M blocks per page
    em_by_page = {}
    for page_idx, ptxt in enumerate(page_texts):
        blocks = extract_em_sections_from_page_text(ptxt)
        if blocks:
            em_by_page[page_idx] = blocks

    # assign E&M rows to patients
    patient_em_map = assign_em_rows_to_patients(em_by_page, page_texts, cleaned, combined_text)

    # prepare final patients list and attach only E&M rows
    final_patients = []
    for p in cleaned:
        base = _base_name(p.get("Patient Name") or "")
        patient_name = base if base else _normalize_name(p.get("Patient Name") or "NIL")
        dob = p.get("Date of Birth") or "NIL"
        if dob and dob != "NIL":
            dob = _normalize_date_token(dob) or dob
        dos = p.get("Date of Service") or "NIL"
        if dos and dos != "NIL":
            dos = _normalize_date_token(dos) or dos
        insurance = p.get("Primary Insurance") or "NIL"
        subscriber = p.get("Subscriber ID") or "NIL"

        em_rows = patient_em_map.get(base, []) or []

        final_patients.append({
            "Base Name": base if base else "NIL",
            "Patient Name": patient_name if patient_name else "NIL",
            "Date of Birth": dob if dob else "NIL",
            "Date of Service": dos if dos else "NIL",
            "Primary Insurance": insurance if insurance else "NIL",
            "Subscriber ID": subscriber if subscriber else "NIL",
            "EvaluationAndManagement_Procedures": em_rows,
        })

    cleaned_proc_tables = {}
    for page_idx, blocks in em_by_page.items():
        for b in blocks:
            hdr = b.get("header", "EVALUATION AND MANAGEMENT")
            cleaned_proc_tables.setdefault(hdr, []).extend([[r[0], r[1], r[2]] for r in b.get("parsed_rows", [])])

    return {
        "patients": final_patients,
        "procedure_tables": cleaned_proc_tables,
        "patient_procedures": patient_em_map,
        "file_name": getattr(file_obj, "name", None) or "unknown.pdf"
    }

# -----------------------
# display helper (prints only E&M for each patient)
# -----------------------
def display_patient_em_only(result, print_fn=print):
    patients = result.get("patients", [])
    if not patients:
        print_fn("No patients found.")
        return
    print_fn(f"{len(patients)} patient(s) found.")
    for i, p in enumerate(patients, start=1):
        print_fn("=" * 60)
        print_fn(f"Patient {i}: {p.get('Patient Name','NIL')}")
        print_fn("-" * 60)
        print_fn(f"Base Name: {p.get('Base Name','NIL')}")
        print_fn(f"Date of Birth: {p.get('Date of Birth','NIL')}")
        print_fn(f"Date of Service: {p.get('Date of Service','NIL')}")
        print_fn(f"Primary Insurance: {p.get('Primary Insurance','NIL')}")
        print_fn(f"Subscriber ID: {p.get('Subscriber ID','NIL')}")
        print_fn("\nEVALUATION AND MANAGEMENT (NEW PATIENT) Procedures:")
        em = p.get("EvaluationAndManagement_Procedures", [])
        if not em:
            print_fn("  No E&M (New Patient) procedures found for this patient.")
        else:
            for r in em:
                print_fn(f"  - Code: {r.get('Code','')} \t Desc: {r.get('Description','')} \t Fee: {r.get('Fee','')}")
        print_fn("\n")

if __name__ == "__main__":
    import sys
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "/mnt/data/Sample pdf ocr 1.pdf"
    with open(pdf_path, "rb") as fh:
        res = extract_fields_from_pdf(fh, vision_enabled=False)
    display_patient_em_only(res)
