import React, { useState, useMemo } from "react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { GPSPoint } from "../types";
import { Gauge, Compass, Activity, Clock } from "lucide-react";

interface TrackPreviewProps {
  points: GPSPoint[];
}

export const TrackPreview: React.FC<TrackPreviewProps> = ({ points }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 1. Filter out invalid/unlocked coordinates
  const validPoints = useMemo(() => {
    return points.filter(p => p.latitude !== null && p.longitude !== null);
  }, [points]);

  // 2. Compute bounds and project coordinates to SVG space preserving exact aspect ratio (no distortion)
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

    // Aspect ratio correction based on latitude
    const latRad = (centerLat * Math.PI) / 180;
    const lonScale = Math.cos(latRad);

    // Relativize points
    const relativePoints = validPoints.map(p => ({
      x: (p.longitude! - centerLon) * lonScale,
      y: p.latitude! - centerLat,
      speed: p.speedKmh || 0,
      heading: p.heading || 0,
      time: p.time,
      alt: p.altitude || 0
    }));

    const xs = relativePoints.map(p => p.x);
    const ys = relativePoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const maxSpan = Math.max(spanX, spanY, 0.00001);

    // Design SVG dimensions
    const svgWidth = 400;
    const svgHeight = 280;
    const pad = 24;

    const scale = Math.min(
      (svgWidth - 2 * pad) / maxSpan,
      (svgHeight - 2 * pad) / maxSpan
    );

    // Offset to center perfectly
    const offsetX = svgWidth / 2 - ((minX + maxX) / 2) * scale;
    const offsetY = svgHeight / 2 + ((minY + maxY) / 2) * scale;

    return relativePoints.map((p, idx) => ({
      x: offsetX + p.x * scale,
      y: offsetY - p.y * scale, // invert Y for screen coords
      speed: p.speed,
      heading: p.heading,
      time: p.time,
      alt: p.alt,
      index: idx
    }));
  }, [validPoints]);

  // 3. Prepare data for Recharts (subsampled if very dense to keep interaction lag-free)
  const chartData = useMemo(() => {
    if (projectedData.length === 0) return [];
    
    // If we have more than 1000 points, subsample for performance
    const step = Math.max(1, Math.floor(projectedData.length / 500));
    const result = [];
    
    for (let i = 0; i < projectedData.length; i += step) {
      const p = projectedData[i];
      // Format simple timestamp string
      let timeStr = "";
      if (p.time) {
        const d = new Date(p.time);
        timeStr = d.getUTCHours().toString().padStart(2, "0") + ":" +
                  d.getUTCMinutes().toString().padStart(2, "0") + ":" +
                  d.getUTCSeconds().toString().padStart(2, "0") + "." +
                  Math.floor(d.getUTCMilliseconds() / 10).toString().padStart(2, "0");
      }
      result.push({
        name: timeStr,
        speed: parseFloat(p.speed.toFixed(1)),
        originalIndex: p.index,
        heading: p.heading
      });
    }
    return result;
  }, [projectedData]);

  // 4. Generate the main polyline path
  const polylinePointsStr = useMemo(() => {
    return projectedData.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }, [projectedData]);

  const activePoint = useMemo(() => {
    if (hoveredIndex === null || hoveredIndex < 0 || hoveredIndex >= projectedData.length) {
      return projectedData[projectedData.length - 1] || null;
    }
    return projectedData[hoveredIndex];
  }, [projectedData, hoveredIndex]);

  if (validPoints.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col gap-5 shadow-xl">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-mono flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            Telemetry Analysis / 走行データ解析
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">スピードグラフにカーソルを合わせると軌跡が連動します</p>
        </div>
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
              {/* Main circuit trace line */}
              <polyline
                fill="none"
                stroke="#1e293b"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylinePointsStr}
              />
              <polyline
                fill="none"
                stroke="#059669"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylinePointsStr}
                className="drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]"
              />

              {/* Start/Finish marker indicator */}
              {projectedData.length > 0 && (
                <g transform={`translate(${projectedData[0].x}, ${projectedData[0].y})`}>
                  <circle r="5" fill="#e11d48" stroke="#ffffff" strokeWidth="1" />
                </g>
              )}

              {/* Active / Hovered vehicle location glowing dot */}
              {activePoint && (
                <g transform={`translate(${activePoint.x}, ${activePoint.y})`}>
                  <circle r="9" fill="rgba(16, 185, 129, 0.25)" className="animate-ping" />
                  <circle r="5.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" className="shadow-lg" />
                </g>
              )}
            </svg>
          )}

          {/* Start Legend */}
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
            <span className="w-2 h-2 rounded-full bg-rose-600 border border-white/20" />
            <span>START LINE</span>
          </div>

          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 border border-white/20" />
            <span>GPS TRACK</span>
          </div>
        </div>

        {/* Live Telemetry Display */}
        <div className="md:col-span-2 flex flex-col justify-between gap-3 bg-slate-950/30 border border-slate-900/60 rounded-xl p-4">
          <div className="flex flex-col gap-3">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider font-mono uppercase">
              LIVE TELEMETRY / リアルタイム表示
            </span>
            
            {activePoint ? (
              <div className="flex flex-col gap-3.5 mt-1">
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
                    <span className="text-[10px] text-slate-500 block font-mono">TIME (UTC)</span>
                    <span className="text-xs font-mono text-slate-300">
                      {activePoint.time ? (
                        new Date(activePoint.time).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          fractionalSecondDigits: 3,
                          timeZone: "UTC"
                        })
                      ) : "--:--:--.---"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic py-6 text-center">
                Hover chart to view telemetry
              </div>
            )}
          </div>

          <div className="border-t border-slate-900 pt-3 flex flex-col gap-1 text-[10px] text-slate-500 font-mono">
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

      {/* Speed Graph Profile */}
      <div className="bg-slate-950/40 border border-slate-900/60 rounded-xl p-3.5 h-[160px]">
        <span className="text-[9px] font-bold text-slate-600 tracking-widest font-mono uppercase block mb-2">
          SPEED PROFILE / 車速グラフ (km/h)
        </span>
        <div className="w-full h-[110px]">
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
              margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
            >
              <defs>
                <linearGradient id="speedGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis 
                dataKey="name" 
                stroke="#475569" 
                fontSize={9} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => val.split(".")[0]} // truncate milliseconds for cleaner axis
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
                        <div className="text-slate-500 mb-0.5">TIME: {data.name}</div>
                        <div className="text-emerald-400 font-bold">SPEED: {data.speed} km/h</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="speed" 
                stroke="#10b981" 
                strokeWidth={1.5}
                fillOpacity={1} 
                fill="url(#speedGlow)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
