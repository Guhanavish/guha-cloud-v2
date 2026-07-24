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

// B2 diagnostic endpoint
app.get('/api/test-b2', async (req, res) => {
  try {
    const B2 = require('backblaze-b2');
    const keyId = process.env.B2_KEY_ID;
    const appKey = process.env.B2_APP_KEY;
    const b2 = new B2({ applicationKeyId: keyId, applicationKey: appKey });
    await b2.authorize();
    const bucketId = process.env.B2_BUCKET_ID;
    const { data: uploadData } = await b2.getUploadUrl(bucketId);
    res.json({ success: true, apiUrl: b2.apiUrl, hasUploadUrl: !!uploadData?.uploadUrl });
  } catch (e) {
    res.status(500).json({ error: e.message, status: e.response?.status, data: e.response?.data });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    defaultStorageBackend: process.env.DEFAULT_STORAGE_BACKEND || 'supabase',
    storageBackends: ['supabase', 'b2']
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/files', authenticate, fileRoutes);
app.use('/api/folders', authenticate, folderRoutes);

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

// Test Supabase connection on startup
async function startServer() {
  try {
    const { data, error } = await supabase.from('guha_cloud_users').select('count').limit(1);
    if (error) throw error;
    console.log('Connected to Supabase');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Supabase connection error:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;