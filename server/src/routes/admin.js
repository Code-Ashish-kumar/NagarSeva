/**
 * routes/admin.js
 *
 * Department Admin routes — all require ADMIN role.
 */
const express   = require('express');
const auth      = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const {
  getDepartmentQueue,
  getRankedWorkers,
  assignWorker,
  getDeptStats,
} = require('../controller/admin');

const router = express.Router();

// All routes require auth + ADMIN role
router.use(auth, roleGuard('ADMIN'));

// Stats for this admin's department
router.get('/stats', getDeptStats);

// Issues assigned to this admin's department (pending allocation)
router.get('/queue', getDepartmentQueue);

// Ranked field workers in this department
router.get('/workers', getRankedWorkers);

// Assign a specific worker to an issue
router.patch('/issues/:id/assign', assignWorker);

module.exports = router;
