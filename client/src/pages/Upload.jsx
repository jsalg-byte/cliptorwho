import { useMemo, useRef, useState } from 'react';
import PreviewQueue from '../components/PreviewQueue';
import UploadDropzone from '../components/UploadDropzone';
import {
  createUploadStatusStream,
  getUploadCandidates,
  saveApprovedUploadClips,
  uploadRecording,
} from '../lib/api';

export default function Upload({ pushToast }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [uploadId, setUploadId] = useState('');
  const [duration, setDuration] = useState(0);
  const [phase, setPhase] = useState('Idle');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [decisions, setDecisions] = useState({});
  const [saving, setSaving] = useState(false);
  const statusStreamRef = useRef(null);

  const approvedCount = useMemo(
    () => candidates.filter((candidate) => decisions[candidate.id] === 'approved').length,
    [candidates, decisions],
  );

  const closeStatusStream = () => {
    if (statusStreamRef.current) {
      statusStreamRef.current.close();
      statusStreamRef.current = null;
    }
  };

  const loadCandidates = async (jobId) => {
    const payload = await getUploadCandidates(jobId);
    setCandidates(payload.candidates || []);
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('Select a file first');
      return;
    }

    setError('');
    setBusy(true);
    setProgress(0);
    setPhase('Uploading...');
    setCandidates([]);
    setDecisions({});

    try {
      const uploaded = await uploadRecording(file, (event) => {
        if (!event.total) {
          return;
        }

        const uploadProgress = Math.min(100, (event.loaded / event.total) * 100);
        setProgress(Number(uploadProgress.toFixed(2)));
        setPhase('Uploading...');
      });

      setUploadId(uploaded.uploadId);
      setDuration(uploaded.duration || 0);

      closeStatusStream();
      const stream = createUploadStatusStream(uploaded.uploadId);
      statusStreamRef.current = stream;

      stream.onmessage = async (event) => {
        const payload = JSON.parse(event.data);
        setPhase(payload.phase || 'Analyzing...');
        setProgress(Number(payload.progress || 0));

        if (payload.phase === 'done' && payload.ready) {
          closeStatusStream();
          await loadCandidates(uploaded.uploadId);
          setBusy(false);
          pushToast({ type: 'success', message: 'Upload analysis complete.' });
        }

        if (payload.phase === 'error') {
          closeStatusStream();
          setBusy(false);
          setError(payload.error || 'Analysis failed');
        }
      };

      stream.onerror = () => {
        closeStatusStream();
      };
    } catch (apiError) {
      setBusy(false);
      setError(apiError?.response?.data?.error || apiError.message || 'Upload failed');
    }
  };

  const handleDecision = (candidate, next) => {
    setDecisions((previous) => ({
      ...previous,
      [candidate.id]: next,
    }));
  };

  const handleSaveApproved = async () => {
    if (!uploadId) {
      return;
    }

    const approved = candidates
      .filter((candidate) => decisions[candidate.id] === 'approved')
      .map((candidate) => ({
        id: candidate.id,
        start: candidate.start,
        end: candidate.end,
        title: `Highlight ${Math.round(candidate.combinedScore)}`,
        tags: ['auto-highlight'],
      }));

    if (!approved.length) {
      pushToast({ type: 'info', message: 'Approve at least one candidate clip.' });
      return;
    }

    try {
      setSaving(true);
      const result = await saveApprovedUploadClips({ uploadId, approved });
      pushToast({ type: 'success', message: `Saved ${result.saved.length} clips.` });
    } catch (apiError) {
      pushToast({
        type: 'error',
        message: apiError?.response?.data?.error || apiError.message || 'Failed to save approved clips',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Upload Recording</h2>

        <UploadDropzone file={file} onFileSelect={setFile} error={error} />

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={busy || !file}
          className="mt-4 rounded-md bg-accent-purple px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-50"
        >
          {busy ? 'Analyzing...' : 'Analyze Recording'}
        </button>

        <div className="mt-4">
          <p className="text-xs text-text-secondary">{phase}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full bg-accent-cyan transition-all duration-200"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      </div>

      {candidates.length ? (
        <PreviewQueue
          duration={duration}
          candidates={candidates}
          decisions={decisions}
          onApprove={(candidate) => handleDecision(candidate, 'approved')}
          onReject={(candidate) => handleDecision(candidate, 'rejected')}
          onSelectAll={() => {
            const all = {};
            candidates.forEach((candidate) => {
              all[candidate.id] = 'approved';
            });
            setDecisions(all);
          }}
          onDeselectAll={() => setDecisions({})}
          onSave={handleSaveApproved}
          isSaving={saving}
        />
      ) : null}

      {approvedCount > 0 ? (
        <p className="text-sm text-text-secondary">Approved clips ready to save: {approvedCount}</p>
      ) : null}
    </div>
  );
}
