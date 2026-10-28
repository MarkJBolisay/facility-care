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
| Maintenance | ramon@ / jose@ / mario@ / liza@facilitycare.test |
| Student | student@facilitycare.test, ana@facilitycare.test |
| Faculty | faculty@facilitycare.test, maria@facilitycare.test |
| Staff | staff@facilitycare.test |

To reset the database to the demo data:

```bash
cd backend
php artisan migrate:fresh --seed
```

## Features

### Administrator
| Feature | Where in the app |
|---|---|
| Admin Dashboard | **Dashboard** tab: totals, pending/in progress/completed, items needing attention, 6-month trend, open issues by priority/category, personnel workload |
| Report Management | **Reports** tab: search and filter; open a report to approve, reject (with reason), and set the category |
| Priority Management | Report detail: Low / Medium / High / Critical (also updates the linked work order) |
| Maintenance Assignment | Report detail → *Assign maintenance personnel*: lists personnel by availability and workload, and suggests someone with the matching specialization |
| Work Order Management | **Work Orders** tab: create standalone/preventive work orders, edit, reassign, cancel, and track status |
| Facility Management | **Facilities** tab: buildings with their rooms, labs, offices, restrooms and outdoor areas; add/edit/delete; set status |
| Maintenance History | Open any facility to see its past issues, repairs, and material costs (a building includes its rooms) |
| User Management | More → User Management: student, faculty, staff, maintenance and admin accounts; activate/deactivate; reset password |
| Reports and Analytics | More → Reports & Analytics: monthly, quarterly, yearly or custom range; export to CSV (opens in Excel) |
| Notification Management | More → Notification Management: send to the people on a repair request, a whole role, chosen users, or everyone; templates; sent history with read counts |

### Maintenance personnel
| Feature | Where in the app |
|---|---|
| Maintenance Dashboard | **Dashboard** tab: pending, in progress, done this month, overdue, next tasks, availability switch |
| Assigned Work Orders | **My Tasks** tab: location, description, reporter's photo, priority, due date |
| Repair Status Update | Work order: *Start repair* (Pending → In Progress) → *Mark as completed* |
| Repair Documentation | Work order: before and after photos (camera or gallery; resized before upload) |
| Materials Used Recording | Work order: materials and equipment with quantity, unit, and unit cost (total cost is calculated) |
| Maintenance History | **History** tab: completed and cancelled tasks |
| Completion Report | Required when completing: actions taken, remarks, date completed |

### Students / faculty / staff (reporters)
Sign up, submit a report with a photo and location, follow its progress step by step, and get notified when it is approved, assigned, started, or completed.

### Automatic notifications
- New report → all admins
- Approved / rejected / priority changed → the reporter
- Work order assigned → the personnel and the reporter
- Repair started / completed → the reporter and the admins

The app checks for new notifications every 30 seconds (badge on the tab bar).

## Running on a phone (Android)

1. Find your PC's local IP address (`ipconfig`, e.g. `192.168.1.10`). The phone must be on the same Wi-Fi.
2. Put it in `frontend/src/environments/environment.prod.ts` → `apiUrl: 'http://192.168.1.10:8000/api'`.
3. Start the backend with `--host=0.0.0.0` (as shown above) and allow PHP through Windows Firewall.
4. Build and open in Android Studio:
   ```bash
   cd frontend
   npm install @capacitor/android
   npx cap add android        # first time only
   npm run build
   npx cap sync android
   npx cap open android
   ```

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
| Users | `GET/POST users`, `GET/PUT/DELETE users/{id}`, `GET users/counts` |
| Analytics | `GET analytics?period=monthly|quarterly|yearly|custom&year=&month=&quarter=&from=&to=` |
| Notifications | `GET notifications`, `GET notifications/unread-count`, `POST notifications/{id}/read`, `POST notifications/read-all`, `POST notifications/send`, `GET notifications/sent` |

Photos are saved to `backend/public/uploads/`.
