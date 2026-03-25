import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SensitivityDial from '../components/SensitivityDial';
import {
  beginTwitchAuth,
  connectKick,
  disconnectProvider,
  getAuthStatus,
} from '../lib/api';
import { useSettings } from '../hooks/useSettings';

const CLIP_DURATION_OPTIONS = [15, 30, 60, 90];

export default function Settings({ pushToast }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings, updateSetting, updateManySettings, loading } = useSettings();
  const [authStatus, setAuthStatus] = useState({
    twitch: false,
    kick: false,
    twitchConfigured: true,
  });
  const [kickApiKey, setKickApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [wakeWordDraft, setWakeWordDraft] = useState('jarvis');
  const [sensitivityDraft, setSensitivityDraft] = useState({
    audio_threshold: 65,
    motion_threshold: 55,
    chat_threshold: 70,
    upload_min_score: 50,
  });
  const sensitivitySaveTimerRef = useRef(null);
  const pendingSensitivityRef = useRef({});
  const wakeWordSaveTimerRef = useRef(null);

  const refreshAuth = async () => {
    try {
      const status = await getAuthStatus();
      setAuthStatus({
        twitch: Boolean(status.twitch),
        kick: Boolean(status.kick),
        twitchConfigured: status.twitchConfigured !== false,
      });
    } catch (_error) {
      setAuthStatus({ twitch: false, kick: false, twitchConfigured: false });
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  useEffect(() => {
    setSensitivityDraft({
      audio_threshold: Number(settings.audio_threshold),
      motion_threshold: Number(settings.motion_threshold),
      chat_threshold: Number(settings.chat_threshold),
      upload_min_score: Number(settings.upload_min_score),
    });
  }, [
    settings.audio_threshold,
    settings.motion_threshold,
    settings.chat_threshold,
    settings.upload_min_score,
  ]);

  useEffect(() => {
    setWakeWordDraft(String(settings.wake_word || 'jarvis'));
  }, [settings.wake_word]);

  useEffect(() => {
    return () => {
      if (sensitivitySaveTimerRef.current) {
        clearTimeout(sensitivitySaveTimerRef.current);
      }
      if (wakeWordSaveTimerRef.current) {
        clearTimeout(wakeWordSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connected = params.get('connected');
    const oauthError = params.get('oauth_error');

    if (connected === 'twitch') {
      pushToast({ type: 'success', message: 'Twitch connected.' });
    }

    if (oauthError === 'twitch_not_configured') {
      pushToast({
        type: 'error',
        message: 'Twitch OAuth is not configured on the server. Admin must set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in deployment env.',
      });
    } else if (oauthError === 'invalid_state' || oauthError === 'missing_code' || oauthError === 'twitch_callback_failed') {
      pushToast({
        type: 'error',
        message: 'Twitch OAuth failed. Please try connecting again.',
      });
    }

    if (connected || oauthError) {
      navigate('/settings', { replace: true });
      refreshAuth();
    }
  }, [location.search, navigate, pushToast]);

  const updateWithToast = async (key, value) => {
    try {
      await updateSetting(key, value);
      pushToast({ type: 'success', message: 'Settings updated.' });
    } catch (error) {
      pushToast({ type: 'error', message: error?.response?.data?.error || 'Failed to save setting' });
    }
  };

  const scheduleSensitivitySave = (key, value) => {
    setSensitivityDraft((previous) => ({
      ...previous,
      [key]: Number(value),
    }));

    pendingSensitivityRef.current[key] = Number(value);

    if (sensitivitySaveTimerRef.current) {
      clearTimeout(sensitivitySaveTimerRef.current);
    }

    sensitivitySaveTimerRef.current = setTimeout(async () => {
      const payload = { ...pendingSensitivityRef.current };
      pendingSensitivityRef.current = {};

      if (!Object.keys(payload).length) {
        return;
      }

      try {
        await updateManySettings(payload);
        pushToast({ type: 'success', message: 'Detection sensitivity saved.' });
      } catch (error) {
        pushToast({
          type: 'error',
          message: error?.response?.data?.error || 'Failed to save sensitivity settings',
        });
      }
    }, 700);
  };

  const scheduleWakeWordSave = (value) => {
    setWakeWordDraft(value);

    if (wakeWordSaveTimerRef.current) {
      clearTimeout(wakeWordSaveTimerRef.current);
    }

    wakeWordSaveTimerRef.current = setTimeout(async () => {
      try {
        await updateSetting('wake_word', value);
        pushToast({ type: 'success', message: 'Voice trigger saved.' });
      } catch (error) {
        pushToast({
          type: 'error',
          message: error?.response?.data?.error || 'Failed to save wake word',
        });
      }
    }, 700);
  };

  const handleKickConnect = async () => {
    if (!kickApiKey.trim()) {
      pushToast({ type: 'error', message: 'Kick API key is required.' });
      return;
    }

    try {
      setBusy(true);
      await connectKick(kickApiKey.trim());
      pushToast({ type: 'success', message: 'Kick connected.' });
      await refreshAuth();
    } catch (error) {
      pushToast({ type: 'error', message: error?.response?.data?.error || 'Failed to connect Kick' });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (provider) => {
    try {
      setBusy(true);
      await disconnectProvider(provider);
      pushToast({ type: 'success', message: `${provider === 'twitch' ? 'Twitch' : 'Kick'} disconnected.` });
      await refreshAuth();
    } catch (error) {
      pushToast({ type: 'error', message: error?.response?.data?.error || 'Failed to disconnect' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-text-secondary">Loading settings...</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-bg-card p-4">
        <h2 className="text-lg font-semibold text-text-primary">Voice Trigger</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Say "{settings.wake_word} clip that" to clip the current moment.
        </p>

        <div className="mt-3 flex gap-2">
          <input
            value={wakeWordDraft}
            onChange={(event) => scheduleWakeWordSave(event.target.value)}
            className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4">
        <h2 className="text-lg font-semibold text-text-primary">Clip Defaults</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CLIP_DURATION_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => updateWithToast('clip_duration', value)}
              className={`rounded-md border px-3 py-1 text-sm transition ${
                Number(settings.clip_duration) === value
                  ? 'border-accent-purple bg-accent-purple/20 text-text-primary'
                  : 'border-border text-text-secondary hover:border-accent-purple/40'
              }`}
            >
              {value}s
            </button>
          ))}
        </div>

        <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={Boolean(settings.auto_save_uploads)}
            onChange={(event) => updateWithToast('auto_save_uploads', event.target.checked)}
          />
          Auto-save approved upload clips
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Detection Sensitivity</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <SensitivityDial
            label="🔊 Audio"
            description="Clip triggers when volume exceeds this threshold."
            value={sensitivityDraft.audio_threshold}
            onChange={(value) => scheduleSensitivitySave('audio_threshold', value)}
          />
          <SensitivityDial
            label="👁️ Motion"
            description="Clip triggers when frame change exceeds this threshold."
            value={sensitivityDraft.motion_threshold}
            onChange={(value) => scheduleSensitivitySave('motion_threshold', value)}
          />
          <SensitivityDial
            label="💬 Chat"
            description="Clip triggers when chat rate exceeds this threshold."
            value={sensitivityDraft.chat_threshold}
            onChange={(value) => scheduleSensitivitySave('chat_threshold', value)}
          />
          <SensitivityDial
            label="🎯 Upload"
            description="Minimum score needed for upload highlights."
            value={sensitivityDraft.upload_min_score}
            onChange={(value) => scheduleSensitivitySave('upload_min_score', value)}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4">
        <h2 className="text-lg font-semibold text-text-primary">Connected Platforms</h2>

        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-elevated p-3">
            <div>
              <p className="font-semibold text-text-primary">Twitch</p>
              <p className="text-xs text-text-secondary">
                {authStatus.twitch ? 'Connected via OAuth' : 'Not connected'}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Users connect their account with OAuth. App keys are server-side only.
              </p>
              {!authStatus.twitchConfigured ? (
                <p className="mt-1 text-xs text-red-300">
                  Twitch OAuth is not configured by the app owner yet.
                </p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={beginTwitchAuth}
                disabled={!authStatus.twitchConfigured}
                className="rounded-md bg-purple-600 px-3 py-1 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {authStatus.twitch ? 'Reconnect' : 'Connect'}
              </button>
              {authStatus.twitch ? (
                <button
                  type="button"
                  onClick={() => handleDisconnect('twitch')}
                  disabled={busy}
                  className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-1 text-sm text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-elevated p-3">
            <p className="font-semibold text-text-primary">Kick</p>
            <p className="mb-2 text-xs text-text-secondary">
              {authStatus.kick ? 'API key connected' : 'Not connected'}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                value={kickApiKey}
                onChange={(event) => setKickApiKey(event.target.value)}
                placeholder="Paste Kick API key"
                className="min-w-[280px] flex-1 rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-primary"
              />
              <button
                type="button"
                disabled={busy}
                onClick={handleKickConnect}
                className="rounded-md bg-accent-green px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {authStatus.kick ? 'Update' : 'Connect'}
              </button>
              {authStatus.kick ? (
                <button
                  type="button"
                  onClick={() => handleDisconnect('kick')}
                  disabled={busy}
                  className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4">
        <h2 className="text-lg font-semibold text-text-primary">Appearance</h2>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => updateWithToast('theme', 'dark')}
            className={`rounded-md border px-3 py-1 text-sm transition ${
              settings.theme === 'dark'
                ? 'border-accent-purple bg-accent-purple/20 text-text-primary'
                : 'border-border text-text-secondary'
            }`}
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => updateWithToast('theme', 'light')}
            className={`rounded-md border px-3 py-1 text-sm transition ${
              settings.theme === 'light'
                ? 'border-accent-purple bg-accent-purple/20 text-text-primary'
                : 'border-border text-text-secondary'
            }`}
          >
            Light
          </button>
        </div>
      </section>
    </div>
  );
}
