const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const authRoutes   = require('./routes/auth');

const app = express();

// ─── Security & Parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Health check — useful for Railway/Render deploy
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` });
});

// ─── Centralized Error Handler (MUST be last) ─────────────────────────────────
app.use(errorHandler);

module.exports = app;
