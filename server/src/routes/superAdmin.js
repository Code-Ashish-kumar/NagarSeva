/**
 * routes/superAdmin.js
 *
 * All routes require SUPER_ADMIN role.
 */
const express   = require('express');
const auth      = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const {
  getTriagingQueue,
  getIssueDetail,
  verifyIssue,
  rejectIssue,
  getDepartments,
  createDepartment,
  deleteDepartment,
  getStats,
  createStaff,
  getStaffList,
  resendCredentials,
} = require('../controller/superAdmin');

const router = express.Router();

// All routes require auth + SUPER_ADMIN
router.use(auth, roleGuard('SUPER_ADMIN'));

// Dashboard stats
router.get('/stats', getStats);

// Triaging queue
router.get('/queue', getTriagingQueue);

// Issue detail
router.get('/issues/:id/detail', getIssueDetail);

// Verify & Route to department
router.patch('/issues/:id/verify', verifyIssue);

// Reject with reason (triggers email)
router.patch('/issues/:id/reject', rejectIssue);

// Department CRUD
router.get('/departments', getDepartments);
router.post('/departments', createDepartment);
router.delete('/departments/:id', deleteDepartment);

// Staff management
router.get('/staff', getStaffList);
router.post('/staff', createStaff);
router.post('/staff/:id/resend-credentials', resendCredentials);

module.exports = router;
