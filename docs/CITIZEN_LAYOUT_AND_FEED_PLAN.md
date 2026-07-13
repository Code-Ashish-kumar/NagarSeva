# Citizen Layout & Nearby Feed Implementation Plan

This plan details the technical steps to create a unified header navigation bar for citizen users, structure a shared page layout, and fetch/render a feed of nearby complaints within a 4km radius on the home feed.

---

## Proposed Changes

### Database & Backend

#### [MODIFY] [issue.js](file:///d:/megaProject/NagarSeva/server/src/controller/issue.js)
* Update `getNearbyIssues` controller function:
  * Join the `users` table to select the original reporter's name (`u.name AS reporter_name`).
  * Select the `address` and `report_count`.
  * Select a JSON array of all report image URLs (`json_agg(image_url)`) from the `issue_images` table instead of only the single `thumbnail`.
  * Perform exact spatial calculations using PostGIS by casting geometries to `::geography` inside `ST_DWithin` to ensure the radius param behaves in meters.

---

### Shared Navigation Layout

#### [NEW] [CitizenLayout.jsx](file:///d:/megaProject/NagarSeva/client/src/components/common/CitizenLayout.jsx)
* Build a responsive top navbar component shared across all citizen pages:
  * **Branding**: Logo emoji (`🏛️`) and label `NagarSeva` linking to `/citizen`.
  * **Nav Links**: Sticky top links for `Feed`, `My Complaints`, `City Pulse`, and `Report Issue`.
  * **Profile Dropdown**: Displays initials/avatar in a menu button, which slides open to reveal user information and a **Logout** action.
  * **Mobile Navigation**: Collapses links into a responsive mobile drawer/toggle dropdown.
* Renders the shared navbar and sub-pages using React Router's `<Outlet />`.

#### [MODIFY] [App.jsx](file:///d:/megaProject/NagarSeva/client/src/App.jsx)
* Nest the `/citizen` routes (`CitizenDashboard`, `ReportWizard`, `MyComplaints`, `CityPulse`) inside the new `CitizenLayout` wrapper to ensure the navigation header persists across pages.

---

### Home Page Feed

#### [MODIFY] [CitizenDashboard.jsx](file:///d:/megaProject/NagarSeva/client/src/pages/CitizenDashboard.jsx)
* On mount, request current GPS location (defaulting to Ranchi coordinates `23.3441, 85.3090` if denied).
* Fetch open complaints within a 4km radius of the coordinates: `GET /api/issues/nearby?lat=...&lng=...&radius=4000`.
* Render a feed of issue cards:
  * Display title (category-based), description, address, and reporter's name.
  * **Horizontal Image Track**: A scrollable horizontal track of all report images using Tailwind's `snap-x overflow-x-auto scrollbar-none`.
  * **Upvote / Endorsement Button**: Call `POST /api/issues/:id/me-too` to increment upvotes, disabling the button upon success and handling 500m proximity verification alerts.

---

## Verification Plan

### Automated Verification
* Run the Vite build command to guarantee all changes compile without syntax errors:
  ```powershell
  npm run build
  ```

### Manual Verification
* Log in as a citizen.
* Confirm that the navigation header is sticky at the top, responsive on smaller viewports, and correctly routes between pages.
* Verify the profile dropdown reveals details and triggers logout correctly.
* Confirm the feed fetches issues in Ranchi (or current location) and displays scrollable images and upvote counts.
