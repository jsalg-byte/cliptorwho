const express = require('express');
const { streamImageAsset, streamWithRange } = require('./clips');

function createShareRouter({ queries, objectStorage }) {
  const router = express.Router();

  router.get('/:token', (req, res) => {
    try {
      const clip = queries.getClipByShareToken(req.params.token);
      if (!clip) {
        res.status(404).json({ error: 'Shared clip not found' });
        return;
      }

      res.json({
        clip: {
          id: clip.id,
          title: clip.title,
          platform: clip.platform,
          channel: clip.channel,
          duration: clip.duration,
          source: clip.source,
          tags: clip.tags,
          createdAt: clip.createdAt,
          thumbnailUrl: `/api/share/${clip.shareToken}/thumb`,
          fileUrl: `/api/share/${clip.shareToken}/file`,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load shared clip', details: error.message });
    }
  });

  router.get('/:token/file', async (req, res) => {
    try {
      const clip = queries.getClipByShareToken(req.params.token);
      if (!clip) {
        res.status(404).json({ error: 'Shared clip not found' });
        return;
      }

      await streamWithRange(req, res, clip.filePath, { objectStorage, contentType: 'video/mp4' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to stream shared clip', details: error.message });
    }
  });

  router.get('/:token/thumb', async (req, res) => {
    try {
      const clip = queries.getClipByShareToken(req.params.token);
      if (!clip || !clip.thumbnailPath) {
        res.status(404).json({ error: 'Shared thumbnail not found' });
        return;
      }

      await streamImageAsset(res, clip.thumbnailPath, { objectStorage, fallbackType: 'image/jpeg' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load shared thumbnail', details: error.message });
    }
  });

  return router;
}

module.exports = {
  createShareRouter,
};
