# NeoMatCare — AI-Assisted Maternal & Newborn Emergency Referral Platform

> **Accelerating maternal and under-five survival in Northern Ghana** — an offline-first, voice-accessible referral and early-risk-detection system built for the frontline health worker with two bars of signal, not the specialist with a fibre connection.

[![Live API](https://img.shields.io/badge/API-Live-brightgreen)](https://neomatcare-production.up.railway.app/api/health/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An entry to **UNICEF StartUp Lab's "AI for Nurturing Care: Accelerating Maternal, Newborn and Under-5 Survival in Northern Ghana"** hackathon, run with MEST Africa and HOPin Academy.

---

## 🧩 Problem Statement

> **Develop a practical, low-connectivity, community-level AI solution that empowers frontline health workers and caregivers to accelerate maternal and under-five survival in Northern Ghana.**

### Background Context

Maternal, newborn, and under-five survival remains a major public health challenge in Northern Ghana (covering the Northern, North East, Savannah, Upper East, and Upper West regions), driven by geographic barriers, poverty, and weak referral networks.

Nationally, maternal mortality stood at **234 per 100,000 live births in 2023** — well above the Sustainable Development Goal target of under 70 by 2030 — while national neonatal and under-five mortality rates reached **18 and 36 per 1,000 live births**, respectively. Regionally, the crisis is acute: between 2019 and 2023, the **Northern Region alone accounted for 10% of the country's neonatal deaths (2,512 deaths)**, while the **Upper East saw neonatal mortality rise to 6 per 1,000 in 2025** (primarily due to birth asphyxia), and the **Upper West struggled with rising maternal deaths and pregnant maternal anaemia (increasing to 44.2%)**.

Severe nutritional deficiencies and systemic food insecurity heavily impact child survival and development in these northern territories. While national stunting among under-fives stands at **17.4%**, it reaches **nearly 30% in the Northern and North East regions**, where food insecurity rates soar as high as **73.7% in the Upper East** and **over 58% in Savannah**. Across Ghana, **2.4 million children under five live in child food poverty**, and only **26.4% of children aged 6–23 months receive a minimum acceptable diet** due to seasonal shortages, high food costs, and a lack of practical guidance for caregivers.

Frontline community health (CHPS) workers and nutrition officers are crucial to changing these outcomes, but their efforts are severely hindered by fragmented records, supply challenges, transport barriers, and low connectivity.

To address these resource gaps, the hackathon seeks to spark practical, responsible AI-powered tools that **empower — rather than replace — healthcare professionals**. The goal is to equip these workers with simple, effective digital solutions for **early risk detection, household prioritization, referral support, and local nutritional guidance** to save lives.

---

## 💡 Our Solution

NeoMatCare is not a concept built for this brief from scratch — it's a platform already running as a full-stack system (Django/PostgreSQL backend, React web dashboard, React Native mobile app), extended over the course of this hackathon with the offline and voice layers the brief specifically asks for. Here's how the current build maps to each of the four asks, honestly — including where it doesn't yet reach the full ambition of the brief.

**Early risk detection — built.** Every patient record carries an auto-computed risk level (`LOW` / `MEDIUM` / `HIGH`) derived from parity, gravida history, blood group, ANC attendance, and prior emergencies involving any of 14 WHO IMPAC/GHS EmONC-recognised danger signs. An AI layer (Claude) turns those flags into a plain-language risk narrative for the health worker, and separately screens ANC visit history for patterns a busy worker could miss between visits.

**Referral support — built, and the system's most mature part.** This is what NeoMatCare exists to do: close the second and third of the classic "Three Delays" in obstetric emergencies (Thaddeus & Maine, 1994) — the delay in reaching the right facility, and the delay in receiving appropriate care once there. A rule-based engine ranks every candidate facility by clinical capability, real-time bed/cot capacity, and distance, returning the top 3 with reason codes and a confidence level. Every referral then moves through an auditable state machine, with SMS, email, and in-app alerts firing automatically — and, when a specialist opinion is needed before or during transit, a live voice/video consultation channel.

**Household prioritization — partially built.** Health workers can already filter and sort their caseload by the same auto-computed risk level, surfacing which patients need a follow-up visit first — a first pass at prioritization. What's missing is reasoning across a *household* as a unit (siblings, food security, multiple dependents at one address) rather than one patient record at a time — that's the clearest gap between what's shipped and the brief's full ambition, and it's the top item on the roadmap below.

**Local nutritional guidance — partially built.** The patient portal already delivers nutrition, lifestyle, and danger-sign guidance at trimester / monthly / weekly / daily granularity, personalised and pushed to patients automatically as pregnancy progresses. Today that content is scoped to the mother during pregnancy — extending the same content engine to under-five child feeding and household food-security guidance is the other half of the brief's nutrition ask, and the second roadmap priority.

On top of those four, two things were built specifically because this brief demands them:

- **Low-connectivity, by design, not as an afterthought.** Patient registration, case creation, referrals, and ANC visit logging all go through an offline-first mutation queue on both web and mobile — a write made with no signal is stored locally and retried automatically the moment connectivity returns, never blocking the worker from moving to the next patient. See [Offline-First Design](#-offline-first-design) below.
- **Voice, in the languages people actually speak.** A worker who's more comfortable speaking than typing can dictate notes and have guidance read back to them in Twi, Dagbani, Ewe, Ga, Frafra (Gurune), Hausa, or English — Dagbani and Frafra being first languages across large parts of the Northern and Upper East regions this brief is written for. See [Voice & Local-Language Accessibility](#-voice--local-language-accessibility) below.

And throughout, the platform is built to **empower, not replace**: every AI output — risk narratives, ANC anomaly flags, referral suggestions, transport recommendations — is advisory. A health worker can override any facility recommendation, but the reason is mandatory and permanently logged. The AI drafts; the human decides.

---

## 📦 Repositories

NeoMatCare is three codebases working together:

| Layer | Repository | What it is |
|-------|-----------|------------|
| **Backend API** (this repo) | [`NeomatCare`](https://github.com/mohammedawalbawahissah-gif/NeomatCare) | Django REST Framework + PostgreSQL. The referral engine, all business logic, and every integration (AI, voice, SMS, email, WebRTC) live here. |
| **Web Dashboard** | [`neomatcare-frontend`](https://github.com/mohammedawalbawahissah-gif/neomatcare-frontend) | React + Vite. Used by facility admins, superadmins, specialists, and drivers; also usable by health workers on a desktop/laptop. |
| **Mobile App** | [`neomatcare-mobile`](https://github.com/mohammedawalbawahissah-gif/neomatcare-mobile) | Expo / React Native. The primary field tool — this is what a CHPS-level health worker actually carries. |

---

## 🔗 Live Deployment

| Resource | URL |
|----------|-----|
| **Base URL** | `https://neomatcare-production.up.railway.app` |
| **Health check** | [`/api/health/`](https://neomatcare-production.up.railway.app/api/health/) — confirmed live |

> The backend also ships a Render deployment configuration (`render.yaml`) alongside its Railway setup. Interactive Swagger/OpenAPI docs (`drf-spectacular`) are installed as a dependency but not currently wired into `config/urls.py` — the [API Endpoints](#-api-endpoints) section below is the current source of truth for the API surface.

---

## ✨ Features

### Core platform
- **JWT authentication** with refresh, blacklisting, OTP verification (SMS/email), and a staff-approval gate — self-registered facility staff can't log in until a facility admin or superadmin approves them
- **Six roles**: `superadmin`, `facility_admin`, `health_worker`, `specialist`, `driver`, and `patient` (branded "Health Companion" in the patient-facing app)
- **Health facility registry** with GPS coordinates, granular capacity fields (ICU beds, NICU cots, theatre, blood bank, on-call specialist), and a facility hierarchy modelled directly on Ghana's real system: CHPS Compound → Primary/District → Secondary/Regional → Tertiary/Teaching
- **Emergency case management** with full clinical fields (vitals, 14 WHO IMPAC/GHS-recognised danger signs, obstetric history), auto-computed patient risk scoring, and append-only ANC visit logging and triage notes
- **Referral recommendation engine** — see [Referral Engine](#-referral-engine)
- **Complete referral lifecycle** — state machine from `DRAFT` through `COMPLETED`, immutable audit trail, maternal/neonatal outcome recording

### AI suite (Claude-backed)
Six advisory capabilities, each with a dedicated panel on web and mobile: triage-note extraction into structured fields, plain-language risk narration, ANC anomaly detection, referral handover drafting, transport-mode recommendation, and role-aware chat. None of these make a decision on their own — every output is a suggestion a human reviews.

### Telemedicine
- Text-based consultation messaging tied to a referral
- Live WebRTC voice/video consultations between health workers and specialists, with TURN relay (Xirsys/Twilio) plus STUN fallback for NAT traversal

### Communications
- Real-time in-app notifications, email, and SMS (via Africa's Talking) fire on referral and consultation lifecycle events — delivery runs off the request thread so a flaky SMS gateway can't delay a health worker's next action

### Wellness / patient portal
Pregnancy and menstrual-cycle tracking, plus trimester/monthly/weekly/daily nutrition, lifestyle, and danger-sign content, personalised and pushed to patients automatically (currently scoped to the pregnant mother — see [Roadmap](#-roadmap)).

### Transport & dispatch
Driver/vehicle/dispatch-request models with Ghana-specific vehicle types: ambulance, car, motorcycle, tricycle, truck.

### Engineering
- Idempotency keys on cases and referrals — a retried submission (from the offline queue, or a double-tap on a bad connection) resolves to the same record instead of duplicating it
- Distance-based facility filtering via the Haversine formula (no external mapping API dependency)
- Engine-version tracking on every referral, for reproducibility
- Timestamped facility capacity audit log
- Soft-delete on patient records; PHI isolated in a separate model, excluded from list serializers

---

## 🏗️ Tech Stack

### Backend (this repo)
| Layer | Technology |
|-------|-----------|
| Framework | Django 5.0 + Django REST Framework |
| Database | PostgreSQL |
| Authentication | JWT via `djangorestframework-simplejwt` |
| AI | Anthropic Claude (`claude-sonnet-5`) |
| Local-language voice | Khaya AI / GhanaNLP (Twi, Dagbani, Ewe, Ga, Frafra), Google Cloud Speech-to-Text (Hausa) |
| SMS | Africa's Talking |
| Real-time telemedicine | WebRTC signalling + Xirsys/Twilio TURN |
| Environment config | `django-environ` (12-factor) |
| Testing | `pytest-django` |
| Deployment | Railway (live); Render config also present |

### Web dashboard
React 18 + Vite, TanStack Query, `react-leaflet` (facility maps), Tailwind CSS, Axios, Recharts — plus a custom offline-mutation-queue and read-cache layer (see below).

### Mobile app
Expo SDK 54 (React Native 0.81, React 19), React Navigation, `@react-native-async-storage/async-storage` + `@react-native-community/netinfo` (offline queue), `expo-speech` + `@react-native-voice/voice` (on-device English voice), `react-native-webrtc` (teleconsultation), `expo-notifications` (push).

---

## 🚀 Local Setup

### Prerequisites
- Python 3.12.10 (pinned via `python-version` at the repo root)
- PostgreSQL installed and running
- Node.js 18+ (for the web and mobile repos)

### Backend

```bash
git clone https://github.com/mohammedawalbawahissah-gif/NeomatCare.git
cd NeomatCare
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements/dev.txt
```

Create a `.env` file at the repo root (there is currently no `.env.example` to copy — these are the variables the app reads):

```env
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/maternal_referral
DB_SCHEMA=public
ACCESS_TOKEN_LIFETIME_MINUTES=15
REFRESH_TOKEN_LIFETIME_DAYS=7

# AI
ANTHROPIC_API_KEY=

# Local-language voice
KHAYA_API_KEY=
GOOGLE_CLOUD_STT_API_KEY=

# SMS (Africa's Talking)
AT_USERNAME=
AT_API_KEY=

# Email
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
DEFAULT_FROM_EMAIL=

# WebRTC TURN (either or both)
XIRSYS_IDENT=
XIRSYS_SECRET=
XIRSYS_CHANNEL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```

```bash
psql -U postgres -c "CREATE DATABASE maternal_referral;"
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Web dashboard

```bash
git clone https://github.com/mohammedawalbawahissah-gif/neomatcare-frontend.git
cd neomatcare-frontend
npm install
echo "VITE_API_URL=http://localhost:8000/api" > .env
npm run dev
```

### Mobile app

```bash
git clone https://github.com/mohammedawalbawahissah-gif/neomatcare-mobile.git
cd neomatcare-mobile
npm install
echo "EXPO_PUBLIC_API_URL=http://<your-machine-ip>:8000/api" > .env
npx expo start
```

---

## 📡 API Endpoints

### Authentication (`/api/auth/`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register/` | Create a new account |
| `POST` | `/api/auth/login/` | Obtain access and refresh tokens |
| `POST` | `/api/auth/token/refresh/` | Refresh an expired access token |
| `POST` | `/api/auth/logout/` | Blacklist the refresh token |
| `GET`  | `/api/auth/me/` | Current user profile |

### Health Facilities (`/api/facilities/`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/facilities/` | List facilities (supports distance + capability filters, e.g. `?lat=&lng=&radius_km=&has_theatre=true&level=3`) |
| `POST` | `/api/facilities/` | Register a new facility |
| `GET`  | `/api/facilities/{id}/` | Full facility detail |
| `PATCH`| `/api/facilities/{id}/capacity/` | Update real-time resource availability |
| `GET`  | `/api/facilities/{id}/capacity-history/` | Timestamped capacity audit log |

### Patients & Emergency Cases (`/api/cases/`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` / `GET` | `/api/cases/` | Create / list emergency cases (role-scoped) |
| `GET`  | `/api/cases/{id}/` | Full case detail |
| `POST` | `/api/cases/{id}/triage-note/` | Append a clinical note |
| `POST` | `/api/cases/{id}/suggest-facilities/` | Case-scoped facility suggestion shortcut |
| `POST` / `GET` | `/api/cases/patients/` | Create / list patient records |
| `GET`  | `/api/cases/patients/{id}/` | Full patient detail (risk level, risk flags) |
| `POST` | `/api/cases/patients/{id}/anc-visits/` | Log an ANC visit |

### Referrals (`/api/referrals/`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/referrals/suggest/` | Run the engine — top 3 ranked facilities |
| `POST` | `/api/referrals/create/` | Create a referral |
| `GET`  | `/api/referrals/` | List referrals (role-scoped) |
| `GET`  | `/api/referrals/{id}/` | Full referral detail |
| `PATCH`| `/api/referrals/{id}/status/` | Transition to next state |
| `GET`  | `/api/referrals/{id}/timeline/` | Full timestamped state history |
| `PATCH`| `/api/referrals/{id}/outcome/` | Record maternal and neonatal outcome |

### AI, Voice, Consultations, Transport, Wellness, Notifications
| Prefix | Covers |
|--------|--------|
| `/api/ai/` | Triage extraction, risk narration, ANC anomaly detection, handover drafting, transport recommendation, chat |
| `/api/voice/` | Language list, speech-to-text, text-to-speech (routes to on-device, Khaya AI, or Google Cloud depending on language) |
| `/api/consultations/` | Text consultation threads; WebRTC offer/answer/ICE signalling |
| `/api/transport/` | Drivers, vehicles, dispatch requests |
| `/api/wellness/` | Pregnancy/cycle tracking, nutrition and danger-sign content |
| `/api/notifications/` | In-app notification feed |

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

For every emergency case, the engine (`referral_engine.py`) scores every facility within a 300km radius and returns the top 3, each with a reason-code trail and a confidence level. The score is an additive point total, not a fixed percentage split:

1. **Capability match** — up to 50 points, based on the fraction of clinically-required services (blood bank, theatre, ICU, NICU, obstetrics/specialist) the facility has, derived from the case's danger signs. A facility below the minimum required level for those danger signs scores 0 here.
2. **Feature bonuses** — up to +45: theatre available (+10), blood bank available when required (+10), ICU beds available when required (+10), NICU cots available when required (+10), on-call specialist (+5).
3. **Facility tier** — up to +8 (facility level × 2 — Tertiary/Teaching facilities score highest).
4. **Distance penalty** — up to −20 (1 point per 10km travelled, capped at 200km).

**Confidence**: `HIGH` if every required service is matched and the total score is ≥60; `MEDIUM` if at least half the required services are matched and the score is ≥40; otherwise `LOW`.

**Clinical rule set** — all 14 danger signs the engine recognises, each mapped to required services and a minimum facility level:

| Danger Sign | Min Level | Blood Bank | Theatre | ICU | NICU | Obstetrics | Reference |
|-------------|-----------|------------|---------|-----|------|------------|-----------|
| Postpartum Haemorrhage (PPH) | 3 | ✓ | ✓ | ✓ | | | WHO IMPAC §S-26 |
| Antepartum Haemorrhage (APH) | 2 | ✓ | ✓ | | | | WHO IMPAC / GHS EmONC |
| Ruptured Uterus | 3 | ✓ | ✓ | ✓ | | | WHO IMPAC / GHS EmONC |
| Eclampsia | 2 | | | ✓ | | ✓ | WHO IMPAC §S-53 |
| Severe Pre-eclampsia | 2 | | | ✓ | | ✓ | WHO IMPAC / GHS EmONC |
| Obstructed Labour | 2 | | ✓ | | | ✓ | WHO IMPAC §S-61 |
| Cord Prolapse | 2 | | ✓ | | | ✓ | WHO IMPAC §S-87 |
| Puerperal Sepsis | 2 | | | ✓ | | ✓ | WHO IMPAC / GHS EmONC |
| Chorioamnionitis | 2 | | ✓ | | | ✓ | WHO IMPAC / GHS EmONC |
| Neonatal Distress | 2 | | | | ✓ | | GHS EmONC §8.1 |
| Preterm Labour | 2 | | | | ✓ | ✓ | WHO IMPAC §S-144 |
| Neonatal Sepsis | 2 | | | | ✓ | | WHO IMPAC / GHS EmONC |
| Severe Anaemia | 2 | ✓ | | | | | WHO IMPAC / GHS EmONC |
| Malpresentation | 2 | | ✓ | | | ✓ | WHO IMPAC / GHS EmONC |

Clinicians can override any recommendation — the override reason is required and permanently stored.

---

## 🗣️ Voice & Local-Language Accessibility

A worker can dictate case notes and have any written guidance read back to them, in the language they're most comfortable in:

| Language | Speech-to-text | Text-to-speech | Route |
|----------|----------------|-----------------|-------|
| English | ✓ | ✓ | On-device (free, works offline) |
| Twi | ✓ | ✓ | Khaya AI (GhanaNLP) |
| Dagbani | ✓ | ✓ | Khaya AI (GhanaNLP) |
| Ewe | ✓ | ✓ | Khaya AI (GhanaNLP) |
| Ga | ✓ | ✓ | Khaya AI (GhanaNLP) |
| Frafra (Gurune) | ✓ | ✓ | Khaya AI (GhanaNLP) |
| Hausa | ✓ | — | Google Cloud Speech-to-Text |

Dagbani and Frafra are first languages across large parts of the Northern and Upper East regions — a health worker or caregiver doesn't need English fluency, or even reading fluency, to use the system. Voice audio is proxied through the backend for transcription/synthesis and is never persisted to disk or database.

---

## 📶 Offline-First Design

Patient registration, case creation, referral creation, and ANC visit logging go through a local write-queue on both the web dashboard and the mobile app — built with a specific scenario in mind: a CHPS worker filling out a patient record in a village with no signal.

- A submission is written locally first (`localStorage` on web, `AsyncStorage` on mobile) and queued if the network request fails.
- The queue retries automatically on reconnect (native connectivity events on mobile via NetInfo; the Page Visibility API and periodic polling on web), and also on a timer, to catch a backend host waking up from a cold start rather than a genuine outage.
- Idempotency keys on cases and referrals mean a retry — automatic or a worker's own double-tap on a bad connection — resolves to the same record instead of creating a duplicate.
- A sync-status indicator shows the worker what's still pending, so they always know whether a record has actually reached the server.
- Scope is deliberately narrower than "everything": AI features, voice transcription, and file/photo uploads currently require a live connection and are not queued — see [Roadmap](#-roadmap).
- Read data (facility lists, patient lookups) is cached so a worker can look something up even without a fresh connection, distinct from the write queue above.

---

## 👥 User Roles

| Role | Permissions |
|------|-------------|
| `health_worker` | Create cases, patients, and referrals; view own records; dictate/read-aloud; offline queueing |
| `facility_admin` | All health_worker permissions + manage facility capacity + approve staff registrations + view all facility records |
| `specialist` | Receive and respond to consultations (text and WebRTC); review referrals in their specialty |
| `driver` | View and update assigned transport dispatch requests |
| `patient` ("Health Companion") | Personal wellness portal — pregnancy/cycle tracking, personalised nutrition and danger-sign content, service ratings |
| `superadmin` | Full platform access, including analytics and audit logs |

---

## 🧪 Running Tests

```bash
pytest
```

Automated coverage is currently backend-only (`pytest-django`), covering:
- Haversine distance calculations
- Engine capability matching across all 14 danger signs, confidence-level logic, and radius filtering
- Full referral lifecycle (create → state transitions → outcome) and invalid-transition rejection
- Override-reason enforcement and timeline ordering
- Health check endpoint

The web dashboard and mobile app do not yet have an automated test suite — they're currently verified manually.

---

## 📊 Data Models

```
User ──────────────┐
                    ↓
HealthFacility ← EmergencyCase ← Patient ── PregnancyTracker / CycleTracker (wellness)
      ↑                ↓
      |             Referral ── Consultation (text + WebRTC) ── Specialist Profile
      |            /        \
Vehicle/Driver   ReferralStatusLog   Notification (in-app + email + SMS)
(transport)

FacilityCapacityLog (append-only audit trail)
TriageNote          (append-only clinical notes)
```

Patient data is isolated in a separate model — analytics queries never need to touch PHI. AI, voice, and notification services are stateless service layers rather than persisted models.

---

## 🔒 Security

- JWT access tokens expire in 15 minutes; refresh tokens in 7 days; refresh tokens are blacklisted on logout
- OTP verification (SMS/email) and a staff-approval gate before new facility staff can log in
- Rate limiting on authentication and suggestion endpoints
- PHI isolated in the `Patient` model, excluded from list serializers; soft-delete on all patient records
- Voice audio is proxied for transcription/synthesis and never persisted
- Environment variables via `django-environ` — no secrets in source code
- Compliant with Ghana's Data Protection Act (2012)

---

## 🌱 Roadmap

Ordered by how directly each closes the remaining gap with the hackathon brief:

- [ ] **Household-level view** — group patients/children by household or caregiver so a CHPS worker can prioritize an entire compound in one pass, not one patient record at a time
- [ ] **Under-five illness detection and referral** — extend danger-sign detection past the current neonatal window into general under-five illness (malaria, diarrhoea, pneumonia) per IMCI guidance
- [ ] **Under-five nutrition and growth monitoring** — MUAC/weight-for-age tracking and household food-security flags, extending the existing content engine past pregnancy-only guidance
- [ ] **SMS/USSD fallback workflow** for feature phones, for settings below even a low-end smartphone
- [ ] **Offline support for AI and voice** — these currently require connectivity, since they call out to Claude/Khaya/Google
- [ ] Ministry of Health analytics dashboard
- [ ] Predictive ML layer trained on Ghanaian outcome data, complementing the current rule-based engine
- [ ] Multi-country rule-set support

---

## 📖 Clinical References

- WHO IMPAC — *Managing Complications in Pregnancy and Childbirth* (2017)
- Ghana Health Service — *Emergency Obstetric and Newborn Care (EmONC) Protocols* (2020)
- Thaddeus & Maine — *Too Far to Walk: Maternal Mortality in Context*, Social Science & Medicine (1994)

---

## 🎯 Alignment

Built to support **UN SDG 3** (Good Health and Well-Being) from the outset, and extended for UNICEF StartUp Lab's *AI for Nurturing Care* hackathon to target maternal, newborn, and under-five survival specifically in Northern Ghana's Northern, North East, Savannah, Upper East, and Upper West regions — with the nutrition roadmap above also reaching toward **SDG 2** (Zero Hunger).

---

## 👤 Author

Mohammed Awal Bawah Issah

---

## 📄 License

This project is licensed under the MIT License.
