# MERA Backend — Prototype

## Apps included

| App | Purpose |
|---|---|
| `accounts` | User registration (Patient / Hospital / Ambulance), login, JWT auth, role-based access |
| `medical_profiles` | Patient medical profile (blood type, conditions, meds, allergies), POPI consent |
| `verification` | Hospital verification queue — approve, flag, request more info |
| `emergency_contacts` | Patient emergency contacts (up to 5) |
| `emergencies` | SOS trigger, confirm, cancel, accept, incident status, treatment notes, emergency log |

---

## Prerequisites

- Python 3.11+
- PostgreSQL

---

## Setup

### 1. Create the database

```sql
CREATE DATABASE mera_db;
CREATE USER mera_user WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE mera_db TO mera_user;
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Set environment variables

Create a `.env` file or export these in your shell:

```env
DJANGO_SECRET_KEY=any-long-random-string
DB_NAME=mera_db
DB_USER=mera_user
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=5432
```

### 4. Run

```bash
python manage.py migrate
python manage.py createsuperuser   # optional — Django admin access
python manage.py runserver
```

API available at `http://127.0.0.1:8000/`

---

## API endpoints

| Method | URL | Description |
|---|---|---|
| POST | `/api/auth/register/` | Register patient / hospital / ambulance |
| POST | `/api/auth/login/` | Get JWT tokens |
| POST | `/api/auth/token/refresh/` | Refresh JWT |
| GET/PUT | `/api/medical-profile/` | View / update medical profile |
| POST | `/api/medical-profile/consent/` | Grant or withdraw POPI consent |
| GET | `/api/verification/queue/` | Hospital — view verification queue |
| POST | `/api/verification/<id>/approve/` | Hospital — approve profile |
| POST | `/api/verification/<id>/flag/` | Hospital — flag for in-person visit |
| POST | `/api/verification/<id>/request-info/` | Hospital — request more info |
| GET/POST | `/api/emergency-contacts/` | List / add emergency contacts |
| PUT/DELETE | `/api/emergency-contacts/<id>/` | Edit / remove contact |
| POST | `/api/emergencies/trigger/` | Patient — trigger SOS |
| POST | `/api/emergencies/<id>/confirm/` | Patient — confirm SOS |
| POST | `/api/emergencies/<id>/cancel/` | Patient — cancel SOS |
| GET | `/api/emergencies/active/` | Ambulance — view active alerts |
| POST | `/api/emergencies/<id>/accept/` | Ambulance — accept alert |
| POST | `/api/emergencies/<id>/status/` | Ambulance — update incident status |
| POST | `/api/emergencies/<id>/treatment-notes/` | Ambulance — capture/submit notes |
| GET | `/api/emergencies/history/` | Patient — view past emergencies |
| GET | `/admin/` | Django admin panel |

---

## Notes

- SMS and push notifications print to the console — no external services needed.
- WebSocket real-time updates are stubbed — poll the REST endpoints for status.
