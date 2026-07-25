# MERA — Project Context for AI Assistants

Paste this whole document into a new conversation with Claude, ChatGPT, or any AI assistant before asking for help on this project. It gives the assistant the context it needs to give suggestions that actually fit our architecture instead of generic advice.

---

## What MERA is

MERA (Medical Emergency Response Application) is a South African medical emergency platform connecting **patients**, **hospitals**, and **ambulance services**. It's a year-long capstone project for a team called NonaCrest, with formal SRS and UI specification documents behind it. It must comply with South Africa's POPI Act (data protection law).

## Repo structure

Single repo, three top-level folders:

```
MERA-APP-Nonacrest/
├── backend/           Django REST Framework API (single backend, shared by both frontends)
├── mobile-frontend/   React Native / Expo app — for Patients and EMTs
└── web-frontend/      React + Vite app — for Hospital Admins, Ambulance Admins, and MERA super-admins
```

**One backend serves both frontends.** Nothing is duplicated. Any new endpoint should be built once in `backend/` and consumed by whichever frontend(s) need it.

## User roles (this is the most important part to get right)

There are **five roles**, and each has a specific home:

| Role | Where they log in | What they do |
|---|---|---|
| **Patient** | Mobile app | Self-registers. Triggers SOS, manages own medical profile, uses AI chatbot. |
| **EMT** | Mobile app | Does **not** self-register. Their account is created by their Ambulance Admin. Responds to SOS alerts, updates incident status, submits treatment notes. |
| **Hospital Admin** | Web app | Does **not** self-register. Account created by MERA super-admin during institutional onboarding. Manages patient verification queue, sees incoming ambulance notifications. |
| **Ambulance Admin** | Web app | Does **not** self-register. Account created by MERA super-admin. Creates/manages EMT accounts under their service. |
| **MERA super-admin** | Web app | Internal MERA team only. Onboards new hospital/ambulance institutions, creates their admin accounts, manages/deletes any account platform-wide, views platform stats. |

**Key principle: only Patients self-register.** Every other role's account is created by someone above them in the hierarchy (MERA admin → Hospital/Ambulance admin → EMT). This replaced an earlier design where hospitals and ambulances self-registered with a multi-step approval flow — that flow is being phased out in favor of top-down account creation.

**Important, still evolving:** Hospitals and hospital-related screens are being **removed from the mobile app entirely** and moved fully to the web app. The mobile app will end up serving only Patients and EMTs.

**Role naming — current transitional state (read this carefully before touching `accounts/models.py`):**

The `Role` enum on `User` currently has **seven** values, not five, because the new roles were added *alongside* the old ones rather than replacing them yet:

```
patient            — unchanged, still used
hospital           — OLD name for what is becoming hospital_admin. Still referenced
                      throughout permissions.py, views.py, verification app, etc.
ambulance_service  — OLD name for what is becoming ambulance_admin. Same situation.
hospital_admin     — NEW. Not yet wired into permissions/views beyond the model choice
                      and the web login page's role check.
ambulance_admin     — NEW. Same as above. This is an institution-level account
                      (the ambulance service itself), NOT an individual EMT.
emt                — NEW. Individual crew member, mobile-only, does not self-register.
                      Belongs to exactly one ambulance_admin (see field below).
mera_admin          — NEW. Platform-wide super-admin, web-only.
```

**This is a deliberate, temporary state.** The team has not yet decided whether to do a hard rename (`hospital` → `hospital_admin`, `ambulance_service` → `ambulance_admin`) across every file that references the old names, or to migrate references gradually. **Update:** old and new role names are now treated as equivalent everywhere permission/role checks happen. `accounts/models.py` defines `HOSPITAL_ROLES = {Role.HOSPITAL, Role.HOSPITAL_ADMIN}` and `AMBULANCE_ROLES = {Role.AMBULANCE_SERVICE, Role.AMBULANCE_ADMIN}`, and `IsHospital`, `IsAmbulanceService`, `HospitalListView`, and other role filters across `accounts/`, `verification/`, and `emergencies/` all check membership in these sets (`role__in=HOSPITAL_ROLES`, etc.) rather than a single literal role string. Accounts created with either the old or new role name are treated identically by these checks. The underlying rename decision (collapsing to one canonical name per role) is still not made — these sets are the interim bridge — but the practical blocker (new-role accounts failing old-name-only checks) described in earlier versions of this doc has been resolved.

**EMT ↔ Ambulance Admin link:** Each EMT belongs to exactly one ambulance service. This is modeled as a self-referencing `ForeignKey` on `User`:

```python
ambulance_service = models.ForeignKey(
    "self", null=True, blank=True, on_delete=models.SET_NULL,
    related_name="emts", limit_choices_to={"role": "ambulance_admin"},
)
```

An `ambulance_admin` user's EMTs are accessible via `ambulance_admin_user.emts.all()`.

**Account creation hierarchy (planned, not yet built):**
- MERA admin creates hospital_admin accounts and ambulance_admin accounts (institution onboarding)
- Ambulance admin creates EMT accounts (EMTs never self-register)
- Nobody creates MERA admin accounts through the app — these are set up directly (e.g. via Django shell) since it's the internal MERA team only

**Web login page:** Built at `web-frontend/src/pages/auth/Login.jsx`. Users select their role (MERA Admin / Hospital Admin / Ambulance Admin) via tabs *before* entering credentials. The frontend compares the selected role against `response.user.role` from the login API and **rejects login client-side if they don't match**, even though the backend would otherwise authenticate successfully. This is a deliberate UX choice, not a security boundary — real authorization still happens via backend permission classes on each endpoint.

## Tech stack

- **Backend:** Django REST Framework, PostgreSQL, JWT auth (`djangorestframework-simplejwt`)
- **Mobile frontend:** React Native + Expo (TypeScript)
- **Web frontend:** React + Vite (JavaScript), `react-router-dom` for routing, `recharts` for charts, `lucide-react` for icons. Folder structure under `src/pages/` is split by role (`auth/`, `hospital-admin/`, `ambulance-admin/`, `mera-admin/`) so each teammate can work in their own lane. Only `auth/Login.jsx` exists so far — the other three folders are still empty placeholders (`.gitkeep` only).
- **AI chatbot:** Server-side only, calls the Anthropic API from Django (never from either frontend — API keys must never touch client code)
- **Hosting:** Backend deployed on Render (free tier). Database also on Render Postgres (free tier — **expires and must be recreated roughly every 30 days**, so don't assume data persists indefinitely on the dev database).

## Backend app structure (Django apps)

- `accounts` — custom `User` model with a `role` field. Currently holds both old (`hospital`, `ambulance_service`) and new (`hospital_admin`, `ambulance_admin`, `emt`, `mera_admin`) role values simultaneously — see the "Role naming" section above before changing anything here. Endpoint additions:
  - Ambulance admin — EMT management: `PATCH /auth/admin/emts/{id}/` (edit `full_name`/`phone_number`/`email` on your own EMT — role and password are not editable here) and `DELETE /auth/admin/emts/{id}/` (soft-deactivate: sets `is_active=False`, does **not** hard-delete — same pattern as institutional approval/rejection, chosen because it's the only removal pattern already in this codebase and it preserves incident/treatment-note history). Both `IsAmbulanceService`-gated and scoped to EMTs where `ambulance_service == request.user`; an EMT belonging to a different ambulance service returns 404 (not 403) so ownership isn't leaked, matching `verification`/`medical_profiles`'s existing lookup pattern.
  - MERA admin — institutions/stats/accounts (`IsMERAAdmin`-gated): `GET /auth/admin/institutions/` (hospital_admin + ambulance_admin accounts, both old/new role names via `HOSPITAL_ROLES`/`AMBULANCE_ROLES`); `GET /auth/admin/stats/` (counts: patients, hospitals, ambulance services, EMTs, `emergencies.Incident` total); `GET /auth/admin/users/` (every account, any role); `PATCH /auth/admin/users/{id}/deactivate/` (sets `is_active=False` on any account regardless of role; a MERA admin can still deactivate another mera_admin's account, but is blocked with 400 from deactivating their *own* account, to prevent accidental self-lockout).
- `medical_profiles` — patient medical data, includes a `data_sharing_consent` field (for hospital/ambulance access) that is **separate** from `ai_chatbot_consent` (for AI chatbot use) — these must never be conflated. Also has the hospital **Patient List** endpoint (SC-13): `GET /medical-profile/patients/`, `IsHospital`-gated, returns every patient tied to the requesting hospital across *all* verification statuses (not just one queue bucket), with optional `?search=` (patient name, case-insensitive) and `?status=verified|pending|flagged|info_requested` filters. It determines "belongs to this hospital" the same way the `verification` app's queue/approved/flagged endpoints do — via `VerificationRequest.objects.filter(hospital=request.user)` — since `MedicalProfile` itself has no hospital field. This means `medical_profiles` now imports `VerificationRequest` from `verification`, on top of the existing `verification` → `medical_profiles` dependency, so the two apps are mutually coupled. **Deliberate design decision:** a patient stays visible in a hospital's roster based on *any past* `VerificationRequest` to that hospital, even after the patient later moves to a different hospital for current care — this is intentional, not an oversight. The product reasoning is that patients may want their medical history visible to every hospital that has ever treated them, not just their current one. Do not "fix" this by restricting the roster to the patient's most recent hospital without raising it as a product discussion first.
- `emergencies` — incident/SOS lifecycle
- `emergency_contacts` — patient's trusted contacts, notified on SOS
- `verification` — hospital verification of patient medical profiles
- `chatbot` — AI health assistant; calls Claude via the Anthropic API, stores conversation history, returns structured JSON (`{"reply": "...", "needs_referral": true/false}`)

## Key architectural decisions already made (don't relitigate without discussion)

1. **AI calls are backend-only.** The Django `chatbot` app calls Anthropic's API server-side. The API key lives only in the backend's environment variables, never in either frontend.
2. **Chatbot consent is separate from data-sharing consent.** A patient can consent to sharing data with hospitals/ambulances without consenting to the AI chatbot using their profile as context, and vice versa.
3. **Chatbot responses are structured JSON**, not freeform text, so the frontend can reliably show a "consult a professional" banner without relying on string-matching the AI's wording.
4. **The chatbot does not autonomously trigger SOS or suggest emergency dispatch.** It can flag that a response touches on something serious (`needs_referral`), but never decides to call an ambulance — that stays a deliberate, manual action by the patient (same press-and-hold safety gesture as the main SOS button).
5. **One web app, not three.** Hospital Admin, Ambulance Admin, and MERA super-admin all log into the same web app at the same URL. The UI shown after login depends on the logged-in user's `role` — this is not three separate deployed applications.
6. **Secrets never go in Git.** `.env` files are gitignored in every project folder. Real secrets are shared between teammates privately (not via GitHub, Slack, or Discord in plaintext).

## Prototype safety bypasses — MUST be reinstated before any real launch

Running the Django test suite (`python manage.py test`) surfaced three places where real safety/verification logic has been deliberately disabled for prototype/demo purposes. These are not bugs — they were intentional shortcuts — but they mean the current prototype is **not safe to use with real patient data or real institutions.** Anyone touching auth, SOS, or medical profile verification should know these exist:

1. **Institutional account approval gate is bypassed.** `accounts/views.py`, `LoginView` — the check that blocks `pending`/`rejected` hospital and ambulance accounts from logging in is commented out (`# PROTOTYPE: approval gate bypassed; reinstate for production`). Right now, any institutional account can log in regardless of MERA approval status.

2. **Patient SOS verification check is hardcoded to always pass.** `emergencies/services.py`, `_patient_is_verified()` — this function unconditionally `return True`s instead of actually checking the patient's verification status. Any patient, verified or not, can currently trigger a real SOS.

3. **Medical profile auto-verifies on submission instead of requiring hospital review.** `medical_profiles/models.py`, `submit_by_patient()` — sets `verification_status = VERIFIED` immediately instead of `PENDING` (comment: "Auto-verified for prototype — skipping hospital verification flow"). The hospital verification queue (SC-12/SC-12b) currently has nothing real to review.

**Before any real-world use, all three of these need to be re-enabled and tested.** Until then, treat every patient/institutional account in this system as unverified in practice, regardless of what their `verification_status` field says.

## Known test suite gaps

`python manage.py test` is clean aside from the 4 prototype safety bypass failures documented in the section above (institutional approval gate, SOS verification check, medical profile auto-verification ×2) — those are expected and intentional. No other failures or errors.



- `main` is protected — no direct pushes. All changes go through a Pull Request.
- Each teammate works on their own feature branch (e.g. `feature/hospital-admin-dashboard`), tests locally, then opens a PR.
- Local testing: run Django locally (`python manage.py runserver`) with your own `.env` (values shared privately by the team, never committed). Point the frontend you're working on at `http://localhost:8000` while testing backend changes; point at the deployed Render URL when you don't need to test backend changes.
- Each teammate needs their own local Python virtual environment (`venv`) and `node_modules` — these are never committed to Git.

## What NOT to suggest

- Don't suggest calling the Anthropic API directly from either frontend.
- Don't suggest merging Hospital Admin, Ambulance Admin, and MERA super-admin into fewer/more roles without flagging it as a discussion point first — the current five-role split reflects real product requirements from project mentor feedback.
- Don't suggest self-registration flows for EMTs, Hospital Admins, or Ambulance Admins — these are intentionally admin-created only.
- Don't suggest storing secrets in code, committing `.env` files, or committing `venv`/`node_modules` folders.
- Don't suggest AI-driven autonomous emergency dispatch or SOS triggering.
- `hospital`/`hospital_admin` and `ambulance_service`/`ambulance_admin` ARE now treated as interchangeable in permission/role checks via `HOSPITAL_ROLES`/`AMBULANCE_ROLES` (see "Role naming" section above). If you find a check that compares against a single literal role string instead of these sets, flag it — that's a spot the migration missed, not the intended behavior.
- Don't build EMT self-registration flows on mobile — EMT accounts are created exclusively by their ambulance_admin.

---

*If anything in this document seems out of date or contradicts what you're seeing in the actual codebase, trust the codebase and flag the discrepancy — this document may lag behind recent changes.*