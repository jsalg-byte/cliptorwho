import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ClipCard from '../components/ClipCard';
import ClipEditorModal from '../components/ClipEditorModal';
import StreamEmbed from '../components/StreamEmbed';
import VoiceTriggerIndicator from '../components/VoiceTriggerIndicator';
import ActivityGraph from '../components/ActivityGraph';
import { listClips, createChatActivityStream, getAuthStatus, getStreamStatus } from '../lib/api';
import { useSettings } from '../hooks/useSettings';
import { useClipTrigger } from '../hooks/useClipTrigger';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer';
import { useMotionAnalyzer } from '../hooks/useMotionAnalyzer';

function Meter({ label, value, threshold }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
        <span>{label}</span>
        <span>{Math.round(value)} / 100</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full bg-accent-cyan transition-all duration-200"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
        <div
          className="absolute inset-y-0 w-[2px] bg-accent-red"
          style={{ left: `${Math.min(100, Math.max(0, threshold))}%` }}
        />
      </div>
    </div>
  );
}

export default function Dashboard({ pushToast, onMicStatusChange }) {
  const { settings } = useSettings();
  const [platform, setPlatform] = useState('twitch');
  const [channel, setChannel] = useState('');
  const [creatorDefault, setCreatorDefault] = useState({
    checked: false,
    platform: '',
    channel: '',
    live: null,
  });
  const [monitoring, setMonitoring] = useState(false);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [streamStatus, setStreamStatus] = useState({
    live: false,
    viewers: 0,
    embedUrl: '',
    playbackUrl: '',
  });
  const [recentClips, setRecentClips] = useState([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatData, setChatData] = useState([]);
  const [editingClip, setEditingClip] = useState(null);
  const inputRef = useRef(null);

  const videoRef = useRef(null);

  const loadRecentClips = useCallback(async () => {
    try {
      const clips = await listClips({ sort: 'newest' });
      setRecentClips(clips.slice(0, 6));
    } catch (error) {
      pushToast({ type: 'error', message: error?.response?.data?.error || 'Failed to load clips' });
    }
  }, [pushToast]);

  useEffect(() => {
    loadRecentClips();
  }, [loadRecentClips]);

  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const status = await getAuthStatus();
        const defaultPlatform = status?.defaults?.platform || '';
        const defaultChannel = status?.defaults?.channel || '';

        if (defaultPlatform) {
          setPlatform((current) => current || defaultPlatform);
        }
        if (defaultChannel) {
          setChannel((current) => current || defaultChannel);
        }

        if (defaultPlatform && defaultChannel) {
          const ownStatus = await getStreamStatus(defaultPlatform, defaultChannel);
          setCreatorDefault({
            checked: true,
            platform: defaultPlatform,
            channel: defaultChannel,
            live: Boolean(ownStatus.live),
          });

          // Creator-first default view: if user's stream is live, show it automatically.
          if (ownStatus.live) {
            setPlatform(defaultPlatform);
            setChannel(defaultChannel);
            setStreamStatus(ownStatus);
            setMonitoring(true);
          }
        } else {
          setCreatorDefault({
            checked: true,
            platform: '',
            channel: '',
            live: null,
          });
        }
      } catch (_error) {
        // keep manual input flow when auth defaults fail
        setCreatorDefault({
          checked: true,
          platform: '',
          channel: '',
          live: null,
        });
      }
    };

    loadDefaults();
  }, []);

  const { triggerClip, isTriggering } = useClipTrigger({
    platform,
    channel,
    onClipCreated: () => loadRecentClips(),
    onToast: pushToast,
  });

  const onVoiceTrigger = useCallback(() => {
    triggerClip('voice');
  }, [triggerClip]);

  const speech = useSpeechRecognition({
    enabled: voiceEnabled,
    wakeWord: settings.wake_word,
    onTrigger: onVoiceTrigger,
  });

  useEffect(() => {
    onMicStatusChange?.(voiceEnabled && speech.listening);
  }, [onMicStatusChange, speech.listening, voiceEnabled]);

  const audio = useAudioAnalyzer({
    videoRef,
    enabled: monitoring && audioEnabled,
    threshold: settings.audio_threshold,
    onTrigger: () => triggerClip('audio'),
  });

  const motion = useMotionAnalyzer({
    videoRef,
    enabled: monitoring && motionEnabled,
    threshold: settings.motion_threshold,
    onTrigger: () => triggerClip('motion'),
  });

  useEffect(() => {
    if (!monitoring || !chatEnabled || !platform || !channel) {
      return undefined;
    }

    const stream = createChatActivityStream({ platform, channel });

    const onActivity = (event) => {
      const payload = JSON.parse(event.data);
      setChatData((previous) => {
        const next = [
          ...previous,
          {
            label: new Date(payload.timestamp).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
            messagesPerSec: Math.min(100, payload.normalized),
            spike: payload.spike,
          },
        ];

        return next.slice(-120);
      });
    };

    const onSpike = () => {
      triggerClip('chat');
    };

    stream.addEventListener('activity', onActivity);
    stream.addEventListener('hype_spike', onSpike);

    return () => {
      stream.close();
    };
  }, [chatEnabled, monitoring, platform, channel, triggerClip]);

  const monitorStream = async () => {
    if (!platform || !channel) {
      pushToast({ type: 'error', message: 'Choose platform and channel.' });
      return;
    }

    try {
      setMonitorLoading(true);
      const status = await getStreamStatus(platform, channel);
      setStreamStatus(status);
      setMonitoring(true);
      pushToast({ type: 'success', message: `Monitoring ${channel} on ${platform}.` });
    } catch (error) {
      pushToast({
        type: 'error',
        message: error?.response?.data?.error || error.message || 'Failed to monitor stream',
      });
    } finally {
      setMonitorLoading(false);
    }
  };

  const chatThresholdData = useMemo(() => {
    return chatData.length ? chatData : [{ label: '0', messagesPerSec: 0, spike: false }];
  }, [chatData]);

  const anyDetectionActive = voiceEnabled || audioEnabled || motionEnabled || chatEnabled;
  const handleMonitorAnotherCreator = useCallback(() => {
    setChannel('');
    setMonitoring(false);
    setStreamStatus({
      live: false,
      viewers: 0,
      embedUrl: '',
      playbackUrl: '',
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-bg-card p-4" data-tour="monitor-panel">
        {creatorDefault.checked && creatorDefault.channel && creatorDefault.live === false ? (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            You are offline right now.{' '}
            <button
              type="button"
              onClick={handleMonitorAnotherCreator}
              className="font-semibold text-accent-cyan underline underline-offset-2 transition hover:text-cyan-400"
            >
              Monitor another creators stream?
            </button>
          </div>
        ) : null}

        <div className="grid gap-2 md:grid-cols-[1fr_160px_120px]">
          <input
            ref={inputRef}
            value={channel}
            onChange={(event) => setChannel(event.target.value.trim())}
            placeholder="Monitor another creator's live (channel name)"
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary"
          />

          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary"
          >
            <option value="twitch">Twitch</option>
            <option value="kick">Kick</option>
          </select>

          <button
            type="button"
            onClick={monitorStream}
            disabled={monitorLoading}
            className="rounded-md bg-accent-purple px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-50"
          >
            {monitorLoading ? 'Loading...' : 'Monitor'}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
              streamStatus.live
                ? 'bg-accent-green/20 text-accent-green'
                : 'bg-slate-500/20 text-slate-300'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${streamStatus.live ? 'bg-accent-green' : 'bg-slate-400'}`} />
            {streamStatus.live ? 'LIVE' : 'OFFLINE'}
          </span>
          <span className="text-text-secondary">Viewers: {streamStatus.viewers || 0}</span>
        </div>
      </div>

      <StreamEmbed
        platform={platform}
        channel={channel}
        embedUrl={streamStatus.embedUrl}
        playbackUrl={streamStatus.playbackUrl}
        videoRef={videoRef}
        creatorOffline={creatorDefault.checked && creatorDefault.live === false}
        onMonitorAnother={handleMonitorAnotherCreator}
      />

      <div className="flex flex-wrap gap-2" data-tour="detection-row">
        <button
          type="button"
          onClick={() => triggerClip('manual')}
          disabled={isTriggering}
          data-tour="clip-now"
          className="rounded-md bg-accent-purple px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-50"
        >
          🎬 Clip Now
        </button>

        <button
          type="button"
          onClick={() => setVoiceEnabled((value) => !value)}
          disabled={!speech.supported}
          className={`rounded-md border px-3 py-2 text-sm transition ${
            voiceEnabled
              ? 'border-red-500/50 bg-red-500/20 text-red-200'
              : 'border-border text-text-secondary hover:border-red-500/50'
          }`}
        >
          🎙️ Local Voice Cmd
        </button>

        <button
          type="button"
          onClick={() => setAudioEnabled((value) => !value)}
          className={`rounded-md border px-3 py-2 text-sm transition ${
            audioEnabled
              ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-200'
              : 'border-border text-text-secondary hover:border-cyan-500/50'
          }`}
        >
          🔊 Audio Detect
        </button>

        <button
          type="button"
          onClick={() => setMotionEnabled((value) => !value)}
          className={`rounded-md border px-3 py-2 text-sm transition ${
            motionEnabled
              ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
              : 'border-border text-text-secondary hover:border-emerald-500/50'
          }`}
        >
          👁️ Motion Detect
        </button>

        <button
          type="button"
          onClick={() => setChatEnabled((value) => !value)}
          className={`rounded-md border px-3 py-2 text-sm transition ${
            chatEnabled
              ? 'border-orange-500/50 bg-orange-500/20 text-orange-200'
              : 'border-border text-text-secondary hover:border-orange-500/50'
          }`}
        >
          💬 Chat Detect
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Cliptor Who is creator-first: connect your own channel, monitor it, and clip faster. Local voice command is optional.
      </p>

      {anyDetectionActive ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <Meter label="Audio Energy" value={audio.energy} threshold={settings.audio_threshold} />
          <Meter label="Motion Intensity" value={motion.motionScore} threshold={settings.motion_threshold} />
          <ActivityGraph
            title="Chat Hype"
            data={chatThresholdData}
            dataKey="messagesPerSec"
            threshold={settings.chat_threshold}
            spikeKey="spike"
            height={95}
          />
        </div>
      ) : null}

      <section className="space-y-3" data-tour="recent-clips">
        <h2 className="text-lg font-semibold text-text-primary">Recent Clips</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recentClips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} onOpen={setEditingClip} />
          ))}
        </div>
      </section>

      {speech.supported || voiceEnabled ? (
        <VoiceTriggerIndicator
          listening={speech.listening}
          supported={speech.supported}
          flashTriggered={speech.flashTriggered}
          transcript={speech.transcript}
          onToggle={() => setVoiceEnabled((value) => !value)}
        />
      ) : null}

      <ClipEditorModal
        clip={editingClip}
        isOpen={Boolean(editingClip)}
        onClose={() => setEditingClip(null)}
        onSaved={() => loadRecentClips()}
        onToast={pushToast}
      />
    </div>
  );
}
