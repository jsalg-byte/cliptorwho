const fs = require('fs');
const path = require('path');
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const { randomUUID } = require('crypto');
const { analyzeAudio } = require('../services/audioAnalyzer');
const { analyzeMotion, removeDirRecursive } = require('../services/motionAnalyzer');
const { scoreHighlights } = require('../services/highlightScorer');
const {
  createUploader,
  ensureDir,
  probeDuration,
  safeUnlink,
  validateVideoFile,
} = require('../services/uploader');
const {
  estimateClipBytes,
  formatBytes,
  getStorageBudgetState,
} = require('../services/storagePolicy');

function runFfmpeg(configure) {
  return new Promise((resolve, reject) => {
    const command = configure(ffmpeg());
    command
      .on('error', (error) => reject(error))
      .on('end', () => resolve())
      .run();
  });
}

async function extractFrameThumbnail(sourceFile, second, outputPath) {
  await runFfmpeg((command) =>
    command
      .input(sourceFile)
      .outputOptions(['-y', '-ss', String(Math.max(0, second)), '-vframes', '1'])
      .output(outputPath),
  );
}

function parseTags(input) {
  if (Array.isArray(input)) {
    return input.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function createUploadRouter({ queries, paths, objectStorage }) {
  const router = express.Router();
  const upload = createUploader(paths.uploadsDir);

  const progressChannels = new Map();
  const progressKey = (userId, uploadId) => `${userId}:${uploadId}`;

  function getChannel(channelId) {
    if (!progressChannels.has(channelId)) {
      progressChannels.set(channelId, {
        listeners: new Set(),
        last: null,
      });
    }

    return progressChannels.get(channelId);
  }

  function publish(channelId, payload) {
    const channel = getChannel(channelId);
    channel.last = payload;

    for (const client of channel.listeners) {
      client.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  function subscribe(channelId, res) {
    const channel = getChannel(channelId);
    channel.listeners.add(res);
    return channel;
  }

  function unsubscribe(channelId, res) {
    const channel = progressChannels.get(channelId);
    if (!channel) {
      return;
    }

    channel.listeners.delete(res);
    if (channel.listeners.size === 0 && channel.last?.phase === 'done') {
      progressChannels.delete(channelId);
    }
  }

  async function analyzeUpload(userId, uploadId, filePath, duration) {
    const channelId = progressKey(userId, uploadId);
    const settings = queries.getUserSettings(userId);
    const clipDuration = Number(settings.clip_duration || 30);
    const uploadMinScore = Number(settings.upload_min_score || 50);

    const frameDir = path.join(paths.framesDir, uploadId);
    ensureDir(frameDir);

    try {
      queries.updateUploadJob(userId, uploadId, { status: 'analyzing' });

      publish(channelId, {
        phase: 'Analyzing audio...',
        progress: 20,
      });

      const audioResult = await analyzeAudio(filePath);

      publish(channelId, {
        phase: 'Analyzing motion...',
        progress: 50,
      });

      const motionResult = await analyzeMotion(filePath, frameDir);

      publish(channelId, {
        phase: 'Scoring highlights...',
        progress: 72,
      });

      const scored = scoreHighlights({
        audioTimeline: audioResult.timeline,
        motionTimeline: motionResult.timeline,
        duration,
        clipDuration,
        minScore: uploadMinScore,
      });

      const candidates = [];
      for (let i = 0; i < scored.candidates.length; i += 1) {
        const candidate = scored.candidates[i];
        const thumbnailName = `upload_${uploadId}_${candidate.id}.jpg`;
        const thumbnailPath = path.join(paths.thumbsDir, thumbnailName);
        await extractFrameThumbnail(filePath, candidate.peakSecond, thumbnailPath);

        candidates.push({
          ...candidate,
          thumbnailPath,
          thumbnailUrl: `/thumbs/${thumbnailName}`,
        });

        publish(channelId, {
          phase: 'Scoring highlights...',
          progress: Number((72 + ((i + 1) / Math.max(1, scored.candidates.length)) * 26).toFixed(2)),
        });
      }

      queries.updateUploadJob(userId, uploadId, {
        status: 'ready',
        candidatesJson: candidates,
      });

      publish(channelId, {
        phase: 'done',
        progress: 100,
        ready: true,
      });
    } catch (error) {
      queries.updateUploadJob(userId, uploadId, {
        status: 'error',
      });

      publish(channelId, {
        phase: 'error',
        progress: 100,
        error: error.message,
      });
    } finally {
      removeDirRecursive(frameDir);
    }
  }

  router.post('/', upload.single('file'), async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Use field name "file"' });
        return;
      }

      await validateVideoFile(req.file.path);
      const duration = await probeDuration(req.file.path);
      const uploadId = randomUUID();

      queries.createUploadJob({
        id: uploadId,
        userId,
        filePath: req.file.path,
        status: 'uploading',
        duration,
        candidatesJson: '[]',
        createdAt: new Date().toISOString(),
      });

      publish(progressKey(userId, uploadId), {
        phase: 'Uploading...',
        progress: 10,
      });

      analyzeUpload(userId, uploadId, req.file.path, duration);

      res.status(202).json({
        uploadId,
        duration,
        filePath: req.file.path,
      });
    } catch (error) {
      if (req.file?.path) {
        safeUnlink(req.file.path);
      }
      res.status(500).json({ error: 'Upload failed', details: error.message });
    }
  });

  router.get('/:id/status', (req, res) => {
    try {
      const userId = req.session.userId;
      const uploadId = req.params.id;
      const channelId = progressKey(userId, uploadId);
      const job = queries.getUploadJob(userId, uploadId);
      if (!job) {
        res.status(404).json({ error: 'Upload job not found' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const channel = subscribe(channelId, res);

      if (channel.last) {
        res.write(`data: ${JSON.stringify(channel.last)}\n\n`);
      } else {
        res.write(
          `data: ${JSON.stringify({
            phase: job.status,
            progress: job.status === 'ready' ? 100 : 0,
          })}\n\n`,
        );
      }

      const keepAlive = setInterval(() => {
        res.write('event: ping\ndata: {}\n\n');
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAlive);
        unsubscribe(channelId, res);
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to open upload status stream', details: error.message });
    }
  });

  router.get('/:id/candidates', (req, res) => {
    try {
      const userId = req.session.userId;
      const job = queries.getUploadJob(userId, req.params.id);
      if (!job) {
        res.status(404).json({ error: 'Upload job not found' });
        return;
      }

      if (job.status !== 'ready' && job.status !== 'done') {
        res.status(409).json({ error: 'Upload analysis is not complete', status: job.status });
        return;
      }

      res.json({
        uploadId: job.id,
        duration: job.duration,
        candidates: job.candidates,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch candidates', details: error.message });
    }
  });

  router.post('/save-approved', async (req, res) => {
    try {
      const userId = req.session.userId;
      const uploadId = String(req.body?.uploadId || '');
      const approved = Array.isArray(req.body?.approved) ? req.body.approved : [];
      const channelId = progressKey(userId, uploadId);

      if (!uploadId) {
        res.status(400).json({ error: 'uploadId is required' });
        return;
      }

      const job = queries.getUploadJob(userId, uploadId);
      if (!job) {
        res.status(404).json({ error: 'Upload job not found' });
        return;
      }

      queries.updateUploadJob(userId, uploadId, { status: 'saving' });
      publish(channelId, {
        phase: 'Saving approved clips...',
        progress: 0,
      });

      if (!approved.length) {
        queries.updateUploadJob(userId, uploadId, { status: 'done' });
        publish(channelId, {
          phase: 'done',
          progress: 100,
        });

        res.json({ saved: [] });
        return;
      }

      const candidateById = job.candidates.reduce((acc, candidate) => {
        acc[candidate.id] = candidate;
        return acc;
      }, {});

      const totalEstimatedBytes = approved.reduce((sum, item) => {
        const sourceCandidate = candidateById[item.id] || {};
        const start = Math.max(0, Number(item.start || sourceCandidate.start || 0));
        const end = Math.max(start + 0.1, Number(item.end || sourceCandidate.end || start + 30));
        return sum + estimateClipBytes(end - start);
      }, 0);

      const budget = getStorageBudgetState(queries, totalEstimatedBytes);
      if (!budget.allowed) {
        queries.updateUploadJob(userId, uploadId, { status: 'ready' });
        res.status(429).json({
          error: `Storage limit reached (${formatBytes(budget.currentBytes)} / ${formatBytes(budget.maxStorageBytes)}). Delete old clips or raise MAX_STORAGE_GB.`,
        });
        return;
      }

      const saved = [];
      for (let i = 0; i < approved.length; i += 1) {
        const item = approved[i];
        const sourceCandidate = candidateById[item.id] || {};

        const clipId = randomUUID();
        const outputPath = path.join(paths.clipsDir, `${clipId}.mp4`);
        const thumbnailPath = path.join(paths.thumbsDir, `${clipId}.jpg`);

        const start = Math.max(0, Number(item.start || sourceCandidate.start || 0));
        const end = Math.max(start + 0.1, Number(item.end || sourceCandidate.end || start + 30));

        await runFfmpeg((command) =>
          command
            .input(job.filePath)
            .outputOptions([
              '-y',
              '-ss',
              String(start),
              '-to',
              String(end),
              '-c:v',
              'libx264',
              '-preset',
              'veryfast',
              '-crf',
              '23',
              '-c:a',
              'aac',
            ])
            .output(outputPath),
        );

        await extractFrameThumbnail(outputPath, 1, thumbnailPath);
        const fileSize = fs.statSync(outputPath).size;

        let storedFilePath = outputPath;
        let storedThumbPath = thumbnailPath;

        if (objectStorage?.enabled) {
          storedFilePath = await objectStorage.uploadFile(outputPath, `clips/${clipId}.mp4`, {
            contentType: 'video/mp4',
            cacheControl: 'public, max-age=31536000, immutable',
          });
          storedThumbPath = await objectStorage.uploadFile(thumbnailPath, `thumbs/${clipId}.jpg`, {
            contentType: 'image/jpeg',
            cacheControl: 'public, max-age=31536000, immutable',
          });

          safeUnlink(outputPath);
          safeUnlink(thumbnailPath);
        }

        const tags = ['upload', ...parseTags(item.tags)];
        const clip = queries.insertClip({
          id: clipId,
          userId,
          title: String(item.title || `Upload highlight ${i + 1}`),
          platform: 'upload',
          channel: 'uploaded-recording',
          duration: Number((end - start).toFixed(2)),
          fileSize,
          filePath: storedFilePath,
          thumbnailPath: storedThumbPath,
          tags,
          source: 'upload',
          combinedScore: sourceCandidate.combinedScore || null,
          shareToken: randomUUID().replace(/-/g, '').slice(0, 16),
          createdAt: new Date().toISOString(),
        });

        saved.push(clip.id);

        publish(channelId, {
          phase: 'Saving approved clips...',
          progress: Number((((i + 1) / approved.length) * 100).toFixed(2)),
        });
      }

      queries.updateUploadJob(userId, uploadId, { status: 'done' });
      publish(channelId, {
        phase: 'done',
        progress: 100,
      });

      safeUnlink(job.filePath);
      removeDirRecursive(path.join(paths.framesDir, uploadId));

      res.json({ saved });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save approved clips', details: error.message });
    }
  });

  return router;
}

module.exports = {
  createUploadRouter,
};
