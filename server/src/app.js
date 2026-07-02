const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const authRoutes       = require('./routes/auth');
const issueRoutes      = require('./routes/issue');
const uploadRoutes     = require('./routes/upload');
const complaintsRoutes = require('./routes/complaints');
const superAdminRoutes = require('./routes/superAdmin');
const adminRoutes      = require('./routes/admin');
const fieldWorkerRoutes = require('./routes/fieldWorker');

const app = express();

// ─── Security & Parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,  // Required for cookies to be sent cross-origin
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser()); // Parse req.cookies — must come before routes

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/issues',     issueRoutes);
app.use('/api/upload',     uploadRoutes);
app.use('/api/complaints', complaintsRoutes);
app.use('/api/super-admin',   superAdminRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/field-worker',  fieldWorkerRoutes);

// Health check — useful for Railway/Render deploy
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` });
});

// ─── Centralized Error Handler (MUST be last) ─────────────────────────────────
app.use(errorHandler);

module.exports = app;
