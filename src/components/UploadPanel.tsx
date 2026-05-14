'use client';
import { useRef, useState } from "react";

interface UploadPanelProps {
  title: string;
  description: string;
  accept: string;
  endpoint: string;
}

type UploadResult = Record<string, string | number | boolean>;

export default function UploadPanel({ title, description, accept, endpoint }: UploadPanelProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setUploading(true);
    setResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: formData, signal: AbortSignal.timeout(300000) });
      const json = (await res.json()) as UploadResult & { error?: string };
      if (!res.ok) {
        setError((json.error as string | undefined) ?? `エラー: ${res.status}`);
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-gray-400 mt-1">{description}</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-blue-400 bg-blue-950/30" : "border-gray-700 hover:border-gray-500"
        }`}
      >
        {uploading ? (
          <p className="text-blue-400 text-sm">アップロード中...</p>
        ) : (
          <>
            <p className="text-gray-400 text-sm">ファイルをドラッグ&ドロップ</p>
            <p className="text-gray-600 text-xs mt-1">または クリックして選択</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {result && (
        <div className="bg-green-950/50 border border-green-700 rounded p-4 text-sm space-y-1">
          {Object.entries(result).map(([key, value]) => (
            <div key={key}>
              <span className="text-green-400 font-medium">{key}: </span>
              <span className="text-green-200">{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-950/50 border border-red-700 rounded p-4 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
