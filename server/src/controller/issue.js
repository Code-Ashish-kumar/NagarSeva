const Joi  = require('joi');
const pool = require('../config/db');

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
  radius: Joi.number().min(100).max(50000).default(5000), // Default 5km radius
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a readable short ID (e.g., ISS-2025-ABCD) */
function generateShortId() {
  const year = new Date().getFullYear();
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
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
    if (image_urls.length > 0) {
      for (let url of image_urls) {
        await client.query(
          `INSERT INTO issue_images (issue_id, uploader_id, image_url, image_type)
           VALUES ($1, $2, $3, 'REPORT')`,
          [newIssueId, reporter_id, url]
        );
      }
    }

    await client.query('COMMIT'); // Save transaction

    res.status(201).json({
      message: 'Issue reported successfully.',
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
      return res.status(404).json({ error: 'ISSUE_NOT_FOUND', message: 'Issue not found.' });
    }
    
    const old_status = currentIssue.rows[0].status;
    if (old_status === new_status) {
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
 */
const getNearbyIssues = async (req, res) => {
  try {
    const { error, value } = nearbyQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });
    }

    const { lat, lng, radius } = value;

    const result = await pool.query(
      `SELECT 
          i.id, i.short_id, i.category, i.status, i.priority_score,
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
       ORDER BY i.priority_score DESC`,
      [lng, lat, radius]
    );

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

module.exports = { createIssue, updateIssueStatus, getNearbyIssues };