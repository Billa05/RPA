/* CertifyHub — User Portal Logic
 * All user/API data is set via textContent or setAttribute — no raw innerHTML interpolation.
 */
'use strict';

const API = 'http://localhost:5000/api';

let currentEvent  = null;
let currentRegId  = null;
let uploadedFiles = {};
let pollTimer     = null;

const DOC_LABELS = {
  government_id:   { label: 'Government ID',           icon: 'fa-id-card' },
  photo:           { label: 'Passport Photo',           icon: 'fa-camera' },
  address_proof:   { label: 'Address Proof',            icon: 'fa-home' },
  payment_receipt: { label: 'Payment Receipt',          icon: 'fa-receipt' },
  education_cert:  { label: 'Education Certificate',    icon: 'fa-graduation-cap' },
  employer_letter: { label: 'Employer Letter',          icon: 'fa-briefcase' },
  medical_cert:    { label: 'Medical Certificate',      icon: 'fa-heartbeat' },
  noc:             { label: 'No Objection Certificate', icon: 'fa-file-signature' },
};

// ── DOM helpers ──────────────────────────────────────────
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'cls')       node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'id')   node.id = v;
    else                   node.setAttribute(k, v);
  });
  children.forEach(c => c && node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return node;
}
function icon(cls) { return el('i', { cls: `fas ${cls}` }); }
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// ── Toast ────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const row = el('div', { cls: `toast ${type}` }, [icon(icons[type]), ' ' + msg]);
  document.getElementById('toasts').appendChild(row);
  setTimeout(() => row.remove(), 4200);
}

// ── Views ────────────────────────────────────────────────
function showHome() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  document.getElementById('view-home').style.display = '';
  document.getElementById('view-flow').style.display = 'none';
  currentEvent = null; currentRegId = null; uploadedFiles = {};
}

function showFlow(event) {
  currentEvent = event;
  document.getElementById('view-home').style.display = 'none';
  document.getElementById('view-flow').style.display = '';
  const badge = document.getElementById('flow-event-badge');
  clear(badge);
  badge.appendChild(icon('fa-calendar-alt'));
  badge.appendChild(document.createTextNode(' ' + event.name));
  document.getElementById('step1-event-name').textContent = event.name;
  goStep(1);
}

// ── Events ───────────────────────────────────────────────
async function loadEvents() {
  const grid = document.getElementById('events-grid');
  clear(grid);
  grid.appendChild(el('div', { cls: 'empty-state' }, [
    icon('fa-spinner fa-spin'), el('p', { text: 'Loading…' })
  ]));

  try {
    await fetch(`${API}/seed`, { method: 'POST' }).catch(() => {});
    const events = await fetch(`${API}/events`).then(r => r.json());
    renderEvents(events);
  } catch {
    clear(grid);
    grid.appendChild(el('div', { cls: 'empty-state' }, [
      icon('fa-exclamation-triangle'),
      el('p', { text: 'Backend not reachable. Run: cd backend && python app.py' })
    ]));
  }
}

function renderEvents(events) {
  const grid = document.getElementById('events-grid');
  clear(grid);

  if (!events.length) {
    grid.appendChild(el('div', { cls: 'empty-state' }, [
      icon('fa-calendar-times'), el('p', { text: 'No events available.' })
    ]));
    return;
  }

  events.forEach(evt => {
    // Header row
    const nameEl   = el('h3', { text: evt.name });
    const vendorBadge = el('span', { cls: 'badge badge-purple', style: 'margin-top:4px' }, [evt.vendorName]);
    const nameWrap = el('div', {}, [nameEl, vendorBadge]);
    const eventIcon = el('div', { cls: 'event-icon' }, [icon('fa-calendar-star')]);
    const topRow   = el('div', { cls: 'event-card-top' }, [nameWrap, eventIcon]);

    // Description
    const desc = el('p', { cls: 'event-desc', text: evt.description });

    // Meta
    const metaDate  = el('span', {}, [icon('fa-calendar'), ' ' + evt.date]);
    const metaVenue = el('span', {}, [icon('fa-map-marker-alt'), ' ' + (evt.venue || '—')]);
    const metaAtt   = el('span', {}, [icon('fa-users'), ' ' + evt.attendeeCount + ' attendees']);
    const meta      = el('div', { cls: 'event-meta' }, [metaDate, metaVenue, metaAtt]);

    // Required doc chips
    const chipsWrap = el('div', { cls: 'docs-required' });
    (evt.requiredDocs || []).forEach(d => {
      const info = DOC_LABELS[d] || { label: d, icon: 'fa-file' };
      chipsWrap.appendChild(el('div', { cls: 'doc-chip' }, [icon(info.icon), ' ' + info.label]));
    });

    const card = el('div', { cls: 'card event-card' }, [topRow, desc, meta, chipsWrap]);
    card.addEventListener('click', () => openEvent(evt.id));
    grid.appendChild(card);
  });
}

async function openEvent(id) {
  try {
    const event = await fetch(`${API}/events/${id}`).then(r => r.json());
    showFlow(event);
  } catch {
    toast('Failed to load event', 'error');
  }
}

// ── Wizard ───────────────────────────────────────────────
function goStep(n) {
  document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.wizard-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < n) s.classList.add('done');
    if (i + 1 === n) s.classList.add('active');
  });
  document.getElementById(`panel-${n}`).classList.add('active');
  if (n === 4) loadCertificate();
  window.scrollTo({ top: 100, behavior: 'smooth' });
}

// ── Step 1: Attendance check ─────────────────────────────
async function checkAttendance() {
  const name = document.getElementById('att-name').value.trim();
  const id   = document.getElementById('att-id').value.trim();
  if (!name || !id) { toast('Enter your name and ID number', 'error'); return; }

  try {
    const res = await fetch(`${API}/events/${currentEvent.id}/check-attendee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, idNumber: id })
    }).then(r => r.json());

    if (!res.found) {
      toast(res.reason || 'Not found in attendee list', 'error');
      return;
    }

    toast('Welcome, ' + res.attendeeName + '! Attendance confirmed.', 'success');

    // Check if this person already has a registration
    if (res.existingRegistration) {
      const reg = res.existingRegistration;
      currentRegId = reg.id;

      if (reg.certificateReady) {
        // Certificate is ready — skip straight to download
        toast('Your certificate is ready! Jumping to download.', 'success');
        goStep(4);
        return;
      }

      if (['partial', 'failed'].includes(reg.verificationStatus) && !reg.vendorOverride) {
        // Docs were checked but some failed — show results, start polling for vendor override
        toast('You already submitted — showing your verification results.', 'info');
        resumeVerificationView(reg);
        goStep(3);
        return;
      }

      if (reg.verificationStatus === 'verified' || reg.verificationStatus === 'approved') {
        // All verified — go to cert
        toast('All documents verified! Generating certificate.', 'success');
        goStep(4);
        return;
      }

      // Status is 'pending' — docs submitted but not verified yet, re-trigger verify
      toast('Resuming your registration — re-verifying documents.', 'info');
      const verify = await fetch(`${API}/registrations/${currentRegId}/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      }).then(r => r.json());
      renderVerification(verify);
      goStep(3);
      return;
    }

    // No existing registration — normal flow: upload documents
    buildUploadList();
    goStep(2);
  } catch {
    toast('Cannot verify attendance. Is the backend running?', 'error');
  }
}

// Resume the verification view for an existing registration (no re-upload)
function resumeVerificationView(reg) {
  const docs = reg.documents || [];
  const passCount = docs.filter(d => d.status === 'verified').length;
  const failCount = docs.filter(d => d.status === 'failed').length;

  document.getElementById('pass-count').textContent = passCount;
  document.getElementById('fail-count').textContent = failCount;

  const container = document.getElementById('verify-results');
  clear(container);

  docs.forEach(d => {
    const info = DOC_LABELS[d.key] || DOC_LABELS[d.docType] || { label: d.name, icon: 'fa-file' };
    const isOk = d.status === 'verified';

    const statusIcon = icon(isOk ? 'fa-check-circle' : 'fa-times-circle');
    const iconWrap   = el('div', { cls: 'doc-result-icon' }, [statusIcon]);

    const nameEl  = el('div', { cls: 'doc-result-name', text: info.label });
    const infoDiv = el('div', { cls: 'doc-result-info' }, [nameEl]);
    if (d.reason) {
      const reasonEl = el('div', { cls: 'doc-result-reason' }, [icon('fa-exclamation-triangle'), ' ' + d.reason]);
      infoDiv.appendChild(reasonEl);
    }

    const badge = el('span', { cls: 'badge ' + (isOk ? 'badge-green' : 'badge-red'), text: isOk ? 'Verified' : 'Failed' });
    const conf  = el('div', { cls: 'doc-result-conf', text: d.confidence ? (d.confidence * 100).toFixed(0) + '% confidence' : '' });
    const aside = el('div', {}, [badge, conf]);

    const row = el('div', { cls: `doc-result ${d.status}` }, [iconWrap, infoDiv, aside]);
    container.appendChild(row);
  });

  if (reg.certificateReady) {
    document.getElementById('all-passed-msg').style.display   = '';
    document.getElementById('some-failed-msg').style.display  = 'none';
    document.getElementById('btn-get-cert').style.display     = '';
    document.getElementById('btn-wait-vendor').style.display  = 'none';
  } else {
    document.getElementById('all-passed-msg').style.display   = 'none';
    document.getElementById('some-failed-msg').style.display  = '';
    document.getElementById('btn-get-cert').style.display     = 'none';
    document.getElementById('btn-wait-vendor').style.display  = '';
    startPolling();
  }
}

// ── Step 2: Upload documents ─────────────────────────────
function buildUploadList() {
  uploadedFiles = {};
  const docs = currentEvent.requiredDocs || [];
  const container = document.getElementById('upload-list');
  clear(container);

  docs.forEach((docType, i) => {
    const info = DOC_LABELS[docType] || { label: docType, icon: 'fa-file' };

    // Header
    const num    = el('div', { cls: 'doc-upload-num', text: String(i + 1) });
    const lbl    = el('label', { cls: 'form-label', style: 'margin:0' }, [icon(info.icon), ' ' + info.label]);
    const reqMark = el('span', { style: 'color:var(--red)' }, [' *']);
    lbl.appendChild(reqMark);
    const header = el('div', { cls: 'doc-upload-header' }, [num, lbl]);

    // Upload area
    const fileInput = el('input', { type: 'file', id: `fi-${docType}`, accept: '.pdf,.jpg,.jpeg,.png', style: 'display:none' });
    const uploadIconEl = el('div', { cls: 'upload-icon' }, [icon('fa-cloud-upload-alt')]);
    const uploadTitle  = el('div', { text: 'Click or drag to upload', style: 'font-size:14px;font-weight:600' });
    const uploadHint   = el('div', { cls: 'upload-hint', text: 'PDF, JPG, PNG — max 5 MB' });
    const area = el('div', { cls: 'upload-area', id: `ua-${docType}` }, [fileInput, uploadIconEl, uploadTitle, uploadHint]);

    area.addEventListener('click', () => fileInput.click());
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', e => {
      e.preventDefault(); area.classList.remove('drag-over');
      const f = e.dataTransfer.files[0]; if (f) setFile(docType, f);
    });
    fileInput.addEventListener('change', function() { if (this.files[0]) setFile(docType, this.files[0]); });

    // Preview row
    const prevIcon = icon('fa-file-alt');
    const prevName = el('div', { cls: 'upload-preview-name', id: `upn-${docType}` });
    const prevSize = el('div', { cls: 'upload-preview-size', id: `ups-${docType}` });
    const prevInfo = el('div', { cls: 'upload-preview-info' }, [prevName, prevSize]);
    const removeBtn = el('button', { cls: 'btn btn-ghost btn-sm' }, [icon('fa-times')]);
    removeBtn.addEventListener('click', () => removeFile(docType));
    const prev = el('div', { cls: 'upload-preview', id: `up-${docType}`, style: 'display:none' }, [prevIcon, prevInfo, removeBtn]);

    const item = el('div', { cls: 'doc-upload-item' }, [header, area, prev]);
    container.appendChild(item);
  });
}

function setFile(dt, file) {
  if (file.size > 5 * 1024 * 1024) { toast('File must be under 5 MB', 'error'); return; }
  uploadedFiles[dt] = file;
  const area = document.getElementById(`ua-${dt}`);
  if (area) area.style.display = 'none';
  const prev = document.getElementById(`up-${dt}`);
  if (prev) {
    prev.style.display = 'flex';
    document.getElementById(`upn-${dt}`).textContent = file.name;
    document.getElementById(`ups-${dt}`).textContent = fmtSize(file.size);
  }
  toast(file.name + ' ready', 'success');
}

function removeFile(dt) {
  delete uploadedFiles[dt];
  const area = document.getElementById(`ua-${dt}`);
  if (area) area.style.display = '';
  const prev = document.getElementById(`up-${dt}`);
  if (prev) prev.style.display = 'none';
  const fi = document.getElementById(`fi-${dt}`);
  if (fi) fi.value = '';
}

function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

// ── Submit & Verify ──────────────────────────────────────
async function submitAndVerify() {
  const requiredDocs = currentEvent.requiredDocs || [];
  for (const dt of requiredDocs) {
    if (!uploadedFiles[dt]) {
      toast('Please upload: ' + (DOC_LABELS[dt] || { label: dt }).label, 'error');
      return;
    }
  }

  const name = document.getElementById('att-name').value.trim();
  const id   = document.getElementById('att-id').value.trim();
  const docs = requiredDocs.map(dt => ({ key: dt, name: uploadedFiles[dt].name, docType: dt }));

  try {
    // Send as multipart form with actual files
    const formData = new FormData();
    formData.append('data', JSON.stringify({ name, idNumber: id, documents: docs }));
    requiredDocs.forEach(dt => {
      if (uploadedFiles[dt]) formData.append(dt, uploadedFiles[dt]);
    });

    const reg = await fetch(`${API}/events/${currentEvent.id}/register`, {
      method: 'POST',
      body: formData
    }).then(r => r.json());

    if (reg.error) { toast(reg.error, 'error'); return; }
    currentRegId = reg.id;
    toast('Submitted — verifying documents…', 'info');

    const verify = await fetch(`${API}/registrations/${currentRegId}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());

    renderVerification(verify);
    goStep(3);
  } catch {
    toast('Submission failed. Is the backend running?', 'error');
  }
}

function renderVerification(data) {
  document.getElementById('pass-count').textContent = data.passCount;
  document.getElementById('fail-count').textContent = data.failCount;

  const container = document.getElementById('verify-results');
  clear(container);

  data.results.forEach(r => {
    const info = DOC_LABELS[r.key] || { label: r.name, icon: 'fa-file' };
    const isOk = r.status === 'verified';

    const statusIcon = icon(isOk ? 'fa-check-circle' : 'fa-times-circle');
    const iconWrap   = el('div', { cls: 'doc-result-icon' }, [statusIcon]);

    const nameEl  = el('div', { cls: 'doc-result-name', text: info.label });
    const infoDiv = el('div', { cls: 'doc-result-info' }, [nameEl]);
    if (r.reason) {
      const reasonEl = el('div', { cls: 'doc-result-reason' }, [icon('fa-exclamation-triangle'), ' ' + r.reason]);
      infoDiv.appendChild(reasonEl);
    }

    const badge   = el('span', { cls: 'badge ' + (isOk ? 'badge-green' : 'badge-red'), text: isOk ? 'Verified' : 'Failed' });
    const conf    = el('div', { cls: 'doc-result-conf', text: (r.confidence * 100).toFixed(0) + '% confidence' });
    const aside   = el('div', {}, [badge, conf]);

    const row = el('div', { cls: `doc-result ${r.status}` }, [iconWrap, infoDiv, aside]);
    container.appendChild(row);
  });

  if (data.certificateReady) {
    document.getElementById('all-passed-msg').style.display   = '';
    document.getElementById('some-failed-msg').style.display  = 'none';
    document.getElementById('btn-get-cert').style.display     = '';
    document.getElementById('btn-wait-vendor').style.display  = 'none';
  } else {
    document.getElementById('all-passed-msg').style.display   = 'none';
    document.getElementById('some-failed-msg').style.display  = '';
    document.getElementById('btn-get-cert').style.display     = 'none';
    document.getElementById('btn-wait-vendor').style.display  = '';
    startPolling();
  }
}

function startPolling() {
  const start = Date.now();
  pollTimer = setInterval(async () => {
    if (Date.now() - start > 180000) { clearInterval(pollTimer); return; }
    try {
      const reg = await fetch(`${API}/registrations/${currentRegId}`).then(r => r.json());
      if (reg.certificateReady) {
        clearInterval(pollTimer);
        document.getElementById('btn-get-cert').style.display    = '';
        document.getElementById('btn-wait-vendor').style.display = 'none';
        document.getElementById('some-failed-msg').style.display = 'none';
        document.getElementById('all-passed-msg').style.display  = '';
        document.getElementById('all-passed-title').textContent  = 'Vendor approved your application!';
        toast('Vendor approved! You can now get your certificate.', 'success');
      }
    } catch { /* silent poll failure */ }
  }, 4000);
}

// ── Certificate ──────────────────────────────────────────
async function loadCertificate() {
  if (!currentRegId) return;
  try {
    const cert = await fetch(`${API}/registrations/${currentRegId}/certificate`).then(r => r.json());
    document.getElementById('cert-name').textContent   = cert.applicantName;
    document.getElementById('cert-event').textContent  = cert.eventName;
    document.getElementById('cert-date').textContent   = cert.eventDate ? cert.eventDate + ' — ' + cert.eventVenue : '';
    document.getElementById('cert-vendor').textContent = (cert.vendorName || 'Event Organizer') + ' — Authorized Signatory';
    document.getElementById('cert-hash').textContent   = 'SHA256: ' + cert.hash;
  } catch {
    toast('Could not load certificate data', 'error');
  }
}

function printCert() {
  const preview = document.getElementById('cert-preview');
  const clone   = preview.cloneNode(true);
  const win     = window.open('', '_blank', 'width=800,height=700');

  const css = [
    'body{margin:0;padding:40px;background:#fff;display:flex;justify-content:center;font-family:Inter,sans-serif}',
    '.cert-paper{background:#fff;color:#1a1a2e;border-radius:0;padding:48px;max-width:640px;width:100%;position:relative;overflow:hidden}',
    '.cert-border{position:absolute;inset:12px;border:2px solid rgba(124,92,252,.2);border-radius:10px;pointer-events:none}',
    '.cert-seal{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#7c5cfc,#6366f1);display:flex;align-items:center;justify-content:center;font-size:30px;color:#fff;margin:0 auto 16px}',
    '.cert-org{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;text-align:center}',
    '.cert-title{font-size:28px;font-weight:800;text-align:center;color:#1a1a2e;margin:8px 0 4px}',
    '.cert-sub{font-size:13px;color:#999;text-align:center;margin-bottom:28px}',
    '.cert-body{font-size:15px;text-align:center;color:#333;line-height:1.8;margin-bottom:24px}',
    '.cert-body strong{color:#1a1a2e;font-size:18px}',
    '.cert-divider{height:1px;background:#ddd;margin:20px 0}',
    '.cert-footer{display:flex;justify-content:space-between;align-items:flex-end}',
    '.cert-qr{width:72px;height:72px;background:#f0f0f0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:32px}',
    '.cert-sig{text-align:right}',
    '.cert-sig-line{width:130px;height:1px;background:#333;margin-bottom:6px;margin-left:auto}',
    '.cert-sig-name{font-size:12px;color:#666}',
    '.cert-hash{font-family:monospace;font-size:9px;color:#bbb;text-align:center;margin-top:16px;word-break:break-all}',
    '@media print{body{padding:20px;background:#fff}}',
  ].join('\n');

  // Write a minimal HTML shell, then inject the certificate clone
  const d = win.document;
  d.open();
  d.write('<!DOCTYPE html><html><head><title>Certificate</title>');
  d.write('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">');
  d.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap">');
  d.write('<style>' + css + '</style>');
  d.write('</head><body></body></html>');
  d.close();

  // Append the cloned certificate into the body
  d.body.appendChild(clone);

  // Wait for fonts + icons to load, then trigger print
  setTimeout(function() { win.print(); }, 1200);
}

// Init
loadEvents();
