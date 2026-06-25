const Joi    = require('joi');
const crypto = require('crypto');
const pool   = require('../config/db');

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createIssueSchema = Joi.object({
  category: Joi.string().valid(
    'POTHOLE', 'STREETLIGHT', 'SEWAGE', 'GARBAGE', 'WATER_SUPPLY', 
    'ROAD_DAMAGE', 'ENCROACHMENT', 'STRAY_ANIMALS', 'DEAD_ANIMAL', 
    'PUBLIC_TOILET', 'DRAIN_BLOCKAGE', 'FALLEN_TREE', 'ABANDONED_VEHICLE',
    'AIR_POLLUTION', 'OTHER'
  ).required(),
  description: Joi.string().max(1000).allow('', null),
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  address: Joi.string().allow('', null),
  image_urls: Joi.array().items(Joi.string().uri()).max(5).default([]),
});

const updateStatusSchema = Joi.object({
  new_status: Joi.string().valid(
    'SUBMITTED', 'VERIFIED', 'REJECTED', 'ASSIGNED',
    'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'
  ).required(),
  note: Joi.string().max(500).allow('', null),
});

const nearbyQuerySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  radius: Joi.number().min(100).max(50000).default(5000),
  category: Joi.string().valid(
    'POTHOLE', 'STREETLIGHT', 'SEWAGE', 'GARBAGE', 'WATER_SUPPLY', 
    'ROAD_DAMAGE', 'ENCROACHMENT', 'STRAY_ANIMALS', 'DEAD_ANIMAL', 
    'PUBLIC_TOILET', 'DRAIN_BLOCKAGE', 'FALLEN_TREE', 'ABANDONED_VEHICLE', 
    'AIR_POLLUTION', 'OTHER'
  ).optional(), 
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a readable short ID (e.g., ISS-2025-A7F3B1) using crypto for collision resistance */
function generateShortId() {
  const year = new Date().getFullYear();
  const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase(); // 16.7M unique values
  return `ISS-${year}-${randomStr}`;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/issues
 * Creates a new issue report with location and up to 5 images.
 */
const createIssue = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { error, value } = createIssueSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });
    }

    const { category, description, lat, lng, address, image_urls } = value;
    const reporter_id = req.user.id; // From auth middleware
    const short_id = generateShortId();

    await client.query('BEGIN'); // Start transaction

    // 1. Insert main issue record
    const issueResult = await client.query(
      `INSERT INTO issues (short_id, reporter_id, category, description, location, address)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7)
       RETURNING id, short_id`,
      [short_id, reporter_id, category, description, lng, lat, address]
    );
    
    const newIssueId = issueResult.rows[0].id;

    // 2. Insert uploaded images into dependent table
    if (image_urls && image_urls.length > 0) {
      for (let url of image_urls) {
        await client.query(
          `INSERT INTO issue_images (issue_id, uploader_id, image_url, image_type)
           VALUES ($1, $2, $3, 'REPORT')`,
          [newIssueId, reporter_id, url]
        );
      }
    }

    // 3. AUTO-WATCH: Automatically add the reporter to the watchers table 
    // We use ON CONFLICT DO NOTHING just as a safe database practice
    await client.query(
      `INSERT INTO watchers (issue_id, user_id) 
       VALUES ($1, $2)
       ON CONFLICT (issue_id, user_id) DO NOTHING`,
      [newIssueId, reporter_id]
    );

    await client.query('COMMIT'); // Save transaction

    res.status(201).json({
      message: 'Issue reported successfully. You are now watching this issue for updates.',
      issue: { id: newIssueId, short_id: issueResult.rows[0].short_id }
    });

  } catch (err) {
    await client.query('ROLLBACK'); // Undo if error occurs
    console.error('[createIssue]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to report issue.' });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/issues/:id/status
 * Updates issue status and logs it in the immutable audit trail.
 * BUG FIX: Added client.release() + ROLLBACK before early 404/400 returns
 *          to avoid leaking a pool connection.
 */
const updateIssueStatus = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { error, value } = updateStatusSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });
    }

    const { new_status, note } = value;
    const changed_by = req.user.id; // Admin or Field Worker ID

    await client.query('BEGIN');

    // 1. Get current status
    const currentIssue = await client.query('SELECT status FROM issues WHERE id = $1', [id]);
    if (currentIssue.rows.length === 0) {
      // BUG FIX: Must ROLLBACK and release before returning early inside a transaction
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ISSUE_NOT_FOUND', message: 'Issue not found.' });
    }
    
    const old_status = currentIssue.rows[0].status;
    if (old_status === new_status) {
      // BUG FIX: Must ROLLBACK and release before returning early inside a transaction
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'INVALID_STATUS', message: 'Status is already set to this value.' });
    }

    // 2. Update issue status
    await client.query(
      `UPDATE issues SET status = $1, updated_at = NOW() WHERE id = $2`,
      [new_status, id]
    );

    // 3. Log to audit trail
    await client.query(
      `INSERT INTO audit_logs (issue_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, old_status, new_status, changed_by, note]
    );

    await client.query('COMMIT');

    res.status(200).json({
      message: `Status successfully updated to ${new_status}.`
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateIssueStatus]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update status.' });
  } finally {
    client.release();
  }
};

/**
 * GET /api/issues/nearby
 * Fetches nearby issues using PostGIS spatial querying.
 * BUG FIX: Removed the duplicated inner function definition. The original code
 *          had an entire second copy of this function pasted inside the outer
 *          function body, making `category` and `result` unreachable in the
 *          outer scope — causing a ReferenceError at runtime.
 */
const getNearbyIssues = async (req, res) => {
  try {
    const { error, value } = nearbyQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });
    }

    const { lat, lng, radius, category } = value;

    // Build the base query and parameters
    let queryStr = `
      SELECT 
          i.id, i.short_id, i.category, i.description, i.status, i.priority_score,
          ST_AsGeoJSON(i.location)::json AS geo_location,
          (
              SELECT image_url FROM issue_images 
              WHERE issue_id = i.id AND image_type = 'REPORT' LIMIT 1
          ) as thumbnail
       FROM issues i
       WHERE ST_DWithin(
          i.location, 
          ST_SetSRID(ST_MakePoint($1, $2), 4326), 
          $3
       )
       AND i.status NOT IN ('CLOSED', 'REJECTED')
    `;
    
    // The base array of values mapped to $1, $2, $3
    const queryParams = [lng, lat, radius];

    // Dynamically append the category filter if provided
    if (category) {
      queryParams.push(category); // This makes it $4
      queryStr += ` AND i.category = $${queryParams.length}`; 
    }

    // Finally, append the ORDER BY clause
    queryStr += ` ORDER BY i.priority_score DESC;`;

    const result = await pool.query(queryStr, queryParams);

    res.status(200).json({
      message: 'Nearby issues retrieved.',
      count: result.rows.length,
      data: result.rows
    });

  } catch (err) {
    console.error('[getNearbyIssues]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch nearby issues.' });
  }
};

/**
 * POST /api/issues/:id/watch
 * Adds the authenticated user to the watchers list for an issue.
 */
const watchIssue = async (req, res) => {
  try {
    const issue_id = req.params.id;
    const user_id = req.user.id;

    // 1. Verify the issue actually exists first
    const issueCheck = await pool.query('SELECT id FROM issues WHERE id = $1', [issue_id]);
    if (issueCheck.rows.length === 0) {
      return res.status(404).json({ error: 'ISSUE_NOT_FOUND', message: 'Issue not found.' });
    }

    // 2. Insert into the watchers table securely
    // 'ON CONFLICT' gracefully handles if they are already watching it
    const result = await pool.query(
      `INSERT INTO watchers (issue_id, user_id) 
       VALUES ($1, $2) 
       ON CONFLICT (issue_id, user_id) DO NOTHING 
       RETURNING *`,
      [issue_id, user_id]
    );

    // If rows.length is 0, the ON CONFLICT clause triggered (already watching)
    if (result.rows.length === 0) {
      return res.status(200).json({ 
        message: 'You are already watching this issue.' 
      });
    }

    res.status(201).json({
      message: 'You are now watching this issue. You will be notified of updates.'
    });

  } catch (err) {
    console.error('[watchIssue]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to watch issue.' });
  }
};

/**
 * DELETE /api/issues/:id/watch
 * Removes the authenticated user from the watchers list.
 */
const unwatchIssue = async (req, res) => {
  try {
    const issue_id = req.params.id;
    const user_id = req.user.id;

    const result = await pool.query(
      `DELETE FROM watchers 
       WHERE issue_id = $1 AND user_id = $2 
       RETURNING *`,
      [issue_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: 'NOT_WATCHING', 
        message: 'You are not currently watching this issue.' 
      });
    }

    res.status(200).json({
      message: 'You have stopped watching this issue.'
    });

  } catch (err) {
    console.error('[unwatchIssue]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to unwatch issue.' });
  }
};

// BUG FIX: watchIssue and unwatchIssue were defined but missing from exports
module.exports = { createIssue, updateIssueStatus, getNearbyIssues, watchIssue, unwatchIssue };