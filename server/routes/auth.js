const express = require('express');
const axios = require('axios');
const { randomUUID } = require('crypto');

function createGuestUser(queries) {
  return queries.createUser({
    id: randomUUID(),
    displayName: `Guest ${Math.floor(Math.random() * 100000)}`,
  });
}

function ensureSessionUser(req, queries) {
  if (req.session?.userId) {
    const existing = queries.getUserById(req.session.userId);
    if (existing) {
      return existing;
    }
  }

  const guest = createGuestUser(queries);
  req.session.userId = guest.id;
  req.session.isAuthenticated = true;
  return guest;
}

async function fetchTwitchProfile(accessToken, clientId) {
  const response = await axios.get('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
    },
  });

  return response.data?.data?.[0] || null;
}

function resolveBackendBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BACKEND_URL || '').trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

function resolveTwitchRedirectUri(req) {
  const configured = String(process.env.TWITCH_REDIRECT_URI || '').trim();
  if (configured) {
    return configured;
  }

  return `${resolveBackendBaseUrl(req)}/auth/twitch/callback`;
}

function isTwitchOAuthConfigured() {
  return Boolean(
    String(process.env.TWITCH_CLIENT_ID || '').trim()
      && String(process.env.TWITCH_CLIENT_SECRET || '').trim(),
  );
}

function buildFrontendSettingsRedirect(frontendUrl, params = {}) {
  const url = new URL('/settings', frontendUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function safeDecryptMaybe(value, decryptText) {
  if (!value) {
    return null;
  }

  try {
    return decryptText(value);
  } catch (_error) {
    return null;
  }
}

function createAuthRouter({ queries, frontendUrl, encryptText, decryptText }) {
  const router = express.Router();

  router.get('/twitch', (req, res) => {
    try {
      const clientId = process.env.TWITCH_CLIENT_ID;
      const redirectUri = resolveTwitchRedirectUri(req);

      if (!isTwitchOAuthConfigured() || !clientId) {
        res.redirect(
          buildFrontendSettingsRedirect(frontendUrl, {
            oauth_error: 'twitch_not_configured',
          }),
        );
        return;
      }

      const state = randomUUID();
      req.session.twitchOAuthState = state;
      req.session.twitchOAuthRedirectUri = redirectUri;

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'user:read:email chat:read',
        force_verify: 'true',
        state,
      });

      res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
    } catch (error) {
      res.status(500).json({ error: 'Failed to start Twitch OAuth', details: error.message });
    }
  });

  router.get('/twitch/callback', async (req, res) => {
    try {
      const code = req.query.code;
      const state = String(req.query.state || '');

      if (!code) {
        res.redirect(
          buildFrontendSettingsRedirect(frontendUrl, {
            oauth_error: 'missing_code',
          }),
        );
        return;
      }

      if (!state || state !== req.session.twitchOAuthState) {
        res.redirect(
          buildFrontendSettingsRedirect(frontendUrl, {
            oauth_error: 'invalid_state',
          }),
        );
        return;
      }

      const clientId = process.env.TWITCH_CLIENT_ID;
      const clientSecret = process.env.TWITCH_CLIENT_SECRET;
      const redirectUri = req.session.twitchOAuthRedirectUri || resolveTwitchRedirectUri(req);

      if (!isTwitchOAuthConfigured() || !clientId || !clientSecret || !redirectUri) {
        res.redirect(
          buildFrontendSettingsRedirect(frontendUrl, {
            oauth_error: 'twitch_not_configured',
          }),
        );
        return;
      }

      const tokenParams = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

      const tokenResponse = await axios.post(
        `https://id.twitch.tv/oauth2/token?${tokenParams.toString()}`,
      );

      const twitchProfile = await fetchTwitchProfile(tokenResponse.data.access_token, clientId);
      if (!twitchProfile?.id) {
        res.status(500).json({ error: 'Unable to fetch Twitch user profile' });
        return;
      }

      const sessionUser = req.session?.userId ? queries.getUserById(req.session.userId) : null;
      let user = queries.getUserByProviderExternalId('twitch', twitchProfile.id);

      if (user) {
        user = queries.updateUser(user.id, {
          email: twitchProfile.email || user.email,
          displayName: twitchProfile.display_name || twitchProfile.login || user.displayName,
          avatarUrl: twitchProfile.profile_image_url || user.avatarUrl,
        });
      } else if (sessionUser) {
        user = queries.updateUser(sessionUser.id, {
          email: twitchProfile.email || sessionUser.email,
          displayName: twitchProfile.display_name || twitchProfile.login || sessionUser.displayName,
          avatarUrl: twitchProfile.profile_image_url || sessionUser.avatarUrl,
        });
      } else {
        user = queries.createUser({
          id: randomUUID(),
          email: twitchProfile.email || null,
          displayName: twitchProfile.display_name || twitchProfile.login || 'Twitch User',
          avatarUrl: twitchProfile.profile_image_url || null,
        });
      }

      queries.upsertUserConnection({
        userId: user.id,
        provider: 'twitch',
        externalId: twitchProfile.id,
        accessToken: encryptText(tokenResponse.data.access_token),
        refreshToken: encryptText(tokenResponse.data.refresh_token),
        metadata: {
          login: twitchProfile.login,
          displayName: twitchProfile.display_name,
          email: twitchProfile.email,
          expiresIn: tokenResponse.data.expires_in,
          tokenType: tokenResponse.data.token_type,
        },
      });

      req.session.userId = user.id;
      req.session.isAuthenticated = true;
      req.session.twitchOAuthState = null;
      req.session.twitchOAuthRedirectUri = null;

      req.session.save(() => {
        const redirectTarget = buildFrontendSettingsRedirect(frontendUrl, {
          connected: 'twitch',
        });
        res.redirect(redirectTarget);
      });
    } catch (error) {
      req.session.twitchOAuthState = null;
      req.session.twitchOAuthRedirectUri = null;
      res.redirect(
        buildFrontendSettingsRedirect(frontendUrl, {
          oauth_error: 'twitch_callback_failed',
        }),
      );
    }
  });

  router.post('/kick', (req, res) => {
    try {
      const apiKey = String(req.body?.apiKey || '').trim();
      if (!apiKey) {
        res.status(400).json({ error: 'Kick API key is required' });
        return;
      }

      const user = ensureSessionUser(req, queries);
      queries.upsertUserConnection({
        userId: user.id,
        provider: 'kick',
        apiKey: encryptText(apiKey),
        metadata: {
          connectedAt: new Date().toISOString(),
        },
      });

      req.session.userId = user.id;
      req.session.isAuthenticated = true;

      req.session.save(() => {
        res.json({ success: true });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save Kick API key', details: error.message });
    }
  });

  router.post('/disconnect/:provider', (req, res) => {
    try {
      const provider = String(req.params.provider || '').toLowerCase();
      if (!['twitch', 'kick'].includes(provider)) {
        res.status(400).json({ error: 'Unsupported provider' });
        return;
      }

      const userId = req.session?.userId;
      const user = userId ? queries.getUserById(userId) : null;
      if (!user) {
        res.status(401).json({ error: 'No active session user to disconnect' });
        return;
      }

      queries.deleteUserConnection(user.id, provider);
      const connections = queries.listUserConnections(user.id);
      const hasConnectedPlatform = connections.some(
        (connection) => connection.provider === 'twitch' || connection.provider === 'kick',
      );
      req.session.isAuthenticated = hasConnectedPlatform;

      req.session.save(() => {
        res.json({
          success: true,
          authenticated: hasConnectedPlatform,
        });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to disconnect provider', details: error.message });
    }
  });

  router.get('/status', (req, res) => {
    try {
      const user = req.session?.userId ? queries.getUserById(req.session.userId) : null;
      if (!user) {
        res.json({
          authenticated: false,
          twitchConfigured: isTwitchOAuthConfigured(),
          twitch: false,
          kick: false,
          user: null,
        });
        return;
      }

      const twitchConnection = queries.getUserConnection(user.id, 'twitch');
      const kickConnection = queries.getUserConnection(user.id, 'kick');

      const kickConnected = Boolean(kickConnection?.apiKey && safeDecryptMaybe(kickConnection.apiKey, decryptText));
      const hasConnectedPlatform = Boolean(twitchConnection?.accessToken || kickConnected);
      const twitchLogin = twitchConnection?.metadata?.login || null;
      if (!hasConnectedPlatform && req.session?.isAuthenticated) {
        req.session.isAuthenticated = false;
      }

      res.json({
        authenticated: hasConnectedPlatform,
        twitchConfigured: isTwitchOAuthConfigured(),
        twitch: Boolean(twitchConnection?.accessToken),
        kick: kickConnected,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        defaults: {
          platform: twitchConnection?.accessToken ? 'twitch' : null,
          channel: twitchLogin,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch auth status', details: error.message });
    }
  });

  router.post('/logout', (req, res) => {
    try {
      req.session.destroy((error) => {
        if (error) {
          res.status(500).json({ error: 'Failed to logout', details: error.message });
          return;
        }

        res.json({ success: true });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to logout', details: error.message });
    }
  });

  return router;
}

module.exports = {
  createAuthRouter,
  ensureSessionUser,
};
