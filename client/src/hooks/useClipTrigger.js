import { useCallback, useMemo, useRef, useState } from 'react';
import { createClip } from '../lib/api';
import { useSettings } from './useSettings';

const SOURCE_COOLDOWNS = {
  manual: 4000,
  voice: 30000,
  audio: 30000,
  motion: 30000,
  chat: 30000,
};

function now() {
  return Date.now();
}

export function useClipTrigger({ platform, channel, onClipCreated, onToast }) {
  const { settings } = useSettings();
  const [isTriggering, setIsTriggering] = useState(false);
  const [lastTriggeredSource, setLastTriggeredSource] = useState('');
  const cooldownMap = useRef(new Map());

  const triggerClip = useCallback(
    async (source = 'manual') => {
      if (!platform || !channel) {
        onToast?.({ type: 'error', message: 'Choose platform and channel first.' });
        return null;
      }

      const cooldownMs = SOURCE_COOLDOWNS[source] || 30_000;
      const lastAt = cooldownMap.current.get(source) || 0;
      const elapsed = now() - lastAt;

      if (elapsed < cooldownMs) {
        const secondsLeft = Math.ceil((cooldownMs - elapsed) / 1000);
        onToast?.({
          type: 'info',
          message: `${source} trigger cooling down (${secondsLeft}s)` ,
        });
        return null;
      }

      try {
        setIsTriggering(true);

        const clip = await createClip({
          platform,
          channel,
          duration: Number(settings.clip_duration || 30),
          source,
        });

        cooldownMap.current.set(source, now());
        setLastTriggeredSource(source);
        onClipCreated?.(clip);
        onToast?.({ type: 'success', message: `Clip created from ${source}.` });
        return clip;
      } catch (error) {
        onToast?.({
          type: 'error',
          message: error?.response?.data?.error || error.message || 'Failed to create clip',
        });
        return null;
      } finally {
        setIsTriggering(false);
      }
    },
    [platform, channel, settings.clip_duration, onClipCreated, onToast],
  );

  const cooldowns = useMemo(() => {
    const snapshot = {};
    Object.keys(SOURCE_COOLDOWNS).forEach((source) => {
      const cooldownMs = SOURCE_COOLDOWNS[source];
      const lastAt = cooldownMap.current.get(source) || 0;
      const remaining = Math.max(0, cooldownMs - (now() - lastAt));
      snapshot[source] = remaining;
    });
    return snapshot;
  }, [lastTriggeredSource]);

  return {
    triggerClip,
    isTriggering,
    lastTriggeredSource,
    cooldowns,
  };
}
