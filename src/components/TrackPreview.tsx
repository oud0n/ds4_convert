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
    <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col gap-5 shadow-xl">
      {/* Top Header */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-mono flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            Telemetry Analysis / 走行データ解析 & 時間指定トリミング
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">車速グラフで抽出区間の開始・終了時刻を設定できます</p>
        </div>

        {isTrimmed && onResetTrim && (
          <button
            type="button"
            onClick={onResetTrim}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-900/60 px-3 py-1 rounded-lg transition-all cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            全期間表示に戻す
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* Track Trace Visualizer */}
        <div className="md:col-span-3 flex flex-col items-center justify-center bg-slate-950/60 border border-slate-900/80 rounded-xl p-3 relative h-[300px]">
          <span className="absolute top-2.5 left-2.5 text-[9px] font-bold text-slate-600 tracking-widest font-mono uppercase">
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
                stroke="#1e293b"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={fullPolylineStr}
              />

              {/* Trimmed active track segment */}
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={trimmedPolylineStr}
                className="drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]"
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
                  <circle r="6" fill="#f43f5e" stroke="#ffffff" strokeWidth="1.5" />
                </g>
              )}

              {/* Active / Hovered vehicle location glowing dot */}
              {activePoint && (
                <g transform={`translate(${activePoint.x}, ${activePoint.y})`}>
                  <circle r="10" fill="rgba(16, 185, 129, 0.3)" className="animate-ping" />
                  <circle r="6" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" className="shadow-lg" />
                </g>
              )}
            </svg>
          )}

          {/* Map Legends */}
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-3 text-[9px] font-mono text-slate-500">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 border border-white/20" />
              <span>抽出開始 (START)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 border border-white/20" />
              <span>抽出終了 (END)</span>
            </div>
          </div>
        </div>

        {/* Live Telemetry Display */}
        <div className="md:col-span-2 flex flex-col justify-between gap-3 bg-slate-950/30 border border-slate-900/60 rounded-xl p-4">
          <div className="flex flex-col gap-3">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider font-mono uppercase">
              LIVE TELEMETRY / リアルタイム表示
            </span>
            
            {activePoint ? (
              <div className="flex flex-col gap-3 mt-1">
                {/* Speed */}
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-950/40 p-2 rounded-lg border border-emerald-900/30">
                    <Gauge className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block font-mono">SPEED</span>
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      {activePoint.speed.toFixed(1)} <span className="text-xs text-slate-500">km/h</span>
                    </span>
                  </div>
                </div>

                {/* Heading */}
                <div className="flex items-center gap-3">
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <Compass className="w-4 h-4 text-slate-400" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block font-mono">HEADING</span>
                    <span className="text-sm font-semibold font-mono text-slate-200">
                      {activePoint.heading.toFixed(1)}° <span className="text-xs text-slate-500">DEG</span>
                    </span>
                  </div>
                </div>

                {/* Time */}
                <div className="flex items-center gap-3">
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <Clock className="w-4 h-4 text-slate-400" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block font-mono">TIME</span>
                    <span className="text-xs font-mono text-slate-300">
                      {secToFormattedTime(activePoint.sec)}
                    </span>
                  </div>
                </div>

                {/* Quick Set Start / End Buttons for hovered point */}
                {onTrimChange && (
                  <div className="flex gap-2 mt-1 pt-2 border-t border-slate-900">
                    <button
                      type="button"
                      onClick={() => {
                        const newStart = Math.min(activePoint.sec, currentEndSec - 1);
                        onTrimChange(newStart, currentEndSec);
                      }}
                      className="flex-1 py-1.5 px-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 rounded-lg text-[10px] font-bold text-emerald-300 flex items-center justify-center gap-1 cursor-pointer transition-all shadow-sm active:scale-95"
                    >
                      <Flag className="w-3 h-3 text-emerald-400" />
                      ここを開始地に設定
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newEnd = Math.max(activePoint.sec, currentStartSec + 1);
                        onTrimChange(currentStartSec, newEnd);
                      }}
                      className="flex-1 py-1.5 px-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 rounded-lg text-[10px] font-bold text-rose-300 flex items-center justify-center gap-1 cursor-pointer transition-all shadow-sm active:scale-95"
                    >
                      <Flag className="w-3 h-3 text-rose-400" />
                      ここを終了地に設定
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic py-6 text-center">
                グラフにカーソルを合わせるとテレメトリが表示されます
              </div>
            )}
          </div>

          <div className="border-t border-slate-900 pt-2.5 flex flex-col gap-1 text-[10px] text-slate-500 font-mono">
            <div className="flex justify-between">
              <span>LATITUDE:</span>
              <span className="text-slate-400">{activePoint?.y !== undefined ? validPoints[activePoint.index].latitude?.toFixed(6) : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>LONGITUDE:</span>
              <span className="text-slate-400">{activePoint?.x !== undefined ? validPoints[activePoint.index].longitude?.toFixed(6) : "--"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Speed Graph Profile & Interactive Time Trimming Controls */}
      <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 tracking-wider font-mono uppercase flex items-center gap-1.5">
            <Scissors className="w-3.5 h-3.5 text-emerald-400" />
            SPEED PROFILE / 車速グラフ (km/h) & 時間トリミング
          </span>

          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
            <span>抽出範囲:</span>
            <span className="text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/50">
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
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              
              <XAxis 
                dataKey="sec" 
                type="number"
                domain={[0, maxSec]}
                stroke="#475569" 
                fontSize={9} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(s) => secToFormattedTime(s)}
              />
              <YAxis 
                stroke="#475569" 
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
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded shadow-lg text-[10px] font-mono text-slate-200">
                        <div className="text-slate-400 font-bold mb-0.5">TIME: {data.name}</div>
                        <div className="text-emerald-400 font-bold">SPEED: {data.speed} km/h</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Dim out excluded ranges */}
              {currentStartSec > 0 && (
                <ReferenceArea x1={0} x2={currentStartSec} fill="#020617" fillOpacity={0.65} />
              )}
              {currentEndSec < maxSec && (
                <ReferenceArea x1={currentEndSec} x2={maxSec} fill="#020617" fillOpacity={0.65} />
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
                stroke="#f43f5e" 
                strokeWidth={2}
                label={{ value: "🏁 終了", fill: "#f43f5e", fontSize: 10, position: "top" }}
              />

              <Area 
                type="monotone" 
                dataKey="speed" 
                stroke="#10b981" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#speedGlow)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Integrated Range Sliders & Time Input Controls */}
        {onTrimChange && maxSec > 0 && (
          <div className="flex flex-col gap-3 mt-1 pt-3 border-t border-slate-900">
            {/* Visual dual slider bar */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                  <span>開始スライダー</span>
                  <span className="text-emerald-400 font-bold">{secToFormattedTime(currentStartSec)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, currentEndSec - 1)}
                  value={currentStartSec}
                  onChange={(e) => onTrimChange(Number(e.target.value), currentEndSec)}
                  className="w-full accent-emerald-400 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                  <span>終了スライダー</span>
                  <span className="text-rose-400 font-bold">{secToFormattedTime(currentEndSec)}</span>
                </div>
                <input
                  type="range"
                  min={Math.min(maxSec, currentStartSec + 1)}
                  max={maxSec}
                  value={currentEndSec}
                  onChange={(e) => onTrimChange(currentStartSec, Number(e.target.value))}
                  className="w-full accent-rose-400 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Steppers & Text Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Start Time Input */}
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-850 flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 font-bold">
                  <span className="text-emerald-400">🚩 START / 開始時刻</span>
                  <span className="text-slate-500 font-normal">HH:mm:ss</span>
                </div>
                <input
                  type="text"
                  value={startTimeInput}
                  onChange={(e) => setStartTimeInput(e.target.value)}
                  onBlur={handleStartBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleStartBlur()}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500 text-center"
                />
                <div className="flex gap-1 justify-center">
                  <button
                    type="button"
                    onClick={() => adjustStart(-60)}
                    className="flex-1 py-1 text-[9px] font-mono font-bold bg-slate-950 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 transition-all cursor-pointer"
                  >
                    -1分
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustStart(-10)}
                    className="flex-1 py-1 text-[9px] font-mono font-bold bg-slate-950 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 transition-all cursor-pointer"
                  >
                    -10秒
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustStart(10)}
                    className="flex-1 py-1 text-[9px] font-mono font-bold bg-slate-950 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 transition-all cursor-pointer"
                  >
                    +10秒
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustStart(60)}
                    className="flex-1 py-1 text-[9px] font-mono font-bold bg-slate-950 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 transition-all cursor-pointer"
                  >
                    +1分
                  </button>
                </div>
              </div>

              {/* End Time Input */}
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-850 flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 font-bold">
                  <span className="text-rose-400">🏁 END / 終了時刻</span>
                  <span className="text-slate-500 font-normal">HH:mm:ss</span>
                </div>
                <input
                  type="text"
                  value={endTimeInput}
                  onChange={(e) => setEndTimeInput(e.target.value)}
                  onBlur={handleEndBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleEndBlur()}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono font-bold text-rose-400 focus:outline-none focus:border-rose-500 text-center"
                />
                <div className="flex gap-1 justify-center">
                  <button
                    type="button"
                    onClick={() => adjustEnd(-60)}
                    className="flex-1 py-1 text-[9px] font-mono font-bold bg-slate-950 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 transition-all cursor-pointer"
                  >
                    -1分
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustEnd(-10)}
                    className="flex-1 py-1 text-[9px] font-mono font-bold bg-slate-950 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 transition-all cursor-pointer"
                  >
                    -10秒
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustEnd(10)}
                    className="flex-1 py-1 text-[9px] font-mono font-bold bg-slate-950 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 transition-all cursor-pointer"
                  >
                    +10秒
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustEnd(60)}
                    className="flex-1 py-1 text-[9px] font-mono font-bold bg-slate-950 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 transition-all cursor-pointer"
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
