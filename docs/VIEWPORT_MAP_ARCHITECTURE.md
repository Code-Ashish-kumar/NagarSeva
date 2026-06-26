# Viewport-Based Map Architecture — "City Pulse" Page

## Overview

This document explains the architecture behind the NagarSeva **City Pulse** page — a Google Maps-like experience where civic issues are displayed on a map, clustered at low zoom levels, and revealed as individual markers when the user zooms in. Citizens can click any issue to see details in a floating card and endorse ("Me too") directly from the map.

This replaces the naive "fetch all nearby issues" approach with a performant, scalable architecture.

---

## The Problem with Point + Radius

The original `GET /api/issues/nearby?lat=X&lng=Y&radius=5000` approach has three inefficiencies:

1. **Circular query on rectangular screens**: The screen is a rectangle, but `ST_DWithin` queries a circle. We compute distance for points in the corners that will never be displayed.
2. **No zoom awareness**: Whether zoomed to street level or city level, the same data is fetched and rendered.
3. **DOM explosion**: Rendering 500+ Leaflet markers (each a full HTML element with event listeners) freezes the browser.

---

## The Solution: Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Client)                          │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Leaflet Map │───▶│ Supercluster │───▶│ Render Layer │  │
│  │  (moveend)   │    │ (K-D Tree)   │    │ (markers/    │  │
│  │              │    │              │    │  clusters)   │  │
│  └──────┬───────┘    └──────────────┘    └──────────────┘  │
│         │ bounds = {sw_lat, sw_lng, ne_lat, ne_lng}         │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │ Debounced    │    ┌──────────────┐                       │
│  │ API Call     │───▶│ Floating Card│  (on marker click)    │
│  │ + AbortCtrl  │    │ (Me Too btn) │                       │
│  └──────┬───────┘    └──────────────┘                       │
└─────────┼───────────────────────────────────────────────────┘
          │ HTTP
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (Express)                          │
│                                                             │
│  GET /api/issues/viewport?sw_lng=&sw_lat=&ne_lng=&ne_lat=   │
│       │                                                     │
│       ▼                                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SELECT id, short_id, category, status, report_count,│   │
│  │         ST_X(location::geometry) as lng,              │   │
│  │         ST_Y(location::geometry) as lat,              │   │
│  │         thumbnail                                    │   │
│  │  FROM issues                                         │   │
│  │  WHERE location && ST_MakeEnvelope(sw, ne, 4326)     │   │
│  │    AND status NOT IN ('CLOSED', 'REJECTED')          │   │
│  │  LIMIT 500                                           │   │
│  └──────────────────────────────────────────────────────┘   │
│       │                                                     │
│       ▼ GIST R-tree index scan (O(log n), sub-ms)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Database — Bounding Box Query with GIST Index

### Why `&&` (bounding box overlap) instead of `ST_DWithin` (radius)

| Operator | What it does | Index usage | Post-filter needed |
|----------|-------------|-------------|-------------------|
| `ST_DWithin(geog, point, radius)` | Finds points within a circle | GIST index for bounding box pre-filter, then computes actual geodesic distance for each candidate | Yes — distance calc |
| `location && ST_MakeEnvelope(...)` | Finds points whose bounding box overlaps the envelope | Pure GIST index intersection | No — the bounding box IS the query shape |

**The key insight:** The user's screen IS a rectangle. The map viewport IS a bounding box. So `&&` is a zero-waste query — every row returned will be visible on screen. No false positives, no wasted computation.

### How the GIST Index Works (R-tree)

The GIST index organizes points into a hierarchy of bounding rectangles:

```
Level 0 (root):  [────────── All of India ──────────]
Level 1:         [── North ──]  [── South ──]  [── East ──]
Level 2:         [Delhi] [Luck] [Bang] [Chen] [Kolk] [Guwa]
Level 3:         individual points within each city
```

When the query says "give me points inside this envelope", PostgreSQL traverses from root → leaf, only descending into rectangles that **overlap** the query envelope. Entire subtrees are pruned in O(1). Result: O(log n) scan regardless of total table size.

### The Query

```sql
SELECT 
  i.id, i.short_id, i.category, i.status, i.report_count,
  i.priority_score, i.address, i.description,
  ST_X(i.location::geometry) AS lng,
  ST_Y(i.location::geometry) AS lat,
  (SELECT image_url FROM issue_images 
   WHERE issue_id = i.id AND image_type = 'REPORT' 
   ORDER BY uploaded_at LIMIT 1) AS thumbnail
FROM issues i
WHERE i.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
  AND i.status NOT IN ('CLOSED', 'REJECTED')
ORDER BY i.priority_score DESC
LIMIT 500;
```

**LIMIT 500**: Safety cap. At city-wide zoom, we don't want to return 10K rows. The frontend clusters them anyway, so 500 highest-priority issues is sufficient for visual representation.

---

## Layer 2: Network — Debounced Viewport Fetching

### The Problem
Map panning is continuous — the `moveend` event fires on every pan/zoom. Without debouncing, rapid scrolling generates dozens of concurrent API calls.

### The Solution: Debounce + AbortController

```js
const abortRef = useRef(null);
const timerRef = useRef(null);

function onMapMoveEnd(bounds) {
  // Cancel any pending request
  if (abortRef.current) abortRef.current.abort();
  // Debounce: wait 300ms after last move before fetching
  clearTimeout(timerRef.current);
  timerRef.current = setTimeout(async () => {
    abortRef.current = new AbortController();
    const res = await fetch(
      `/api/issues/viewport?sw_lng=${bounds.sw_lng}&sw_lat=${bounds.sw_lat}&ne_lng=${bounds.ne_lng}&ne_lat=${bounds.ne_lat}`,
      { signal: abortRef.current.signal, credentials: 'include' }
    );
    const data = await res.json();
    setIssues(data.data);
  }, 300);
}
```

**Why this matters:**
- **Debounce (300ms)**: The user pans for 2 seconds. Without debounce = 20 requests. With debounce = 1 request (at the final position).
- **AbortController**: If a new pan starts before the previous fetch completes, the old request is cancelled at the TCP level. No wasted bandwidth, no stale data rendered.

---

## Layer 3: Frontend — Supercluster (K-D Tree Spatial Indexing)

### What Supercluster Does

Supercluster is a spatial clustering library that uses a **K-D tree** (k-dimensional binary space partition). It pre-computes cluster hierarchies for every zoom level.

### How the K-D Tree Works

A K-D tree recursively splits 2D space along alternating axes:

```
Root: split on X (longitude)
├── Left (lng < 78): split on Y (latitude)
│   ├── Bottom: [issues in SW India]
│   └── Top: [issues in NW India]
└── Right (lng >= 78): split on Y
    ├── Bottom: [issues in SE India]
    └── Top: [issues in NE India]
```

At each zoom level, Supercluster decides which leaf nodes are close enough to merge into a single cluster. Higher zoom = fewer merges = more individual points.

### Performance Characteristics

| Operation | Complexity | Typical Time |
|-----------|-----------|--------------|
| Build tree from N points | O(n log n) | ~5ms for 500 points |
| Query clusters at zoom level | O(k log n) | <1ms |
| Re-cluster on zoom change | O(k log n) | <1ms |

The browser always renders at most ~50-80 elements (clusters + individual markers), regardless of whether the viewport contains 10 or 10,000 issues.

### Integration with React-Leaflet

```jsx
import useSupercluster from 'use-supercluster';

// Convert issues to GeoJSON points (Supercluster's input format)
const points = issues.map(issue => ({
  type: 'Feature',
  properties: { cluster: false, issueId: issue.id, ...issue },
  geometry: { type: 'Point', coordinates: [issue.lng, issue.lat] }
}));

const { clusters } = useSupercluster({
  points,
  bounds: mapBounds,        // [sw_lng, sw_lat, ne_lng, ne_lat]
  zoom: currentZoom,
  options: { radius: 75, maxZoom: 17 }
});

// Render: clusters show count bubble, individual points show category icon
```

---

## Layer 4: UI — Floating Issue Card

### Why Not Leaflet Popups?

Leaflet popups are:
- Hard to style (injected into the map's shadow DOM)
- Limited in interactivity (no React state, no hooks)
- Blocking (cover the map, dismiss on outside click)

### The Floating Card Approach

A standard React component absolutely positioned over the map container:

```jsx
{selectedIssue && (
  <div className="map-issue-card">
    <button className="card-close" onClick={() => setSelected(null)}>✕</button>
    <img src={selectedIssue.thumbnail} />
    <h3>{selectedIssue.category}</h3>
    <StatusBadge status={selectedIssue.status} />
    <p>👥 {selectedIssue.report_count} reports</p>
    <p>📍 {selectedIssue.address}</p>
    <button onClick={() => handleMeToo(selectedIssue.id)}>👍 Me Too</button>
  </div>
)}
```

This gives full React lifecycle, full CSS control, and non-blocking interaction (the map remains pannable/zoomable behind the card).

---

## Scalability Ladder

| Scale | Strategy | When to use |
|-------|----------|-------------|
| < 10K issues | Bounding box → JSON → Supercluster (frontend) | **Current approach** |
| 10K–100K issues | Add server-side pre-clustering with `ST_ClusterDBSCAN` | When viewport queries return > 500 rows at city zoom |
| 100K–1M issues | Vector tiles via `ST_AsMVT` | When JSON serialization becomes the bottleneck |
| 1M+ issues | Tile cache (Redis/CDN) + pre-generated MVT tiles | Google Maps scale |

For NagarSeva (a city-level civic platform), the first tier is more than sufficient.

---

## Implementation Plan

### Backend Changes

1. **New endpoint**: `GET /api/issues/viewport`
   - Params: `sw_lng`, `sw_lat`, `ne_lng`, `ne_lat`
   - Uses `&&` operator with `ST_MakeEnvelope`
   - Returns: `{ count, data: [{ id, short_id, category, status, report_count, priority_score, lat, lng, address, description, thumbnail }] }`
   - LIMIT 500, ordered by priority_score DESC

2. **New route** in `server/src/routes/issue.js`:
   - `router.get('/viewport', getViewportIssues)` — public, no auth needed

### Frontend Changes

1. **Install**: `npm install supercluster use-supercluster`

2. **New page**: `client/src/pages/CityPulse.jsx`
   - Full-screen Leaflet map
   - `useSupercluster` for clustering
   - Debounced viewport fetch on `moveend`
   - Cluster markers (circle with count) + individual markers (category icon)
   - Floating card on marker click with issue details + "Me too" button

3. **New route** in `App.jsx`:
   - `/citizen/city-pulse` → `<CityPulse />`

4. **Dashboard link**: Add "City Pulse" button on CitizenDashboard

### File Changes

| File | Change |
|------|--------|
| `server/src/controller/issue.js` | Add `getViewportIssues` controller |
| `server/src/routes/issue.js` | Add `GET /viewport` route |
| `client/package.json` | Add `supercluster`, `use-supercluster` |
| `client/src/pages/CityPulse.jsx` | NEW — full page component |
| `client/src/styles/citypulse.css` | NEW — map + card + cluster styles |
| `client/src/App.jsx` | Add `/citizen/city-pulse` route |
| `client/src/pages/CitizenDashboard.jsx` | Add "City Pulse" button |
| `client/src/services/api.js` | Add `VIEWPORT_ISSUES_API` endpoint |
| `client/src/main.jsx` | Import `citypulse.css` |

---

## Key Interview Talking Points

1. **"Why bounding box over radius?"** — The viewport IS a rectangle. Using `&&` with `ST_MakeEnvelope` is a pure index operation with zero post-filtering. `ST_DWithin` requires an additional distance computation step.

2. **"How does the GIST index work?"** — It's an R-tree. Points are organized into nested bounding rectangles. Query traversal prunes entire subtrees that don't overlap the search envelope. Complexity: O(log n) for n rows.

3. **"How do you prevent DOM explosion?"** — Supercluster implements a K-D tree that pre-computes cluster hierarchies per zoom level. The browser renders ~50 elements max regardless of data volume.

4. **"What about rapid panning?"** — Debounce (300ms) + AbortController pattern. Only the final viewport position triggers a fetch. In-flight requests for stale positions are aborted at TCP level.

5. **"What about race conditions with Me Too from the map?"** — The `POST /api/issues/:id/me-too` endpoint is idempotent (checks watcher membership before incrementing). Multiple clicks won't double-count.

6. **"How would you scale to 1M issues?"** — Move clustering server-side with PostGIS `ST_ClusterDBSCAN`, then graduate to vector tiles via `ST_AsMVT`. The architecture is layered so each upgrade is independent.

---

## Feature: Contextual Upvoting (Location-Aware "Me Too")

### The Concept

Citizens should only be able to upvote (endorse / "Me too") issues that are **contextually relevant** to them. This prevents gaming and ensures priority scores reflect genuine local impact. Two eligibility criteria:

1. **Proximity-based**: The citizen's current GPS location is within 500m of the issue → they can see and upvote it (they're physically near the problem)
2. **Watcher-based**: The citizen is in the watchers list of the issue (they previously reported or were merged into it) → they can always upvote nearby issues in the same area

### Why This Matters (Interview Point)

Without this constraint, a user in Mumbai could upvote every pothole in Delhi, inflating priority scores for issues they've never seen. The location constraint ensures:
- **Data integrity**: Priority reflects actual affected population
- **Anti-gaming**: Can't mass-upvote from a different city
- **Natural behavior**: Mirrors how real civic engagement works — you report/upvote issues you encounter

### The Optimized Query Strategy

#### Option A: Pure Server-Side Validation (Chosen Approach)

When a citizen calls `POST /api/issues/:id/me-too`, the server validates eligibility:

```sql
-- Check 1: Is the citizen already a watcher? (instant, index-only)
SELECT 1 FROM watchers WHERE issue_id = $1 AND user_id = $2;

-- If not a watcher, Check 2: Is the citizen within 500m of the issue?
SELECT 1 FROM issues
WHERE id = $1
  AND ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint($2, $3), 4326),
    500  -- metres
  );
```

**Query Optimization:** The second query hits the GIST index on `issues.location` to compute distance for a single row (fetched by primary key `id`). This is O(1) — it's not a spatial scan; it's a single-row lookup + one distance calculation. Total: ~0.1ms.

#### Why Not Do It in a Single Query?

We could combine both checks:

```sql
SELECT 1 FROM issues i
WHERE i.id = $1
  AND (
    EXISTS (SELECT 1 FROM watchers WHERE issue_id = $1 AND user_id = $2)
    OR ST_DWithin(i.location, ST_SetSRID(ST_MakePoint($3, $4), 4326), 500)
  );
```

This is actually **less efficient** because:
- The `OR` prevents PostgreSQL from short-circuiting on the first condition
- The query planner may not use the primary key index for the spatial check within an OR branch
- Separating them allows the fast watcher check (index-only scan on composite PK) to succeed without ever touching the geometry column

**Two sequential checks with early exit > one combined query with OR.**

#### The Flow

```
Client sends: POST /api/issues/:id/me-too
  Headers: { lat: 26.8467, lng: 80.9462 }  ← citizen's current GPS (optional)

Server logic:
  1. Issue exists? (PK lookup) → if not, 404
  2. Issue is open? (status check) → if not, 400
  3. User is original reporter? → if yes, 400
  4. User is already a watcher? → if yes, 200 "already endorsed" (no increment)
  5. If lat/lng provided:
       Is citizen within 500m of issue? (ST_DWithin on single row) → if not, 403
  6. If lat/lng NOT provided:
       Reject with 400 "Location required for endorsement"
       (Unless user is watcher — already caught at step 4)
  7. All checks pass → BEGIN transaction:
       UPDATE report_count, priority_score
       INSERT INTO watchers
       COMMIT
  8. Return 200 with new counts
```

### Frontend Integration

The "Me too" button on the City Pulse floating card and on My Complaints sends the citizen's current GPS coordinates along with the request:

```js
async function handleMeToo(issueId) {
  // Get current position (already available from map)
  const position = await getCurrentPosition();
  
  await apiConnector('POST', endpoints.ME_TOO_API(issueId), null, {
    'X-User-Lat': position.lat.toString(),
    'X-User-Lng': position.lng.toString(),
  });
}
```

Using custom headers (`X-User-Lat`, `X-User-Lng`) rather than body params keeps the request body empty (idiomatic for endorsement-style actions) and allows the server to treat location as optional metadata.

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| User on City Pulse map, clicks issue 3km away | "Me too" button is visible but server returns 403 "You must be near this issue to endorse it" |
| User is a watcher (was merged into issue) but is now in another city | Allowed — watcher status overrides proximity (they've already proven they're affected) |
| User denies location permission | "Me too" button shows tooltip: "Enable location to endorse issues" |
| User spoofs GPS coordinates | Server-side; we can't fully prevent GPS spoofing on mobile. For MVP this is acceptable. At scale, add rate limiting per user (max 10 endorsements/day) |

### Performance Characteristics

| Operation | Complexity | Typical Latency |
|-----------|-----------|----------------|
| Watcher check (composite PK index) | O(1) | <0.05ms |
| Single-row ST_DWithin | O(1) | <0.1ms |
| UPDATE + INSERT (transaction) | O(1) | ~1-2ms |
| **Total round-trip** | | **~5ms server + network** |

The entire "Me too" operation never does a spatial scan. Every step is either a primary key lookup or a single-row spatial computation. This is the key interview point: **we validate spatial proximity without scanning the spatial index**.

### Interview Talking Point

> "The upvote validation uses a two-phase eligibility check with early exit. First, I check the watchers composite-key index (O(1) hash lookup). If that fails, I do a single-row `ST_DWithin` against the issue's known location using the primary key — this is NOT a spatial scan, it's a point-to-point distance calculation on one pre-fetched row. The GIST index isn't even consulted because we already have the row by PK. Total server time: under 5ms regardless of table size."
