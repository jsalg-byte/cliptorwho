const { randomUUID } = require('crypto');
const { DEFAULT_SETTINGS } = require('./schema');

function safeParseJSON(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function mapClipRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    duration: Number(row.duration || 0),
    fileSize: Number(row.fileSize || 0),
    combinedScore: row.combinedScore == null ? null : Number(row.combinedScore),
    tags: row.tags ? row.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
  };
}

function mapUploadRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    duration: Number(row.duration || 0),
    candidates: safeParseJSON(row.candidatesJson, []),
  };
}

function mapUserConnectionRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: safeParseJSON(row.metadata, {}),
  };
}

function createQueries(db) {
  const insertUserStmt = db.prepare(`
    INSERT INTO users (id, email, displayName, avatarUrl, createdAt, updatedAt)
    VALUES (@id, @email, @displayName, @avatarUrl, @createdAt, @updatedAt)
  `);

  const updateUserStmt = db.prepare(`
    UPDATE users
    SET email = COALESCE(@email, email),
        displayName = COALESCE(@displayName, displayName),
        avatarUrl = COALESCE(@avatarUrl, avatarUrl),
        updatedAt = @updatedAt
    WHERE id = @id
  `);

  const getUserByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');

  const getUserByProviderExternalIdStmt = db.prepare(`
    SELECT users.*
    FROM users
    INNER JOIN user_connections ON user_connections.userId = users.id
    WHERE user_connections.provider = @provider
      AND user_connections.externalId = @externalId
    LIMIT 1
  `);

  const upsertConnectionStmt = db.prepare(`
    INSERT INTO user_connections (
      id, userId, provider, externalId, accessToken, refreshToken,
      apiKey, metadata, createdAt, updatedAt
    ) VALUES (
      @id, @userId, @provider, @externalId, @accessToken, @refreshToken,
      @apiKey, @metadata, @createdAt, @updatedAt
    )
    ON CONFLICT(userId, provider) DO UPDATE SET
      externalId = excluded.externalId,
      accessToken = excluded.accessToken,
      refreshToken = excluded.refreshToken,
      apiKey = excluded.apiKey,
      metadata = excluded.metadata,
      updatedAt = excluded.updatedAt
  `);

  const getUserConnectionStmt = db.prepare(`
    SELECT *
    FROM user_connections
    WHERE userId = @userId AND provider = @provider
    LIMIT 1
  `);

  const listUserConnectionsStmt = db.prepare(`
    SELECT *
    FROM user_connections
    WHERE userId = @userId
    ORDER BY provider ASC
  `);

  const deleteUserConnectionStmt = db.prepare(`
    DELETE FROM user_connections
    WHERE userId = @userId AND provider = @provider
  `);

  const getUserSettingsRowsStmt = db.prepare(`
    SELECT key, value
    FROM user_settings
    WHERE userId = @userId
  `);

  const getUserSettingStmt = db.prepare(`
    SELECT value
    FROM user_settings
    WHERE userId = @userId AND key = @key
    LIMIT 1
  `);

  const upsertUserSettingStmt = db.prepare(`
    INSERT INTO user_settings (userId, key, value)
    VALUES (@userId, @key, @value)
    ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value
  `);

  const insertClipStmt = db.prepare(`
    INSERT INTO clips (
      id, userId, title, platform, channel, duration, fileSize, filePath, thumbnailPath,
      tags, source, combinedScore, shareToken, createdAt
    ) VALUES (
      @id, @userId, @title, @platform, @channel, @duration, @fileSize, @filePath, @thumbnailPath,
      @tags, @source, @combinedScore, @shareToken, @createdAt
    )
  `);

  const getClipByIdStmt = db.prepare(`
    SELECT *
    FROM clips
    WHERE id = @id AND userId = @userId
    LIMIT 1
  `);

  const getClipByShareTokenStmt = db.prepare('SELECT * FROM clips WHERE shareToken = ?');

  const updateClipStmt = db.prepare(`
    UPDATE clips
    SET title = COALESCE(@title, title),
        tags = COALESCE(@tags, tags)
    WHERE id = @id AND userId = @userId
  `);

  const updateClipMediaStmt = db.prepare(`
    UPDATE clips
    SET duration = COALESCE(@duration, duration),
        fileSize = COALESCE(@fileSize, fileSize),
        filePath = COALESCE(@filePath, filePath),
        thumbnailPath = COALESCE(@thumbnailPath, thumbnailPath)
    WHERE id = @id AND userId = @userId
  `);

  const deleteClipStmt = db.prepare('DELETE FROM clips WHERE id = @id AND userId = @userId');
  const totalClipStorageStmt = db.prepare('SELECT COALESCE(SUM(fileSize), 0) AS total FROM clips');
  const listExpiredClipsStmt = db.prepare(`
    SELECT id, userId, filePath, thumbnailPath, fileSize, createdAt
    FROM clips
    WHERE createdAt < @cutoffIso
    ORDER BY createdAt ASC
  `);

  const insertUploadJobStmt = db.prepare(`
    INSERT INTO upload_jobs (id, userId, filePath, status, duration, candidatesJson, createdAt)
    VALUES (@id, @userId, @filePath, @status, @duration, @candidatesJson, @createdAt)
  `);

  const updateUploadJobStmt = db.prepare(`
    UPDATE upload_jobs
    SET filePath = COALESCE(@filePath, filePath),
        status = COALESCE(@status, status),
        duration = COALESCE(@duration, duration),
        candidatesJson = COALESCE(@candidatesJson, candidatesJson)
    WHERE id = @id AND userId = @userId
  `);

  const getUploadJobStmt = db.prepare(`
    SELECT *
    FROM upload_jobs
    WHERE id = @id AND userId = @userId
    LIMIT 1
  `);

  return {
    createUser(user) {
      const timestamp = new Date().toISOString();
      const payload = {
        id: user.id || randomUUID(),
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        avatarUrl: user.avatarUrl ?? null,
        createdAt: user.createdAt || timestamp,
        updatedAt: user.updatedAt || timestamp,
      };

      insertUserStmt.run(payload);
      return this.getUserById(payload.id);
    },

    getUserById(id) {
      return getUserByIdStmt.get(id) || null;
    },

    updateUser(id, payload = {}) {
      updateUserStmt.run({
        id,
        email: payload.email ?? null,
        displayName: payload.displayName ?? null,
        avatarUrl: payload.avatarUrl ?? null,
        updatedAt: new Date().toISOString(),
      });
      return this.getUserById(id);
    },

    getUserByProviderExternalId(provider, externalId) {
      if (!provider || !externalId) {
        return null;
      }

      return (
        getUserByProviderExternalIdStmt.get({
          provider,
          externalId,
        }) || null
      );
    },

    upsertUserConnection(connection = {}) {
      const timestamp = new Date().toISOString();
      upsertConnectionStmt.run({
        id: connection.id || randomUUID(),
        userId: connection.userId,
        provider: connection.provider,
        externalId: connection.externalId ?? null,
        accessToken: connection.accessToken ?? null,
        refreshToken: connection.refreshToken ?? null,
        apiKey: connection.apiKey ?? null,
        metadata: JSON.stringify(connection.metadata || {}),
        createdAt: connection.createdAt || timestamp,
        updatedAt: timestamp,
      });

      return this.getUserConnection(connection.userId, connection.provider);
    },

    getUserConnection(userId, provider) {
      return mapUserConnectionRow(getUserConnectionStmt.get({ userId, provider }));
    },

    listUserConnections(userId) {
      const rows = listUserConnectionsStmt.all({ userId });
      return rows.map(mapUserConnectionRow);
    },

    deleteUserConnection(userId, provider) {
      return deleteUserConnectionStmt.run({ userId, provider });
    },

    getUserSettings(userId) {
      const rows = getUserSettingsRowsStmt.all({ userId });
      const userValues = rows.reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {});

      return {
        ...DEFAULT_SETTINGS,
        ...userValues,
      };
    },

    getUserSetting(userId, key) {
      const row = getUserSettingStmt.get({ userId, key });
      if (row) {
        return row.value;
      }

      return Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)
        ? DEFAULT_SETTINGS[key]
        : null;
    },

    upsertUserSettings(userId, values = {}) {
      const entries = Object.entries(values);
      const write = db.transaction((items) => {
        for (const [key, value] of items) {
          upsertUserSettingStmt.run({
            userId,
            key,
            value: String(value),
          });
        }
      });

      write(entries);
      return this.getUserSettings(userId);
    },

    insertClip(clip) {
      insertClipStmt.run({
        ...clip,
        tags: Array.isArray(clip.tags) ? clip.tags.join(',') : clip.tags || '',
      });

      return this.getClipById(clip.userId, clip.id);
    },

    listClips(userId, filters = {}) {
      const where = ['userId = @userId'];
      const params = { userId };

      if (filters.platform) {
        where.push('platform = @platform');
        params.platform = filters.platform;
      }

      if (filters.source) {
        where.push('source = @source');
        params.source = filters.source;
      }

      if (filters.search) {
        where.push('(title LIKE @search OR channel LIKE @search OR tags LIKE @search)');
        params.search = `%${filters.search}%`;
      }

      if (filters.tags) {
        const tags = String(filters.tags)
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);

        tags.forEach((tag, index) => {
          const key = `tag${index}`;
          where.push(`tags LIKE @${key}`);
          params[key] = `%${tag}%`;
        });
      }

      const sortMap = {
        newest: 'createdAt DESC',
        oldest: 'createdAt ASC',
        duration: 'duration DESC',
        detection: 'source ASC, createdAt DESC',
      };

      const sortClause = sortMap[filters.sort] || sortMap.newest;
      const query = `SELECT * FROM clips WHERE ${where.join(' AND ')} ORDER BY ${sortClause}`;
      const rows = db.prepare(query).all(params);

      return rows.map(mapClipRow);
    },

    getClipById(userId, id) {
      return mapClipRow(getClipByIdStmt.get({ userId, id }));
    },

    getClipByShareToken(token) {
      return mapClipRow(getClipByShareTokenStmt.get(token));
    },

    updateClip(userId, id, payload = {}) {
      updateClipStmt.run({
        userId,
        id,
        title: payload.title ?? null,
        tags: Array.isArray(payload.tags)
          ? payload.tags.join(',')
          : payload.tags ?? null,
      });

      return this.getClipById(userId, id);
    },

    updateClipMedia(userId, id, payload = {}) {
      updateClipMediaStmt.run({
        userId,
        id,
        duration: payload.duration ?? null,
        fileSize: payload.fileSize ?? null,
        filePath: payload.filePath ?? null,
        thumbnailPath: payload.thumbnailPath ?? null,
      });

      return this.getClipById(userId, id);
    },

    deleteClip(userId, id) {
      return deleteClipStmt.run({ userId, id });
    },

    getTotalClipStorageBytes() {
      const row = totalClipStorageStmt.get();
      return Number(row?.total || 0);
    },

    listExpiredClips(cutoffIso) {
      const rows = listExpiredClipsStmt.all({ cutoffIso });
      return rows.map((row) => ({
        ...row,
        fileSize: Number(row.fileSize || 0),
      }));
    },

    createUploadJob(job) {
      insertUploadJobStmt.run({
        ...job,
        candidatesJson: job.candidatesJson || '[]',
      });
      return this.getUploadJob(job.userId, job.id);
    },

    updateUploadJob(userId, id, payload = {}) {
      let candidatesJson = null;
      if (Object.prototype.hasOwnProperty.call(payload, 'candidatesJson')) {
        if (typeof payload.candidatesJson === 'string') {
          candidatesJson = payload.candidatesJson;
        } else {
          candidatesJson = JSON.stringify(payload.candidatesJson || []);
        }
      }

      updateUploadJobStmt.run({
        userId,
        id,
        filePath: payload.filePath ?? null,
        status: payload.status ?? null,
        duration: payload.duration ?? null,
        candidatesJson,
      });

      return this.getUploadJob(userId, id);
    },

    getUploadJob(userId, id) {
      return mapUploadRow(getUploadJobStmt.get({ userId, id }));
    },
  };
}

module.exports = {
  createQueries,
};
