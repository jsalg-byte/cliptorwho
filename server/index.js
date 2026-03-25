const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const Database = require('better-sqlite3');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { initSchema } = require('./db/schema');
const { createQueries } = require('./db/queries');
const { createAuthRouter } = require('./routes/auth');
const { createClipsRouter } = require('./routes/clips');
const { createUploadRouter } = require('./routes/upload');
const { createStreamRouter } = require('./routes/stream');
const { createSettingsRouter } = require('./routes/settings');
const { createShareRouter } = require('./routes/share');
const { encryptText, decryptText } = require('./services/crypto');
const { createObjectStorage } = require('./services/objectStorage');
const { getStorageConfig, pruneExpiredClips } = require('./services/storagePolicy');
const { ensureDir } = require('./services/uploader');

const app = express();

const PORT = Number(process.env.PORT || 3001);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = FRONTEND_URL
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const PRIMARY_FRONTEND_URL = ALLOWED_ORIGINS[0] || 'http://localhost:5173';
if (!ALLOWED_ORIGINS.length) {
  ALLOWED_ORIGINS.push(PRIMARY_FRONTEND_URL);
}
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true' || IS_PRODUCTION;

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic;
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffmpegPath && ffmpegPath.endsWith('ffmpeg')) {
  const ffprobePath = ffmpegPath.replace(/ffmpeg$/, 'ffprobe');
  ffmpeg.setFfprobePath(ffprobePath);
}

const dbPath = path.join(__dirname, 'db', 'cliptorwho.sqlite');
const db = new Database(dbPath);
initSchema(db);
const queries = createQueries(db);
const objectStorage = createObjectStorage();

const paths = {
  clipsDir: path.join(__dirname, 'clips'),
  thumbsDir: path.join(__dirname, 'thumbs'),
  uploadsDir: path.join(__dirname, 'uploads'),
  framesDir: path.join(__dirname, 'frames'),
};
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');

Object.values(paths).forEach((dirPath) => ensureDir(dirPath));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const configuredCookieSecure =
  process.env.SESSION_COOKIE_SECURE != null
    ? process.env.SESSION_COOKIE_SECURE === 'true'
    : IS_PRODUCTION;
const cookieSecure = configuredCookieSecure;
const cookieSameSite =
  process.env.SESSION_COOKIE_SAMESITE ||
  (cookieSecure ? 'none' : 'lax');

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'cliptorwho-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use('/clips', express.static(paths.clipsDir));
app.use('/thumbs', express.static(paths.thumbsDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'cliptor-who' });
});

app.use('/auth', createAuthRouter({
  queries,
  frontendUrl: PRIMARY_FRONTEND_URL,
  encryptText,
  decryptText,
}));

app.use('/api/share', createShareRouter({ queries, objectStorage }));

function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  const authenticated = Boolean(req.session?.isAuthenticated);
  const user = userId ? queries.getUserById(userId) : null;

  if (authenticated && user) {
    next();
    return;
  }

  if (req.session) {
    req.session.userId = null;
    req.session.isAuthenticated = false;
  }

  res.status(401).json({
    error: 'Unauthorized. Connect Twitch or Kick first.',
  });
}

app.use('/api', requireAuth);

app.use('/api', createClipsRouter({ queries, paths, objectStorage }));
app.use('/api/upload', createUploadRouter({ queries, paths, objectStorage }));
app.use('/api/stream', createStreamRouter({ queries, decryptText }));
app.use('/api/settings', createSettingsRouter({ queries }));

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    const passthroughPrefixes = ['/api/', '/auth/', '/clips/', '/thumbs/', '/health'];
    if (passthroughPrefixes.some((prefix) => req.path.startsWith(prefix))) {
      next();
      return;
    }

    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  res.status(500).json({
    error: 'Unexpected server error',
    details: error.message,
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Cliptor Who server listening on http://localhost:${PORT}`);
});

async function runRetentionSweep() {
  try {
    const result = await pruneExpiredClips({ queries, objectStorage });
    if (result.pruned > 0) {
      // eslint-disable-next-line no-console
      console.log(`Pruned ${result.pruned} expired clips (retention=${result.retentionDays} days).`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Retention sweep failed:', error.message);
  }
}

const retentionConfig = getStorageConfig();
if (retentionConfig.retentionDays > 0) {
  runRetentionSweep();
  const intervalMinutes = Math.max(15, Number(process.env.RETENTION_SWEEP_MINUTES || 360));
  setInterval(runRetentionSweep, intervalMinutes * 60 * 1000);
}
