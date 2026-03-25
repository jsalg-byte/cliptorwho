import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSettings, saveSettings } from '../lib/api';

const defaultSettings = {
  wake_word: 'jarvis',
  clip_duration: 30,
  audio_threshold: 65,
  motion_threshold: 55,
  chat_threshold: 70,
  upload_min_score: 50,
  theme: 'dark',
  auto_save_uploads: false,
};

const SettingsContext = createContext(null);

function normalizeSettings(next = {}) {
  return {
    ...defaultSettings,
    ...next,
    clip_duration: Number(next.clip_duration ?? defaultSettings.clip_duration),
    audio_threshold: Number(next.audio_threshold ?? defaultSettings.audio_threshold),
    motion_threshold: Number(next.motion_threshold ?? defaultSettings.motion_threshold),
    chat_threshold: Number(next.chat_threshold ?? defaultSettings.chat_threshold),
    upload_min_score: Number(next.upload_min_score ?? defaultSettings.upload_min_score),
    auto_save_uploads:
      next.auto_save_uploads === true || next.auto_save_uploads === 'true' || defaultSettings.auto_save_uploads,
  };
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const next = await getSettings();
      setSettings(normalizeSettings(next));
    } catch (apiError) {
      setError(apiError?.response?.data?.error || apiError.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const updateSetting = useCallback(
    async (key, value) => {
      const previous = settings;
      const optimistic = normalizeSettings({
        ...settings,
        [key]: value,
      });

      setSettings(optimistic);

      try {
        const updated = await saveSettings({ [key]: value });
        setSettings(normalizeSettings(updated));
        return updated;
      } catch (apiError) {
        setSettings(previous);
        throw apiError;
      }
    },
    [settings],
  );

  const updateManySettings = useCallback(
    async (nextValues) => {
      const previous = settings;
      const optimistic = normalizeSettings({ ...settings, ...nextValues });
      setSettings(optimistic);

      try {
        const updated = await saveSettings(nextValues);
        setSettings(normalizeSettings(updated));
        return updated;
      } catch (apiError) {
        setSettings(previous);
        throw apiError;
      }
    },
    [settings],
  );

  const value = useMemo(
    () => ({
      settings,
      loading,
      error,
      refreshSettings,
      updateSetting,
      updateManySettings,
    }),
    [settings, loading, error, refreshSettings, updateSetting, updateManySettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }

  return context;
}
