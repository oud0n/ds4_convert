import React, { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { parseFile } from "../utils/parser";
import { ParsedGPSFile } from "../types";

interface UploadZoneProps {
  onFileLoaded: (file: ParsedGPSFile) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileLoaded }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setStatus('loading');
    setErrorMsg("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (result instanceof ArrayBuffer) {
          const bytes = new Uint8Array(result);
          const parsed = parseFile(file.name, bytes);
          if (parsed.points.length === 0) {
            throw new Error("No valid GPS (NMEA) coordinates found in the file. Please upload a valid .bon4 / .bnx4 / .nmea log file.");
          }
          onFileLoaded(parsed);
          setStatus('success');
          // Reset success state after some time
          setTimeout(() => setStatus('idle'), 2500);
        } else {
          throw new Error("Invalid file content");
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err?.message || "Failed to process GPS file");
      }
    };

    reader.onerror = () => {
      setStatus('error');
      setErrorMsg("Failed to read file contents");
    };

    reader.readAsArrayBuffer(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div
      id="upload-container"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={triggerFileInput}
      className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 min-h-[180px] ${
        isDragActive
          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 shadow-sm"
          : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/70"
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept="*/*"
        className="hidden"
      />

      {status === 'idle' && (
        <div className="flex flex-col items-center gap-3">
          <div className="p-3.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              GPSログファイルをドロップ、または<span className="text-blue-600 dark:text-blue-400 font-semibold underline">ファイルを選択</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              対応フォーマット: <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">.bon4</span>, <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">.bnx4</span>, <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">.bon</span>, <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">.binx</span>, <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">.dsp</span>, <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">.nmea</span>
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              ※ iPhone / iPad の「ファイル」アプリからの選択にも対応
            </p>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" />
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">ファイルを解析中...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center gap-2">
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">読み込み完了</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">変換設定を行ってダウンロードしてください</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-2">
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-full">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">読み込みエラー</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-md">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
};

