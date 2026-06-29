# Next Stage: Role-Based Dashboards, Issue Lifecycle & Worker Ranking

## Current State

| Component | Status |
|-----------|--------|
| Auth (register, login, OTP, JWT cookie, role in token) | ✅ |
| Role routing (CITIZEN → `/citizen`, ADMIN → `/admin`, etc.) | ✅ |
| Citizen complete flow (report → AI → submit → My Complaints → City Pulse → Me Too) | ✅ |
| Issue creation + PostGIS + Cloudinary + dedup + advisory locks | ✅ |
| `updateIssueStatus` controller + audit_logs | ✅ Backend exists |
| Admin/FieldWorker/SuperAdmin dashboards | ❌ Placeholder only |
| Email notifications on status change | ❌ Not built |
| Department management | ❌ Not built |

---

## Migration 008: Departments & Relations

```sql
-- 008_departments_and_relations.sql

-- 1. Create departments table (relational, supports soft delete)
CREATE TABLE departments (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMPTZ NULL  -- soft delete
);

-- 2. Link users to departments
ALTER TABLE users ADD COLUMN department_id INT REFERENCES departments(id);
CREATE INDEX idx_users_department_id ON users (department_id);

-- 3. Link issues to departments and field workers
ALTER TABLE issues DROP COLUMN IF EXISTS assigned_dept;  -- remove old string column
ALTER TABLE issues ADD COLUMN department_id INT REFERENCES departments(id);
ALTER TABLE issues ADD COLUMN assigned_to UUID REFERENCES users(id);
CREATE INDEX idx_issues_department_id ON issues (department_id);
CREATE INDEX idx_issues_assigned_to ON issues (assigned_to);

-- 4. Seed initial departments
INSERT INTO departments (name) VALUES
  ('Road & Infrastructure'),
  ('Water Supply & Drainage'),
  ('Sanitation & Waste'),
  ('Street Lighting'),
  ('Parks & Environment'),
  ('Encroachment & Land'),
  ('Animal Control'),
  ('General / Other');
```

---

## Refined Issue Lifecycle

```
CITIZEN submits
        │
        ▼
  ┌──────────┐
  │SUBMITTED │  priority_score computed from report_count + dedup
  └─────┬────┘
        │
        ▼
┌───────────────┐
│  SUPER_ADMIN  │  Triaging Queue (ordered by priority_score DESC)
│  Review Modal │  Shows: images, map pin, AI category, AI description
└───────┬───────┘
        │
   ┌────┴────┐
   │Decision?│
   └────┬────┘
   │VERIFY              │REJECT
   ▼                    ▼
┌────────┐         ┌────────┐
│VERIFIED│         │REJECTED│
└───┬────┘         └───┬────┘
    │                   │
    │               ┌───┴───────────────────────────┐
    │               │ • Audit: SUBMITTED → REJECTED │
    │               │ • Email citizen: reason        │
    │               │ • Issue stays in DB (soft)     │
    │               │ • Filtered from all views      │
    │               └───────────────────────────────┘
    │
    ▼ SuperAdmin picks department from dropdown
┌──────────┐
│ ASSIGNED │  issues.department_id = chosen dept
└─────┬────┘  Audit: VERIFIED → ASSIGNED, metadata: {department_id}
      │
      ▼
┌──────────────────┐
│   ADMIN          │  Department Admin sees their queue
│   (dept-scoped)  │  WHERE department_id = admin.department_id AND status = 'ASSIGNED'
└──────────┬───────┘
           │
           ▼ Admin clicks [Allocate] → Worker Score ranking
           ▼ Picks best field worker → assigns
┌─────────────┐
│ IN_PROGRESS │  issues.assigned_to = field_worker.id
└──────┬──────┘  Audit: ASSIGNED → IN_PROGRESS, metadata: {assigned_to, worker_name}
       │
       ▼
┌──────────────┐
│ FIELD_WORKER │  Uploads progress photos (image_type = 'PROGRESS')
│              │  Marks resolved when done (uploads RESOLUTION_PROOF)
└──────┬───────┘
       │
       ▼
┌──────────┐
│ RESOLVED │  Audit: IN_PROGRESS → RESOLVED
└─────┬────┘  Email watchers: "Your issue has been resolved"
      │
      ▼
 ┌────┴─────┐
 │Confirmed?│  (SuperAdmin or Citizen can act)
 └────┬─────┘
 │YES         │NO (citizen unsatisfied)
 ▼            ▼
┌──────┐   ┌────────┐
│CLOSED│   │REOPENED│ → returns to ASSIGNED status
└──────┘   └────────┘
```

---

## Field Worker Ranking Algorithm

When an Admin views field workers for assignment, the backend computes a **Worker Score (S)** for each eligible worker in that department:

```
S = (w₁ · E) + (w₂ · R) − (w₃ · B)
```

| Variable | Meaning | Computation |
|----------|---------|-------------|
| **E** (Experience) | Normalized lifetime issues handled | `total_resolved / max(total_resolved across dept)` → [0, 1] |
| **R** (Success Rate) | Ratio of resolved to total closed | `resolved / (resolved + rejected_by_inspector)` → [0, 1] |
| **B** (Busyness) | Current active workload | `COUNT(*) WHERE assigned_to = worker AND status = 'IN_PROGRESS'` |
| w₁ | Experience weight | 0.3 (configurable) |
| w₂ | Reliability weight | 0.4 (configurable) |
| w₃ | Busyness penalty | 0.3 (configurable) |

Workers are sorted by S descending. Admin sees the ranked list and picks.

### The SQL (single query, no N+1)

```sql
WITH worker_stats AS (
  SELECT
    u.id, u.name, u.email,
    COUNT(CASE WHEN i.status IN ('RESOLVED', 'CLOSED') THEN 1 END) AS resolved_count,
    COUNT(CASE WHEN i.status = 'REJECTED' THEN 1 END) AS rejected_count,
    COUNT(CASE WHEN i.status = 'IN_PROGRESS' THEN 1 END) AS active_count,
    COUNT(i.id) AS total_handled
  FROM users u
  LEFT JOIN issues i ON i.assigned_to = u.id
  WHERE u.role = 'FIELD_WORKER'
    AND u.department_id = $1
  GROUP BY u.id, u.name, u.email
)
SELECT *,
  CASE WHEN MAX(total_handled) OVER () = 0 THEN 0
       ELSE total_handled::FLOAT / MAX(total_handled) OVER ()
  END AS experience_norm,
  CASE WHEN (resolved_count + rejected_count) = 0 THEN 0.5
       ELSE resolved_count::FLOAT / (resolved_count + rejected_count)
  END AS success_rate,
  (0.3 * (CASE WHEN MAX(total_handled) OVER () = 0 THEN 0
                ELSE total_handled::FLOAT / MAX(total_handled) OVER () END))
  + (0.4 * (CASE WHEN (resolved_count + rejected_count) = 0 THEN 0.5
             ELSE resolved_count::FLOAT / (resolved_count + rejected_count) END))
  - (0.3 * active_count)
  AS worker_score
FROM worker_stats
ORDER BY worker_score DESC;
```

**Interview point:** "I implemented a composite scoring algorithm in a single SQL CTE with window functions. No N+1 queries — one round-trip computes experience normalization across the department, success rates, and active workload, then ranks by the weighted objective function."

---

## SuperAdmin Dashboard — Features

### 1. Global Metrics Bar
- Total SUBMITTED (pending review)
- Verification Rate (%) = verified / (verified + rejected) over last 30 days
- Average Triaging Time = avg(time between SUBMITTED and VERIFIED/REJECTED)

### 2. Triaging Queue
- Paginated table of issues with status = `SUBMITTED`
- Ordered by `priority_score DESC` (most-reported issues first)
- Columns: short_id, category, address, report_count, priority_score, created_at
- Click row → opens review modal

### 3. Department Management Center
- CRUD interface for `departments` table
- Add new, soft-delete (set `deleted_at`), restore
- Shows: name, issue count, worker count

### 4. Interactive Triaging Modal
On clicking [Review]:
- Shows: all uploaded images (carousel), AI analysis flags (category, severity, confidence), Leaflet map with pin, user description, report_count
- Two action buttons:
  - **Verify & Route**: Opens department dropdown (`SELECT * FROM departments WHERE deleted_at IS NULL`). Submitting → PATCH status to ASSIGNED, set department_id, audit log
  - **Reject**: Opens textarea for mandatory rejection reason. Submitting → PATCH to REJECTED, audit log, triggers email to reporter + watchers

---

## Admin Dashboard (Department-Scoped) — Features

### 1. Departmental Queue
- Issues WHERE `department_id = admin.department_id AND status = 'ASSIGNED'`
- Ordered by priority_score DESC
- Columns: short_id, category, address, priority_score, days_pending

### 2. Smart Allocation Component
- On click [Allocate] → fetches field workers via ranking query
- Displays ranked list: name, score, active tasks, resolved count
- Admin picks → PATCH assigns the worker, status → IN_PROGRESS

### 3. Resource Overview Grid
- All field workers in department with their current active task count
- Visual indicator: 🟢 (0-2 tasks), 🟡 (3-4), 🔴 (5+)

---

## Field Worker Dashboard — Features

### 1. My Assignments
- Issues WHERE `assigned_to = my_id AND status = 'IN_PROGRESS'`
- Cards showing: category, address, priority, days since assignment
- Click → issue detail with navigation link (opens Google Maps directions)

### 2. Progress Upload
- Button to upload progress photos (`image_type = 'PROGRESS'`)
- Optional note field

### 3. Mark Resolved
- Requires at least 1 `RESOLUTION_PROOF` image upload
- On submit: status → RESOLVED, audit log, email watchers

---

## API Endpoints (New)

### SuperAdmin APIs
| Method | Path | Body/Params | Description |
|--------|------|-------------|-------------|
| GET | `/api/issues/queue` | `?status=SUBMITTED` | Triaging queue |
| GET | `/api/issues/:id/detail` | — | Full issue detail + images + audit |
| PATCH | `/api/issues/:id/verify` | `{ department_id }` | Verify + assign dept |
| PATCH | `/api/issues/:id/reject` | `{ reason }` | Reject + email watchers |
| GET | `/api/departments` | — | List active departments |
| POST | `/api/departments` | `{ name }` | Create department |
| DELETE | `/api/departments/:id` | — | Soft-delete department |
| GET | `/api/stats/super-admin` | — | Metrics (counts, rates) |

### Admin APIs
| Method | Path | Body/Params | Description |
|--------|------|-------------|-------------|
| GET | `/api/issues/queue` | `?status=ASSIGNED&dept=MY_DEPT` | Department queue |
| GET | `/api/users/field-workers` | `?dept_id=X` | Ranked workers |
| PATCH | `/api/issues/:id/assign` | `{ assigned_to }` | Assign to worker |

### Field Worker APIs
| Method | Path | Body/Params | Description |
|--------|------|-------------|-------------|
| GET | `/api/issues/assigned` | — | My active assignments |
| POST | `/api/issues/:id/images` | `{ image_urls, type }` | Upload progress/proof |
| PATCH | `/api/issues/:id/resolve` | `{ image_urls }` | Mark resolved |

### Shared
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/issues/:id/audit` | Audit trail timeline for an issue |

---

## Email Notifications (Watcher Dispatch)

On any status change, email all users in the `watchers` table for that issue:

```js
// After successful status update:
const watchers = await pool.query(
  'SELECT u.email, u.name FROM watchers w JOIN users u ON w.user_id = u.id WHERE w.issue_id = $1',
  [issue_id]
);
for (const watcher of watchers.rows) {
  await sendStatusEmail(watcher.email, watcher.name, issue.short_id, new_status, note);
}
```

Triggered on: REJECTED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, REOPENED.

---

## Frontend Routes (New)

| Route | Component | Role Guard |
|-------|-----------|------------|
| `/super-admin` | SuperAdminDashboard | SUPER_ADMIN |
| `/super-admin/departments` | DepartmentManager | SUPER_ADMIN |
| `/admin` | AdminDashboard | ADMIN |
| `/field-worker` | FieldWorkerDashboard | FIELD_WORKER |

---

## Implementation Order

| Phase | What | Effort |
|-------|------|--------|
| 1 | Migration 008 + seed departments | 10 min |
| 2 | SuperAdmin backend (queue, verify, reject, dept CRUD, stats) | 2-3 hrs |
| 3 | SuperAdmin frontend (dashboard + triaging modal) | 3-4 hrs |
| 4 | Admin backend (dept queue, worker ranking query, assign) | 1-2 hrs |
| 5 | Admin frontend (queue + allocation component) | 2-3 hrs |
| 6 | Field Worker backend (assignments, progress upload, resolve) | 1-2 hrs |
| 7 | Field Worker frontend (dashboard + resolve flow) | 2-3 hrs |
| 8 | Watcher email notifications on status change | 1 hr |
| 9 | Issue detail + audit trail timeline (shared component) | 1-2 hrs |

---

## Key Interview Talking Points

1. **Worker Ranking**: "I use a composite objective function S = w₁E + w₂R − w₃B computed in a single SQL CTE with window functions. No N+1 problem — the ranking, normalization, and workload computation happen in one DB round-trip."

2. **Soft Delete Pattern**: "Departments use `deleted_at IS NULL` for active filtering. This preserves referential integrity — historical issues still link to their department even after deletion."

3. **Audit Trail Design**: "Every status transition is immutable in `audit_logs` with JSONB metadata. The frontend renders this as a timeline. It's append-only — no updates or deletes — making it legally defensible for civic accountability."

4. **Role-based Access**: "The JWT contains the role claim. Middleware validates it server-side on every request. Frontend routing is cosmetic — real security is at the API layer via `roleGuard('SUPER_ADMIN')`."

5. **Status Machine**: "The issue lifecycle follows a strict state machine: SUBMITTED → VERIFIED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED. Invalid transitions are rejected at the API level. REOPENED is a special edge case that returns to ASSIGNED."
