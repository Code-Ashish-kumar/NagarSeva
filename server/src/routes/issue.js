/**
 * routes/issue.js
 *
 * Endpoints:
 *   POST   /api/issues               — report a new civic issue (citizen)
 *   GET    /api/issues/nearby        — fetch nearby open issues (public)
 *   PATCH  /api/issues/:id/status    — update issue status (admin/staff only)
 *   POST   /api/issues/:id/watch     — watch an issue for updates (citizen)
 *   DELETE /api/issues/:id/watch     — unwatch an issue (citizen)
 */
const express   = require('express');
const auth      = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

const {
  createIssue,
  getNearbyIssues,
  updateIssueStatus,
  watchIssue,
  unwatchIssue,
} = require('../controller/issue');

const router = express.Router();

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/issues/nearby
 * Public — anyone can view nearby open issues on the map.
 * Query params: lat, lng, radius (metres, optional), category (optional)
 *
 * NOTE: This route MUST be defined before /:id routes to prevent Express
 *       from treating "nearby" as an :id parameter.
 */
router.get('/nearby', getNearbyIssues);

/**
 * POST /api/issues
 * Authenticated citizens report a new issue.
 */
router.post('/', auth, createIssue);

/**
 * PATCH /api/issues/:id/status
 * Restricted to ADMIN and FIELD_WORKER roles.
 * Body: { new_status, note? }
 */
router.patch('/:id/status', auth, roleGuard('ADMIN', 'FIELD_WORKER'), updateIssueStatus);

/**
 * POST /api/issues/:id/watch
 * Authenticated user subscribes to updates for an issue.
 */
router.post('/:id/watch', auth, watchIssue);

/**
 * DELETE /api/issues/:id/watch
 * Authenticated user unsubscribes from an issue.
 */
router.delete('/:id/watch', auth, unwatchIssue);

module.exports = router;
