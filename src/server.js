require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const pg = require('pg');

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const folderRoutes = require('./routes/folders');
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');
const chunkController = require('./controllers/chunkController');
const supabase = require('./lib/supabase');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 2 * 1024 * 1024 * 1024;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// PostgreSQL connection pool for sessions
const pgPool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
  ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : false
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || !IS_PRODUCTION) {
      return callback(null, true);
    }
    const allowed = [
      'http://localhost:3000',
      process.env.CLIENT_URL
    ].filter(Boolean);
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, origin);
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session with PostgreSQL store
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: new pgSession({
    pool: pgPool,
    tableName: 'guha_cloud_sessions',
    createTableIfMissing: true
  }),
  cookie: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
};

app.use(session(sessionConfig));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// Static files
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

app.get('/api/config', (req, res) => {
  res.json({
    defaultStorageBackend: process.env.DEFAULT_STORAGE_BACKEND || 'supabase',
    storageBackends: ['supabase', 'b2']
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/files', authenticate, fileRoutes);
app.use('/api/folders', authenticate, folderRoutes);

// Chunked upload routes (authenticated)
app.post('/api/chunk/init', authenticate, express.json(), chunkController.initUpload);

const multer = require('multer');
const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }).single('chunk');
const handleChunk = (req, res, next) => { chunkUpload(req, res, (err) => { if (err) return res.status(400).json({ error: 'Chunk upload error: ' + err.message }); next(); }); };

app.post('/api/chunk/upload/:uploadId/:chunkIndex', authenticate, handleChunk, chunkController.uploadChunk);
app.post('/api/chunk/finalize/:uploadId', authenticate, chunkController.finalizeUpload);

// HTML routes
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(publicPath, 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(publicPath, 'register.html'));
});

app.get('/dashboard', authenticate, (req, res) => {
  res.sendFile(path.join(publicPath, 'dashboard.html'));
});

// Catch-all for SPA-like behavior
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.use(errorHandler);

// Add deleted_at column to both tables if missing
async function addColumnIfMissing(table, column, definition) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return true;
  const ref = (process.env.SUPABASE_URL || '').match(/https:\/\/(.+)\.supabase\.co/)?.[1];
  if (ref && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${definition}` })
      });
      if (r.ok) { console.log(`Added ${column} to ${table} via Management API`); return true; }
    } catch {}
  }
  try {
    const pg = require('pg');
    const pool = new pg.Pool({
      connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
      ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : false
    });
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${definition}`);
    await pool.end();
    console.log(`Added ${column} to ${table} via pg`);
    return true;
  } catch (e) { console.error(`Could not add ${column} to ${table}:`, e.message); return false; }
}

async function ensureRecycleBinColumn() {
  const ok = await addColumnIfMissing('guha_cloud_files', 'deleted_at', 'deleted_at TIMESTAMPTZ');
  const ok2 = await addColumnIfMissing('guha_cloud_folders', 'deleted_at', 'deleted_at TIMESTAMPTZ');
  if (!ok) {
    console.log('To enable Recycle Bin, run this SQL in your Supabase SQL Editor:');
    console.log('  ALTER TABLE guha_cloud_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;');
    console.log('  ALTER TABLE guha_cloud_folders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;');
  }
}

// Clean up expired recycle bin items (older than 2 days)
async function cleanupExpiredFiles() {
  try {
    const File = require('./models/File');
    const Folder = require('./models/Folder');
    const [fc, fdc] = await Promise.all([
      File.cleanupExpired(),
      Folder.cleanupExpired()
    ]);
    const total = fc + fdc;
    if (total > 0) console.log(`Cleaned up ${total} expired recycle bin items`);
  } catch (err) {
    console.error('Recycle bin cleanup error:', err.message);
  }
}

// Test Supabase connection on startup
async function startServer() {
  try {
    const { data, error } = await supabase.from('guha_cloud_users').select('count').limit(1);
    if (error) throw error;
    console.log('Connected to Supabase');
    
    await ensureRecycleBinColumn();
    await cleanupExpiredFiles();

    // Periodic cleanup every 30 minutes
    setInterval(cleanupExpiredFiles, 30 * 60 * 1000);

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
    server.timeout = 300000; // 5 minutes for large file uploads
  } catch (err) {
    console.error('Supabase connection error:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;