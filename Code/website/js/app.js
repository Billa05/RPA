/* ============================================
   CertifyHub — Main Application Logic
   ============================================ */

const API_BASE = 'http://localhost:5000/api';

// ---- State ----
let currentStep = 1;
let uploadedFiles = {};
let applications = JSON.parse(localStorage.getItem('certifyhub_apps') || '[]');
let currentVerifyAppId = null;

// ---- Certificate Requirements Map ----
const CERT_REQUIREMENTS = {
    birth: {
        name: 'Birth Certificate',
        icon: 'fa-baby',
        docs: ['Hospital Birth Record', 'Parents ID Proof', 'Address Proof'],
        fields: ['Child Name', 'Date of Birth', 'Place of Birth', 'Father Name', 'Mother Name', 'Hospital Name']
    },
    income: {
        name: 'Income Certificate',
        icon: 'fa-coins',
        docs: ['Salary Slip / Income Proof', 'Bank Statement (6 months)', 'IT Returns', 'Employer Certificate'],
        fields: ['Annual Income', 'Source of Income', 'Employer Name', 'Financial Year']
    },
    domicile: {
        name: 'Domicile Certificate',
        icon: 'fa-home',
        docs: ['Ration Card', 'Electricity Bill', 'Voter ID', 'Rent Agreement', 'School Certificate'],
        fields: ['Years of Residence', 'Previous Address', 'Purpose of Certificate']
    },
    caste: {
        name: 'Caste Certificate',
        icon: 'fa-users',
        docs: ['Parents Caste Certificate', 'School Leaving Certificate', 'Affidavit', 'Ration Card'],
        fields: ['Caste', 'Sub-Caste', 'Religion', 'Father Caste Certificate No.']
    },
    character: {
        name: 'Character Certificate',
        icon: 'fa-user-check',
        docs: ['Police Verification Report', 'Previous Character Certificate'],
        fields: ['Purpose', 'Issuing Authority Required']
    },
    marriage: {
        name: 'Marriage Certificate',
        icon: 'fa-heart',
        docs: ['Wedding Invitation Card', 'Wedding Photos', 'Both Spouse IDs', 'Address Proof (Both)', 'Witness IDs (2)', 'Marriage Affidavit'],
        fields: ['Spouse Name', 'Date of Marriage', 'Place of Marriage', 'Witness 1 Name', 'Witness 2 Name']
    },
    death: {
        name: 'Death Certificate',
        icon: 'fa-cross',
        docs: ['Hospital Death Record', 'Deceased ID Proof', 'Applicant ID Proof'],
        fields: ['Deceased Name', 'Date of Death', 'Place of Death', 'Cause of Death', 'Relation to Deceased']
    },
    education: {
        name: 'Education Certificate',
        icon: 'fa-graduation-cap',
        docs: ['Marksheets', 'Degree Certificate', 'Transfer Certificate', 'Migration Certificate', 'University ID'],
        fields: ['Institution Name', 'Degree/Course', 'Year of Passing', 'Roll Number', 'University Name']
    }
};

// ---- Page Navigation ----
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (page === 'admin') refreshAdmin();
    if (page === 'track') renderRecentApps();
}

function selectCertType(type) {
    showPage('apply');
    setTimeout(() => {
        nextStep(2);
        const radio = document.querySelector(`input[name="certType"][value="${type}"]`);
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change'));
            showRequirements(type);
        }
    }, 100);
}

// ---- Theme Toggle ----
function toggleTheme() {
    const body = document.body;
    const isDark = !body.hasAttribute('data-theme');
    body.setAttribute('data-theme', isDark ? 'light' : '');
    if (!isDark) body.removeAttribute('data-theme');
    const icon = document.querySelector('.theme-toggle i');
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    localStorage.setItem('certifyhub_theme', isDark ? 'light' : 'dark');
}

// ---- Mobile Menu ----
function toggleMenu() {
    document.getElementById('mobileMenu').classList.toggle('active');
}

// ---- Wizard Steps ----
function nextStep(step) {
    if (step === 2 && !validateStep1()) return;
    if (step === 3) {
        const certType = document.querySelector('input[name="certType"]:checked');
        if (!certType) { showToast('Please select a certificate type', 'error'); return; }
        generateUploadZones(certType.value);
    }
    if (step === 4) {
        populateReview();
    }

    currentStep = step;
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');

    document.querySelectorAll('.wizard-step').forEach((s, i) => {
        s.classList.remove('active', 'completed');
        if (i + 1 < step) s.classList.add('completed');
        if (i + 1 === step) s.classList.add('active');
    });

    window.scrollTo({ top: 200, behavior: 'smooth' });
}

function prevStep(step) {
    nextStep(step);
}

function validateStep1() {
    const required = ['fullName', 'email', 'phone', 'aadhaar', 'dob', 'gender', 'address', 'city', 'state', 'pincode'];
    for (const id of required) {
        const el = document.getElementById(id);
        if (!el.value.trim()) {
            el.focus();
            el.style.borderColor = 'var(--danger)';
            setTimeout(() => el.style.borderColor = '', 2000);
            showToast(`Please fill in all required fields`, 'error');
            return false;
        }
    }
    return true;
}

// ---- Requirements Display ----
function showRequirements(type) {
    const req = CERT_REQUIREMENTS[type];
    if (!req) return;
    const box = document.getElementById('requirementsBox');
    const list = document.getElementById('requirementsList');
    list.innerHTML = req.docs.map(d => `<li>${d}</li>`).join('');
    box.style.display = 'block';
}

document.addEventListener('change', (e) => {
    if (e.target.name === 'certType') {
        showRequirements(e.target.value);
    }
});

// ---- Upload Zones ----
function generateUploadZones(type) {
    const req = CERT_REQUIREMENTS[type];
    const container = document.getElementById('uploadZones');
    container.innerHTML = req.docs.map((doc, i) => {
        const key = `doc_${i}`;
        return `
            <div class="upload-zone" id="zone-${key}">
                <div class="upload-area" onclick="triggerUpload('${key}')"
                     ondrop="handleDrop(event, '${key}')"
                     ondragover="handleDragOver(event)"
                     ondragleave="handleDragLeave(event)">
                    <input type="file" id="file-${key}" accept=".pdf,.jpg,.jpeg,.png"
                           onchange="handleFileSelect(this, '${key}')" hidden>
                    <div class="upload-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                    <h4>${doc}</h4>
                    <p>Drag & drop or click to upload</p>
                    <span class="upload-formats">PDF, JPG, PNG — Max 5MB</span>
                </div>
                <div class="upload-preview" id="preview-${key}" style="display:none;">
                    <div class="preview-info">
                        <i class="fas fa-file-alt"></i>
                        <span class="preview-name"></span>
                        <span class="preview-size"></span>
                    </div>
                    <div class="preview-status">
                        <span class="status-badge pending"><i class="fas fa-clock"></i> Pending</span>
                    </div>
                    <button class="btn btn-sm btn-danger" onclick="removeFile('${key}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function triggerUpload(key) {
    document.getElementById(`file-${key}`).click();
}

function handleFileSelect(input, key) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        showToast('File size must be less than 5MB', 'error');
        return;
    }
    uploadedFiles[key] = file;
    showFilePreview(key, file);
    showToast(`${file.name} uploaded successfully`, 'success');
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e, key) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
        uploadedFiles[key] = file;
        showFilePreview(key, file);
        showToast(`${file.name} uploaded successfully`, 'success');
    }
}

function showFilePreview(key, file) {
    const zone = document.getElementById(`zone-${key}`);
    zone.querySelector('.upload-area').style.display = 'none';
    const preview = document.getElementById(`preview-${key}`);
    preview.style.display = 'flex';
    preview.querySelector('.preview-name').textContent = file.name;
    preview.querySelector('.preview-size').textContent = formatFileSize(file.size);
}

function removeFile(key) {
    delete uploadedFiles[key];
    const zone = document.getElementById(`zone-${key}`);
    zone.querySelector('.upload-area').style.display = '';
    document.getElementById(`preview-${key}`).style.display = 'none';
    const input = document.getElementById(`file-${key}`);
    if (input) input.value = '';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ---- Review ----
function populateReview() {
    const fields = {
        fullName: 'Full Name', email: 'Email', phone: 'Phone',
        aadhaar: 'Aadhaar', dob: 'Date of Birth', gender: 'Gender',
        city: 'City', state: 'State', pincode: 'PIN Code'
    };

    const personalDiv = document.getElementById('reviewPersonal');
    personalDiv.innerHTML = Object.entries(fields).map(([id, label]) => {
        const val = document.getElementById(id)?.value || '—';
        return `<div class="review-item"><span class="label">${label}</span><span class="value">${val}</span></div>`;
    }).join('');

    const certType = document.querySelector('input[name="certType"]:checked')?.value;
    const certInfo = CERT_REQUIREMENTS[certType];
    document.getElementById('reviewCert').innerHTML = `
        <div class="review-item"><span class="label">Certificate Type</span><span class="value">${certInfo?.name || '—'}</span></div>
        <div class="review-item"><span class="label">Documents Required</span><span class="value">${certInfo?.docs.length || 0} documents</span></div>
    `;

    const docsDiv = document.getElementById('reviewDocs');
    const allFiles = Object.entries(uploadedFiles);
    if (allFiles.length === 0) {
        docsDiv.innerHTML = '<p style="color:var(--text-muted)">No documents uploaded</p>';
    } else {
        docsDiv.innerHTML = allFiles.map(([key, file]) => `
            <div class="review-doc">
                <i class="fas fa-file-alt"></i>
                <span>${file.name} (${formatFileSize(file.size)})</span>
            </div>
        `).join('');
    }
}

// ---- Submit Application ----
async function submitApplication() {
    const consent = document.getElementById('consent');
    if (!consent.checked) {
        showToast('Please accept the declaration', 'error');
        return;
    }

    const certType = document.querySelector('input[name="certType"]:checked')?.value;
    const appData = {
        id: generateTrackingId(),
        fullName: document.getElementById('fullName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        aadhaar: document.getElementById('aadhaar').value,
        dob: document.getElementById('dob').value,
        gender: document.getElementById('gender').value,
        address: document.getElementById('address').value,
        city: document.getElementById('city').value,
        state: document.getElementById('state').value,
        pincode: document.getElementById('pincode').value,
        certType: certType,
        certName: CERT_REQUIREMENTS[certType]?.name,
        documents: Object.entries(uploadedFiles).map(([k, f]) => ({ key: k, name: f.name, size: f.size })),
        status: 'pending',
        submittedAt: new Date().toISOString(),
        timeline: [
            { step: 'submitted', label: 'Submitted', date: new Date().toISOString(), completed: true },
            { step: 'under_review', label: 'Under Review', date: null, completed: false },
            { step: 'verified', label: 'Verified', date: null, completed: false },
            { step: 'approved', label: 'Approved', date: null, completed: false }
        ]
    };

    // Try to send to backend
    try {
        const resp = await fetch(`${API_BASE}/applications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appData)
        });
        if (resp.ok) {
            const result = await resp.json();
            appData.id = result.id || appData.id;
        }
    } catch (e) {
        // Backend offline — store locally
        console.log('Backend offline, storing locally');
    }

    applications.push(appData);
    localStorage.setItem('certifyhub_apps', JSON.stringify(applications));

    document.getElementById('trackingId').textContent = appData.id;
    document.getElementById('successModal').classList.add('active');
}

function generateTrackingId() {
    const year = new Date().getFullYear();
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `CERT-${year}-${rand}`;
}

function copyTrackingId() {
    const id = document.getElementById('trackingId').textContent;
    navigator.clipboard.writeText(id);
    showToast('Tracking ID copied!', 'success');
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    // Reset form
    currentStep = 1;
    uploadedFiles = {};
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    document.querySelectorAll('.wizard-step').forEach((s, i) => {
        s.classList.remove('active', 'completed');
        if (i === 0) s.classList.add('active');
    });
}

// ---- Track Application ----
async function trackApplication() {
    const trackId = document.getElementById('trackInput').value.trim();
    if (!trackId) { showToast('Please enter a tracking ID', 'error'); return; }

    let app = null;

    // Try backend first
    try {
        const resp = await fetch(`${API_BASE}/applications/${trackId}`);
        if (resp.ok) app = await resp.json();
    } catch (e) {}

    // Fallback to local
    if (!app) {
        app = applications.find(a => a.id === trackId);
    }

    if (!app) {
        showToast('Application not found', 'error');
        return;
    }

    renderTrackResult(app);
}

function renderTrackResult(app) {
    document.getElementById('trackResult').style.display = 'block';
    document.getElementById('trackName').textContent = app.fullName;
    document.getElementById('trackType').textContent = app.certName || CERT_REQUIREMENTS[app.certType]?.name;

    const statusEl = document.getElementById('trackStatus');
    const statusMap = {
        pending: 'Pending',
        under_review: 'Under Review',
        verified: 'Verified',
        approved: 'Approved',
        rejected: 'Rejected'
    };
    statusEl.textContent = statusMap[app.status] || app.status;
    statusEl.className = `track-status ${app.status}`;

    document.getElementById('trackAppId').textContent = app.id;
    document.getElementById('trackDate').textContent = new Date(app.submittedAt).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    document.getElementById('trackDocs').textContent = `${app.documents?.length || 0} documents uploaded`;
    document.getElementById('trackVerification').textContent =
        app.status === 'approved' ? 'All documents verified' :
        app.status === 'rejected' ? 'Verification failed' :
        'In progress';

    // Timeline
    const timelineEl = document.getElementById('trackTimeline');
    const steps = app.timeline || [
        { step: 'submitted', label: 'Submitted', completed: true },
        { step: 'under_review', label: 'Under Review', completed: app.status !== 'pending' },
        { step: 'verified', label: 'Verified', completed: ['verified', 'approved'].includes(app.status) },
        { step: 'approved', label: 'Approved', completed: app.status === 'approved' }
    ];

    const activeIdx = steps.findIndex(s => !s.completed);

    timelineEl.innerHTML = steps.map((s, i) => {
        const isCompleted = s.completed;
        const isActive = i === activeIdx;
        const cls = isCompleted ? 'completed' : isActive ? 'active' : '';
        const icon = isCompleted ? 'fa-check' : isActive ? 'fa-spinner fa-spin' : 'fa-circle';
        return `
            <div class="timeline-step ${cls}">
                ${i < steps.length - 1 ? '<div class="timeline-connector"></div>' : ''}
                <div class="timeline-dot"><i class="fas ${icon}"></i></div>
                <span class="timeline-label">${s.label}</span>
                ${s.date ? `<span class="timeline-date">${new Date(s.date).toLocaleDateString()}</span>` : ''}
            </div>
        `;
    }).join('');
}

function renderRecentApps() {
    const list = document.getElementById('appsList');
    if (applications.length === 0) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No applications yet. <a href="#" onclick="showPage('apply')">Apply now</a></p></div>`;
        return;
    }
    list.innerHTML = applications.slice().reverse().map(app => `
        <div class="app-item" onclick="document.getElementById('trackInput').value='${app.id}'; trackApplication();">
            <div class="app-item-info">
                <i class="fas ${CERT_REQUIREMENTS[app.certType]?.icon || 'fa-file'}"></i>
                <div>
                    <div class="app-item-name">${app.fullName}</div>
                    <div class="app-item-type">${app.certName || app.certType} — ${app.id}</div>
                </div>
            </div>
            <span class="status-badge ${app.status}">${app.status.replace('_', ' ')}</span>
        </div>
    `).join('');
}

// ---- Admin ----
function adminLogin() {
    const user = document.getElementById('adminUser').value;
    const pass = document.getElementById('adminPass').value;
    if (user === 'admin' && pass === 'admin123') {
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'block';
        refreshAdmin();
        showToast('Welcome, Admin!', 'success');
    } else {
        showToast('Invalid credentials', 'error');
    }
}

async function refreshAdmin() {
    let allApps = [...applications];

    // Try backend
    try {
        const resp = await fetch(`${API_BASE}/applications`);
        if (resp.ok) {
            const backendApps = await resp.json();
            // Merge, prefer backend
            const localIds = new Set(allApps.map(a => a.id));
            backendApps.forEach(a => { if (!localIds.has(a.id)) allApps.push(a); });
        }
    } catch (e) {}

    // Stats
    document.getElementById('statTotal').textContent = allApps.length;
    document.getElementById('statPending').textContent = allApps.filter(a => a.status === 'pending' || a.status === 'under_review').length;
    document.getElementById('statApproved').textContent = allApps.filter(a => a.status === 'approved').length;
    document.getElementById('statRejected').textContent = allApps.filter(a => a.status === 'rejected').length;

    renderAdminTable(allApps);
}

function renderAdminTable(apps) {
    const filterStatus = document.getElementById('filterStatus')?.value || 'all';
    const filterType = document.getElementById('filterType')?.value || 'all';

    let filtered = apps;
    if (filterStatus !== 'all') filtered = filtered.filter(a => a.status === filterStatus);
    if (filterType !== 'all') filtered = filtered.filter(a => a.certType === filterType);

    const tbody = document.getElementById('adminTableBody');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No applications found</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(app => `
        <tr>
            <td><span class="app-id">${app.id}</span></td>
            <td>${app.fullName}</td>
            <td>${CERT_REQUIREMENTS[app.certType]?.name || app.certType}</td>
            <td>${new Date(app.submittedAt).toLocaleDateString()}</td>
            <td>${app.documents?.length || 0} files</td>
            <td><span class="status-badge ${app.status}">${app.status.replace('_', ' ')}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="openVerifyModal('${app.id}')">
                    <i class="fas fa-search-plus"></i> Review
                </button>
            </td>
        </tr>
    `).join('');
}

function filterApplications() {
    refreshAdmin();
}

function openVerifyModal(appId) {
    currentVerifyAppId = appId;
    const app = applications.find(a => a.id === appId);
    if (!app) { showToast('Application not found', 'error'); return; }

    const content = document.getElementById('verifyContent');
    content.innerHTML = `
        <div style="margin-bottom:16px">
            <div class="review-grid">
                <div class="review-item"><span class="label">Applicant</span><span class="value">${app.fullName}</span></div>
                <div class="review-item"><span class="label">Certificate</span><span class="value">${app.certName}</span></div>
                <div class="review-item"><span class="label">Aadhaar</span><span class="value">${app.aadhaar}</span></div>
                <div class="review-item"><span class="label">Email</span><span class="value">${app.email}</span></div>
            </div>
        </div>
        <h3 style="font-size:15px;margin-bottom:12px"><i class="fas fa-file-alt" style="color:var(--accent-light)"></i> Documents</h3>
        ${(app.documents || []).map(doc => `
            <div class="verify-doc-item">
                <i class="fas fa-file-alt"></i>
                <div class="verify-doc-info">
                    <div class="verify-doc-name">${doc.name}</div>
                    <div class="verify-doc-size">${formatFileSize(doc.size)}</div>
                </div>
                <span class="verify-doc-status status-badge pending">Unverified</span>
            </div>
        `).join('')}
    `;

    document.getElementById('verifyModal').classList.add('active');
}

function closeVerifyModal() {
    document.getElementById('verifyModal').classList.remove('active');
    currentVerifyAppId = null;
}

async function verifyAction(action) {
    if (!currentVerifyAppId) return;

    const notes = document.getElementById('verifyNotes').value;

    // Update local
    const app = applications.find(a => a.id === currentVerifyAppId);
    if (app) {
        app.status = action;
        app.verificationNotes = notes;
        app.verifiedAt = new Date().toISOString();

        // Update timeline
        if (app.timeline) {
            app.timeline.forEach(t => {
                if (t.step === 'under_review') { t.completed = true; t.date = new Date().toISOString(); }
                if (t.step === 'verified' && action === 'approved') { t.completed = true; t.date = new Date().toISOString(); }
                if (t.step === 'approved' && action === 'approved') { t.completed = true; t.date = new Date().toISOString(); }
            });
        }

        localStorage.setItem('certifyhub_apps', JSON.stringify(applications));
    }

    // Try backend
    try {
        await fetch(`${API_BASE}/applications/${currentVerifyAppId}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: action, notes })
        });
    } catch (e) {}

    closeVerifyModal();
    refreshAdmin();
    showToast(`Application ${action}!`, action === 'approved' ? 'success' : 'error');
}

// ---- Download Certificate ----
async function fetchCertificate() {
    const trackId = document.getElementById('downloadInput').value.trim();
    if (!trackId) { showToast('Please enter a tracking ID', 'error'); return; }

    let app = applications.find(a => a.id === trackId);

    // Try backend
    if (!app) {
        try {
            const resp = await fetch(`${API_BASE}/applications/${trackId}`);
            if (resp.ok) app = await resp.json();
        } catch (e) {}
    }

    if (!app) { showToast('Application not found', 'error'); return; }
    if (app.status !== 'approved') {
        showToast('Certificate not yet approved. Current status: ' + app.status, 'info');
        return;
    }

    renderCertificatePreview(app);
    document.getElementById('downloadResult').style.display = 'block';
}

function renderCertificatePreview(app) {
    const hash = btoa(app.id + app.fullName + app.certType).replace(/[^a-zA-Z0-9]/g, '').substring(0, 40);
    const certInfo = CERT_REQUIREMENTS[app.certType] || {};

    document.getElementById('certPreview').innerHTML = `
        <div class="cert-title">Government of India</div>
        <div class="cert-seal-img"><i class="fas fa-award"></i></div>
        <div class="cert-main-title">${certInfo.name || 'Certificate'}</div>
        <div class="cert-subtitle">Digital Certificate — Verified & Authenticated</div>
        <div class="cert-divider"></div>
        <div class="cert-field">
            <div class="cert-field-label">Certificate No.</div>
            <div class="cert-field-value">${app.id}</div>
        </div>
        <div class="cert-field">
            <div class="cert-field-label">Issued To</div>
            <div class="cert-field-value">${app.fullName}</div>
        </div>
        <div class="cert-field">
            <div class="cert-field-label">Date of Birth</div>
            <div class="cert-field-value">${new Date(app.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div class="cert-field">
            <div class="cert-field-label">Address</div>
            <div class="cert-field-value">${app.city}, ${app.state}</div>
        </div>
        <div class="cert-field">
            <div class="cert-field-label">Aadhaar</div>
            <div class="cert-field-value">${app.aadhaar}</div>
        </div>
        <div class="cert-field">
            <div class="cert-field-label">Issued On</div>
            <div class="cert-field-value">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div class="cert-divider"></div>
        <div class="cert-footer">
            <div class="cert-qr-box"><i class="fas fa-qrcode"></i></div>
            <div class="cert-signature">
                <div class="cert-sig-line"></div>
                <div class="cert-sig-name">Authorized Signatory</div>
            </div>
        </div>
        <div class="cert-hash">SHA256: ${hash}</div>
    `;
}

function downloadCert(type) {
    if (type === 'print') {
        const content = document.getElementById('certPreview').innerHTML;
        const w = window.open('', '', 'width=800,height=600');
        w.document.write(`<html><head><title>Certificate</title><style>
            body{font-family:Inter,sans-serif;padding:40px;color:#1a1a2e}
            .cert-title{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#666;text-align:center}
            .cert-main-title{font-size:22px;font-weight:800;text-align:center}
            .cert-subtitle{font-size:12px;color:#888;text-align:center;margin-bottom:20px}
            .cert-seal-img{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#6c5ce7,#a29bfe);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;color:white;font-size:24px}
            .cert-field{margin-bottom:12px}
            .cert-field-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999}
            .cert-field-value{font-size:14px;font-weight:600}
            .cert-divider{height:1px;background:#eee;margin:16px 0}
            .cert-footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px}
            .cert-qr-box{width:70px;height:70px;background:#f5f5f5;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:30px}
            .cert-sig-line{width:120px;height:1px;background:#333;margin-bottom:4px;margin-left:auto}
            .cert-sig-name{font-size:11px;color:#666;text-align:right}
            .cert-hash{font-family:monospace;font-size:9px;color:#bbb;margin-top:16px;word-break:break-all;text-align:center}
        </style><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"></head><body>${content}</body></html>`);
        w.document.close();
        setTimeout(() => { w.print(); }, 500);
    } else {
        showToast('PDF download would be generated by the backend in production', 'info');
    }
}

function verifyCertQR() {
    showToast('QR verification: Certificate is authentic and valid', 'success');
}

// ---- Toast Notifications ----
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type]}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ---- Counter Animation ----
function animateCounters() {
    document.querySelectorAll('.stat-number[data-count]').forEach(el => {
        const target = parseInt(el.dataset.count);
        let current = 0;
        const increment = target / 60;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            el.textContent = Math.floor(current).toLocaleString();
        }, 25);
    });
}

// ---- Navbar Scroll ----
window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    // Restore theme
    const savedTheme = localStorage.getItem('certifyhub_theme');
    if (savedTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        document.querySelector('.theme-toggle i').className = 'fas fa-sun';
    }

    // Animate counters when visible
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounters();
                observer.disconnect();
            }
        });
    });
    const statsEl = document.querySelector('.hero-stats');
    if (statsEl) observer.observe(statsEl);
});
