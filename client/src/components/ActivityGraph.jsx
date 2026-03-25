import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export default function ActivityGraph({
  title,
  data,
  dataKey = 'value',
  threshold = 0,
  height = 140,
  spikeKey,
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</p>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid stroke="rgba(100,116,139,0.16)" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                background: '#111827',
                border: '1px solid rgba(124,58,237,0.35)',
                borderRadius: 12,
                color: '#e2e8f0',
                fontSize: 12,
              }}
            />
            <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="4 3" />
            <Bar
              dataKey={dataKey}
              radius={[4, 4, 0, 0]}
              fill="#06b6d4"
              isAnimationActive={false}
            >
              {data.map((entry, idx) => (
                <Cell
                  key={`${entry.label || idx}`}
                  fill={spikeKey && entry[spikeKey] ? '#ef4444' : '#06b6d4'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
