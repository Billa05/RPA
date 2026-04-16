/* CertifyHub — Vendor Portal Logic */
'use strict';

const API = 'http://localhost:5000/api';

const DOC_OPTIONS = [
  { key: 'government_id',   label: 'Government ID',           icon: 'fa-id-card' },
  { key: 'photo',           label: 'Passport Photo',           icon: 'fa-camera' },
  { key: 'address_proof',   label: 'Address Proof',            icon: 'fa-home' },
  { key: 'payment_receipt', label: 'Payment Receipt',          icon: 'fa-receipt' },
  { key: 'education_cert',  label: 'Education Certificate',    icon: 'fa-graduation-cap' },
  { key: 'employer_letter', label: 'Employer Letter',          icon: 'fa-briefcase' },
  { key: 'medical_cert',    label: 'Medical Certificate',      icon: 'fa-heartbeat' },
  { key: 'noc',             label: 'No Objection Certificate', icon: 'fa-file-signature' },
];

let vendorToken  = localStorage.getItem('vendor_token') || null;
let vendorName   = localStorage.getItem('vendor_name')  || '';
let excelFileObj = null;
let attendeeMode = 'type';   // 'type' | 'excel'
let rowCount     = 0;
let currentOverrideRegId = null;

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

function toast(msg, type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const row = el('div', { cls: `toast ${type}` }, [icon(icons[type]), ' ' + msg]);
  document.getElementById('toasts').appendChild(row);
  setTimeout(() => row.remove(), 4200);
}

// ── Auth ─────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('v-email').value.trim();
  const pass  = document.getElementById('v-pass').value;
  if (!email || !pass) { toast('Enter email and password', 'error'); return; }

  try {
    const res = await fetch(`${API}/vendor/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    }).then(r => r.json());

    if (res.error) { toast(res.error, 'error'); return; }

    vendorToken = res.token;
    vendorName  = res.vendor.name;
    localStorage.setItem('vendor_token', vendorToken);
    localStorage.setItem('vendor_name',  vendorName);
    showDash();
  } catch {
    toast('Cannot reach backend. Run: cd backend && python app.py', 'error');
  }
}

function logout() {
  vendorToken = null; vendorName = '';
  localStorage.removeItem('vendor_token');
  localStorage.removeItem('vendor_name');
  document.getElementById('view-dash').style.display  = 'none';
  document.getElementById('view-login').style.display = '';
  document.getElementById('nav-links').style.display  = 'none';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'X-Vendor-Id': vendorToken };
}

// ── Dashboard ────────────────────────────────────────────
async function showDash() {
  document.getElementById('view-login').style.display = 'none';
  document.getElementById('view-dash').style.display  = '';
  document.getElementById('nav-links').style.display  = '';
  document.getElementById('nav-vendor-name').textContent = vendorName;
  document.getElementById('dash-greeting').textContent   = 'Welcome, ' + vendorName;

  buildDocCheckboxes();
  resetAttendeeRows();
  await Promise.all([loadEvents(), loadRegistrations()]);
  showTab('events');
}

async function loadDashStats() {
  try {
    const [events, regs] = await Promise.all([
      fetch(`${API}/vendor/events`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/vendor/events`, { headers: authHeaders() }).then(r => r.json()).catch(() => []),
    ]);

    let allRegs = [];
    for (const evt of events) {
      const evtRegs = await fetch(`${API}/vendor/events/${evt.id}/registrations`, { headers: authHeaders() }).then(r => r.json()).catch(() => []);
      allRegs = allRegs.concat(evtRegs);
    }

    document.getElementById('s-events').textContent   = events.length;
    document.getElementById('s-total').textContent    = allRegs.length;
    document.getElementById('s-pending').textContent  = allRegs.filter(r => ['partial','failed','pending'].includes(r.verificationStatus) && !r.vendorOverride).length;
    document.getElementById('s-approved').textContent = allRegs.filter(r => r.certificateReady).length;
  } catch { /* silent */ }
}

// ── Tabs ─────────────────────────────────────────────────
function showTab(name) {
  ['events','registrations','create'].forEach(t => {
    document.getElementById('panel-' + t).classList.remove('active');
    document.getElementById('tab-' + t).classList.remove('active');
  });
  document.getElementById('panel-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'registrations') loadRegistrations();
  if (name === 'events') loadEvents();
}

// ── Events list ──────────────────────────────────────────
async function loadEvents() {
  const container = document.getElementById('events-list');
  clear(container);
  container.appendChild(el('div', { cls: 'empty-state' }, [icon('fa-spinner fa-spin'), el('p', { text: 'Loading…' })]));

  try {
    const events = await fetch(`${API}/vendor/events`, { headers: authHeaders() }).then(r => r.json());
    clear(container);
    await loadDashStats();

    // Populate event filter select
    const sel = document.getElementById('filter-event');
    while (sel.options.length > 1) sel.remove(1);
    events.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      sel.appendChild(opt);
    });

    if (!events.length) {
      container.appendChild(el('div', { cls: 'empty-state' }, [
        icon('fa-calendar-plus'),
        el('p', { text: 'No events yet. Create your first event!' })
      ]));
      return;
    }

    events.forEach(e => {
      const card = el('div', { cls: 'card' });

      const topRow = el('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px' });
      const left   = el('div');
      const nameEl = el('h3', { text: e.name, style: 'margin-bottom:4px' });
      const metaEl = el('div', { style: 'display:flex;gap:16px;font-size:12px;color:var(--txt3);flex-wrap:wrap' });
      metaEl.appendChild(el('span', {}, [icon('fa-calendar'), ' ' + e.date]));
      metaEl.appendChild(el('span', {}, [icon('fa-map-marker-alt'), ' ' + (e.venue || '—')]));
      metaEl.appendChild(el('span', {}, [icon('fa-users'), ' ' + e.attendeeCount + ' attendees']));
      metaEl.appendChild(el('span', {}, [icon('fa-file-alt'), ' ' + (e.registrationCount || 0) + ' registrations']));
      left.appendChild(nameEl);
      left.appendChild(metaEl);

      const viewBtn = el('button', { cls: 'btn btn-ghost btn-sm' }, [icon('fa-external-link-alt'), ' View Registrations']);
      viewBtn.addEventListener('click', () => {
        document.getElementById('filter-event').value = e.id;
        showTab('registrations');
      });

      topRow.appendChild(left);
      topRow.appendChild(viewBtn);
      card.appendChild(topRow);

      if (e.description) {
        card.appendChild(el('p', { text: e.description, style: 'font-size:13px;margin-bottom:12px' }));
      }

      // Doc chips
      const chipsRow = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
      (e.requiredDocs || []).forEach(d => {
        chipsRow.appendChild(el('span', { cls: 'tag', text: d.replace(/_/g, ' ') }));
      });
      card.appendChild(chipsRow);

      container.appendChild(card);
    });
  } catch {
    clear(container);
    container.appendChild(el('div', { cls: 'empty-state' }, [icon('fa-exclamation-triangle'), el('p', { text: 'Failed to load events.' })]));
  }
}

// ── Registrations ────────────────────────────────────────
async function loadRegistrations() {
  const container = document.getElementById('reg-list');
  clear(container);
  container.appendChild(el('div', { cls: 'empty-state' }, [icon('fa-spinner fa-spin'), el('p', { text: 'Loading…' })]));

  const filterEvt    = document.getElementById('filter-event').value;
  const filterStatus = document.getElementById('filter-status').value;

  try {
    const events = await fetch(`${API}/vendor/events`, { headers: authHeaders() }).then(r => r.json());
    let allRegs = [];

    const eventsToFetch = filterEvt ? events.filter(e => e.id === filterEvt) : events;
    for (const e of eventsToFetch) {
      const regs = await fetch(`${API}/vendor/events/${e.id}/registrations`, { headers: authHeaders() }).then(r => r.json()).catch(() => []);
      regs.forEach(r => { r._eventName = e.name; });
      allRegs = allRegs.concat(regs);
    }

    if (filterStatus) allRegs = allRegs.filter(r => r.verificationStatus === filterStatus);

    clear(container);
    if (!allRegs.length) {
      container.appendChild(el('div', { cls: 'empty-state' }, [
        icon('fa-inbox'), el('p', { text: 'No registrations found.' })
      ]));
      return;
    }

    allRegs.forEach(reg => {
      const card = el('div', { cls: 'reg-card' });
      card.addEventListener('click', () => openOverride(reg));

      // Top row
      const topRow   = el('div', { cls: 'reg-card-top' });
      const infoLeft = el('div');
      infoLeft.appendChild(el('div', { cls: 'reg-name', text: reg.applicantName }));
      infoLeft.appendChild(el('div', { cls: 'reg-id',   text: reg.id + ' · ' + (reg._eventName || reg.eventName) }));
      topRow.appendChild(infoLeft);

      const statusBadge = el('span', { cls: 'badge ' + statusBadgeCls(reg) + ' badge-sm' }, [
        icon(statusIcon(reg)), ' ' + statusLabel(reg)
      ]);
      topRow.appendChild(statusBadge);
      card.appendChild(topRow);

      // Doc pills
      const docsRow = el('div', { cls: 'reg-docs-row' });
      (reg.documents || []).forEach(d => {
        const pill = el('div', { cls: 'doc-mini ' + (d.status || 'pending') }, [
          icon(d.status === 'verified' ? 'fa-check' : d.status === 'failed' ? 'fa-times' : 'fa-clock'),
          ' ' + d.name.replace(/_/g, ' ')
        ]);
        docsRow.appendChild(pill);
      });
      card.appendChild(docsRow);

      // Needs review hint
      if (needsReview(reg)) {
        const hint = el('div', { style: 'margin-top:10px;font-size:12px;color:var(--yellow);display:flex;align-items:center;gap:6px' },
          [icon('fa-exclamation-circle'), ' Needs your review — click to approve or reject']);
        card.appendChild(hint);
      }

      container.appendChild(card);
    });
  } catch (e) {
    clear(container);
    container.appendChild(el('div', { cls: 'empty-state' }, [icon('fa-exclamation-triangle'), el('p', { text: 'Failed to load registrations.' })]));
  }
}

function statusBadgeCls(reg) {
  if (reg.certificateReady)                        return 'badge-green';
  if (reg.verificationStatus === 'rejected')        return 'badge-red';
  if (['partial','failed'].includes(reg.verificationStatus)) return 'badge-yellow';
  if (reg.verificationStatus === 'verified')        return 'badge-green';
  return 'badge-blue';
}
function statusIcon(reg) {
  if (reg.certificateReady)                        return 'fa-award';
  if (reg.verificationStatus === 'rejected')        return 'fa-times-circle';
  if (['partial','failed'].includes(reg.verificationStatus)) return 'fa-exclamation-circle';
  if (reg.verificationStatus === 'verified')        return 'fa-check-circle';
  return 'fa-clock';
}
function statusLabel(reg) {
  if (reg.certificateReady)                        return reg.vendorOverride ? 'Approved (Override)' : 'Certificate Ready';
  if (reg.verificationStatus === 'rejected')        return 'Rejected';
  if (reg.verificationStatus === 'partial')         return 'Partial — Needs Review';
  if (reg.verificationStatus === 'failed')          return 'Failed — Needs Review';
  if (reg.verificationStatus === 'verified')        return 'Verified';
  return 'Pending';
}
function needsReview(reg) {
  return ['partial','failed'].includes(reg.verificationStatus) && !reg.vendorOverride;
}

// ── Override modal ───────────────────────────────────────
function openOverride(reg) {
  currentOverrideRegId = reg.id;
  const content = document.getElementById('override-content');
  clear(content);

  // Applicant info
  const infoGrid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px' });
  [
    ['Applicant', reg.applicantName],
    ['ID Number', reg.idNumber],
    ['Event', reg._eventName || reg.eventName],
    ['Submitted', new Date(reg.submittedAt).toLocaleDateString()],
    ['Status', statusLabel(reg)],
    ['Certificate', reg.certificateReady ? 'Ready' : 'Not Ready'],
  ].forEach(([lbl, val]) => {
    const item = el('div', { style: 'padding:10px;background:var(--surface);border-radius:var(--r-sm)' });
    item.appendChild(el('div', { style: 'font-size:11px;color:var(--txt3);text-transform:uppercase;letter-spacing:0.5px', text: lbl }));
    item.appendChild(el('div', { style: 'font-size:14px;font-weight:600;margin-top:2px', text: val }));
    infoGrid.appendChild(item);
  });
  content.appendChild(infoGrid);

  // Documents
  content.appendChild(el('div', { cls: 'section-title', text: 'Document Verification Results' }));

  (reg.documents || []).forEach(d => {
    const isOk = d.status === 'verified';
    const row  = el('div', { cls: 'override-doc-item ' + (d.status || 'pending') });
    row.appendChild(icon(isOk ? 'fa-check-circle' : 'fa-times-circle'));

    const info = el('div', { style: 'flex:1' });
    info.appendChild(el('div', { style: 'font-weight:600;font-size:13px', text: d.name }));
    if (d.reason) info.appendChild(el('div', { style: 'font-size:12px;color:var(--red)', text: d.reason }));

    // View document button — opens the uploaded file in a new tab
    if (d.savedFile) {
      const viewBtn = el('a', {
        cls: 'btn btn-ghost btn-sm',
        href: `${API}/registrations/${reg.id}/documents/${d.savedFile}`,
        target: '_blank'
      }, [icon('fa-eye'), ' View']);
      info.appendChild(viewBtn);
    }

    row.appendChild(info);
    if (d.confidence !== null && d.confidence !== undefined) {
      row.appendChild(el('span', { cls: 'badge ' + (isOk ? 'badge-green' : 'badge-red'), text: (d.confidence * 100).toFixed(0) + '%' }));
    }
    content.appendChild(row);
  });

  if (reg.vendorOverride) {
    const note = el('div', { style: 'padding:12px;border-radius:var(--r-sm);background:var(--surface);margin-top:14px;font-size:13px;color:var(--txt2)' });
    note.appendChild(el('div', { style: 'font-weight:700;margin-bottom:4px', text: 'Previous decision: ' + reg.verificationStatus.toUpperCase() }));
    note.appendChild(el('div', { text: reg.overrideNote || 'No note' }));
    content.appendChild(note);
  }

  document.getElementById('override-note').value = '';
  document.getElementById('override-modal').classList.add('open');
}

function closeOverride() {
  document.getElementById('override-modal').classList.remove('open');
  currentOverrideRegId = null;
}

async function doOverride(action) {
  if (!currentOverrideRegId) return;
  const note = document.getElementById('override-note').value.trim();

  try {
    const res = await fetch(`${API}/registrations/${currentOverrideRegId}/override`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action, note })
    }).then(r => r.json());

    if (res.error) { toast(res.error, 'error'); return; }
    toast(action === 'approve' ? 'Registration approved — certificate issued!' : 'Registration rejected', action === 'approve' ? 'success' : 'info');
    closeOverride();
    loadRegistrations();
    loadDashStats();
  } catch {
    toast('Override failed', 'error');
  }
}

// ── Attendee mode toggle ─────────────────────────────────
function setAttendeeMode(mode) {
  attendeeMode = mode;
  document.getElementById('att-mode-type').style.display  = mode === 'type'  ? '' : 'none';
  document.getElementById('att-mode-excel').style.display = mode === 'excel' ? '' : 'none';
  document.getElementById('att-toggle-type').className    = 'btn btn-sm ' + (mode === 'type'  ? 'btn-primary' : 'btn-ghost');
  document.getElementById('att-toggle-excel').className   = 'btn btn-sm ' + (mode === 'excel' ? 'btn-primary' : 'btn-ghost');
}

function addAttendeeRow(name = '', id = '') {
  rowCount++;
  const idx     = rowCount;
  const rows    = document.getElementById('att-rows');

  const num     = el('div', { cls: 'att-row-num', text: String(idx) });
  const nameIn  = el('input', { cls: 'form-input', placeholder: 'Full Name', id: `atn-${idx}` });
  nameIn.value  = name;
  const idIn    = el('input', { cls: 'form-input', placeholder: 'ID Number', id: `ati-${idx}` });
  idIn.value    = id;
  const delBtn  = el('button', { cls: 'btn btn-ghost btn-sm' }, [icon('fa-trash')]);
  delBtn.addEventListener('click', () => rows.removeChild(row));

  const row = el('div', { cls: 'att-row', id: `att-row-${idx}` }, [num, nameIn, idIn, delBtn]);
  rows.appendChild(row);
}

function resetAttendeeRows() {
  const rows = document.getElementById('att-rows');
  clear(rows);
  rowCount = 0;
  setAttendeeMode('type');
  addAttendeeRow(); // one blank row to start
}

function getTypedAttendees() {
  const rows = document.getElementById('att-rows').querySelectorAll('.att-row');
  const result = [];
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const name   = inputs[0]?.value.trim();
    const id     = inputs[1]?.value.trim();
    if (name && id) result.push({ name, idNumber: id });
  });
  return result;
}

// ── Create Event ─────────────────────────────────────────
function buildDocCheckboxes() {
  const wrap = document.getElementById('doc-checkboxes');
  clear(wrap);
  DOC_OPTIONS.forEach(opt => {
    const checkbox = el('input', { type: 'checkbox', id: 'dc-' + opt.key, value: opt.key });
    const box      = el('div', { cls: 'doc-check-box' }, [icon(opt.icon), opt.label]);
    const label    = el('label', { cls: 'doc-check-option', 'for': 'dc-' + opt.key }, [checkbox, box]);
    wrap.appendChild(label);
  });
}

function excelSelected(input) {
  if (input.files[0]) setExcel(input.files[0]);
}

function handleExcelDrop(e) {
  e.preventDefault();
  document.getElementById('excel-zone').classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) setExcel(f);
}

function setExcel(file) {
  if (!file.name.match(/\.xlsx?$/i)) { toast('Please upload an Excel file (.xlsx)', 'error'); return; }
  excelFileObj = file;
  document.getElementById('excel-zone').style.display    = 'none';
  document.getElementById('excel-preview').style.display = 'flex';
  document.getElementById('excel-name').textContent = file.name;
  document.getElementById('excel-size').textContent = fmtSize(file.size);
  toast(file.name + ' ready', 'success');
}

function removeExcel() {
  excelFileObj = null;
  document.getElementById('excel-zone').style.display    = '';
  document.getElementById('excel-preview').style.display = 'none';
  document.getElementById('excel-input').value = '';
}

function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

async function submitNewEvent() {
  const name  = document.getElementById('ev-name').value.trim();
  const date  = document.getElementById('ev-date').value;
  const venue = document.getElementById('ev-venue').value.trim();
  const desc  = document.getElementById('ev-desc').value.trim();

  if (!name || !date) { toast('Event name and date are required', 'error'); return; }

  const selectedDocs = DOC_OPTIONS
    .filter(o => document.getElementById('dc-' + o.key)?.checked)
    .map(o => o.key);
  if (!selectedDocs.length) { toast('Select at least one required document', 'error'); return; }

  if (attendeeMode === 'excel' && !excelFileObj) {
    toast('Please upload the attendee Excel/CSV file', 'error'); return;
  }
  if (attendeeMode === 'type' && !getTypedAttendees().length) {
    toast('Add at least one attendee', 'error'); return;
  }

  const formData = new FormData();

  if (attendeeMode === 'excel') {
    formData.append('data', JSON.stringify({ name, date, venue, description: desc, requiredDocs: selectedDocs }));
    formData.append('attendees', excelFileObj);
  } else {
    formData.append('data', JSON.stringify({
      name, date, venue, description: desc,
      requiredDocs: selectedDocs,
      attendees: getTypedAttendees()
    }));
  }

  try {
    const res = await fetch(`${API}/events`, {
      method: 'POST',
      headers: { 'X-Vendor-Id': vendorToken },
      body: formData
    }).then(r => r.json());

    if (res.error) { toast(res.error, 'error'); return; }
    toast('Event created! ' + res.attendeeCount + ' attendees loaded.', 'success');

    document.getElementById('ev-name').value  = '';
    document.getElementById('ev-date').value  = '';
    document.getElementById('ev-venue').value = '';
    document.getElementById('ev-desc').value  = '';
    buildDocCheckboxes();
    removeExcel();
    resetAttendeeRows();

    await loadEvents();
    showTab('events');
  } catch {
    toast('Failed to create event', 'error');
  }
}

// ── Sample Excel download ────────────────────────────────
function downloadSampleExcel() {
  // Build a CSV that Excel can open — simple, no dependency
  const rows = [
    ['Name', 'IDNumber'],
    ['Rajesh Kumar',  'ID001'],
    ['Priya Sharma',  'ID002'],
    ['Amit Patel',    'ID003'],
    ['Sneha Reddy',   'ID004'],
    ['Mohammed Khan', 'ID005'],
  ];
  const csv   = rows.map(r => r.join(',')).join('\n');
  const blob  = new Blob([csv], { type: 'text/csv' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = 'sample_attendees.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('Sample file downloaded (save as .xlsx in Excel)', 'info');
}

// ── Init ─────────────────────────────────────────────────
if (vendorToken) {
  fetch(`${API}/vendor/events`, { headers: authHeaders() })
    .then(r => { if (r.ok) showDash(); else logout(); })
    .catch(() => logout());
} else {
  // seed demo data silently
  fetch(`${API}/seed`, { method: 'POST' }).catch(() => {});
}
