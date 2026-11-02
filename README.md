# FacilityCare

A mobile app for reporting and repairing school facility issues.

- **frontend/**: Ionic 9 + Angular 22 (Capacitor for Android/iOS)
- **backend/**: Laravel 12 REST API + SQLite (`backend/database/database.sqlite`)

## First-time setup (after cloning)

Requirements: PHP 8.2+ (with `pdo_sqlite`), Composer, Node.js 20+.

```bash
# Backend
cd backend
composer install
cp .env.example .env
php artisan key:generate
php -r "touch('database/database.sqlite');"
php artisan migrate --seed

# Frontend
cd ../frontend
npm install
```

## Running it

Open two terminals.

**1. Backend** (http://localhost:8000)

```bash
cd backend
php artisan serve --host=0.0.0.0 --port=8000
```

**2. Frontend** (http://localhost:4200)

```bash
cd frontend
npm start          # or: ionic serve
```

### Demo accounts (password: `password`)

| Role | Email |
|---|---|
| Administrator | admin@facilitycare.test |
| Technician | ramon@ (electrical) / jose@ (plumbing) / mario@ (carpentry) / liza@ (aircon) / paolo@ (IT) facilitycare.test |
| Student | student@facilitycare.test, ana@facilitycare.test |
| Faculty | faculty@facilitycare.test, maria@facilitycare.test |
| Staff | staff@facilitycare.test |

To reset the database to the demo data:

```bash
cd backend
php artisan migrate:fresh --seed
```

To add only the equipment module's sample data to an existing database:

```bash
cd backend
php artisan migrate
php artisan db:seed --class=EquipmentSeeder
```

### Reminders (overdue tasks, preventive maintenance)

Reminders are sent automatically when someone opens a dashboard (at most once an hour).
To also run them on a fixed daily schedule (7:00 AM), keep this running next to the server:

```bash
cd backend
php artisan schedule:work          # or run once: php artisan facilitycare:reminders
```

## Features

| # | Feature | Where in the app |
|---|---|---|
| 1 | Technician Account Management | More → **Technicians**: specialization, availability, active/overdue/completed tasks, average repair time, assigned tasks |
| 2 | Equipment Category and Status Management | **Equipment** tab: categories (computer, aircon, projector, safety, …), location, and condition — Operational, Needs Repair, Under Maintenance, Out of Service. Condition also updates automatically from requests and repairs |
| 3 | Maintenance History | Equipment profile → *History*: problem reported, actions performed, parts replaced (with cost), technician, service dates |
| 4 | Priority Level Management | Request review: Low / Medium / High (and Critical for safety hazards) |
| 5 | Equipment Profile Management | Equipment → add/edit: equipment ID, name, model, serial number, department, location, acquisition date, condition, importance |
| 6 | Repair Request and Activity History | Activity history on every request, work order and equipment; More → **Activity History** for the whole system (filter by action, person, date) |
| 7 | Maintenance Reports | More → **Maintenance Reports**: requests, equipment conditions, completed maintenance (repairs vs preventive), technician workload; monthly / quarterly / yearly / custom; CSV export |
| 8 | Repair Request Submission | Requesters: **Report** tab — location, the equipment item, how bad it is (minor / moderate / severe), description, photo |
| 9 | Role-Based User Access | Requesters (student/faculty/staff), Technicians and Administrators each get their own tabs, screens and permissions |
| 10 | Technician Task Assignment | *Approve & assign* or New work order: technician, target date; progress shown on the request and the dashboards |
| 11 | Search and Advanced Filtering | Requests, Work Orders and Equipment: search + filters for category, location, status, technician, severity, type and date range |
| 12 | Repair Documentation | Work order steps: before and after photos, materials/parts, actions taken, remarks, condition after repair |
| 13 | Notifications and Reminders | New assignments → technician; status changes → requester and admins; overdue tasks and due preventive maintenance → reminders |
| 14 | Dashboard and Data Persistence | Dashboards per role: pending/in-progress/completed, equipment status summary, preventive maintenance due; SQLite database |
| 15 | Automated Repair Request Prioritization | Request review shows a recommended priority with a score (0–100) = equipment importance (40) + reported severity (40) + waiting time (20); *Use* applies it. Requests can be sorted by score |
| 16 | Smart Technician Assignment | Assign screen ranks technicians: specialization match (45) + available (25) + light workload (30) − overdue tasks; the best match is preselected and marked *Recommended* |
| 17 | Preventive Maintenance Scheduling | Each equipment item can have a service interval; next due date = last service + interval; More → **Preventive Maintenance** lists overdue / due soon, and *Schedule* creates the work order with the recommended technician |

Out of scope (as specified): AI damage diagnosis, IoT monitoring, failure prediction, procurement, depreciation.

The app checks for new notifications every 30 seconds (badge on the tab bar).

## Running on a phone (Android)

1. Find your PC's local IP address (`ipconfig`, e.g. `192.168.1.10`). The phone must be on the same Wi-Fi.
2. Put it in `frontend/src/environments/environment.prod.ts` → `apiUrl: 'http://192.168.1.10:8000/api'`.
3. Start the backend with `--host=0.0.0.0` (as shown above) and allow PHP through Windows Firewall.
4. Build the APK (needs JDK 21 and the Android SDK with platform 36; set `JAVA_HOME`, and `sdk.dir` in `frontend/android/local.properties`):
   ```bash
   cd frontend
   npm run build
   npx cap sync android
   cd android
   ./gradlew assembleDebug    # → android/app/build/outputs/apk/debug/app-debug.apk
   ```
   Or open the `frontend/android` folder in Android Studio and press Run.

   On Windows, if your user folder has a space in it, use the short path (e.g. `C:\Users\OLIVER~1\...`) for `JAVA_HOME` and `sdk.dir`.

`capacitor.config.ts` already allows plain-HTTP calls to the local API. For a real deployment, serve the API over HTTPS and remove `cleartext: true`.

## API overview

All routes are under `/api` and use a Bearer token from `POST /api/login`.

| Area | Endpoints |
|---|---|
| Auth | `POST login`, `POST register`, `GET/PUT me`, `PUT me/password`, `POST logout` |
| Dashboard | `GET dashboard` (content depends on role) |
| Reports | `GET/POST reports`, `GET/PUT/DELETE reports/{id}`, `POST reports/{id}/approve`, `POST reports/{id}/reject` |
| Work orders | `GET/POST work-orders`, `GET/PUT/DELETE work-orders/{id}`, `POST work-orders/{id}/status`, `POST work-orders/{id}/photos`, `DELETE work-order-photos/{id}`, `POST work-orders/{id}/materials`, `DELETE work-order-materials/{id}`, `GET personnel` |
| Facilities | `GET/POST facilities`, `GET/PUT/DELETE facilities/{id}`, `GET facilities/{id}/history` |
| Equipment | `GET/POST equipment`, `GET equipment/summary`, `GET/PUT/DELETE equipment/{id}`, `GET equipment/{id}/history`, `POST equipment/{id}/schedule`, `GET preventive-maintenance` |
| Technicians | `GET technicians`, `GET/PUT technicians/{id}`, `GET personnel?category=` (ranked for assignment) |
| Activity | `GET activity?action=&user_id=&from=&to=&search=` |
| Users | `GET/POST users`, `GET/PUT/DELETE users/{id}`, `GET users/counts` |
| Analytics | `GET analytics?period=monthly|quarterly|yearly|custom&year=&month=&quarter=&from=&to=` |
| Notifications | `GET notifications`, `GET notifications/unread-count`, `POST notifications/{id}/read`, `POST notifications/read-all`, `POST notifications/send`, `GET notifications/sent` |

Photos are saved to `backend/public/uploads/`.
