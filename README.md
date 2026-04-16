# CertifyHub: RPA Certificate Verification System

A complete UiPath RPA demonstration project with a web portal, mock backend, and automated workflows for certificate generation and document verification.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   CertifyHub    │────▶│  Flask Backend   │◀────│   UiPath Bot    │
│   Website       │     │  (Mock Service)  │     │   (Workflows)   │
│   :8080         │     │  :5000           │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
     User uploads           Verifies docs           Automates the
     documents              against mock DB          entire flow
```

## Quick Start

### 1. Start the Backend (Terminal 1)
```bash
cd backend
pip install -r requirements.txt
python app.py
```

### 2. Start the Website (Terminal 2)
```bash
cd website
python -m http.server 8080
```

### 3. Seed Test Data
```bash
curl -X POST http://localhost:5000/api/seed
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/applications` | List all applications |
| POST | `/api/applications` | Submit new application |
| GET | `/api/applications/:id` | Get application by ID |
| POST | `/api/applications/:id/verify` | Approve/reject application |
| POST | `/api/verify/aadhaar` | Verify Aadhaar against mock DB |
| POST | `/api/verify/document` | Verify single document (mock OCR) |
| POST | `/api/verify/batch` | Batch verify all documents |
| GET | `/api/certificates/:id` | Get generated certificate |
| GET | `/api/certificates/:id/download` | Download certificate |
| GET | `/api/certificates/verify/:hash` | QR/hash verification |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| POST | `/api/seed` | Seed mock test data |
