export default function TagPill({ tag }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
      #{tag}
    </span>
  );
}
