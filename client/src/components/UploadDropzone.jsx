import { useRef, useState } from 'react';

export default function UploadDropzone({ file, onFileSelect, error }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = (selectedFile) => {
    if (!selectedFile) {
      return;
    }

    onFileSelect?.(selectedFile);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          pickFile(event.dataTransfer.files?.[0]);
        }}
        className={`flex h-56 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition duration-200 ${
          dragOver
            ? 'border-accent-purple bg-accent-purple/10 shadow-[0_0_25px_rgba(124,58,237,0.2)]'
            : 'border-accent-purple/40 bg-bg-card'
        }`}
      >
        <p className="text-lg font-semibold text-text-primary">Drop your recording here</p>
        <p className="mt-2 text-sm text-text-secondary">or click to browse .mp4 .mov .mkv .webm</p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.mov,.mkv,.webm"
        hidden
        onChange={(event) => pickFile(event.target.files?.[0])}
      />

      {file ? (
        <div className="rounded-lg border border-border bg-bg-card p-3 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">{file.name}</p>
          <p>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-accent-red">{error}</p> : null}
    </div>
  );
}
