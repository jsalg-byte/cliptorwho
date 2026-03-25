import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDuration, scoreColor } from '../lib/utils';

function sparkData(values = []) {
  return values.map((value, index) => ({
    index,
    value,
  }));
}

function decisionClasses(decision) {
  if (decision === 'approved') {
    return 'ring-1 ring-accent-purple shadow-[0_0_18px_rgba(124,58,237,0.25)]';
  }

  if (decision === 'rejected') {
    return 'opacity-55 grayscale';
  }

  return '';
}

export default function PreviewQueue({
  duration,
  candidates,
  decisions,
  onApprove,
  onReject,
  onSelectAll,
  onDeselectAll,
  onSave,
  isSaving,
}) {
  const approvedCount = candidates.filter((candidate) => decisions[candidate.id] === 'approved').length;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-text-primary">Preview Queue</h3>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-md border border-border px-3 py-1 text-sm text-text-secondary transition hover:border-accent-purple hover:text-text-primary"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="rounded-md border border-border px-3 py-1 text-sm text-text-secondary transition hover:border-accent-purple hover:text-text-primary"
          >
            Deselect All
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-elevated p-3">
        <div className="relative h-12 overflow-hidden rounded bg-black/40">
          {candidates.map((candidate) => {
            const left = duration ? (candidate.start / duration) * 100 : 0;
            return (
              <div
                key={candidate.id}
                className="absolute top-0 h-full w-[3px] bg-accent-purple"
                style={{ left: `${Math.min(100, left)}%` }}
                title={`${formatDuration(candidate.start)} - ${formatDuration(candidate.end)}`}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {candidates.map((candidate) => {
          const decision = decisions[candidate.id];
          const borderColor = scoreColor(candidate.combinedScore);

          return (
            <div
              key={candidate.id}
              className={`grid gap-3 rounded-xl border border-border bg-bg-elevated p-3 md:grid-cols-[160px_1fr] ${
                borderColor
              } border-l-4 ${decisionClasses(decision)}`}
            >
              <img
                src={candidate.thumbnailUrl}
                alt="Candidate thumbnail"
                className="aspect-video w-full rounded-md object-cover"
              />

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-text-primary">
                    {formatDuration(candidate.start)} - {formatDuration(candidate.end)}
                  </p>
                  <span className="text-sm text-text-secondary">Score {Math.round(candidate.combinedScore)}</span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
                  <div
                    className="h-full bg-accent-purple"
                    style={{ width: `${Math.min(100, Math.max(0, candidate.combinedScore))}%` }}
                  />
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {candidate.signals?.includes('audio') ? (
                    <span className="rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-cyan-300">
                      🔊 Loud
                    </span>
                  ) : null}
                  {candidate.signals?.includes('motion') ? (
                    <span className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                      👁️ Motion
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="h-14 rounded border border-border bg-bg-card p-1">
                    <ResponsiveContainer>
                      <LineChart data={sparkData(candidate.audioSpark)}>
                        <XAxis hide dataKey="index" />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip
                          formatter={(value) => Number(value).toFixed(1)}
                          contentStyle={{
                            background: '#111827',
                            border: '1px solid rgba(34,211,238,0.3)',
                            borderRadius: 8,
                            color: '#e2e8f0',
                          }}
                        />
                        <Line type="monotone" dataKey="value" stroke="#06b6d4" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-14 rounded border border-border bg-bg-card p-1">
                    <ResponsiveContainer>
                      <LineChart data={sparkData(candidate.motionSpark)}>
                        <XAxis hide dataKey="index" />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip
                          formatter={(value) => Number(value).toFixed(1)}
                          contentStyle={{
                            background: '#111827',
                            border: '1px solid rgba(16,185,129,0.3)',
                            borderRadius: 8,
                            color: '#e2e8f0',
                          }}
                        />
                        <Line type="monotone" dataKey="value" stroke="#10b981" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onApprove(candidate)}
                    className={`rounded-md px-3 py-1 text-sm transition ${
                      decision === 'approved'
                        ? 'bg-accent-purple text-white'
                        : 'border border-border text-text-secondary hover:border-accent-purple'
                    }`}
                  >
                    ✅ Approve
                  </button>

                  <button
                    type="button"
                    onClick={() => onReject(candidate)}
                    className={`rounded-md px-3 py-1 text-sm transition ${
                      decision === 'rejected'
                        ? 'bg-slate-700 text-slate-100'
                        : 'border border-border text-text-secondary hover:border-slate-500'
                    }`}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={approvedCount === 0 || isSaving}
        onClick={onSave}
        className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : `Save Approved Clips (${approvedCount})`}
      </button>
    </div>
  );
}
