import React, { useState, useEffect } from "react";
import { Clock, RotateCcw, Scissors, ChevronLeft, ChevronRight } from "lucide-react";

interface TimeRangePickerProps {
  originalStartTime: Date | null;
  originalEndTime: Date | null;
  timezoneOffset: number;
  trimStartSec: number;
  trimEndSec: number;
  totalDurationSec: number;
  onTrimChange: (startSec: number, endSec: number) => void;
  onReset: () => void;
}

export function TimeRangePicker({
  originalStartTime,
  originalEndTime,
  timezoneOffset,
  trimStartSec,
  trimEndSec,
  totalDurationSec,
  onTrimChange,
  onReset,
}: TimeRangePickerProps) {
  if (!originalStartTime || !originalEndTime || totalDurationSec <= 0) {
    return null;
  }

  // Helper to convert relative seconds from log start to HH:mm:ss in current timezone
  const secToFormattedTime = (sec: number): string => {
    const adjustedStart = new Date(originalStartTime.getTime() + timezoneOffset * 3600 * 1000);
    const targetDate = new Date(adjustedStart.getTime() + sec * 1000);
    const hh = targetDate.getUTCHours().toString().padStart(2, "0");
    const mm = targetDate.getUTCMinutes().toString().padStart(2, "0");
    const ss = targetDate.getUTCSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  // Convert HH:mm:ss back to relative seconds from log start
  const formattedTimeToSec = (timeStr: string): number | null => {
    const parts = timeStr.split(":").map(Number);
    if (parts.length < 2 || parts.some(isNaN)) return null;
    const [h, m, s = 0] = parts;

    const adjustedStart = new Date(originalStartTime.getTime() + timezoneOffset * 3600 * 1000);
    const startH = adjustedStart.getUTCHours();
    const startM = adjustedStart.getUTCMinutes();
    const startS = adjustedStart.getUTCSeconds();

    const startTotalSec = startH * 3600 + startM * 60 + startS;
    const targetTotalSec = h * 3600 + m * 60 + s;

    let diffSec = targetTotalSec - startTotalSec;
    if (diffSec < -43200) diffSec += 86400; // Handling midnight rollover
    if (diffSec > 129600) diffSec -= 86400;

    return Math.max(0, Math.min(totalDurationSec, diffSec));
  };

  const [startTimeStr, setStartTimeStr] = useState(secToFormattedTime(trimStartSec));
  const [endTimeStr, setEndTimeStr] = useState(secToFormattedTime(trimEndSec));

  useEffect(() => {
    setStartTimeStr(secToFormattedTime(trimStartSec));
  }, [trimStartSec, originalStartTime, timezoneOffset]);

  useEffect(() => {
    setEndTimeStr(secToFormattedTime(trimEndSec));
  }, [trimEndSec, originalStartTime, timezoneOffset]);

  const handleStartTextBlur = () => {
    const parsed = formattedTimeToSec(startTimeStr);
    if (parsed !== null) {
      const clampedStart = Math.min(parsed, trimEndSec - 1);
      onTrimChange(clampedStart, trimEndSec);
    } else {
      setStartTimeStr(secToFormattedTime(trimStartSec));
    }
  };

  const handleEndTextBlur = () => {
    const parsed = formattedTimeToSec(endTimeStr);
    if (parsed !== null) {
      const clampedEnd = Math.max(parsed, trimStartSec + 1);
      onTrimChange(trimStartSec, clampedEnd);
    } else {
      setEndTimeStr(secToFormattedTime(trimEndSec));
    }
  };

  const adjustStart = (deltaSec: number) => {
    const newStart = Math.max(0, Math.min(trimEndSec - 1, trimStartSec + deltaSec));
    onTrimChange(newStart, trimEndSec);
  };

  const adjustEnd = (deltaSec: number) => {
    const newEnd = Math.min(totalDurationSec, Math.max(trimStartSec + 1, trimEndSec + deltaSec));
    onTrimChange(trimStartSec, newEnd);
  };

  const isTrimmed = trimStartSec > 0 || trimEndSec < totalDurationSec;
  const currentDurationSec = trimEndSec - trimStartSec;

  const formatDurationText = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const parts = [];
    if (h > 0) parts.push(`${h}時間`);
    if (m > 0 || h > 0) parts.push(`${m}分`);
    parts.push(`${s}秒`);
    return parts.join(" ");
  };

  const startPercent = (trimStartSec / totalDurationSec) * 100;
  const endPercent = (trimEndSec / totalDurationSec) * 100;

  return (
    <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col gap-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 font-mono">
          <Scissors className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>時間指定トリミング (GUI)</span>
        </div>
        {isTrimmed && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            全期間にリセット
          </button>
        )}
      </div>

      {/* Visual Dual Progress Track */}
      <div className="flex flex-col gap-2 my-1">
        <div className="relative w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
          <div
            className="absolute top-0 bottom-0 bg-blue-500 rounded-full transition-all"
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(0, endPercent - startPercent)}%`,
            }}
          />
        </div>

        {/* Range Sliders Controls */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <span>開始スライダー</span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold">{secToFormattedTime(trimStartSec)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, trimEndSec - 1)}
              value={trimStartSec}
              onChange={(e) => onTrimChange(Number(e.target.value), trimEndSec)}
              className="w-full accent-blue-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <span>終了スライダー</span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold">{secToFormattedTime(trimEndSec)}</span>
            </div>
            <input
              type="range"
              min={Math.min(totalDurationSec, trimStartSec + 1)}
              max={totalDurationSec}
              value={trimEndSec}
              onChange={(e) => onTrimChange(trimStartSec, Number(e.target.value))}
              className="w-full accent-blue-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Detailed Start & End Time Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Start Time Section */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 flex flex-col gap-2">
          <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 font-mono">
            <span>START TIME / 開始時刻</span>
            <span className="text-slate-400 dark:text-slate-500 font-normal">HH:mm:ss</span>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={startTimeStr}
              onChange={(e) => setStartTimeStr(e.target.value)}
              onBlur={handleStartTextBlur}
              onKeyDown={(e) => e.key === "Enter" && handleStartTextBlur()}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1 text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 focus:outline-none focus:border-blue-500 text-center shadow-xs"
              placeholder="00:00:00"
            />
          </div>

          {/* Steppers */}
          <div className="flex gap-1 justify-center">
            <button
              type="button"
              onClick={() => adjustStart(-60)}
              className="flex-1 py-1 text-[10px] font-mono font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
            >
              -1分
            </button>
            <button
              type="button"
              onClick={() => adjustStart(-10)}
              className="flex-1 py-1 text-[10px] font-mono font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
            >
              -10秒
            </button>
            <button
              type="button"
              onClick={() => adjustStart(10)}
              className="flex-1 py-1 text-[10px] font-mono font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
            >
              +10秒
            </button>
            <button
              type="button"
              onClick={() => adjustStart(60)}
              className="flex-1 py-1 text-[10px] font-mono font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
            >
              +1分
            </button>
          </div>
        </div>

        {/* End Time Section */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 flex flex-col gap-2">
          <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 font-mono">
            <span>END TIME / 終了時刻</span>
            <span className="text-slate-400 dark:text-slate-500 font-normal">HH:mm:ss</span>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={endTimeStr}
              onChange={(e) => setEndTimeStr(e.target.value)}
              onBlur={handleEndTextBlur}
              onKeyDown={(e) => e.key === "Enter" && handleEndTextBlur()}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1 text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 focus:outline-none focus:border-blue-500 text-center shadow-xs"
              placeholder="00:00:00"
            />
          </div>

          {/* Steppers */}
          <div className="flex gap-1 justify-center">
            <button
              type="button"
              onClick={() => adjustEnd(-60)}
              className="flex-1 py-1 text-[10px] font-mono font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
            >
              -1分
            </button>
            <button
              type="button"
              onClick={() => adjustEnd(-10)}
              className="flex-1 py-1 text-[10px] font-mono font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
            >
              -10秒
            </button>
            <button
              type="button"
              onClick={() => adjustEnd(10)}
              className="flex-1 py-1 text-[10px] font-mono font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
            >
              +10秒
            </button>
            <button
              type="button"
              onClick={() => adjustEnd(60)}
              className="flex-1 py-1 text-[10px] font-mono font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
            >
              +1分
            </button>
          </div>
        </div>
      </div>

      {/* Summary info banner */}
      <div className="flex justify-between items-center text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700/60">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>選択期間: <strong className="text-slate-900 dark:text-slate-100 font-semibold">{formatDurationText(currentDurationSec)}</strong></span>
        </div>
        <div className="text-slate-400 dark:text-slate-500 text-[11px]">
          全 {totalDurationSec > 0 ? Math.round((currentDurationSec / totalDurationSec) * 100) : 100}% を抽出
        </div>
      </div>
    </div>
  );
}

