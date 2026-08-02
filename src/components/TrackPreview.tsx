import React, { useState, useMemo, useEffect } from "react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea
} from "recharts";
import { GPSPoint } from "../types";
import { Gauge, Compass, Activity, Clock, Flag, Scissors, RotateCcw } from "lucide-react";

interface TrackPreviewProps {
  points: GPSPoint[];
  fullPoints?: GPSPoint[];
  originalStartTime?: Date | null;
  originalEndTime?: Date | null;
  totalDurationSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  timezoneOffset?: number;
  onTrimChange?: (startSec: number, endSec: number) => void;
  onResetTrim?: () => void;
}

export const TrackPreview: React.FC<TrackPreviewProps> = ({ 
  points, 
  fullPoints,
  totalDurationSec,
  trimStartSec = 0,
  trimEndSec,
  onTrimChange,
  onResetTrim
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Use fullPoints if available to show the complete track graph, falling back to points
  const pointsToUse = useMemo(() => {
    return fullPoints && fullPoints.length > 0 ? fullPoints : points;
  }, [fullPoints, points]);

  // Filter out invalid coordinates
  const validPoints = useMemo(() => {
    return pointsToUse.filter(p => p.latitude !== null && p.longitude !== null);
  }, [pointsToUse]);

  const baseTimeMs = useMemo(() => {
    if (validPoints.length === 0 || !validPoints[0].time) return 0;
    return validPoints[0].time.getTime();
  }, [validPoints]);

  const maxSec = useMemo(() => {
    if (totalDurationSec && totalDurationSec > 0) return totalDurationSec;
    if (validPoints.length === 0 || !validPoints[validPoints.length - 1].time) return 0;
    return Math.round((validPoints[validPoints.length - 1].time!.getTime() - baseTimeMs) / 1000);
  }, [totalDurationSec, validPoints, baseTimeMs]);

  const currentStartSec = trimStartSec;
  const currentEndSec = trimEndSec ?? maxSec;

  // Formatter for relative second -> HH:mm:ss in local/shifted timezone
  const secToFormattedTime = (sec: number): string => {
    if (!baseTimeMs) return "00:00:00";
    const targetDate = new Date(baseTimeMs + sec * 1000);
    const hh = targetDate.getUTCHours().toString().padStart(2, "0");
    const mm = targetDate.getUTCMinutes().toString().padStart(2, "0");
    const ss = targetDate.getUTCSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  // Convert HH:mm:ss input back to relative seconds
  const formattedTimeToSec = (timeStr: string): number | null => {
    if (!baseTimeMs) return null;
    const parts = timeStr.split(":").map(Number);
    if (parts.length < 2 || parts.some(isNaN)) return null;
    const [h, m, s = 0] = parts;

    const baseDate = new Date(baseTimeMs);
    const startH = baseDate.getUTCHours();
    const startM = baseDate.getUTCMinutes();
    const startS = baseDate.getUTCSeconds();

    const startTotalSec = startH * 3600 + startM * 60 + startS;
    const targetTotalSec = h * 3600 + m * 60 + s;

    let diffSec = targetTotalSec - startTotalSec;
    if (diffSec < -43200) diffSec += 86400; // Midnight rollover
    if (diffSec > 129600) diffSec -= 86400;

    return Math.max(0, Math.min(maxSec, diffSec));
  };

  const [startTimeInput, setStartTimeInput] = useState<string>(secToFormattedTime(currentStartSec));
  const [endTimeInput, setEndTimeInput] = useState<string>(secToFormattedTime(currentEndSec));

  useEffect(() => {
    setStartTimeInput(secToFormattedTime(currentStartSec));
  }, [currentStartSec, baseTimeMs]);

  useEffect(() => {
    setEndTimeInput(secToFormattedTime(currentEndSec));
  }, [currentEndSec, baseTimeMs]);

  const handleStartBlur = () => {
    const parsedSec = formattedTimeToSec(startTimeInput);
    if (parsedSec !== null && onTrimChange) {
      const clampedStart = Math.min(parsedSec, currentEndSec - 1);
      onTrimChange(clampedStart, currentEndSec);
    } else {
      setStartTimeInput(secToFormattedTime(currentStartSec));
    }
  };

  const handleEndBlur = () => {
    const parsedSec = formattedTimeToSec(endTimeInput);
    if (parsedSec !== null && onTrimChange) {
      const clampedEnd = Math.max(parsedSec, currentStartSec + 1);
      onTrimChange(currentStartSec, clampedEnd);
    } else {
      setEndTimeInput(secToFormattedTime(currentEndSec));
    }
  };

  const adjustStart = (deltaSec: number) => {
    if (!onTrimChange) return;
    const newStart = Math.max(0, Math.min(currentEndSec - 1, currentStartSec + deltaSec));
    onTrimChange(newStart, currentEndSec);
  };

  const adjustEnd = (deltaSec: number) => {
    if (!onTrimChange) return;
    const newEnd = Math.min(maxSec, Math.max(currentStartSec + 1, currentEndSec + deltaSec));
    onTrimChange(currentStartSec, newEnd);
  };

  // Compute bounds and project coordinates to SVG space
  const projectedData = useMemo(() => {
    if (validPoints.length === 0) return [];

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    validPoints.forEach(p => {
      if (p.latitude! < minLat) minLat = p.latitude!;
      if (p.latitude! > maxLat) maxLat = p.latitude!;
      if (p.longitude! < minLon) minLon = p.longitude!;
      if (p.longitude! > maxLon) maxLon = p.longitude!;
    });

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    const latRad = (centerLat * Math.PI) / 180;
    const lonScale = Math.cos(latRad);

    const relativePoints = validPoints.map(p => {
      const ptTimeMs = p.time ? p.time.getTime() : baseTimeMs;
      const sec = baseTimeMs ? Math.round((ptTimeMs - baseTimeMs) / 1000) : 0;
      return {
        x: (p.longitude! - centerLon) * lonScale,
        y: p.latitude! - centerLat,
        speed: p.speedKmh || 0,
        heading: p.heading || 0,
        time: p.time,
        alt: p.altitude || 0,
        sec
      };
    });

    const xs = relativePoints.map(p => p.x);
    const ys = relativePoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const maxSpan = Math.max(spanX, spanY, 0.00001);

    const svgWidth = 400;
    const svgHeight = 280;
    const pad = 24;

    const scale = Math.min(
      (svgWidth - 2 * pad) / maxSpan,
      (svgHeight - 2 * pad) / maxSpan
    );

    const offsetX = svgWidth / 2 - ((minX + maxX) / 2) * scale;
    const offsetY = svgHeight / 2 + ((minY + maxY) / 2) * scale;

    return relativePoints.map((p, idx) => ({
      x: offsetX + p.x * scale,
      y: offsetY - p.y * scale,
      speed: p.speed,
      heading: p.heading,
      time: p.time,
      alt: p.alt,
      sec: p.sec,
      index: idx
    }));
  }, [validPoints, baseTimeMs]);

  // Trimmed points subset for map highlighting
  const trimmedProjectedData = useMemo(() => {
    const filtered = projectedData.filter(p => p.sec >= currentStartSec && p.sec <= currentEndSec);
    return filtered.length > 0 ? filtered : projectedData;
  }, [projectedData, currentStartSec, currentEndSec]);

  // Prepare data for Recharts AreaChart
  const chartData = useMemo(() => {
    if (projectedData.length === 0) return [];
    
    const step = Math.max(1, Math.floor(projectedData.length / 500));
    const result = [];
    
    for (let i = 0; i < projectedData.length; i += step) {
      const p = projectedData[i];
      let timeStr = "";
      if (p.time) {
        const d = new Date(p.time);
        timeStr = d.getUTCHours().toString().padStart(2, "0") + ":" +
                  d.getUTCMinutes().toString().padStart(2, "0") + ":" +
                  d.getUTCSeconds().toString().padStart(2, "0");
      }
      result.push({
        sec: p.sec,
        name: timeStr,
        speed: parseFloat(p.speed.toFixed(1)),
        originalIndex: p.index,
        heading: p.heading
      });
    }
    return result;
  }, [projectedData]);

  const fullPolylineStr = useMemo(() => {
    return projectedData.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }, [projectedData]);

  const trimmedPolylineStr = useMemo(() => {
    return trimmedProjectedData.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }, [trimmedProjectedData]);

  const activePoint = useMemo(() => {
    if (hoveredIndex === null || hoveredIndex < 0 || hoveredIndex >= projectedData.length) {
      return projectedData[projectedData.length - 1] || null;
    }
    return projectedData[hoveredIndex];
  }, [projectedData, hoveredIndex]);

  const isTrimmed = currentStartSec > 0 || currentEndSec < maxSec;

  if (validPoints.length === 0) {
    return null;
  }

  const startPercent = maxSec > 0 ? (currentStartSec / maxSec) * 100 : 0;
  const endPercent = maxSec > 0 ? (currentEndSec / maxSec) * 100 : 100;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-5 shadow-sm">
      {/* Top Header */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 font-mono flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Telemetry Analysis / 走行データ解析 & 時間指定トリミング
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">車速グラフで抽出区間の開始・終了時刻を設定できます</p>
        </div>

        {isTrimmed && onResetTrim && (
          <button
            type="button"
            onClick={onResetTrim}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-3 py-1 rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            全期間表示に戻す
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* Track Trace Visualizer */}
        <div className="md:col-span-3 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 relative h-[300px]">
          <span className="absolute top-2.5 left-2.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 font-mono uppercase">
            CIRCUIT ROUTE TRACE / コース図
          </span>

          {projectedData.length > 0 && (
            <svg 
              viewBox="0 0 400 280" 
              className="w-full h-full max-h-[250px]"
            >
              {/* Full track background polyline */}
              <polyline
                fill="none"
                stroke="currentColor"
                className="text-slate-300 dark:text-slate-600"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={fullPolylineStr}
              />

              {/* Trimmed active track segment */}
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={trimmedPolylineStr}
              />

              {/* Trimmed Start marker indicator */}
              {trimmedProjectedData.length > 0 && (
                <g transform={`translate(${trimmedProjectedData[0].x}, ${trimmedProjectedData[0].y})`}>
                  <circle r="6" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                </g>
              )}

              {/* Trimmed End marker indicator */}
              {trimmedProjectedData.length > 1 && (
                <g transform={`translate(${trimmedProjectedData[trimmedProjectedData.length - 1].x}, ${trimmedProjectedData[trimmedProjectedData.length - 1].y})`}>
                  <circle r="6" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                </g>
              )}

              {/* Active / Hovered vehicle location dot */}
              {activePoint && (
                <g transform={`translate(${activePoint.x}, ${activePoint.y})`}>
                  <circle r="8" fill="rgba(37, 99, 235, 0.2)" />
                  <circle r="5" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                </g>
              )}
            </svg>
          )}

          {/* Map Legends */}
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-3 text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 border border-slate-200 dark:border-slate-700" />
              <span>抽出開始 (START)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 border border-slate-200 dark:border-slate-700" />
              <span>抽出終了 (END)</span>
            </div>
          </div>
        </div>

        {/* Live Telemetry Display */}
        <div className="md:col-span-2 flex flex-col justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 font-mono uppercase">
              LIVE TELEMETRY / リアルタイム表示
            </span>
            
            {activePoint ? (
              <div className="flex flex-col gap-3 mt-1">
                {/* Speed */}
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 dark:bg-blue-950/60 p-2 rounded-lg border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400">
                    <Gauge className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">SPEED</span>
                    <span className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                      {activePoint.speed.toFixed(1)} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">km/h</span>
                    </span>
                  </div>
                </div>

                {/* Heading */}
                <div className="flex items-center gap-3">
                  <div className="bg-white dark:bg-slate-700/60 p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300">
                    <Compass className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">HEADING</span>
                    <span className="text-sm font-semibold font-mono text-slate-700 dark:text-slate-200">
                      {activePoint.heading.toFixed(1)}° <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">DEG</span>
                    </span>
                  </div>
                </div>

                {/* Time */}
                <div className="flex items-center gap-3">
                  <div className="bg-white dark:bg-slate-700/60 p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">TIME</span>
                    <span className="text-xs font-mono text-slate-700 dark:text-slate-200 font-medium">
                      {secToFormattedTime(activePoint.sec)}
                    </span>
                  </div>
                </div>

                {/* Quick Set Start / End Buttons for hovered point */}
                {onTrimChange && (
                  <div className="flex gap-2 mt-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        const newStart = Math.min(activePoint.sec, currentEndSec - 1);
                        onTrimChange(newStart, currentEndSec);
                      }}
                      className="flex-1 py-1.5 px-2 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Flag className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      ここを開始地に設定
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newEnd = Math.max(activePoint.sec, currentStartSec + 1);
                        onTrimChange(currentStartSec, newEnd);
                      }}
                      className="flex-1 py-1.5 px-2 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800 rounded-lg text-[10px] font-semibold text-red-700 dark:text-red-300 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Flag className="w-3 h-3 text-red-600 dark:text-red-400" />
                      ここを終了地に設定
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-400 dark:text-slate-500 italic py-6 text-center">
                グラフにカーソルを合わせるとテレメトリが表示されます
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex flex-col gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            <div className="flex justify-between">
              <span>LATITUDE:</span>
              <span className="text-slate-700 dark:text-slate-200">{activePoint?.y !== undefined ? validPoints[activePoint.index].latitude?.toFixed(6) : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>LONGITUDE:</span>
              <span className="text-slate-700 dark:text-slate-200">{activePoint?.x !== undefined ? validPoints[activePoint.index].longitude?.toFixed(6) : "--"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Speed Graph Profile & Interactive Time Trimming Controls */}
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 font-mono uppercase flex items-center gap-1.5">
            <Scissors className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            SPEED PROFILE / 車速グラフ (km/h) & 時間トリミング
          </span>

          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>抽出範囲:</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
              {secToFormattedTime(currentStartSec)} ~ {secToFormattedTime(currentEndSec)}
            </span>
          </div>
        </div>

        {/* Speed Chart with Reference Lines */}
        <div className="w-full h-[150px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              onMouseMove={(state) => {
                if (state && state.activeTooltipIndex !== undefined) {
                  const dataPoint = chartData[state.activeTooltipIndex];
                  if (dataPoint) {
                    setHoveredIndex(dataPoint.originalIndex);
                  }
                }
              }}
              onMouseLeave={() => setHoveredIndex(null)}
              margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="speedGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} vertical={false} />
              
              <XAxis 
                dataKey="sec" 
                type="number"
                domain={[0, maxSec]}
                stroke="#94a3b8" 
                fontSize={9} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(s) => secToFormattedTime(s)}
              />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={9} 
                tickLine={false} 
                axisLine={false} 
                domain={['auto', 'auto']}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded shadow-md text-[10px] font-mono text-slate-800 dark:text-slate-100">
                        <div className="text-slate-500 dark:text-slate-400 font-semibold mb-0.5">TIME: {data.name}</div>
                        <div className="text-blue-600 dark:text-blue-400 font-bold">SPEED: {data.speed} km/h</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Dim out excluded ranges */}
              {currentStartSec > 0 && (
                <ReferenceArea x1={0} x2={currentStartSec} fill="#64748b" fillOpacity={0.25} />
              )}
              {currentEndSec < maxSec && (
                <ReferenceArea x1={currentEndSec} x2={maxSec} fill="#64748b" fillOpacity={0.25} />
              )}

              {/* Vertical Reference Lines for Start and End */}
              <ReferenceLine 
                x={currentStartSec} 
                stroke="#10b981" 
                strokeWidth={2}
                label={{ value: "🚩 開始", fill: "#10b981", fontSize: 10, position: "top" }}
              />
              <ReferenceLine 
                x={currentEndSec} 
                stroke="#ef4444" 
                strokeWidth={2}
                label={{ value: "🏁 終了", fill: "#ef4444", fontSize: 10, position: "top" }}
              />

              <Area 
                type="monotone" 
                dataKey="speed" 
                stroke="#2563eb" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#speedGlow)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Integrated Range Sliders & Time Input Controls */}
        {onTrimChange && maxSec > 0 && (
          <div className="flex flex-col gap-3 mt-1 pt-3 border-t border-slate-200 dark:border-slate-700/60">
            {/* Visual dual slider bar */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>開始スライダー</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{secToFormattedTime(currentStartSec)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, currentEndSec - 1)}
                  value={currentStartSec}
                  onChange={(e) => onTrimChange(Number(e.target.value), currentEndSec)}
                  className="w-full accent-emerald-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>終了スライダー</span>
                  <span className="text-red-600 dark:text-red-400 font-semibold">{secToFormattedTime(currentEndSec)}</span>
                </div>
                <input
                  type="range"
                  min={Math.min(maxSec, currentStartSec + 1)}
                  max={maxSec}
                  value={currentEndSec}
                  onChange={(e) => onTrimChange(currentStartSec, Number(e.target.value))}
                  className="w-full accent-red-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Steppers & Text Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Start Time Input */}
              <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
                  <span className="text-emerald-700 dark:text-emerald-400">🚩 START / 開始時刻</span>
                  <span className="text-slate-400 dark:text-slate-500 font-normal">HH:mm:ss</span>
                </div>
                <input
                  type="text"
                  value={startTimeInput}
                  onChange={(e) => setStartTimeInput(e.target.value)}
                  onBlur={handleStartBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleStartBlur()}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1 text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 focus:outline-none focus:border-emerald-500 text-center"
                />
                <div className="flex gap-1 justify-center">
                  <button
                    type="button"
                    onClick={() => adjustStart(-60)}
                    className="flex-1 py-1 text-[10px] font-mono font-medium bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                  >
                    -1分
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustStart(-10)}
                    className="flex-1 py-1 text-[10px] font-mono font-medium bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                  >
                    -10秒
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustStart(10)}
                    className="flex-1 py-1 text-[10px] font-mono font-medium bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                  >
                    +10秒
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustStart(60)}
                    className="flex-1 py-1 text-[10px] font-mono font-medium bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                  >
                    +1分
                  </button>
                </div>
              </div>

              {/* End Time Input */}
              <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
                  <span className="text-red-700 dark:text-red-400">🏁 END / 終了時刻</span>
                  <span className="text-slate-400 dark:text-slate-500 font-normal">HH:mm:ss</span>
                </div>
                <input
                  type="text"
                  value={endTimeInput}
                  onChange={(e) => setEndTimeInput(e.target.value)}
                  onBlur={handleEndBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleEndBlur()}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1 text-xs font-mono font-semibold text-red-700 dark:text-red-400 focus:outline-none focus:border-red-500 text-center"
                />
                <div className="flex gap-1 justify-center">
                  <button
                    type="button"
                    onClick={() => adjustEnd(-60)}
                    className="flex-1 py-1 text-[10px] font-mono font-medium bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                  >
                    -1分
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustEnd(-10)}
                    className="flex-1 py-1 text-[10px] font-mono font-medium bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                  >
                    -10秒
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustEnd(10)}
                    className="flex-1 py-1 text-[10px] font-mono font-medium bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                  >
                    +10秒
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustEnd(60)}
                    className="flex-1 py-1 text-[10px] font-mono font-medium bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                  >
                    +1分
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

