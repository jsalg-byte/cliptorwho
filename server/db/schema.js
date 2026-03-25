const DEFAULT_SETTINGS = {
  wake_word: 'jarvis',
  clip_duration: '30',
  audio_threshold: '65',
  motion_threshold: '55',
  chat_threshold: '70',
  upload_min_score: '50',
  theme: 'dark',
  auto_save_uploads: 'false',
};

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      displayName TEXT,
      avatarUrl TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS user_connections (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      provider TEXT NOT NULL,
      externalId TEXT,
      accessToken TEXT,
      refreshToken TEXT,
      apiKey TEXT,
      metadata TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      UNIQUE(userId, provider)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      userId TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (userId, key)
    );

    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY,
      userId TEXT,
      title TEXT,
      platform TEXT,
      channel TEXT,
      duration REAL,
      fileSize INTEGER,
      filePath TEXT,
      thumbnailPath TEXT,
      tags TEXT,
      source TEXT,
      combinedScore REAL,
      shareToken TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS upload_jobs (
      id TEXT PRIMARY KEY,
      userId TEXT,
      filePath TEXT,
      status TEXT,
      duration REAL,
      candidatesJson TEXT,
      createdAt TEXT
    );
  `);

  const hasColumn = (tableName, columnName) => {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return rows.some((row) => row.name === columnName);
  };

  if (!hasColumn('clips', 'userId')) {
    db.exec('ALTER TABLE clips ADD COLUMN userId TEXT');
  }

  if (!hasColumn('upload_jobs', 'userId')) {
    db.exec('ALTER TABLE upload_jobs ADD COLUMN userId TEXT');
  }

  if (!hasColumn('clips', 'fileSize')) {
    db.exec('ALTER TABLE clips ADD COLUMN fileSize INTEGER');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_clips_userId_createdAt ON clips (userId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_upload_jobs_userId_createdAt ON upload_jobs (userId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_user_connections_userId ON user_connections (userId);
    CREATE INDEX IF NOT EXISTS idx_user_settings_userId ON user_settings (userId);
  `);

  const insertSetting = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO NOTHING
  `);

  const insertMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      insertSetting.run({ key, value });
    }
  });

  insertMany(Object.entries(DEFAULT_SETTINGS));
}

module.exports = {
  DEFAULT_SETTINGS,
  initSchema,
};
