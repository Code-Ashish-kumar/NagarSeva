# City Pulse Map Redesign Plan

This plan details the technical steps to redesign [CityPulse.jsx](file:///d:/megaProject/NagarSeva/client/src/pages/CityPulse.jsx) into a premium, interactive spatial dashboard.

---

## Redesign Highlights

1. **Floating Sidebar Explorer (Left Side)**:
   * **Search & Filters**: Add a live text search bar and tag pills to filter issues by category (e.g., Pothole, Garbage) or status (e.g., In Progress).
   * **Visible List**: Display a scrollable list of all complaints currently in view. Clicking a list item will fly the map to the coordinates and highlight the marker.
   * **Collapsible Layout**: Add a collapse button to let users minimize the sidebar to see the map full-screen.

2. **Sleek Detail Panel (Bottom/Right)**:
   * Redesign the details view into a card containing an image slider (for multiple photos), full description, location, upvote endorsement buttons, and the chronological `<AuditLogs />` history timeline.

3. **Floating Map Controls**:
   * Create custom floating buttons for:
     * **Locate Me**: Fly map back to user's current GPS position.
     * **Zoom In/Out**: Clean icons to control zoom levels.

4. **Premium Styling & Transitions**:
   * Apply glassmorphism overlay effects, soft shadows, custom leaflet marker animations, and slide-in panels.

---

## Proposed Changes

### Client (client)

#### [MODIFY] [CityPulse.jsx](file:///d:/megaProject/NagarSeva/client/src/pages/CityPulse.jsx)
* Implement:
  * Left sidebar container with search state, active category tags, collapsible toggle, and scrollable listing.
  * Custom `MapControls` component that calls map zoom and center methods.
  * Slide-up detailed issue panel with image slider, and `<AuditLogs />` integration.
  * Custom style classes using Tailwind.

---

## Verification Plan

### Automated Verification
* Verify Vite bundle builds successfully:
  ```powershell
  npm run build
  ```

### Manual Verification
* Navigate to the City Pulse page, test the search and category filters, click on list items to verify smooth map fly-to transitions, and test the locate-me button.
