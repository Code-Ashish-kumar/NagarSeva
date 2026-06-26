# Query Optimizations — Duplicate Issue Detection

This document explains the spatial query strategies and concurrency controls used in NagarSeva's duplicate issue detection feature. The goal: detect and merge duplicate civic reports in real time without sacrificing throughput under concurrent load.

---

## 1. PostGIS GIST Index & `ST_DWithin`

The `issues` table has a GIST index on the `location` column (type `geography`). The dedup query uses `ST_DWithin` rather than the naive `ST_Distance(a, b) < radius` approach.

**Why it matters:**

| Approach | Index Usage | Behaviour |
|----------|-------------|-----------|
| `ST_DWithin(location, point, radius)` | ✅ Uses GIST bounding-box pre-filter | The planner applies a bounding-box check first (O(log n)), then refines with exact distance |
| `ST_Distance(location, point) < radius` | ❌ Sequential scan | PostgreSQL must compute the exact distance for **every row** before filtering |

`ST_DWithin` rewrites internally to a bounding-box operator (`&&`) that the GIST index can accelerate, then applies the precise geodesic check only to rows inside the box. On a table with 100k+ issues, this is the difference between sub-millisecond and multi-second query times.

---

## 2. Filter-First Query Strategy

The dedup query applies **cheap, high-selectivity filters before spatial computation**:

```sql
SELECT id, short_id, report_count, priority_score
FROM issues
WHERE category = $1                          -- 1. Category equality (btree index)
  AND status IN ('SUBMITTED', 'VERIFIED',    -- 2. Status filter (eliminates closed/resolved)
      'ASSIGNED', 'IN_PROGRESS', 'REOPENED')
  AND reporter_id != $2                      -- 3. Self-duplicate guard
  AND ST_DWithin(location,                   -- 4. Spatial (GIST, most expensive)
      ST_SetSRID(ST_MakePoint($3, $4), 4326), $5)
  AND id NOT IN (SELECT issue_id FROM watchers WHERE user_id = $2)
ORDER BY report_count DESC,
         ST_Distance(location, ST_SetSRID(ST_MakePoint($3, $4), 4326)) ASC
LIMIT 1;
```

**Execution order logic:**

1. `category = $1` — slices the table to ~7% of rows (1 of 15 categories).
2. `status IN (...)` — further reduces to only active issues.
3. `reporter_id != $2` + watcher subquery — prevents self-inflation.
4. `ST_DWithin(...)` — the GIST index now scans a dramatically smaller candidate set.

PostgreSQL's query planner combines these predicates to minimize the rows entering the spatial operator, keeping the dedup query fast even at scale.

---

## 3. Single-Query Candidate Selection

Instead of fetching all nearby candidates into Node.js and sorting in-memory:

```sql
ORDER BY report_count DESC,
         ST_Distance(location, ST_SetSRID(ST_MakePoint($3, $4), 4326)) ASC
LIMIT 1
```

This retrieves **exactly one row** — the best merge target — in a single database round-trip.

**Selection priority:**
1. Highest `report_count` (merge into the most-reported issue)
2. Closest distance (tiebreaker for equal report counts)

The `LIMIT 1` means PostgreSQL can use a top-N sort internally without materializing the full result set. No array of candidates is transferred to the application layer, avoiding memory pressure and serialization overhead for what is fundamentally a ranking problem the database is purpose-built to solve.

---

## 4. Advisory Lock Strategy

**Problem:** Two citizens submit the same pothole simultaneously. Both run the dedup query before either commits → two new issues created.

**Solution:** PostgreSQL transaction-level advisory locks.

### Grid-Cell Hashing

```js
// server/src/utils/dedupLock.js
const crypto = require('crypto');

function computeLockKey(category, lat, lng) {
  const gridLat = lat.toFixed(4);   // ~11.1m precision
  const gridLng = lng.toFixed(4);
  const input = `${category}:${gridLat}:${gridLng}`;
  const hash = crypto.createHash('md5').update(input).digest();
  return hash.readInt32BE(0);       // 32-bit signed integer lock key
}
```

Truncating to 4 decimal places creates ~11m grid cells. For a 50m dedup radius, nearby submissions in the same category will hash to the same (or adjacent) cells, serializing them.

### Lock Acquisition

```sql
SELECT pg_advisory_xact_lock($1);  -- blocks until lock is available
```

Called **before** the dedup query within the same transaction.

### Why Advisory Locks vs. `SELECT FOR UPDATE`

| Concern | Advisory Lock | `SELECT FOR UPDATE` |
|---------|--------------|---------------------|
| Lock target exists? | Not required — locks a "concept" (area + category) | Requires an existing row |
| Scope | Transaction-scoped, auto-releases on COMMIT/ROLLBACK | Row-scoped |
| Crash safety | Auto-releases — no manual cleanup | Auto-releases |
| Granularity | Category + ~11m grid — unrelated areas don't block | Would lock specific candidate rows |

**Key property:** Different categories and distant locations proceed in parallel. Only submissions targeting the same spatial bucket serialize, providing fine-grained concurrency control without global bottlenecks.

---

## 5. Full Dedup Flow (Annotated)

```
BEGIN;
  -- 1. Acquire fine-grained lock
  SELECT pg_advisory_xact_lock(hash(category + gridCell));

  -- 2. Find best merge candidate (filter-first + LIMIT 1)
  SELECT ... FROM issues WHERE ... ST_DWithin(...) ORDER BY ... LIMIT 1;

  -- 3a. IF candidate found → merge (UPDATE + INSERT images + INSERT watcher)
  -- 3b. ELSE → create new issue

COMMIT;  -- lock auto-releases
```

The entire operation executes as one atomic transaction. If anything fails, ROLLBACK undoes all mutations and releases the lock.

---

## Summary

| Optimization | Impact |
|-------------|--------|
| GIST index + `ST_DWithin` | O(log n) spatial lookup vs O(n) full scan |
| Filter-first predicates | 90%+ row elimination before spatial computation |
| `ORDER BY ... LIMIT 1` | Single-row transfer, no in-app sorting |
| Advisory locks (grid-cell) | Serializes only competing submissions, not global traffic |
| Transaction-scoped locks | Zero leak risk, no manual cleanup |
