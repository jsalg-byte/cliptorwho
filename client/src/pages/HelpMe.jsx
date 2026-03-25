import { BookOpen, Rocket, Settings, Upload, Video, WandSparkles } from 'lucide-react';

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-border bg-bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={18} className="text-accent-cyan" />
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="space-y-2 text-sm text-text-secondary">{children}</div>
    </section>
  );
}

export default function HelpMe({ pushToast }) {
  const restartTour = () => {
    window.dispatchEvent(new Event('cliptorwho:start-tour'));
    pushToast?.({ type: 'info', message: 'Guided tour restarted.' });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-secondary">Help Me</p>
            <h1 className="text-2xl font-bold text-text-primary">Cliptor Who User Guide</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Quick instructions for clipping live streams, analyzing uploads, and sharing highlights.
            </p>
          </div>
          <button
            type="button"
            onClick={restartTour}
            className="rounded-md bg-accent-purple px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-600"
          >
            Restart Guided Tour
          </button>
        </div>
      </section>

      <Section icon={Rocket} title="Quick Start">
        <p>1. Go to Dashboard and enter your channel, then click Monitor.</p>
        <p>2. Use Clip Now for manual highlights.</p>
        <p>3. Enable Voice/Audio/Motion/Chat detection for auto clipping.</p>
        <p>4. Review all saved clips in Clip Library.</p>
      </Section>

      <Section icon={Video} title="Live Clipping">
        <p>Use the detection toggles on Dashboard to automate highlight capture while a stream is live.</p>
        <p>Clip source tags (manual, voice, audio, motion, chat) are stored with each clip for filtering later.</p>
      </Section>

      <Section icon={Upload} title="Upload Recording Analysis">
        <p>Open Upload Recording to drag in MP4/MOV/MKV/WebM files.</p>
        <p>The app scores audio + motion spikes, then shows candidate highlights in a preview queue.</p>
        <p>Approve only what you want and save them into your clip library.</p>
      </Section>

      <Section icon={Settings} title="Settings & Connections">
        <p>Set your wake word, clip duration, and sensitivity thresholds in Settings.</p>
        <p>Connect Twitch with OAuth. Connect Kick with your API key.</p>
        <p>Use disconnect buttons to remove platform access for your current user session.</p>
      </Section>

      <Section icon={WandSparkles} title="Best Practices">
        <p>Start with slightly lower thresholds to avoid missing moments, then tune upward to reduce noise.</p>
        <p>Use concise clip titles and tags so searching in Clip Library stays fast and clean.</p>
        <p>If chat detection is too noisy, raise chat threshold first before changing audio/motion values.</p>
      </Section>

      <Section icon={BookOpen} title="Troubleshooting">
        <p>If a stream does not load, double-check the channel name and platform, then click Monitor again.</p>
        <p>If clip creation feels delayed, wait for stream buffer to stabilize and try Clip Now once more.</p>
        <p>If voice command is unavailable, continue with Clip Now or automatic Audio/Motion/Chat detection.</p>
        <p>If upload analysis is slow, smaller files and shorter recordings will process faster.</p>
      </Section>
    </div>
  );
}
