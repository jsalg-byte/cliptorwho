const { EventEmitter } = require('events');
let WSClass = globalThis.WebSocket;
if (!WSClass) {
  try {
    WSClass = require('ws');
  } catch (_error) {
    WSClass = null;
  }
}

const HYPE_KEYWORDS = [
  'pogchamp',
  'pog',
  'omegalul',
  'kekw',
  'lul',
  'clip',
  'insane',
  'no way',
  'w',
  'lets go',
  'bro',
  'what',
  'actual clip',
  'poggers',
  'monkas',
];

const CHAT_WINDOW_MS = 10_000;
const HISTORY_SECONDS = 120;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class ChatMonitor extends EventEmitter {
  constructor() {
    super();
    this.platform = null;
    this.channel = null;
    this.threshold = 70;
    this.window = [];
    this.history = [];
    this.timer = null;
    this.pollTimer = null;
    this.lastSpikeAt = 0;
    this.kickCursor = null;
    this.twitchSocket = null;
  }

  start({ platform, channel, threshold = 70, kickApiKey = '' }) {
    this.stop();

    this.platform = platform;
    this.channel = channel;
    this.threshold = Number(threshold || 70);
    this.kickApiKey = kickApiKey;
    this.window = [];
    this.history = [];
    this.lastSpikeAt = 0;

    this.timer = setInterval(() => {
      this.emitActivity();
    }, 1000);

    if (platform === 'twitch') {
      this.startTwitchSocket(channel);
    }

    if (platform === 'kick') {
      this.startKickPolling(channel);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.twitchSocket) {
      this.twitchSocket.close();
      this.twitchSocket = null;
    }

    this.platform = null;
    this.channel = null;
    this.window = [];
    this.history = [];
    this.kickCursor = null;
  }

  addMessage(messageText = '') {
    const now = Date.now();
    const text = String(messageText || '').toLowerCase();
    const weight = HYPE_KEYWORDS.some((keyword) => text.includes(keyword)) ? 2 : 1;

    this.window.push({ timestamp: now, weight });
    this.pruneWindow(now);
  }

  pruneWindow(now = Date.now()) {
    const cutoff = now - CHAT_WINDOW_MS;
    this.window = this.window.filter((item) => item.timestamp >= cutoff);
  }

  getRate() {
    const now = Date.now();
    this.pruneWindow(now);

    const totalWeight = this.window.reduce((sum, item) => sum + item.weight, 0);
    return Number((totalWeight / 10).toFixed(2));
  }

  getBaseline() {
    if (!this.history.length) {
      return 0.5;
    }

    const sum = this.history.reduce((acc, item) => acc + item.messagesPerSec, 0);
    return Math.max(0.5, sum / this.history.length);
  }

  emitActivity() {
    const messagesPerSec = this.getRate();
    const baseline = this.getBaseline();
    const ratio = messagesPerSec / baseline;
    const normalized = Number(clamp((ratio - 1) * 50 + 50, 0, 100).toFixed(2));
    const now = Date.now();

    let spike = normalized >= this.threshold;
    if (spike && now - this.lastSpikeAt < 30_000) {
      spike = false;
    }

    if (spike) {
      this.lastSpikeAt = now;
    }

    const payload = {
      timestamp: now,
      platform: this.platform,
      channel: this.channel,
      messagesPerSec,
      normalized,
      threshold: this.threshold,
      spike,
    };

    this.history.push(payload);
    if (this.history.length > HISTORY_SECONDS) {
      this.history = this.history.slice(-HISTORY_SECONDS);
    }

    this.emit('activity', payload);

    if (spike) {
      this.emit('hype_spike', payload);
    }
  }

  startTwitchSocket(channel) {
    if (!WSClass) {
      return;
    }

    const nick = `justinfan${Math.floor(Math.random() * 100000)}`;
    const socket = new WSClass('wss://irc-ws.chat.twitch.tv:443');
    this.twitchSocket = socket;

    const handleOpen = () => {
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
      socket.send('PASS SCHMOOPIIE');
      socket.send(`NICK ${nick}`);
      socket.send(`JOIN #${channel}`);
    };

    const handleMessage = (eventOrData) => {
      const raw = typeof eventOrData === 'string'
        ? eventOrData
        : eventOrData?.data ?? eventOrData?.toString?.() ?? '';

      const lines = String(raw).split('\r\n').filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('PING')) {
          socket.send(line.replace('PING', 'PONG'));
          continue;
        }

        if (!line.includes('PRIVMSG')) {
          continue;
        }

        const splitAt = line.indexOf(' :');
        const message = splitAt >= 0 ? line.slice(splitAt + 2) : '';
        this.addMessage(message);
      }
    };

    const handleError = () => {
      // Keep rate stream alive even if IRC fails.
    };

    const handleClose = () => {
      this.twitchSocket = null;
    };

    if (typeof socket.on === 'function') {
      socket.on('open', handleOpen);
      socket.on('message', handleMessage);
      socket.on('error', handleError);
      socket.on('close', handleClose);
      return;
    }

    socket.onopen = handleOpen;
    socket.onmessage = handleMessage;
    socket.onerror = handleError;
    socket.onclose = handleClose;
  }

  async pollKickMessages(channel) {
    const response = await fetch(`https://kick.com/api/v2/channels/${channel}/messages`, {
      headers: {
        Accept: 'application/json',
        ...(this.kickApiKey ? { Authorization: `Bearer ${this.kickApiKey}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Kick chat API failed with status ${response.status}`);
    }

    const payload = await response.json();
    const messages = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

    const unseen = [];
    for (const message of messages) {
      if (this.kickCursor && Number(message.id) <= this.kickCursor) {
        continue;
      }
      unseen.push(message);
    }

    unseen
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
      .forEach((message) => {
        this.addMessage(message.content || message.message || '');
        this.kickCursor = Math.max(this.kickCursor || 0, Number(message.id || 0));
      });
  }

  startKickPolling(channel) {
    const tick = async () => {
      try {
        await this.pollKickMessages(channel);
      } catch (_error) {
        // Keep monitor running even if the poll endpoint is unavailable.
      }
    };

    tick();
    this.pollTimer = setInterval(tick, 5000);
  }

  getHistory() {
    return [...this.history];
  }
}

module.exports = {
  ChatMonitor,
  HYPE_KEYWORDS,
};
