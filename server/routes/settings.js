const express = require('express');

const NUMERIC_KEYS = new Set([
  'clip_duration',
  'audio_threshold',
  'motion_threshold',
  'chat_threshold',
  'upload_min_score',
]);

const BOOLEAN_KEYS = new Set(['auto_save_uploads']);

function coerceValue(key, value) {
  if (NUMERIC_KEYS.has(key)) {
    return Number(value);
  }

  if (BOOLEAN_KEYS.has(key)) {
    return value === true || value === 'true';
  }

  return value;
}

function createSettingsRouter({ queries }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    try {
      const userId = req.session.userId;
      const raw = queries.getUserSettings(userId);
      const settings = Object.entries(raw).reduce((acc, [key, value]) => {
        acc[key] = coerceValue(key, value);
        return acc;
      }, {});

      res.json({ settings });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings', details: error.message });
    }
  });

  router.post('/', (req, res) => {
    try {
      const userId = req.session.userId;
      const updates = req.body || {};
      if (!Object.keys(updates).length) {
        res.status(400).json({ error: 'No settings payload provided' });
        return;
      }

      const next = queries.upsertUserSettings(userId, updates);
      const settings = Object.entries(next).reduce((acc, [key, value]) => {
        acc[key] = coerceValue(key, value);
        return acc;
      }, {});

      res.json({ settings });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save settings', details: error.message });
    }
  });

  return router;
}

module.exports = {
  createSettingsRouter,
};
