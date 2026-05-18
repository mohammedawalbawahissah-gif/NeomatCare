# NeoMatCare — AI-Assisted Emergency Referral API

> **Maternal and neonatal emergency referral system for Sub-Saharan Africa**
> Built to eliminate the Second and Third Delays in obstetric emergencies by routing frontline health workers to the right facility in real time.

[![Live API](https://img.shields.io/badge/API-Live-brightgreen)](https://neomatcare-production.up.railway.app/api/health/)
[![Docs](https://img.shields.io/badge/Swagger-Docs-blue)](https://neomatcare-production.up.railway.app/api/docs/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌍 Background

Maternal mortality in Sub-Saharan Africa stands at approximately **700 deaths per 100,000 live births** — roughly 70% of the global total. The leading structural cause is not a shortage of care but a failure in the referral system, captured by the **Three Delays Framework**:

1. Delay in deciding to seek care
2. **Delay in reaching the right facility** ← this system addresses this
3. **Delay in receiving appropriate care at the facility** ← and this

NeoMatCare is a backend API that equips frontline health workers — midwives, nurses, and doctors — with a fast, GPS-aware, clinically grounded referral tool that routes obstetric emergencies to the nearest *capable* facility in real time.

---

## 🔗 Live Deployment

| Resource | URL |
|----------|-----|
| **Base URL** | `https://neomatcare-production.up.railway.app` |
| **Health check** | [`/api/health/`](https://neomatcare-production.up.railway.app/api/health/) |
| **Swagger UI** | [`/api/docs/`](https://neomatcare-production.up.railway.app/api/docs/) |
| **OpenAPI Schema** | [`/api/schema/`](https://neomatcare-production.up.railway.app/api/schema/) |

---

## ✨ Features

### Core
- **JWT authentication** with token refresh and blacklisting
- **Role-based access control** — `health_worker`, `facility_admin`, `superadmin`
- **Health facility registry** with real-time GPS coordinates and granular capacity fields
- **Emergency case management** with full clinical fields (vitals, danger signs, obstetric history)
- **Referral recommendation engine** — multi-factor scoring grounded in WHO IMPAC and Ghana Health Service EmONC protocols
- **Complete referral lifecycle** — state machine from `DRAFT` through `COMPLETED` with immutable audit trail
- **Outcome recording** — maternal and neonatal outcomes per referral

### Advanced
- Distance-based facility filtering using the Haversine formula (no external API dependency)
- Clinician override capture with mandatory reason logging
- Engine version tracking on every referral for reproducibility
- Timestamped capacity change log per facility
- Append-only triage notes on emergency cases
- Soft-delete on patient records (data compliance)
- API documentation via Swagger / OpenAPI 3.0

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Django 5.0 + Django REST Framework |
| Database | PostgreSQL |
| Authentication | JWT via `djangorestframework-simplejwt` |
| GPS distance | Haversine formula (custom utility) |
| Environment config | `django-environ` (12-factor compliant) |
| API documentation | `drf-spectacular` |
| Testing | `pytest-django` |
| Deployment | Railway (production) |

---

## 🚀 Local Setup

### Prerequisites
- Python 3.11+
- PostgreSQL installed and running

### 1. Clone and set up the environment

```bash
git clone https://github.com/YOUR_USERNAME/maternal-referral-api.git
cd maternal-referral-api
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements/dev.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your local values:

```env
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/maternal_referral
ACCESS_TOKEN_LIFETIME_MINUTES=15
REFRESH_TOKEN_LIFETIME_DAYS=7
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### 3. Create the database and run migrations

```bash
psql -U postgres -c "CREATE DATABASE maternal_referral;"
python manage.py migrate
python manage.py createsuperuser
```

### 4. Start the development server

```bash
python manage.py runserver
```

Visit `http://localhost:8000/api/docs/` to explore the API.

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register/` | Create a new account |
| `POST` | `/api/auth/login/` | Obtain access and refresh tokens |
| `POST` | `/api/auth/token/refresh/` | Refresh an expired access token |
| `POST` | `/api/auth/logout/` | Blacklist the refresh token |
| `GET`  | `/api/auth/me/` | Current user profile |

### Health Facilities
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/facilities/` | List facilities (supports distance + capability filters) |
| `POST` | `/api/facilities/` | Register a new facility |
| `GET`  | `/api/facilities/{id}/` | Full facility detail |
| `PATCH`| `/api/facilities/{id}/capacity/` | Update real-time resource availability |
| `GET`  | `/api/facilities/{id}/capacity-history/` | Timestamped capacity audit log |

**Facility list filters:**
```
?lat=5.6&lng=-0.2&radius_km=100&has_theatre=true&has_blood_bank=true&has_nicu=true&level=3
```

### Emergency Cases
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/emergency-cases/` | Create a new case (creates Patient record automatically) |
| `GET`  | `/api/emergency-cases/` | List cases (role-scoped) |
| `GET`  | `/api/emergency-cases/{id}/` | Full case detail |
| `POST` | `/api/emergency-cases/{id}/triage-note/` | Append a clinical note |

### Referrals
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/referrals/suggest/` | Run engine — returns top 3 ranked facilities |
| `POST` | `/api/referrals/create/` | Create a referral |
| `GET`  | `/api/referrals/` | List referrals (role-scoped) |
| `GET`  | `/api/referrals/{id}/` | Full referral detail |
| `PATCH`| `/api/referrals/{id}/status/` | Transition to next state |
| `GET`  | `/api/referrals/{id}/timeline/` | Full timestamped state history |
| `PATCH`| `/api/referrals/{id}/outcome/` | Record maternal and neonatal outcome |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/health/` | DB connectivity and uptime check |

---

## 🔄 Referral State Machine

```
DRAFT → PENDING → ACCEPTED → IN_TRANSIT → RECEIVED → COMPLETED
                ↘ CANCELLED              ↘ FAILED
```

Every transition is timestamped and written to an immutable `ReferralStatusLog`. Invalid transitions are rejected with a clear error.

---

## 🧠 Referral Engine

The recommendation engine scores every candidate facility against three weighted factors:

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Capability match | 50% | Required services vs. available (theatre, blood bank, ICU, NICU, specialist) |
| Inverse distance | 30% | 1 / Haversine distance, normalised across candidates |
| Capacity score | 20% | Available ICU beds and NICU cots, normalised |

**Clinical rule sets** are explicitly defined and cited:

| Danger Sign | Min Level | Theatre | Blood Bank | ICU | NICU | Specialist | Reference |
|-------------|-----------|---------|------------|-----|------|------------|-----------|
| PPH | 3 | ✓ | ✓ | | | ✓ | WHO IMPAC §S-26 |
| Eclampsia | 3 | | | ✓ | | ✓ | WHO IMPAC §S-53 |
| Obstructed Labour | 2 | ✓ | | | | ✓ | WHO IMPAC §S-61 |
| Neonatal Distress | 3 | | | | ✓ | | GHS EmONC §8.1 |
| Preterm Labour | 3 | | | | ✓ | ✓ | WHO IMPAC §S-144 |
| Cord Prolapse | 2 | ✓ | | | | | WHO IMPAC §S-87 |

The engine always returns the **top 3 ranked facilities** with reason codes, distance, estimated travel time, and a confidence level (`HIGH` / `MEDIUM` / `LOW`). Clinicians can override any recommendation — the override reason is required and stored.

---

## 👥 User Roles

| Role | Permissions |
|------|-------------|
| `health_worker` | Create cases and referrals, view own records |
| `facility_admin` | All health_worker permissions + manage facility capacity + view all facility records |
| `superadmin` | Full platform access including analytics and audit logs |

---

## 🧪 Running Tests

```bash
pytest
```

The test suite covers:
- Haversine distance calculations
- Engine capability matching (PPH, eclampsia, obstructed labour, multi-sign cases)
- Confidence level logic
- Radius filtering
- Full referral lifecycle (create → state transitions → outcome)
- Invalid transition rejection
- Override reason enforcement
- Timeline ordering
- Health check endpoint

---

## 📊 Data Models

```
User ──────────────┐
                   ↓
HealthFacility ← EmergencyCase ← Patient
                   ↓
                Referral
               /        \
  ReferralStatusLog   Notification
  
FacilityCapacityLog (append-only audit trail)
TriageNote          (append-only clinical notes)
```

Patient data is isolated in a separate model — analytics queries never need to touch PHI.

---

## 🔒 Security

- JWT access tokens expire in 15 minutes; refresh tokens in 7 days
- Refresh tokens are blacklisted on logout
- Rate limiting on authentication and suggestion endpoints
- PHI isolated in the `Patient` model, excluded from list serializers
- Soft-delete on all patient records
- Environment variables via `django-environ` — no secrets in source code
- Compliant with Ghana's Data Protection Act (2012)

---

## 🌱 Future Extensions

- [ ] SMS alerts to receiving facilities via Africa's Talking
- [ ] Mobile frontend (React Native or Flutter)
- [ ] Ministry of Health analytics dashboard
- [ ] Offline sync for facilities with intermittent connectivity
- [ ] Machine learning layer on top of the rule-based engine
- [ ] Multi-country rule set support

---

## 📖 Clinical References

- WHO IMPAC — *Managing Complications in Pregnancy and Childbirth* (2017)
- Ghana Health Service — *Emergency Obstetric and Newborn Care (EmONC) Protocols* (2020)
- Thaddeus & Maine — *Too Far to Walk: Maternal Mortality in Context*, Social Science & Medicine (1994)

---

## 🎯 Alignment

This project supports **UN Sustainable Development Goal 3** — Good Health and Well-Being, specifically the target to reduce the global maternal mortality ratio and end preventable deaths of newborns.

---

## 👤 Author

Built as a Backend Engineering capstone project.

---

## 📄 License

This project is licensed under the MIT License.
