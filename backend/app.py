"""
CertifyHub — Flask Backend Mock Verification Service
Provides REST API for UiPath RPA bot interaction
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import random
import string
import hashlib
import json
import os

app = Flask(__name__)
CORS(app)

# ---- In-Memory Mock Database ----
DB = {
    'applications': {},
    'citizens': {},
    'verification_log': [],
    'certificates': {}
}

# Pre-seed some mock citizen data for verification
MOCK_CITIZENS = {
    '1234 5678 9012': {
        'name': 'Rajesh Kumar',
        'dob': '1990-05-15',
        'gender': 'male',
        'address': '42 MG Road, Sector 15',
        'city': 'Delhi',
        'state': 'delhi',
        'phone': '+91 98765 43210',
        'verified': True
    },
    '9876 5432 1098': {
        'name': 'Priya Sharma',
        'dob': '1985-11-22',
        'gender': 'female',
        'address': '108 Park Street',
        'city': 'Mumbai',
        'state': 'maharashtra',
        'phone': '+91 87654 32109',
        'verified': True
    },
    '5555 6666 7777': {
        'name': 'Amit Patel',
        'dob': '1992-03-08',
        'gender': 'male',
        'address': '7 Lake View Apartments',
        'city': 'Ahmedabad',
        'state': 'gujarat',
        'phone': '+91 76543 21098',
        'verified': True
    },
    '1111 2222 3333': {
        'name': 'Sneha Reddy',
        'dob': '1995-07-14',
        'gender': 'female',
        'address': '23 Jubilee Hills',
        'city': 'Hyderabad',
        'state': 'andhra_pradesh',
        'phone': '+91 65432 10987',
        'verified': True
    },
    '4444 5555 6666': {
        'name': 'Mohammed Khan',
        'dob': '1988-01-30',
        'gender': 'male',
        'address': '56 Civil Lines',
        'city': 'Lucknow',
        'state': 'uttar_pradesh',
        'phone': '+91 54321 09876',
        'verified': True
    }
}

DB['citizens'] = MOCK_CITIZENS


def generate_id():
    year = datetime.now().year
    rand = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
    return f'CERT-{year}-{rand}'


def generate_cert_hash(app_data):
    raw = f"{app_data.get('id','')}{app_data.get('fullName','')}{app_data.get('certType','')}{datetime.now().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ==================== API ENDPOINTS ====================

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint for UiPath bot to verify server is running"""
    return jsonify({
        'status': 'healthy',
        'service': 'CertifyHub Mock Verification Service',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat(),
        'total_applications': len(DB['applications']),
        'total_citizens': len(DB['citizens'])
    })


# ---- Application CRUD ----

@app.route('/api/applications', methods=['GET'])
def list_applications():
    """List all applications — used by admin panel and UiPath bot"""
    status = request.args.get('status')
    cert_type = request.args.get('type')
    apps = list(DB['applications'].values())
    if status:
        apps = [a for a in apps if a['status'] == status]
    if cert_type:
        apps = [a for a in apps if a['certType'] == cert_type]
    return jsonify(apps)


@app.route('/api/applications', methods=['POST'])
def create_application():
    """Submit a new application — called by website or UiPath bot"""
    data = request.json
    app_id = data.get('id') or generate_id()
    data['id'] = app_id
    data['status'] = 'pending'
    data['submittedAt'] = data.get('submittedAt', datetime.now().isoformat())
    data['timeline'] = [
        {'step': 'submitted', 'label': 'Submitted', 'date': datetime.now().isoformat(), 'completed': True},
        {'step': 'under_review', 'label': 'Under Review', 'date': None, 'completed': False},
        {'step': 'verified', 'label': 'Verified', 'date': None, 'completed': False},
        {'step': 'approved', 'label': 'Approved', 'date': None, 'completed': False}
    ]
    DB['applications'][app_id] = data
    return jsonify({'id': app_id, 'message': 'Application submitted successfully'}), 201


@app.route('/api/applications/<app_id>', methods=['GET'])
def get_application(app_id):
    """Get application by ID — used by tracking page and UiPath bot"""
    app_data = DB['applications'].get(app_id)
    if not app_data:
        return jsonify({'error': 'Application not found'}), 404
    return jsonify(app_data)


@app.route('/api/applications/<app_id>', methods=['PUT'])
def update_application(app_id):
    """Update application — used by UiPath bot to update status"""
    if app_id not in DB['applications']:
        return jsonify({'error': 'Application not found'}), 404
    data = request.json
    DB['applications'][app_id].update(data)
    return jsonify(DB['applications'][app_id])


# ---- Verification Endpoints ----

@app.route('/api/applications/<app_id>/verify', methods=['POST'])
def verify_application(app_id):
    """Verify/Approve/Reject application — main endpoint for UiPath bot"""
    if app_id not in DB['applications']:
        return jsonify({'error': 'Application not found'}), 404

    data = request.json
    action = data.get('status', 'approved')
    notes = data.get('notes', '')

    app_data = DB['applications'][app_id]
    app_data['status'] = action
    app_data['verificationNotes'] = notes
    app_data['verifiedAt'] = datetime.now().isoformat()
    app_data['verifiedBy'] = data.get('verifiedBy', 'UiPath Bot')

    # Update timeline
    now = datetime.now().isoformat()
    for step in app_data.get('timeline', []):
        if step['step'] == 'under_review':
            step['completed'] = True
            step['date'] = now
        if step['step'] == 'verified' and action in ('approved', 'verified'):
            step['completed'] = True
            step['date'] = now
        if step['step'] == 'approved' and action == 'approved':
            step['completed'] = True
            step['date'] = now

    # Generate certificate if approved
    if action == 'approved':
        cert_hash = generate_cert_hash(app_data)
        DB['certificates'][app_id] = {
            'id': app_id,
            'hash': cert_hash,
            'issuedAt': now,
            'validUntil': (datetime.now() + timedelta(days=365)).isoformat(),
            'applicant': app_data.get('fullName'),
            'certType': app_data.get('certType')
        }

    # Log verification
    DB['verification_log'].append({
        'appId': app_id,
        'action': action,
        'notes': notes,
        'timestamp': now,
        'verifiedBy': app_data['verifiedBy']
    })

    return jsonify({
        'message': f'Application {action}',
        'application': app_data
    })


@app.route('/api/verify/aadhaar', methods=['POST'])
def verify_aadhaar():
    """
    Mock Aadhaar verification — UiPath bot calls this to verify citizen identity.
    Checks against mock citizen database.
    """
    data = request.json
    aadhaar = data.get('aadhaar', '').strip()

    citizen = DB['citizens'].get(aadhaar)
    if citizen:
        # Optional: verify name matches
        provided_name = data.get('name', '').strip().lower()
        if provided_name and provided_name != citizen['name'].lower():
            return jsonify({
                'verified': False,
                'reason': 'Name does not match Aadhaar records',
                'aadhaar': aadhaar
            })
        return jsonify({
            'verified': True,
            'citizen': citizen,
            'aadhaar': aadhaar,
            'message': 'Aadhaar verified successfully'
        })
    else:
        return jsonify({
            'verified': False,
            'reason': 'Aadhaar not found in database',
            'aadhaar': aadhaar
        })


@app.route('/api/verify/document', methods=['POST'])
def verify_document():
    """
    Mock document verification — UiPath bot calls this to verify uploaded documents.
    Simulates OCR check and database cross-reference.
    """
    data = request.json
    doc_type = data.get('docType', 'unknown')
    doc_name = data.get('docName', '')
    app_id = data.get('appId', '')

    # Mock verification logic — randomly verify with 85% success rate
    is_valid = random.random() < 0.85
    confidence = random.uniform(0.75, 0.99) if is_valid else random.uniform(0.20, 0.55)

    result = {
        'docType': doc_type,
        'docName': doc_name,
        'appId': app_id,
        'isValid': is_valid,
        'confidence': round(confidence, 2),
        'ocrExtracted': {
            'text_detected': True,
            'language': 'English',
            'quality': 'Good' if confidence > 0.8 else 'Fair' if confidence > 0.6 else 'Poor'
        },
        'checks': {
            'format_valid': True,
            'not_expired': is_valid,
            'signature_present': random.random() > 0.1,
            'seal_detected': random.random() > 0.2,
            'tampering_detected': not is_valid and random.random() > 0.7
        },
        'verifiedAt': datetime.now().isoformat()
    }

    return jsonify(result)


@app.route('/api/verify/batch', methods=['POST'])
def verify_batch():
    """
    Batch verification — UiPath bot sends all documents for an application at once.
    Returns verification results for each document.
    """
    data = request.json
    app_id = data.get('appId', '')
    documents = data.get('documents', [])

    results = []
    all_valid = True

    for doc in documents:
        is_valid = random.random() < 0.85
        confidence = random.uniform(0.75, 0.99) if is_valid else random.uniform(0.20, 0.55)
        if not is_valid:
            all_valid = False

        results.append({
            'docName': doc.get('name', ''),
            'docKey': doc.get('key', ''),
            'isValid': is_valid,
            'confidence': round(confidence, 2),
            'status': 'verified' if is_valid else 'rejected'
        })

    return jsonify({
        'appId': app_id,
        'totalDocuments': len(documents),
        'validDocuments': sum(1 for r in results if r['isValid']),
        'allValid': all_valid,
        'results': results,
        'recommendation': 'approve' if all_valid else 'manual_review',
        'verifiedAt': datetime.now().isoformat()
    })


# ---- Certificate Endpoints ----

@app.route('/api/certificates/<app_id>', methods=['GET'])
def get_certificate(app_id):
    """Get generated certificate — UiPath bot downloads this"""
    cert = DB['certificates'].get(app_id)
    if not cert:
        return jsonify({'error': 'Certificate not found. Application may not be approved yet.'}), 404

    app_data = DB['applications'].get(app_id, {})

    return jsonify({
        **cert,
        'applicant': {
            'name': app_data.get('fullName'),
            'dob': app_data.get('dob'),
            'aadhaar': app_data.get('aadhaar'),
            'city': app_data.get('city'),
            'state': app_data.get('state')
        },
        'certType': app_data.get('certType'),
        'certName': app_data.get('certName'),
        'downloadUrl': f'/api/certificates/{app_id}/download'
    })


@app.route('/api/certificates/<app_id>/download', methods=['GET'])
def download_certificate(app_id):
    """Mock certificate download endpoint"""
    cert = DB['certificates'].get(app_id)
    if not cert:
        return jsonify({'error': 'Certificate not found'}), 404

    # In production this would return a PDF. Mock returns JSON.
    return jsonify({
        'message': 'Certificate download initiated',
        'format': 'PDF',
        'size': '245 KB',
        'hash': cert['hash'],
        'downloadedAt': datetime.now().isoformat()
    })


@app.route('/api/certificates/verify/<cert_hash>', methods=['GET'])
def verify_certificate(cert_hash):
    """QR code verification — check if certificate hash is authentic"""
    for app_id, cert in DB['certificates'].items():
        if cert['hash'] == cert_hash:
            return jsonify({
                'authentic': True,
                'certificate': cert,
                'message': 'Certificate is authentic and valid'
            })
    return jsonify({'authentic': False, 'message': 'Certificate not found or tampered'}), 404


# ---- Dashboard / Stats ----

@app.route('/api/dashboard/stats', methods=['GET'])
def dashboard_stats():
    """Dashboard statistics — used by admin panel and UiPath reporting"""
    apps = DB['applications'].values()
    return jsonify({
        'total': len(DB['applications']),
        'pending': sum(1 for a in apps if a.get('status') == 'pending'),
        'under_review': sum(1 for a in apps if a.get('status') == 'under_review'),
        'approved': sum(1 for a in apps if a.get('status') == 'approved'),
        'rejected': sum(1 for a in apps if a.get('status') == 'rejected'),
        'certificates_issued': len(DB['certificates']),
        'citizens_in_db': len(DB['citizens']),
        'recent_verifications': DB['verification_log'][-10:]
    })


@app.route('/api/verification-log', methods=['GET'])
def verification_log():
    """Full verification audit log"""
    return jsonify(DB['verification_log'])


# ---- Mock Data Seeding ----

@app.route('/api/seed', methods=['POST'])
def seed_data():
    """Seed mock applications for testing UiPath workflows"""
    mock_apps = [
        {
            'fullName': 'Rajesh Kumar',
            'email': 'rajesh@example.com',
            'phone': '+91 98765 43210',
            'aadhaar': '1234 5678 9012',
            'dob': '1990-05-15',
            'gender': 'male',
            'address': '42 MG Road, Sector 15',
            'city': 'Delhi',
            'state': 'delhi',
            'pincode': '110001',
            'certType': 'birth',
            'certName': 'Birth Certificate',
            'documents': [
                {'key': 'doc_0', 'name': 'hospital_record.pdf', 'size': 245000},
                {'key': 'doc_1', 'name': 'parent_id.jpg', 'size': 180000},
                {'key': 'aadhaar', 'name': 'aadhaar_card.pdf', 'size': 120000}
            ]
        },
        {
            'fullName': 'Priya Sharma',
            'email': 'priya@example.com',
            'phone': '+91 87654 32109',
            'aadhaar': '9876 5432 1098',
            'dob': '1985-11-22',
            'gender': 'female',
            'address': '108 Park Street',
            'city': 'Mumbai',
            'state': 'maharashtra',
            'pincode': '400001',
            'certType': 'income',
            'certName': 'Income Certificate',
            'documents': [
                {'key': 'doc_0', 'name': 'salary_slip.pdf', 'size': 340000},
                {'key': 'doc_1', 'name': 'bank_statement.pdf', 'size': 520000},
                {'key': 'doc_2', 'name': 'itr_return.pdf', 'size': 180000},
                {'key': 'aadhaar', 'name': 'aadhaar.jpg', 'size': 95000}
            ]
        },
        {
            'fullName': 'Amit Patel',
            'email': 'amit@example.com',
            'phone': '+91 76543 21098',
            'aadhaar': '5555 6666 7777',
            'dob': '1992-03-08',
            'gender': 'male',
            'address': '7 Lake View Apartments',
            'city': 'Ahmedabad',
            'state': 'gujarat',
            'pincode': '380001',
            'certType': 'domicile',
            'certName': 'Domicile Certificate',
            'documents': [
                {'key': 'doc_0', 'name': 'ration_card.pdf', 'size': 210000},
                {'key': 'doc_1', 'name': 'electricity_bill.jpg', 'size': 150000},
                {'key': 'doc_2', 'name': 'voter_id.pdf', 'size': 130000},
                {'key': 'aadhaar', 'name': 'aadhaar_scan.pdf', 'size': 110000}
            ]
        }
    ]

    created = []
    for mock in mock_apps:
        app_id = generate_id()
        mock['id'] = app_id
        mock['status'] = 'pending'
        mock['submittedAt'] = datetime.now().isoformat()
        mock['timeline'] = [
            {'step': 'submitted', 'label': 'Submitted', 'date': datetime.now().isoformat(), 'completed': True},
            {'step': 'under_review', 'label': 'Under Review', 'date': None, 'completed': False},
            {'step': 'verified', 'label': 'Verified', 'date': None, 'completed': False},
            {'step': 'approved', 'label': 'Approved', 'date': None, 'completed': False}
        ]
        DB['applications'][app_id] = mock
        created.append(app_id)

    return jsonify({'message': f'Seeded {len(created)} mock applications', 'ids': created}), 201


if __name__ == '__main__':
    print("""
    ╔══════════════════════════════════════════════════╗
    ║   CertifyHub — Mock Verification Service        ║
    ║   Running on http://localhost:5000               ║
    ║                                                  ║
    ║   API Docs:                                      ║
    ║   GET  /api/health           - Health check      ║
    ║   GET  /api/applications     - List apps         ║
    ║   POST /api/applications     - Create app        ║
    ║   GET  /api/applications/:id - Get app           ║
    ║   POST /api/applications/:id/verify - Verify     ║
    ║   POST /api/verify/aadhaar   - Aadhaar check     ║
    ║   POST /api/verify/document  - Doc verification  ║
    ║   POST /api/verify/batch     - Batch verify      ║
    ║   GET  /api/certificates/:id - Get certificate   ║
    ║   POST /api/seed             - Seed test data    ║
    ║   GET  /api/dashboard/stats  - Dashboard stats   ║
    ╚══════════════════════════════════════════════════╝
    """)
    app.run(debug=True, host='0.0.0.0', port=5000)
