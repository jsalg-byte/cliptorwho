const fs = require('fs');
const path = require('path');
const express = require('express');
const { clipStream, trimClip } = require('../services/clipper');
const {
  deleteLocationAsset,
  estimateClipBytes,
  formatBytes,
  getStorageBudgetState,
} = require('../services/storagePolicy');

function buildUrl(req, relativePath) {
  return `${req.protocol}://${req.get('host')}${relativePath}`;
}

function toClipResponse(req, clip) {
  if (!clip) {
    return null;
  }

  return {
    ...clip,
    thumbnailUrl: `/api/clips/${clip.id}/thumb`,
    fileUrl: `/api/clips/${clip.id}/file`,
    shareUrl: `${buildUrl(req, `/share/${clip.shareToken}`)}`,
  };
}

async function streamWithRange(req, res, filePath, { objectStorage, contentType = 'video/mp4' } = {}) {
  if (objectStorage?.enabled && objectStorage.isManagedUri(filePath)) {
    const parsed = objectStorage.parseUri(filePath);
    if (!parsed?.key) {
      res.status(404).json({ error: 'Clip file not found' });
      return;
    }

    try {
      const response = await objectStorage.getObject(parsed.key, req.headers.range || '');
      const statusCode = response.ContentRange ? 206 : 200;
      const headers = {
        'Accept-Ranges': 'bytes',
        'Content-Type': response.ContentType || contentType,
      };

      if (response.ContentLength != null) {
        headers['Content-Length'] = String(response.ContentLength);
      }

      if (response.ContentRange) {
        headers['Content-Range'] = response.ContentRange;
      }

      res.writeHead(statusCode, headers);
      response.Body.pipe(res);
      return;
    } catch (error) {
      if (String(error?.name || '').toLowerCase().includes('invalidrange')) {
        res.status(416).end();
        return;
      }

      if (error?.$metadata?.httpStatusCode === 404 || error?.$metadata?.httpStatusCode === 403) {
        res.status(404).json({ error: 'Clip file not found' });
        return;
      }

      throw error;
    }
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Clip file not found' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const [startPart, endPart] = range.replace(/bytes=/, '').split('-');
  const start = Number(startPart);
  const end = endPart ? Number(endPart) : fileSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
    res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  const chunkSize = end - start + 1;
  const stream = fs.createReadStream(filePath, { start, end });

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': 'video/mp4',
  });

  stream.pipe(res);
}

async function streamImageAsset(res, filePath, { objectStorage, fallbackType = 'image/jpeg' } = {}) {
  if (objectStorage?.enabled && objectStorage.isManagedUri(filePath)) {
    const parsed = objectStorage.parseUri(filePath);
    if (!parsed?.key) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }

    try {
      const response = await objectStorage.getObject(parsed.key, '');
      const headers = {
        'Content-Type': response.ContentType || fallbackType,
      };
      if (response.ContentLength != null) {
        headers['Content-Length'] = String(response.ContentLength);
      }

      res.writeHead(200, {
        ...headers,
      });
      response.Body.pipe(res);
      return;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.$metadata?.httpStatusCode === 403) {
        res.status(404).json({ error: 'Thumbnail not found' });
        return;
      }

      throw error;
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Thumbnail not found' });
    return;
  }

  res.sendFile(path.resolve(filePath));
}

function createClipsRouter({ queries, paths, objectStorage }) {
  const router = express.Router();

  router.get('/clips', (req, res) => {
    try {
      const userId = req.session.userId;
      const clips = queries.listClips(userId, {
        platform: req.query.platform,
        tags: req.query.tags,
        source: req.query.source,
        search: req.query.search,
        sort: req.query.sort,
      });

      res.json({ clips: clips.map((clip) => toClipResponse(req, clip)) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list clips', details: error.message });
    }
  });

  router.get('/clips/:id', (req, res) => {
    try {
      const userId = req.session.userId;
      const clip = queries.getClipById(userId, req.params.id);
      if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
      }

      res.json({ clip: toClipResponse(req, clip) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch clip', details: error.message });
    }
  });

  router.post('/clip', async (req, res) => {
    try {
      const userId = req.session.userId;
      const { platform, channel, duration, source = 'manual' } = req.body || {};
      if (!platform || !channel) {
        res.status(400).json({ error: 'platform and channel are required' });
        return;
      }

      const clipDuration = Number(duration || queries.getUserSetting(userId, 'clip_duration') || 30);
      const budget = getStorageBudgetState(queries, estimateClipBytes(clipDuration));
      if (!budget.allowed) {
        res.status(429).json({
          error: `Storage limit reached (${formatBytes(budget.currentBytes)} / ${formatBytes(budget.maxStorageBytes)}). Delete old clips or raise MAX_STORAGE_GB.`,
        });
        return;
      }

      const clip = await clipStream({
        userId,
        platform,
        channel,
        duration: clipDuration,
        source,
        clipsDir: paths.clipsDir,
        thumbsDir: paths.thumbsDir,
        queries,
        objectStorage,
      });

      res.status(201).json({ clip: toClipResponse(req, clip) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create clip', details: error.message });
    }
  });

  router.patch('/clips/:id', (req, res) => {
    try {
      const userId = req.session.userId;
      const clip = queries.getClipById(userId, req.params.id);
      if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
      }

      const payload = {
        title: req.body?.title ?? clip.title,
        tags: req.body?.tags ?? clip.tags,
      };

      const updated = queries.updateClip(userId, req.params.id, payload);
      res.json({ clip: toClipResponse(req, updated) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update clip', details: error.message });
    }
  });

  router.delete('/clips/:id', async (req, res) => {
    try {
      const userId = req.session.userId;
      const clip = queries.getClipById(userId, req.params.id);
      if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
      }

      await deleteLocationAsset(clip.filePath, objectStorage);
      await deleteLocationAsset(clip.thumbnailPath, objectStorage);

      queries.deleteClip(userId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete clip', details: error.message });
    }
  });

  router.post('/clips/:id/trim', async (req, res) => {
    try {
      const userId = req.session.userId;
      const clip = queries.getClipById(userId, req.params.id);
      if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
      }

      const start = Number(req.body?.start);
      const end = Number(req.body?.end);

      if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
        res.status(400).json({ error: 'Invalid start/end range' });
        return;
      }

      const updated = await trimClip({
        userId,
        clip,
        start,
        end,
        clipsDir: paths.clipsDir,
        thumbsDir: paths.thumbsDir,
        queries,
        objectStorage,
      });

      res.json({ clip: toClipResponse(req, updated) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to trim clip', details: error.message });
    }
  });

  router.get('/clips/:id/file', async (req, res) => {
    try {
      const userId = req.session.userId;
      const clip = queries.getClipById(userId, req.params.id);
      if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
      }
      await streamWithRange(req, res, clip.filePath, { objectStorage, contentType: 'video/mp4' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to stream clip file', details: error.message });
    }
  });

  router.get('/clips/:id/thumb', async (req, res) => {
    try {
      const userId = req.session.userId;
      const clip = queries.getClipById(userId, req.params.id);
      if (!clip || !clip.thumbnailPath) {
        res.status(404).json({ error: 'Thumbnail not found' });
        return;
      }

      await streamImageAsset(res, clip.thumbnailPath, { objectStorage, fallbackType: 'image/jpeg' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load thumbnail', details: error.message });
    }
  });

  return router;
}

module.exports = {
  createClipsRouter,
  streamImageAsset,
  streamWithRange,
};
