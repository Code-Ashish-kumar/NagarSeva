# Common AuditLogs Tracker Implementation Plan

This plan details the technical steps to create a common timeline tracking component for issue status changes (audit logs) and integrate it into citizen, admin, and superadmin detail views.

---

## Proposed Changes

### Backend (server)

#### [MODIFY] [issue.js](file:///d:/megaProject/NagarSeva/server/src/controller/issue.js)
* Implement a new controller `getIssueAuditLogs` that returns the status audit logs for a given issue ID, including state changes (`from_status`, `to_status`), custom notes/messages, timestamps, and the editor's name.

#### [MODIFY] [issue.js](file:///d:/megaProject/NagarSeva/server/src/routes/issue.js)
* Map `GET /api/issues/:id/audit-logs` to the new controller under `auth` middleware so any logged-in user can view details.

---

### Shared Component (client)

#### [NEW] [AuditLogs.jsx](file:///d:/megaProject/NagarSeva/client/src/components/common/AuditLogs.jsx)
* Build a vertical timeline tracking component:
  * Accepts `issueId` as a prop.
  * Fetches its history on mount from `GET /api/issues/:id/audit-logs`.
  * Renders a vertical line connected by status indicator dots showing the progression:
    * **Step Labels**: formatted status tags (e.g. `Submitted`, `Verified`, `In Progress`, `Resolved`).
    * **Timestamp**: clean date formatting.
    * **Notes/Message**: display change reason notes if provided (e.g., dispatch details, field verification remarks).
    * **Executor**: displays the name of the officer who changed the status.

---

### Integrations (client)

Integrate the `<AuditLogs />` tracker inside the following modal overlays:

#### [MODIFY] [CitizenDashboard.jsx](file:///d:/megaProject/NagarSeva/client/src/pages/CitizenDashboard.jsx)
* Render `<AuditLogs issueId={selectedIssue.id} />` in the floating detail card dialog.

#### [MODIFY] [MyComplaints.jsx](file:///d:/megaProject/NagarSeva/client/src/pages/MyComplaints.jsx)
* Render `<AuditLogs issueId={selectedIssue.id} />` in the card details overlay modal.

#### [MODIFY] [CityPulse.jsx](file:///d:/megaProject/NagarSeva/client/src/pages/CityPulse.jsx)
* Render `<AuditLogs issueId={selectedIssue.id} />` inside the map's floating detail card.

#### [MODIFY] [SuperAdmin_Reports.jsx](file:///d:/megaProject/NagarSeva/client/src/pages/SuperAdmin_Reports.jsx)
* Render `<AuditLogs issueId={selectedReport.id} />` inside the report details overlay panel/modal.

#### [MODIFY] [Admin_Reports.jsx](file:///d:/megaProject/NagarSeva/client/src/pages/Admin_Reports.jsx)
* Render `<AuditLogs issueId={selectedReport.id} />` in the report review sidebar/modal.

---

## Verification Plan

### Automated Verification
* Verify Vite bundle builds successfully:
  ```powershell
  npm run build
  ```

### Manual Verification
* Log in as a citizen, open a complaint from your complaints or feed list, and verify that the status history timeline renders.
* Log in as admin or superadmin, review a complaint, and confirm the status trail loads.
