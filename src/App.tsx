import React, { useState, useEffect } from "react";
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
  Info,
  Sun,
  Moon,
  Monitor
} from "lucide-react";
import { motion } from "motion/react";
import { UploadZone } from "./components/UploadZone";
import { TrackPreview } from "./components/TrackPreview";
import { ParsedGPSFile } from "./types";
import { adjustParsedFile } from "./utils/parser";
import { convertToGPX, convertToCSV, convertToNMEA, convertToTXT, convertToHTMLMap } from "./utils/converter";

export default function App() {
  const [file, setFile] = useState<ParsedGPSFile | null>(null);
  const [exportFormat, setExportFormat] = useState<"nmea" | "gpx" | "csv" | "txt" | "html">("nmea");
  const [timezoneOffset, setTimezoneOffset] = useState<number>(9); // Default to JST (+9) to match official app output
  const [talkerId, setTalkerId] = useState<"GP" | "GN">("GP");
  const [trimStartSec, setTrimStartSec] = useState<number>(0);
  const [trimEndSec, setTrimEndSec] = useState<number>(0);

  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    return (localStorage.getItem("theme") as "light" | "dark" | "system") || "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const isDark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    applyTheme();
    localStorage.setItem("theme", theme);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        applyTheme();
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const handleFileLoaded = (loadedFile: ParsedGPSFile) => {
    setFile(loadedFile);
    setTrimStartSec(0);
    setTrimEndSec(loadedFile.stats.durationSeconds);
  };

  // Calculate milliseconds for trimming
  const { trimStartMs, trimEndMs } = React.useMemo(() => {
    if (!file || !file.stats.startTime) return { trimStartMs: null, trimEndMs: null };
    const origStartMs = file.stats.startTime.getTime();
    const shiftedStartMs = origStartMs + timezoneOffset * 3600 * 1000;
    
    const trimStartMs = shiftedStartMs + trimStartSec * 1000;
    const trimEndMs = shiftedStartMs + trimEndSec * 1000;
    return { trimStartMs, trimEndMs };
  }, [file, timezoneOffset, trimStartSec, trimEndSec]);

  // Calculate full timezone-shifted file without trim filter for full graph reference
  const fullAdjustedFile = React.useMemo(() => {
    if (!file) return null;
    return adjustParsedFile(file, timezoneOffset, talkerId, null, null);
  }, [file, timezoneOffset, talkerId]);

  // Dynamically calculate the timezone-shifted & talker ID-adapted file with trim applied
  const adjustedFile = React.useMemo(() => {
    if (!file) return null;
    return adjustParsedFile(file, timezoneOffset, talkerId, trimStartMs, trimEndMs);
  }, [file, timezoneOffset, talkerId, trimStartMs, trimEndMs]);

  const handleTrimChange = (startSec: number, endSec: number) => {
    setTrimStartSec(startSec);
    setTrimEndSec(endSec);
  };

  const handleResetTrim = () => {
    if (!file) return;
    setTrimStartSec(0);
    setTrimEndSec(file.stats.durationSeconds);
  };

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col antialiased font-sans transition-colors duration-200">
      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-10 flex flex-col gap-6 justify-center">
        
        {/* Header with Theme Switcher */}
        <div className="relative text-center flex flex-col items-center gap-2 pt-4">
          {/* Theme Switcher Toggle */}
          <div className="absolute right-0 top-0 flex items-center bg-slate-200/70 dark:bg-slate-800 p-1 rounded-lg border border-slate-300/50 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setTheme("light")}
              title="ライトモード"
              className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                theme === "light"
                  ? "bg-white dark:bg-slate-700 text-amber-500 shadow-xs font-semibold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Sun className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              title="ダークモード"
              className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                theme === "dark"
                  ? "bg-white dark:bg-slate-700 text-blue-400 shadow-xs font-semibold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Moon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("system")}
              title="システム設定に従う"
              className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                theme === "system"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs font-semibold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Monitor className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 p-3 rounded-xl text-blue-600 dark:text-blue-400 mt-2 sm:mt-0">
            <Compass className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              BNX4 NMEA Converter
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              GPS ログ 変換ツール
            </p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            デジスパイス4の bnx4 / bon4 ログを RaceChrono や Google Earth 等で読み込み可能な標準 NMEA / GPX / CSV フォーマットに変換します。
          </p>
        </div>

        {/* Upload Zone */}
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">GPS ログファイルのアップロード</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">ファイルをドロップするか、デバイスから選択してください</p>
            </div>

            <UploadZone onFileLoaded={handleFileLoaded} />
          </div>

          {/* Active File Context & Conversion Panel */}
          {adjustedFile && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Column: Track Info Summary */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wider uppercase font-mono">
                      Track Information / 走行ログ概要
                    </h3>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="bg-blue-50 dark:bg-blue-950/60 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900">
                        <Navigation className="w-5 h-5 text-blue-600 dark:text-blue-400 rotate-45" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">FILE NAME</p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono truncate">{adjustedFile.metadata.name}</p>
                      </div>
                    </div>
                  </div>

                  {/* Main statistics grid */}
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-2.5 rounded-lg flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-medium font-mono">Duration / 走行時間</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{formatDuration(adjustedFile.stats.durationSeconds)}</span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-2.5 rounded-lg flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-medium font-mono">Points / GPSログ数</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono">{adjustedFile.stats.pointCount.toLocaleString()} 点</span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-2.5 rounded-lg flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <Gauge className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span className="text-[10px] font-medium font-mono">Max Speed / 最高車速</span>
                      </div>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono">
                        {adjustedFile.stats.maxSpeedKmh.toFixed(1)} <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">km/h</span>
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-2.5 rounded-lg flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <Gauge className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                        <span className="text-[10px] font-medium font-mono">Avg Speed / 平均車速</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-mono">
                        {adjustedFile.stats.averageSpeedKmh.toFixed(1)} <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">km/h</span>
                      </span>
                    </div>
                  </div>

                  {/* Additional coordinate locks and timeline timestamps */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-lg p-3 flex flex-col gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">START TIME ({tzLabel})</span>
                      <span className="text-slate-700 dark:text-slate-200 font-medium">{formatTime(adjustedFile.stats.startTime)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">END TIME ({tzLabel})</span>
                      <span className="text-slate-700 dark:text-slate-200 font-medium">{formatTime(adjustedFile.stats.endTime)}</span>
                    </div>
                    <div className="h-px bg-slate-200 dark:bg-slate-700 my-0.5" />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">COORDINATES</span>
                      <span className="text-[11px] text-slate-700 dark:text-slate-200">
                        {adjustedFile.stats.startLat?.toFixed(5)}, {adjustedFile.stats.startLon?.toFixed(5)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Converter and Exporter Panel */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4 justify-between shadow-sm">
                  <div className="flex flex-col gap-4">
                    
                    {/* Timezone and Talker ID settings */}
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 border border-slate-200 dark:border-slate-700/60 rounded-lg flex flex-col gap-3">
                      <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 tracking-wider uppercase font-mono">
                        Conversion Settings / 変換設定
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 font-mono">
                            時差補正
                          </span>
                          <div className="flex bg-slate-200/70 dark:bg-slate-700/70 rounded-md p-0.5">
                            <button
                              type="button"
                              onClick={() => setTimezoneOffset(9)}
                              className={`flex-1 py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                                timezoneOffset === 9 
                                  ? "bg-blue-600 text-white shadow-xs" 
                                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                              }`}
                            >
                              JST (+9h)
                            </button>
                            <button
                              type="button"
                              onClick={() => setTimezoneOffset(0)}
                              className={`flex-1 py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                                timezoneOffset === 0 
                                  ? "bg-blue-600 text-white shadow-xs" 
                                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                              }`}
                            >
                              UTC (+0h)
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 font-mono">
                            トーカーID
                          </span>
                          <div className="flex bg-slate-200/70 dark:bg-slate-700/70 rounded-md p-0.5">
                            <button
                              type="button"
                              onClick={() => setTalkerId("GP")}
                              className={`flex-1 py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                                talkerId === "GP" 
                                  ? "bg-blue-600 text-white shadow-xs" 
                                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                              }`}
                            >
                              $GP (GPS)
                            </button>
                            <button
                              type="button"
                              onClick={() => setTalkerId("GN")}
                              className={`flex-1 py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                                talkerId === "GN" 
                                  ? "bg-blue-600 text-white shadow-xs" 
                                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                              }`}
                            >
                              $GN (GNSS)
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                        * 公式アプリの出力はJST(+9h)基準です。RaceChrono等の解析アプリで時刻がズレる場合はUTC(+0h)をお試しください。
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 tracking-wider uppercase font-mono">
                        Export Format Selection / 変換形式の選択
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">ダウンロードするファイル形式を指定してください</p>
                    </div>

                    {/* Format Card Options */}
                    <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                      
                      {/* NMEA Card */}
                      <div 
                        onClick={() => setExportFormat("nmea")}
                        className={`border p-2.5 rounded-lg cursor-pointer flex flex-col gap-0.5 transition-colors ${
                          exportFormat === "nmea"
                            ? "bg-blue-50/70 dark:bg-blue-950/50 border-blue-400 dark:border-blue-500 text-blue-900 dark:text-blue-100"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">STANDARD NMEA-0183 (.nmea)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "nmea"}
                            onChange={() => setExportFormat("nmea")}
                            className="accent-blue-600 cursor-pointer"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                          標準的なNMEA-0183。RaceChrono、Harry's LapTimer等の解析アプリに最適。
                        </p>
                      </div>

                      {/* GPX Card */}
                      <div 
                        onClick={() => setExportFormat("gpx")}
                        className={`border p-2.5 rounded-lg cursor-pointer flex flex-col gap-0.5 transition-colors ${
                          exportFormat === "gpx"
                            ? "bg-blue-50/70 dark:bg-blue-950/50 border-blue-400 dark:border-blue-500 text-blue-900 dark:text-blue-100"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">GPX TRACK (.gpx)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "gpx"}
                            onChange={() => setExportFormat("gpx")}
                            className="accent-blue-600 cursor-pointer"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                          Google Earth、Garmin、Strava等で読み込み可能なXML軌跡。
                        </p>
                      </div>

                      {/* CSV Card */}
                      <div 
                        onClick={() => setExportFormat("csv")}
                        className={`border p-2.5 rounded-lg cursor-pointer flex flex-col gap-0.5 transition-colors ${
                          exportFormat === "csv"
                            ? "bg-blue-50/70 dark:bg-blue-950/50 border-blue-400 dark:border-blue-500 text-blue-900 dark:text-blue-100"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">SPREADSHEET CSV (.csv)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "csv"}
                            onChange={() => setExportFormat("csv")}
                            className="accent-blue-600 cursor-pointer"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                          ExcelやPython Pandas、MATLAB等で車速・位置情報を数値解析するためのデータ。
                        </p>
                      </div>

                      {/* TXT Card */}
                      <div 
                        onClick={() => setExportFormat("txt")}
                        className={`border p-2.5 rounded-lg cursor-pointer flex flex-col gap-0.5 transition-colors ${
                          exportFormat === "txt"
                            ? "bg-blue-50/70 dark:bg-blue-950/50 border-blue-400 dark:border-blue-500 text-blue-900 dark:text-blue-100"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">RAW GPS TXT (.txt)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "txt"}
                            onChange={() => setExportFormat("txt")}
                            className="accent-blue-600 cursor-pointer"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                          スペース区切りのタイムスタンプ・座標・車速データ。
                        </p>
                      </div>

                      {/* HTML Map Card */}
                      <div 
                        onClick={() => setExportFormat("html")}
                        className={`border p-2.5 rounded-lg cursor-pointer flex flex-col gap-0.5 transition-colors ${
                          exportFormat === "html"
                            ? "bg-blue-50/70 dark:bg-blue-950/50 border-blue-400 dark:border-blue-500 text-blue-900 dark:text-blue-100"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider font-mono">INTERACTIVE HTML MAP (.html)</span>
                          <input
                            type="radio"
                            name="exportFormat"
                            checked={exportFormat === "html"}
                            onChange={() => setExportFormat("html")}
                            className="accent-blue-600 cursor-pointer"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                          Leaflet.jsを採用した、ブラウザで即座に動作する単一ファイルの軌跡マップ。
                        </p>
                      </div>

                    </div>
                  </div>

                  {/* Action Download Button */}
                  <button
                    onClick={handleDownload}
                    className="w-full mt-3 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <FileDown className="w-4 h-4 text-white" />
                    変換ファイルをダウンロード
                  </button>
                </div>
              </div>

              {/* Racetrack Visualizer and Speed Profile Graph with Integrated Time Trimming */}
              {file && adjustedFile && (
                <div>
                  <TrackPreview 
                    points={adjustedFile.points} 
                    fullPoints={fullAdjustedFile?.points}
                    originalStartTime={file.stats.startTime}
                    originalEndTime={file.stats.endTime}
                    totalDurationSec={file.stats.durationSeconds}
                    trimStartSec={trimStartSec}
                    trimEndSec={trimEndSec}
                    timezoneOffset={timezoneOffset}
                    onTrimChange={handleTrimChange}
                    onResetTrim={handleResetTrim}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Information Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-3 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 tracking-wider uppercase font-mono flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            仕様とセキュリティについて
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-800 dark:text-slate-200">bnx4 / bon4 仕様への互換</span>
              <p>
                bnx4 / bon4 のログデータは内部的にNMEA-0183に準拠しています。本ツールは独自の拡張子を判定し、標準的なGPSソフトウェアで読み込めるようNMEA行を最適化、またはGPX/CSVへ整形します。
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-800 dark:text-slate-200">セキュアなブラウザ処理 (100% Client-Side)</span>
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

