const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings
  max: 10,                // max 10 simultaneous connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    return;
  }
  release();
  console.log('✅ Database connected');
});

module.exports = pool;
