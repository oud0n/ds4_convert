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
      className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 min-h-[200px] ${
        isDragActive
          ? "border-emerald-500 bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
          : "border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/60"
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
          <div className="p-4 rounded-full bg-slate-800/60 text-slate-400">
            <Upload className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">
              GPSログファイルをドロップ、または<span className="text-emerald-400 font-semibold underline">タップして選択</span>
            </p>
            <p className="text-xs text-slate-400 mt-1.5 leading-normal">
              対応フォーマット: <span className="font-mono text-emerald-500/90 font-medium">.bon4</span>, <span className="font-mono text-emerald-500/90 font-medium">.bnx4</span>, <span className="font-mono text-emerald-500/90 font-medium">.bon</span>, <span className="font-mono text-emerald-500/90 font-medium">.binx</span>, <span className="font-mono text-emerald-500/90 font-medium">.dsp</span>, <span className="font-mono text-emerald-500/90 font-medium">.nmea</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              ※ iPhone / iPad の「ファイル」アプリからも選択可能です
            </p>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
          <p className="text-sm text-slate-300 font-medium">Reading and validating NMEA sentences...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-full">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-400">File Loaded Successfully</p>
            <p className="text-xs text-slate-400 mt-1">Ready to convert and download</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-full">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-rose-400">Loading Failed</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
};
