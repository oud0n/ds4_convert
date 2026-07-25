import React, { useState } from "react";
import { 
  Navigation, 
  Upload, 
  Download, 
  FileDown, 
  Compass, 
  Gauge, 
  Clock, 
  MapPin, 
  CheckCircle, 
  HelpCircle, 
  Sparkles,
  Info
} from "lucide-react";
import { motion } from "motion/react";
import { UploadZone } from "./components/UploadZone";
import { TrackPreview } from "./components/TrackPreview";
import { ParsedGPSFile } from "./types";
import { generateMockSuzukaLog, adjustParsedFile } from "./utils/parser";
import { convertToGPX, convertToCSV, convertToNMEA, convertToTXT, convertToHTMLMap } from "./utils/converter";

export default function App() {
  const [file, setFile] = useState<ParsedGPSFile | null>(null);
  const [exportFormat, setExportFormat] = useState<"nmea" | "gpx" | "csv" | "txt" | "html">("nmea");
  const [timezoneOffset, setTimezoneOffset] = useState<number>(9); // Default to JST (+9) to match official app output
  const [talkerId, setTalkerId] = useState<"GP" | "GN">("GP");

  const handleFileLoaded = (loadedFile: ParsedGPSFile) => {
    setFile(loadedFile);
  };

  const loadDemoLog = () => {
    const demo = generateMockSuzukaLog("demo_suzuka_hotlap.dg1");
    setFile(demo);
  };

  // Dynamically calculate the timezone-shifted & talker ID-adapted file
  const adjustedFile = React.useMemo(() => {
    if (!file) return null;
    return adjustParsedFile(file, timezoneOffset, talkerId);
  }, [file, timezoneOffset, talkerId]);

  const tzLabel = timezoneOffset === 9 ? "JST (UTC+9)" : timezoneOffset === 0 ? "UTC" : `UTC${timezoneOffset >= 0 ? "+" : ""}${timezoneOffset}`;

  const handleDownload = () => {
    if (!adjustedFile) return;

    let content = "";
    let mimeType = "text/plain";
    let extension = exportFormat;
    const baseName = adjustedFile.metadata.name.replace(/\.[^/.]+$/, "");

    if (exportFormat === "nmea") {
      content = convertToNMEA(adjustedFile);
      mimeType = "application/octet-stream";
    } else if (exportFormat === "gpx") {
      content = convertToGPX(adjustedFile);
      mimeType = "application/gpx+xml";
    } else if (exportFormat === "csv") {
      content = convertToCSV(adjustedFile);
      mimeType = "text/csv";
    } else if (exportFormat === "txt") {
      content = convertToTXT(adjustedFile);
      mimeType = "text/plain";
    } else if (exportFormat === "html") {
      content = convertToHTMLMap(adjustedFile);
      mimeType = "text/html";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    // Add timezone indicator suffix to name
    const suffix = timezoneOffset === 9 ? "_JST" : timezoneOffset === 0 ? "_UTC" : `_UTC${timezoneOffset >= 0 ? "+" : ""}${timezoneOffset}`;
    link.download = `${baseName}${suffix}_converted.${extension}`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper formats
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDuration = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    const parts = [];
    if (hrs > 0) parts.push(`${hrs}時間`);
    if (mins > 0 || hrs > 0) parts.push(`${mins}分`);
    parts.push(`${secs}秒`);
    return parts.join(" ");
  };

  const formatTime = (date: Date | null) => {
    if (!date) return "--:--:--";
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC"
    }) + ` (${tzLabel})`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased font-sans">
      {/* Decorative top ambient bar */}
      <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 w-full" />

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12 flex flex-col gap-8 justify-center">
        
        {/* Simple elegant header */}
        <div className="text-center flex flex-col items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-400 to-teal-600 p-3 rounded-2xl text-slate-950 shadow-lg shadow-emerald-500/10">
            <Compass className="w-8 h-8 text-slate-950 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100">
              BNX4 NMEA Converter
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              GPS ログ 変換ツール
            </p>
          </div>
          <p className="text-sm text-slate-400 max-w-md mt-2 leading-relaxed">
            デジスパイス4のbnx4、bon4をnmeaに変換するアプリです。RaceChronoやGoogle Earth等で読み込み可能な標準フォーマットに変換します。
          </p>
        </div>

        {/* Upload Zone & Preloaded Demo */}
        <div className="grid grid-cols-1 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 flex flex-col gap-5 shadow-xl shadow-slate-950/40"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">GPS ログファイルのアップロード</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">ファイルをドロップするか、デバイスから選択してください</p>
              </div>
              <button
                onClick={loadDemoLog}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 rounded-lg text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                デモデータ（鈴鹿サーキット）をロード
              </button>
            </div>

            <UploadZone onFileLoaded={handleFileLoaded} />
          </motion.div>

          {/* Active File Context & Conversion Panel */}
          {adjustedFile && (
            <div className="flex flex-col gap-6">
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                
                {/* Left Column: Track Info Summary */}
                <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-mono">
                      Track Information / 走行ログ概要
                    </h3>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="bg-emerald-950/50 p-2.5 rounded-lg border border-emerald-900/30">
                        <Navigation className="w-5 h-5 text-emerald-400 rotate-45" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 font-mono">FILE NAME</p>
                        <p className="text-sm font-semibold text-slate-200 font-mono truncate">{adjustedFile.metadata.name}</p>
                      </div>
                    </div>
                  </div>

                  {/* Main statistics bento grid */}
                  <div className="grid grid-cols-2 gap-3.5 mt-2">
                    <div className="bg-slate-950/50 border border-slate-900/60 p-3 rounded-xl flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-bold tracking-wider uppercase font-mono">Duration / 走行時間</span>
                      </div>
                      <span className="text-sm font-bold text-slate-100">{formatDuration(adjustedFile.stats.durationSeconds)}</span>
                    </div>

                    <div className="bg-slate-950/50 border border-slate-900/60 p-3 rounded-xl flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-slate-500">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-bold tracking-wider uppercase font-mono">Points / GPSログ数</span>
                      </div>
                      <span className="text-sm font-bold text-slate-100 font-mono">{adjustedFile.stats.pointCount.toLocaleString()} 点</span>
                    </div>

                    <div className="bg-slate-950/50 border border-slate-900/60 p-3 rounded-xl flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-slate-500">
                        <Gauge className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-bold tracking-wider uppercase font-mono">Max Speed / 最高車速</span>
                      </div>
                      <span className="text-sm font-bold text-emerald-400 font-mono">
                        {adjustedFile.stats.maxSpeedKmh.toFixed(1)} <span className="text-[10px] text-slate-500">km/h</span>
                      </span>
                    </div>

                    <div className="bg-slate-950/50 border border-slate-900/60 p-3 rounded-xl flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-slate-500">
                        <Gauge className="w-3.5 h-3.5 text-slate-600" />
                        <span className="text-[9px] font-bold tracking-wider uppercase font-mono">Avg Speed / 平均車速</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-300 font-mono">
                        {adjustedFile.stats.averageSpeedKmh.toFixed(1)} <span className="text-[10px] text-slate-500">km/h</span>
                      </span>
                    </div>
                  </div>

                  {/* Additional coordinate locks and timeline timestamps */}
                  <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-3 flex flex-col gap-2 text-xs font-mono text-slate-400">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500">START TIME ({tzLabel})</span>
                      <span className="text-slate-300">{formatTime(adjustedFile.stats.startTime)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500">END TIME ({tzLabel})</span>
                      <span className="text-slate-300">{formatTime(adjustedFile.stats.endTime)}</span>
                    </div>
                    <div className="h-px bg-slate-900 my-1" />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500">COORDINATES</span>
                      <span className="text-[11px] text-slate-300">
                        {adjustedFile.stats.startLat?.toFixed(5)}, {adjustedFile.stats.startLon?.toFixed(5)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Converter and Exporter Panel */}
                <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 flex flex-col gap-5 justify-between shadow-xl">
                  <div className="flex flex-col gap-4">
                    
                    {/* Timezone and Talker ID settings */}
                    <div className="bg-slate-950/40 p-4 border border-slate-900 rounded-xl flex flex-col gap-3">
                      <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-mono">
                        Conversion Settings / 変換設定
                      </h3>
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase font-mono">
                            Timezone / 時差補正
                          </span>
                          <div className="flex bg-slate-950/80 rounded-lg p-0.5 border border-slate-900">
                            <button
                              type="button"
                              onClick={() => setTimezoneOffset(9)}
                              className={`flex-1 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                                timezoneOffset === 9 
                                  ? "bg-emerald-500 text-slate-950 shadow-sm" 
                                  : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              JST (+9h)
                            </button>
                            <button
                              type="button"
                              onClick={() => setTimezoneOffset(0)}
                              className={`flex-1 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                                timezoneOffset === 0 
                                  ? "bg-emerald-500 text-slate-950 shadow-sm" 
                                  : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              UTC (+0h)
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase font-mono">
                            Talker ID / トーカーID
                          </span>
                          <div className="flex bg-slate-950/80 rounded-lg p-0.5 border border-slate-900">
                            <button
                              type="button"
                              onClick={() => setTalkerId("GP")}
                              className={`flex-1 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                                talkerId === "GP" 
                                  ? "bg-emerald-500 text-slate-950 shadow-sm" 
                                  : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              $GP (GPS)
                            </button>
                            <button
                              type="button"
                              onClick={() => setTalkerId("GN")}
                              className={`flex-1 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                                talkerId === "GN" 
                                  ? "bg-emerald-500 text-slate-950 shadow-sm" 
                                  : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              $GN (GNSS)
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="text-[9px] text-slate-500 leading-normal">
                        * 公式アプリの変換はJST(+9h)基準です。RaceChrono等の解析アプリで時差ズレする場合はUTC(+0h)を推奨します。
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-mono">
                        Export Format Selection / 変換形式の選択
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">ダウンロードするファイル形式を指定してください</p>
                    </div>

                    {/* Format Card Options */}
                    <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                      
                      {/* NMEA Card */}
                      <div 
                        onClick={() => setExportFormat("nmea")}
                        className={`border p-3 rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                          exportFormat === "nmea"
                            ? "bg-emerald-950/25 border-emerald-500/80 text-emerald-400"
                            : "bg-slate-950/20 border-slate-900 hover:border-slate-850 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">STANDARD NMEA-0183 (.nmea)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "nmea"}
                            onChange={() => setExportFormat("nmea")}
                            className="accent-emerald-400 cursor-pointer"
                          />
                        </div>
                        <p className="text-[9px] text-slate-500 leading-normal">
                          標準的なNMEA-0183。RaceChrono、Harry's LapTimer等の解析アプリに最適。
                        </p>
                      </div>

                      {/* GPX Card */}
                      <div 
                        onClick={() => setExportFormat("gpx")}
                        className={`border p-3 rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                          exportFormat === "gpx"
                            ? "bg-emerald-950/25 border-emerald-500/80 text-emerald-400"
                            : "bg-slate-950/20 border-slate-900 hover:border-slate-850 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">GPX TRACK (.gpx)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "gpx"}
                            onChange={() => setExportFormat("gpx")}
                            className="accent-emerald-400 cursor-pointer"
                          />
                        </div>
                        <p className="text-[9px] text-slate-500 leading-normal">
                          Google Earth、Garmin、Strava等で読み込み可能なXML軌跡。
                        </p>
                      </div>

                      {/* CSV Card */}
                      <div 
                        onClick={() => setExportFormat("csv")}
                        className={`border p-3 rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                          exportFormat === "csv"
                            ? "bg-emerald-950/25 border-emerald-500/80 text-emerald-400"
                            : "bg-slate-950/20 border-slate-900 hover:border-slate-850 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">SPREADSHEET CSV (.csv)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "csv"}
                            onChange={() => setExportFormat("csv")}
                            className="accent-emerald-400 cursor-pointer"
                          />
                        </div>
                        <p className="text-[9px] text-slate-500 leading-normal">
                          ExcelやPython Pandas、MATLAB等で車速・位置情報を数値解析するためのデータ。
                        </p>
                      </div>

                      {/* TXT Card (Raw space-separated output format) */}
                      <div 
                        onClick={() => setExportFormat("txt")}
                        className={`border p-3 rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                          exportFormat === "txt"
                            ? "bg-emerald-950/25 border-emerald-500/80 text-emerald-400"
                            : "bg-slate-950/20 border-slate-900 hover:border-slate-850 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">RAW GPS TXT (.txt)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "txt"}
                            onChange={() => setExportFormat("txt")}
                            className="accent-emerald-400 cursor-pointer"
                          />
                        </div>
                        <p className="text-[9px] text-slate-500 leading-normal">
                          Pythonスクリプト形式に完全準拠したスペース区切りのタイムスタンプ・座標・車速データ。
                        </p>
                      </div>

                      {/* HTML Map Card */}
                      <div 
                        onClick={() => setExportFormat("html")}
                        className={`border p-3 rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                          exportFormat === "html"
                            ? "bg-emerald-950/25 border-emerald-500/80 text-emerald-400"
                            : "bg-slate-950/20 border-slate-900 hover:border-slate-850 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">INTERACTIVE HTML MAP (.html)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "html"}
                            onChange={() => setExportFormat("html")}
                            className="accent-emerald-400 cursor-pointer"
                          />
                        </div>
                        <p className="text-[9px] text-slate-500 leading-normal">
                          Leaflet.jsと暗色地図を採用した、ブラウザで即座に動作する単一ファイルの軌跡マップ。
                        </p>
                      </div>

                    </div>
                  </div>

                  {/* Big Action Download Button */}
                  <button
                    onClick={handleDownload}
                    className="w-full mt-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 transition-all cursor-pointer border border-emerald-400/20"
                  >
                    <FileDown className="w-4 h-4 text-slate-950" />
                    変換ファイルをダウンロード
                  </button>
                </div>
              </motion.div>

              {/* Racetrack Visualizer and Speed Profile Graph */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
              >
                <TrackPreview points={adjustedFile.points} />
              </motion.div>
            </div>
          )}
        </div>

        {/* Minimal Information Sidebar / Footer */}
        <div className="bg-slate-900/10 border border-slate-900 rounded-2xl p-6 flex flex-col gap-3 shadow-md">
          <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-mono flex items-center gap-1.5">
            <Info className="w-4 h-4 text-emerald-400" />
            仕様とセキュリティについて
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400 leading-relaxed">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-300">bnx4 / bon4 仕様への互換</span>
              <p>
                bnx4 / bon4 のログデータは内部的にNMEA-0183に準拠しています。本ツールは独自の拡張子を判定し、標準的なGPSソフトウェアで読み込めるようNMEA行を最適化、またはGPX/CSVへ整形します。
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-300">セキュアなブラウザ処理 (100% Client-Side)</span>
              <p>
                お使いのログファイルがサーバーに送信されることはありません。すべてのデコード、解析、変換処理はお使いのブラウザ内部で安全に行われます。完全オフライン環境でも動作します。
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
