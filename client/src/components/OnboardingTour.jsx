import { useEffect, useMemo, useRef, useState } from 'react';

const TOUR_STORAGE_KEY = 'cliptorwho_onboarding_v1_seen';

const STEPS = [
  {
    path: '/',
    selector: '[data-tour="logo"]',
    title: 'Welcome to Cliptor Who',
    body: 'This is your clipping command center. We will show the core workflow in under a minute.',
  },
  {
    path: '/',
    selector: '[data-tour="monitor-panel"]',
    title: 'Pick Stream Source',
    body: 'Enter a channel, choose Twitch or Kick, then click Monitor to load live status and stream context.',
  },
  {
    path: '/',
    selector: '[data-tour="clip-now"]',
    title: 'Clip Instantly',
    body: 'Use Clip Now to capture a highlight on demand. Voice and auto-detection can trigger this too.',
  },
  {
    path: '/',
    selector: '[data-tour="detection-row"]',
    title: 'Enable Auto Detection',
    body: 'Toggle Voice, Audio, Motion, and Chat to automate highlight capture while you watch.',
  },
  {
    path: '/upload',
    selector: '[data-tour="nav-upload"]',
    title: 'Analyze Uploaded Recordings',
    body: 'Use Upload to scan full recordings, review scored highlight candidates, and save approved clips.',
  },
  {
    path: '/library',
    selector: '[data-tour="nav-library"]',
    title: 'Manage Your Clip Library',
    body: 'Browse, search, filter, edit, and share all saved clips from one place.',
  },
  {
    path: '/settings',
    selector: '[data-tour="nav-settings"]',
    title: 'Tune Detection',
    body: 'Adjust wake word, thresholds, and platform connections in Settings.',
  },
  {
    path: '/help',
    selector: '[data-tour="nav-help"]',
    title: 'Need a Refresher?',
    body: 'Open Help Me anytime for feature docs, best practices, and how to restart this tour.',
  },
];

function findVisibleTarget(selector) {
  if (!selector) {
    return null;
  }

  const candidates = Array.from(document.querySelectorAll(selector));
  return candidates.find((element) => {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function OnboardingTour({ pathname, onNavigate, onToast }) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const autoStartCheckedRef = useRef(false);

  const step = STEPS[stepIndex] || null;
  const isLast = stepIndex === STEPS.length - 1;

  const recalcTarget = useMemo(
    () => () => {
      if (!open || !step) {
        setTargetRect(null);
        return;
      }

      const target = findVisibleTarget(step.selector);
      if (!target) {
        setTargetRect(null);
        return;
      }

      setTargetRect(target.getBoundingClientRect());
    },
    [open, step],
  );

  useEffect(() => {
    if (autoStartCheckedRef.current) {
      return;
    }
    autoStartCheckedRef.current = true;

    if (pathname.startsWith('/share/')) {
      return;
    }

    const alreadySeen = window.localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    if (!alreadySeen) {
      setOpen(true);
      setStepIndex(0);
    }
  }, [pathname]);

  useEffect(() => {
    const onRestart = () => {
      window.localStorage.removeItem(TOUR_STORAGE_KEY);
      setOpen(true);
      setStepIndex(0);
      onNavigate('/');
    };

    window.addEventListener('cliptorwho:start-tour', onRestart);
    return () => window.removeEventListener('cliptorwho:start-tour', onRestart);
  }, [onNavigate]);

  useEffect(() => {
    if (!open || !step) {
      return;
    }

    if (step.path && pathname !== step.path) {
      onNavigate(step.path);
      return;
    }

    const timer = setTimeout(recalcTarget, 100);
    return () => clearTimeout(timer);
  }, [open, step, pathname, onNavigate, recalcTarget]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onChange = () => recalcTarget();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [open, recalcTarget]);

  const completeTour = () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setOpen(false);
    onToast?.({ type: 'success', message: 'Tour complete. You can reopen it from Help Me.' });
  };

  const skipTour = () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setOpen(false);
  };

  const nextStep = () => {
    if (isLast) {
      completeTour();
      return;
    }

    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const tooltipStyle = (() => {
    if (!targetRect) {
      return {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const bubbleWidth = 320;
    const margin = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = targetRect.left;
    left = clamp(left, margin, viewportWidth - bubbleWidth - margin);

    const preferBelow = targetRect.bottom + 180 < viewportHeight;
    const top = preferBelow
      ? targetRect.bottom + 10
      : Math.max(margin, targetRect.top - 170);

    return {
      left,
      top,
    };
  })();

  if (!open || !step) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90]" onClick={skipTour} role="presentation">
      <div className="absolute inset-0 bg-black/65" />

      {targetRect ? (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-accent-cyan shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-all"
          style={{
            left: targetRect.left - 6,
            top: targetRect.top - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      ) : null}

      <div
        className="absolute w-[320px] rounded-2xl border border-border bg-bg-card p-4 shadow-xl"
        style={tooltipStyle}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <p className="text-xs uppercase tracking-wide text-text-secondary">
          Guided Tour {stepIndex + 1}/{STEPS.length}
        </p>
        <h3 className="mt-1 text-base font-semibold text-text-primary">{step.title}</h3>
        <p className="mt-2 text-sm text-text-secondary">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={skipTour}
            className="text-xs font-medium text-text-secondary transition hover:text-text-primary"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent-purple/40"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={nextStep}
              className="rounded-md bg-accent-purple px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-600"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
