# Dynamic Department Cache — System Design

## The Problem

The AI needs to classify civic issues into departments. But departments are **dynamic** — SuperAdmin can add or remove them anytime. The AI prompt must reflect the current department list.

**Naive approach:** Query the `departments` table on every AI call.
- Every citizen submission → 1 DB query just to build the prompt
- At 100 submissions/hour → 100 extra queries
- The department list changes maybe once a week

**This is a classic read-heavy, write-rare data pattern.**

---

## The Solution: In-Memory Cache with Event-Driven Invalidation

```
┌────────────────────────────────────────────────────────────────────┐
│                         SERVER MEMORY                              │
│                                                                    │
│  cachedDepartments = ["Road & Infrastructure", "Water Supply", ...]│
│  lastFetchTime = 1719849600000                                     │
│                                                                    │
└────────────────────┬───────────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    READ PATH                WRITE PATH
    (every AI call)          (rare: dept CRUD)
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────────┐
│ getDeptNames()  │    │ invalidateCache()   │
│                 │    │                     │
│ if TTL expired: │    │ lastFetchTime = 0   │
│   reload from DB│    │ (forces reload on   │
│ else:           │    │  next read)         │
│   return cache  │    │                     │
│   (0ms, no I/O) │    │ Called by:          │
└─────────────────┘    │ - createDepartment  │
                       │ - deleteDepartment  │
                       └─────────────────────┘
```

---

## Implementation

### `server/src/config/departmentCache.js`

```js
let cachedDepartments = [];
let lastFetchTime = 0;
const TTL_MS = 5 * 60 * 1000;  // 5 minutes

async function getDepartmentNames() {
  if (cachedDepartments.length === 0 || Date.now() - lastFetchTime > TTL_MS) {
    await loadDepartments();  // One DB query
  }
  return cachedDepartments;  // O(1) memory read
}

function invalidateCache() {
  lastFetchTime = 0;  // Next call will reload
}
```

### How the AI Prompt Adapts

```js
// In ai.js:
const departments = await getDepartmentNames();
// → ["Road & Infrastructure", "Water Supply & Drainage", "Sanitation & Waste", ...]

// Injected into the prompt:
"department": <one of: "Road & Infrastructure", "Water Supply & Drainage", ...>
```

When SuperAdmin adds "Traffic & Signals" → `invalidateCache()` → next AI call reloads → prompt includes the new department. AI immediately starts classifying traffic-related issues into it.

---

## Why This Pattern (Interview Deep Dive)

### vs. Querying DB Every Time
| Metric | DB every call | Cache |
|--------|--------------|-------|
| Latency per AI call | +2-5ms (DB round-trip) | +0ms (memory read) |
| DB load (100 calls/hr) | 100 queries/hr | 0-1 queries/hr |
| Freshness | Real-time | ≤5 min stale (or instant on CRUD) |

### vs. Redis Cache
| Metric | Redis | In-memory |
|--------|-------|-----------|
| Network hop | Yes (1-2ms to Redis) | No (same process) |
| Complexity | Redis connection + serialization | 3 variables |
| Failure mode | Redis down = stale data or error | Process restart = reload |
| Right choice for | Multi-server deployment | Single server (our case) |

**Verdict:** For a single-server deployment with data that changes ~1x/week, in-process memory is optimal. Redis adds network latency for zero benefit.

### vs. Polling on Interval
Some designs poll the DB every N seconds regardless of changes:
```js
setInterval(loadDepartments, 60000);  // every 60s
```
This is wasteful — 60 queries/hour for data that changes once a week. Our approach (TTL + invalidation) means:
- 0 queries when cache is fresh AND no CRUD happened
- 1 query when TTL expires (every 5 min) — safety net
- 1 query when CRUD triggers invalidation — immediate freshness

### TTL as Safety Net
The 5-minute TTL exists for edge cases:
- Server A invalidates but Server B (in multi-server future) doesn't know
- A bug in the CRUD controller forgets to call `invalidateCache()`
- Race condition where the cache loads stale data during a concurrent DELETE

TTL guarantees eventual consistency even if invalidation fails.

---

## The Data Flow End-to-End

```
1. Server boots → loadDepartments() → cache = ["Road", "Water", ...]

2. Citizen submits photo:
   → analyzeComplaint()
   → getDepartmentNames()  // returns from memory in 0ms
   → buildPrompt(departments)
   → AI returns: { department: "Road & Infrastructure", ... }

3. SuperAdmin adds "Traffic & Signals":
   → POST /departments → INSERT → invalidateCache()
   → cache is now stale (lastFetchTime = 0)

4. Next citizen submission:
   → getDepartmentNames()  // TTL expired → reload from DB
   → cache = ["Road", "Water", ..., "Traffic & Signals"]
   → AI now knows about the new department

5. SuperAdmin deletes "Animal Control":
   → DELETE /departments/:id → soft delete → invalidateCache()
   → Next AI call won't offer "Animal Control" as an option
```

---

## How the Issue Gets Pre-Routed

When the citizen submits an issue:
1. AI assigns `department: "Road & Infrastructure"`
2. Frontend sends it in the POST body
3. Server resolves name → `department_id` via:
   ```sql
   SELECT id FROM departments WHERE name = $1 AND deleted_at IS NULL
   ```
4. Issue is created with `department_id` already set
5. SuperAdmin sees the AI-suggested department in the review modal
6. SuperAdmin can accept (keep department) or override (pick different one)

This means **most issues arrive pre-routed** — SuperAdmin just confirms. Only edge cases need manual department assignment.

---

## Scalability Path

| Scale | Approach |
|-------|----------|
| Single server (now) | In-process memory cache ✅ |
| 2-5 servers (future) | Redis with pub/sub invalidation |
| 100+ servers (Google scale) | Config service (Consul/etcd) with watch |

The interface (`getDepartmentNames()` / `invalidateCache()`) stays the same regardless of backing store. Only the implementation changes.

---

## Interview Talking Points

1. **"Why not just query the DB?"** — "Departments change once a week but AI is called 100x/hour. Caching eliminates 99.9% of those queries. The O(1) memory read vs 2-5ms DB round-trip compounds at scale."

2. **"How do you handle staleness?"** — "Two mechanisms: event-driven invalidation (immediate, on CRUD) and TTL safety net (5 min, catches edge cases). Together they provide eventual consistency under 5 minutes worst case, instant in the normal path."

3. **"What if the server crashes?"** — "On restart, `loadDepartments()` is called at module import time. The cache rebuilds automatically in one query. Zero manual intervention."

4. **"What if two requests arrive between invalidation and reload?"** — "Both will trigger `loadDepartments()`. The second call may redundantly reload, but it's a single SELECT query — idempotent and cheap. No race condition because we're writing to a module-level variable (single-threaded Node.js)."

5. **"How would you scale this to multiple servers?"** — "Replace in-memory with Redis. On invalidation, publish to a channel. Other servers subscribe and clear their local cache. Same interface, different backing store. The `getDepartmentNames()` API stays identical."

---

## Files Involved

| File | Role |
|------|------|
| `server/src/config/departmentCache.js` | Cache module: load, get, invalidate |
| `server/src/config/ai.js` | Imports `getDepartmentNames()`, passes to `buildPrompt()` |
| `server/src/controller/superAdmin.js` | Calls `invalidateCache()` on create/delete |
| `server/src/controller/issue.js` | Resolves `department` name → `department_id` on create |
| `client/src/components/complaint/Step4_ReviewForm.jsx` | Displays `department` from AI response |
