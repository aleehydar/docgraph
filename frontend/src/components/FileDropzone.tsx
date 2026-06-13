import clsx from "clsx";
import { FileText, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const ACCEPTED = [".pdf", ".txt", ".docx", ".md"];
const MAX_MB = 20;

interface FileDropzoneProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDropzone({ file, onFileChange, disabled }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((f: File): string | null => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      return `Unsupported format. Use ${ACCEPTED.join(", ")}`;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      return `File exceeds ${MAX_MB} MB limit`;
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      const err = validate(f);
      if (err) {
        alert(err);
        return;
      }
      onFileChange(f);
    },
    [onFileChange, validate],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [disabled, handleFile],
  );

  if (file) {
    return (
      <div className="panel animate-fade-in overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <FileText className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{file.name}</p>
            <p className="text-xs text-zinc-500">{formatSize(file.size)}</p>
          </div>
          {!disabled && (
            <button
              onClick={() => onFileChange(null)}
              className="btn-ghost !p-2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={clsx(
        "group relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200",
        dragging
          ? "border-emerald-500/60 bg-emerald-500/5"
          : "border-border hover:border-zinc-600 hover:bg-surface-raised/50",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div
          className={clsx(
            "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors",
            dragging
              ? "bg-emerald-500/20"
              : "bg-surface-overlay group-hover:bg-surface-overlay/80",
          )}
        >
          <Upload
            className={clsx(
              "h-6 w-6 transition-colors",
              dragging ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-400",
            )}
          />
        </div>
        <p className="text-sm font-medium text-zinc-300">
          Drop a document here, or{" "}
          <span className="text-emerald-400">browse files</span>
        </p>
        <p className="mt-1.5 text-xs text-zinc-600">
          PDF, TXT, DOCX, Markdown — up to {MAX_MB} MB
        </p>
      </div>
    </div>
  );
}
