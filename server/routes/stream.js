const express = require('express');
const axios = require('axios');
const { resolvePlaybackUrl } = require('../services/clipper');
const { ChatMonitor } = require('../services/chatMonitor');

let cachedTwitchToken = null;
let cachedTwitchTokenExpiry = 0;

async function getTwitchAppToken() {
  const now = Date.now();
  if (cachedTwitchToken && cachedTwitchTokenExpiry > now + 30_000) {
    return cachedTwitchToken;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const response = await axios.post(`https://id.twitch.tv/oauth2/token?${params.toString()}`);
  cachedTwitchToken = response.data.access_token;
  cachedTwitchTokenExpiry = now + Number(response.data.expires_in || 0) * 1000;

  return cachedTwitchToken;
}

async function getTwitchStreamStatus(channel) {
  const token = await getTwitchAppToken();
  const clientId = process.env.TWITCH_CLIENT_ID;

  if (!token || !clientId) {
    return {
      live: false,
      viewers: 0,
    };
  }

  try {
    const response = await axios.get('https://api.twitch.tv/helix/streams', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': clientId,
      },
      params: {
        user_login: channel,
      },
    });

    const stream = response.data?.data?.[0];
    return {
      live: Boolean(stream),
      viewers: Number(stream?.viewer_count || 0),
    };
  } catch (_error) {
    return {
      live: false,
      viewers: 0,
    };
  }
}

async function getKickStreamStatus(channel) {
  try {
    const response = await axios.get(`https://kick.com/api/v2/channels/${channel}`);
    const payload = response.data || {};

    return {
      live: Boolean(payload?.livestream || payload?.stream),
      viewers: Number(payload?.livestream?.viewer_count || payload?.stream?.viewer_count || 0),
    };
  } catch (_error) {
    return {
      live: false,
      viewers: 0,
    };
  }
}

function createStreamRouter({ queries, decryptText = (value) => value }) {
  const router = express.Router();
  const chatMonitors = new Map();

  const monitorKey = (userId, platform, channel) => `${userId}:${platform}:${channel}`;

  function createMonitorEntry({ userId, platform, channel, threshold, kickApiKey }) {
    const key = monitorKey(userId, platform, channel);
    let entry = chatMonitors.get(key);

    if (!entry) {
      const monitor = new ChatMonitor();
      monitor.start({
        platform,
        channel,
        threshold,
        kickApiKey,
      });

      entry = {
        monitor,
        clients: 0,
      };

      chatMonitors.set(key, entry);
    }

    return { key, entry };
  }

  router.get('/status', async (req, res) => {
    try {
      const platform = String(req.query.platform || '').toLowerCase();
      const channel = String(req.query.channel || '').trim();

      if (!platform || !channel) {
        res.status(400).json({ error: 'platform and channel query params are required' });
        return;
      }

      let status;
      if (platform === 'twitch') {
        status = await getTwitchStreamStatus(channel);
      } else if (platform === 'kick') {
        status = await getKickStreamStatus(channel);
      } else {
        res.status(400).json({ error: 'Unsupported platform' });
        return;
      }

      let playbackUrl = '';
      try {
        playbackUrl = await resolvePlaybackUrl(platform, channel);
      } catch (_error) {
        playbackUrl = '';
      }

      res.json({
        ...status,
        platform,
        channel,
        playbackUrl,
        embedUrl:
          platform === 'twitch'
            ? `https://player.twitch.tv/?channel=${channel}&parent=${req.hostname}&muted=true`
            : `https://player.kick.com/${channel}`,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stream status', details: error.message });
    }
  });

  router.get('/chat-activity', (req, res) => {
    try {
      const userId = req.session.userId;
      const platform = String(req.query.platform || '').toLowerCase();
      const channel = String(req.query.channel || '').trim();
      const threshold = Number(queries.getUserSetting(userId, 'chat_threshold') || 70);

      if (!userId) {
        res.status(401).json({ error: 'Missing authenticated user session' });
        return;
      }

      if (!platform || !channel) {
        res.status(400).json({ error: 'platform and channel query params are required' });
        return;
      }

      if (!['twitch', 'kick'].includes(platform)) {
        res.status(400).json({ error: 'Unsupported platform' });
        return;
      }

      const kickConnection = queries.getUserConnection(userId, 'kick');
      let kickApiKey = '';
      if (kickConnection?.apiKey) {
        try {
          kickApiKey = decryptText(kickConnection.apiKey) || '';
        } catch (_error) {
          kickApiKey = '';
        }
      }

      const { key, entry } = createMonitorEntry({
        userId,
        platform,
        channel,
        threshold,
        kickApiKey,
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const onActivity = (payload) => {
        res.write(`event: activity\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      const onSpike = (payload) => {
        res.write(`event: hype_spike\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      entry.monitor.on('activity', onActivity);
      entry.monitor.on('hype_spike', onSpike);

      const history = entry.monitor.getHistory();
      history.forEach((item) => {
        res.write(`event: activity\ndata: ${JSON.stringify(item)}\n\n`);
      });

      const keepAlive = setInterval(() => {
        res.write('event: ping\ndata: {}\n\n');
      }, 15000);

      entry.clients += 1;

      req.on('close', () => {
        clearInterval(keepAlive);

        const current = chatMonitors.get(key);
        if (!current) {
          return;
        }

        current.monitor.off('activity', onActivity);
        current.monitor.off('hype_spike', onSpike);
        current.clients = Math.max(0, current.clients - 1);

        if (current.clients === 0) {
          current.monitor.stop();
          chatMonitors.delete(key);
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to open chat SSE stream', details: error.message });
    }
  });

  return router;
}

module.exports = {
  createStreamRouter,
};
