# CertifyHub — RPA Certificate Verification System

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

### 4. Open UiPath Studio
Open `uipath/project.json` in UiPath Studio and run `Main.xaml`.

## UiPath Workflow Flow

```
Main.xaml
 ├── Step 1: Health Check (GET /api/health)
 ├── Step 2: SeedTestData.xaml (POST /api/seed)
 ├── Step 3: OpenBrowserAndLogin.xaml (UI Automation)
 ├── Step 4: ProcessApplications.xaml
 │    └── For each pending app:
 │         ├── VerifyDocuments.xaml
 │         │    ├── POST /api/verify/aadhaar
 │         │    └── POST /api/verify/batch
 │         └── Approve or Reject (POST /api/applications/:id/verify)
 ├── Step 5: DownloadCertificates.xaml
 │    └── For each approved app:
 │         ├── GET /api/certificates/:id
 │         └── Website UI: Download page interaction
 └── Step 6: GenerateReport.xaml
      └── Write Excel report with all results
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

## Mock Aadhaar Database

| Aadhaar | Name | City |
|---------|------|------|
| 1234 5678 9012 | Rajesh Kumar | Delhi |
| 9876 5432 1098 | Priya Sharma | Mumbai |
| 5555 6666 7777 | Amit Patel | Ahmedabad |
| 1111 2222 3333 | Sneha Reddy | Hyderabad |
| 4444 5555 6666 | Mohammed Khan | Lucknow |

## Website Features

- 8 certificate types (Birth, Income, Domicile, Caste, Character, Marriage, Death, Education)
- 4-step application wizard with validation
- Drag-and-drop document upload
- Real-time application tracking with timeline
- Admin panel with login, filters, and verification modal
- Certificate download page with preview
- Dark/light theme toggle
- Fully responsive design
- Toast notifications
- Animated counters and floating UI elements

## Admin Credentials

- **Username:** admin
- **Password:** admin123
