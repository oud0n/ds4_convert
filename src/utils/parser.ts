import { ParsedGPSFile, GPSPoint, FileMetadata } from "../types";

// Helper to format coordinate to NMEA DDMM.MMMMMM (6 decimal places for minutes)
export const formatNmeaCoord = (val: number, isLat: boolean): { nmea: string; dir: string } => {
  const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
  const absVal = Math.abs(val);
  const deg = Math.floor(absVal);
  const min = (absVal - deg) * 60;
  const degStr = deg.toString().padStart(isLat ? 2 : 3, "0");
  const minStr = min.toFixed(6).padStart(9, "0");
  return { nmea: `${degStr}${minStr}`, dir };
};

// Helper to construct a checksum-validated NMEA sentence
export const createNmeaSentence = (sentence: string): string => {
  let checksum = 0;
  for (let i = 0; i < sentence.length; i++) {
    checksum ^= sentence.charCodeAt(i);
  }
  return `$${sentence}*${checksum.toString(16).toUpperCase().padStart(2, "0")}`;
};

// AdjustParsedFile shifting timezone and changing talker ID
export function adjustParsedFile(file: ParsedGPSFile, timezoneOffsetHours: number, talkerId: "GP" | "GN"): ParsedGPSFile {
  const shiftedPoints = file.points.map(pt => {
    if (!pt.time) return pt;
    
    // Shift the timestamp by selected offset
    const adjustedTime = new Date(pt.time.getTime() + timezoneOffsetHours * 60 * 60 * 1000);

    const hh = adjustedTime.getUTCHours().toString().padStart(2, "0");
    const mm = adjustedTime.getUTCMinutes().toString().padStart(2, "0");
    const ss = adjustedTime.getUTCSeconds().toString().padStart(2, "0");
    const ms = adjustedTime.getUTCMilliseconds().toString().padStart(3, "0");
    const timeStr = `${hh}${mm}${ss}.${ms}`;

    const dy = adjustedTime.getUTCDate().toString().padStart(2, "0");
    const mo = (adjustedTime.getUTCMonth() + 1).toString().padStart(2, "0");
    const yr = (adjustedTime.getUTCFullYear() % 100).toString().padStart(2, "0");
    const dateStr = `${dy}${mo}${yr}`;

    const lat = pt.latitude ?? 0;
    const lon = pt.longitude ?? 0;
    const { nmea: latNmea, dir: latDir } = formatNmeaCoord(lat, true);
    const { nmea: lonNmea, dir: lonDir } = formatNmeaCoord(lon, false);

    const speedKnots = (pt.speedKmh ?? 0) / 1.852;
    const heading = pt.heading ?? 0;
    const satellites = pt.satellites ?? 12;
    const altitude = pt.altitude ?? 0.0;

    const ggaNoChecksum = `${talkerId}GGA,${timeStr},${latNmea},${latDir},${lonNmea},${lonDir},1,${satellites.toString().padStart(2, "0")},0.9,${altitude.toFixed(1)},M,,M,,`;
    const ggaSentence = createNmeaSentence(ggaNoChecksum);

    // Format RMC according to standard NMEA-0183 spec:
    // $GPRMC,time,A,lat,N,lon,E,speedKnots,heading,date,,,A*checksum
    const rmcNoChecksum = `${talkerId}RMC,${timeStr},A,${latNmea},${latDir},${lonNmea},${lonDir},${speedKnots.toFixed(1)},${heading.toFixed(2)},${dateStr},,,A`;
    const rmcSentence = createNmeaSentence(rmcNoChecksum);

    return {
      ...pt,
      time: adjustedTime,
      rawGga: ggaSentence,
      rawRmc: rmcSentence
    };
  });

  const validTimes = shiftedPoints.map(p => p.time).filter((t): t is Date => t !== null);
  const startTime = validTimes.length > 0 ? new Date(Math.min(...validTimes.map(t => t.getTime()))) : null;
  const endTime = validTimes.length > 0 ? new Date(Math.max(...validTimes.map(t => t.getTime()))) : null;

  const rawNmeaLines: string[] = [];
  shiftedPoints.forEach(p => {
    // Official DigSpice converter tool uses RMC only.
    // Exporting only RMC sentences ensures perfect compatibility with the official app.
    if (p.rawRmc) rawNmeaLines.push(p.rawRmc);
  });

  const durationSeconds = startTime && endTime 
    ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) 
    : 0;

  return {
    ...file,
    points: shiftedPoints,
    rawNmeaLines,
    stats: {
      ...file.stats,
      startTime,
      endTime,
      durationSeconds
    }
  };
}

// Helper to decode Uint8Array to string
export function arrayBufferToString(buffer: Uint8Array): string {
  try {
    return new TextDecoder("utf-8").decode(buffer);
  } catch {
    let str = "";
    for (let i = 0; i < Math.min(buffer.length, 500000); i++) {
      str += String.fromCharCode(buffer[i]);
    }
    return str;
  }
}

// Parse NMEA coordinate (DDMM.MMMM -> Decimal Degrees)
export function parseNmeaCoordinate(value: string, direction: string): number | null {
  if (!value || !direction) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;

  const degrees = Math.floor(num / 100);
  const minutes = num - degrees * 100;
  let decimal = degrees + minutes / 60;
  if (direction === "S" || direction === "W") {
    decimal = -decimal;
  }
  return decimal;
}

// Helper to parse date from filename if possible
export function parseDateFromFilename(filename: string): { year: number; month: number; day: number } | null {
  const normalized = filename.replace(/[^0-9]/g, "");
  
  // Try 8-digit match first (YYYYMMDD)
  const match8 = normalized.match(/(20[0-9]{2})([0-1][0-9])([0-3][0-9])/);
  if (match8) {
    const year = parseInt(match8[1], 10);
    const month = parseInt(match8[2], 10) - 1;
    const day = parseInt(match8[3], 10);
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // Try 6-digit match (YYMMDD)
  const matches6 = normalized.matchAll(/([0-9]{2})([0-1][0-9])([0-3][0-9])/g);
  for (const match of matches6) {
    const yy = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    if (yy >= 0 && yy <= 99 && month >= 0 && month < 12 && day >= 1 && day <= 31) {
      return { year: 2000 + yy, month, day };
    }
  }

  return null;
}

// Distance calculation using Haversine formula
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Bearing calculation in degrees
function calculateBearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// Parse UTC Date & Time
export function parseUtcDateTime(timeStr: string, dateStr?: string, filename?: string): Date | null {
  if (!timeStr) return null;

  let hours = 0, minutes = 0, seconds = 0, ms = 0;
  if (timeStr.length >= 6) {
    hours = parseInt(timeStr.slice(0, 2), 10);
    minutes = parseInt(timeStr.slice(2, 4), 10);
    seconds = parseInt(timeStr.slice(4, 6), 10);
    if (timeStr.includes(".")) {
      const parts = timeStr.split(".");
      ms = Math.round(parseFloat("0." + parts[1]) * 1000);
    }
  } else {
    return null;
  }

  let day = 1, month = 0, year = 2026;
  if (dateStr && dateStr.length === 6) {
    day = parseInt(dateStr.slice(0, 2), 10);
    month = parseInt(dateStr.slice(2, 4), 10) - 1;
    const yy = parseInt(dateStr.slice(4, 6), 10);
    year = yy < 80 ? 2000 + yy : 1900 + yy;
  } else {
    // Try to extract date from filename
    const parsedDate = filename ? parseDateFromFilename(filename) : null;
    if (parsedDate) {
      day = parsedDate.day;
      month = parsedDate.month;
      year = parsedDate.year;
    } else {
      const now = new Date();
      day = now.getUTCDate();
      month = now.getUTCMonth();
      year = now.getUTCFullYear();
    }
  }

  return new Date(Date.UTC(year, month, day, hours, minutes, seconds, ms));
}

// High-level parser for DigSpice / NMEA logs
export function parseNmeaLog(name: string, content: string): ParsedGPSFile {
  const lines = content.split(/\r?\n/);
  const pointMap = new Map<string, Partial<GPSPoint>>();
  const rawNmeaLines: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || !line.startsWith("$")) continue;
    rawNmeaLines.push(line);

    // Verify NMEA checksum if present
    if (line.includes("*")) {
      const [sentence, checksumStr] = line.split("*");
      let calculatedChecksum = 0;
      for (let i = 1; i < sentence.length; i++) {
        calculatedChecksum ^= sentence.charCodeAt(i);
      }
      const calculatedHex = calculatedChecksum.toString(16).toUpperCase().padStart(2, "0");
      const providedHex = checksumStr.toUpperCase().substring(0, 2);
      if (calculatedHex !== providedHex) {
        // Log mismatch, but let's continue parsing since some logger outputs are loose
        console.warn(`Checksum mismatch: calculated ${calculatedHex}, got ${providedHex}`);
      }
    }

    const parts = line.split(",");
    const talkerSentence = parts[0].toUpperCase();
    const isGGA = talkerSentence.endsWith("GGA");
    const isRMC = talkerSentence.endsWith("RMC");

    if (isGGA && parts.length >= 10) {
      const timeStr = parts[1];
      if (!timeStr) continue;

      const lat = parseNmeaCoordinate(parts[2], parts[3]);
      const lon = parseNmeaCoordinate(parts[4], parts[5]);
      const sat = parseInt(parts[7], 10);
      const alt = parseFloat(parts[9]);

      const existing = pointMap.get(timeStr) || {};
      existing.rawGga = line;
      if (lat !== null) existing.latitude = lat;
      if (lon !== null) existing.longitude = lon;
      if (!isNaN(sat)) existing.satellites = sat;
      if (!isNaN(alt)) existing.altitude = alt;

      pointMap.set(timeStr, existing);
    } else if (isRMC && parts.length >= 10) {
      const timeStr = parts[1];
      if (!timeStr) continue;

      const lat = parseNmeaCoordinate(parts[3], parts[4]);
      const lon = parseNmeaCoordinate(parts[5], parts[6]);
      const speedKnots = parseFloat(parts[7]);
      const heading = parseFloat(parts[8]);
      const dateStr = parts[9];

      const existing = pointMap.get(timeStr) || {};
      existing.rawRmc = line;
      if (lat !== null) existing.latitude = lat;
      if (lon !== null) existing.longitude = lon;
      if (!isNaN(speedKnots)) {
        existing.speedKnots = speedKnots;
        existing.speedKmh = speedKnots * 1.852;
      }
      if (!isNaN(heading)) existing.heading = heading;

      // Parse full date-time
      const dt = parseUtcDateTime(timeStr, dateStr, name);
      if (dt) existing.time = dt;

      // Provide default altitude and satellites if they aren't filled by GGA (since DigSpice official tools export RMC-only)
      if (existing.altitude === undefined) existing.altitude = 0.0;
      if (existing.satellites === undefined) existing.satellites = 12;

      pointMap.set(timeStr, existing);
    }
  }

  // Convert map to sorted point list
  const points: GPSPoint[] = [];
  const sortedTimes = Array.from(pointMap.keys()).sort();

  for (const timeStr of sortedTimes) {
    const pt = pointMap.get(timeStr)!;
    
    // Fill in default Date if it wasn't parsed from RMC
    if (!pt.time) {
      const dt = parseUtcDateTime(timeStr, undefined, name);
      if (dt) pt.time = dt;
    }

    // Only keep points with valid coordinate locks
    if (pt.latitude !== undefined && pt.longitude !== undefined) {
      points.push({
        time: pt.time || null,
        latitude: pt.latitude ?? null,
        longitude: pt.longitude ?? null,
        altitude: pt.altitude ?? null,
        speedKnots: pt.speedKnots ?? 0,
        speedKmh: pt.speedKmh ?? 0,
        heading: pt.heading ?? 0,
        satellites: pt.satellites ?? null,
        rawGga: pt.rawGga,
        rawRmc: pt.rawRmc
      });
    }
  }

  // If we have points but speeds/headings are absent (common for GGA-only converted logs)
  // dynamically calculate speed and heading from sequential latitude/longitude values.
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      if (curr.time && prev.time && curr.latitude !== null && curr.longitude !== null && prev.latitude !== null && prev.longitude !== null) {
        const hasRmcSpeed = curr.rawRmc && curr.speedKmh !== 0;
        if (!hasRmcSpeed) {
          const dtSeconds = (curr.time.getTime() - prev.time.getTime()) / 1000;
          if (dtSeconds > 0) {
            const dist = calculateDistanceMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
            const speedMps = dist / dtSeconds;
            const speedKmh = speedMps * 3.6;

            // Cap calculated speed at 350 km/h to filter GPS spikes/jumps
            if (speedKmh < 350) {
              curr.speedKmh = speedKmh;
              curr.speedKnots = speedKmh / 1.852;
            } else {
              curr.speedKmh = prev.speedKmh;
              curr.speedKnots = prev.speedKnots;
            }

            curr.heading = calculateBearingDegrees(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
          }
        }
      }
    }

    // Extrapolate the first point from the second point if first is 0
    if (points[0].speedKmh === 0 && points[0].heading === 0 && !points[0].rawRmc) {
      points[0].speedKmh = points[1].speedKmh;
      points[0].speedKnots = points[1].speedKnots;
      points[0].heading = points[1].heading;
    }
  }

  // Calculate statistics
  let startTime: Date | null = null;
  let endTime: Date | null = null;
  let maxSpeedKmh = 0;
  let speedSum = 0;
  let speedCount = 0;

  if (points.length > 0) {
    // Filter out null times for sorting
    const validTimes = points.map(p => p.time).filter((t): t is Date => t !== null);
    if (validTimes.length > 0) {
      startTime = new Date(Math.min(...validTimes.map(t => t.getTime())));
      endTime = new Date(Math.max(...validTimes.map(t => t.getTime())));
    }

    points.forEach(p => {
      if (p.speedKmh !== null && p.speedKmh > maxSpeedKmh) {
        maxSpeedKmh = p.speedKmh;
      }
      if (p.speedKmh !== null) {
        speedSum += p.speedKmh;
        speedCount++;
      }
    });
  }

  const durationSeconds = startTime && endTime 
    ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) 
    : 0;

  const averageSpeedKmh = speedCount > 0 ? speedSum / speedCount : 0;

  return {
    metadata: {
      name,
      size: content.length,
      lastModified: Date.now(),
      extension: name.split(".").pop()?.toLowerCase() || ""
    },
    points,
    rawNmeaLines,
    stats: {
      startTime,
      endTime,
      durationSeconds,
      pointCount: points.length,
      maxSpeedKmh,
      averageSpeedKmh,
      startLat: points[0]?.latitude ?? null,
      startLon: points[0]?.longitude ?? null,
      endLat: points[points.length - 1]?.latitude ?? null,
      endLon: points[points.length - 1]?.longitude ?? null
    }
  };
}

export function isBinaryFile(name: string, bytes: Uint8Array): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "bnx4" || ext === "bon4" || ext === "binx" || ext === "bon") return true;

  // Check first 100 bytes for binary characters
  let binaryCount = 0;
  const checkLen = Math.min(bytes.length, 100);
  for (let i = 0; i < checkLen; i++) {
    const c = bytes[i];
    if (c < 9 || (c > 13 && c < 32) || c > 126) {
      binaryCount++;
    }
  }
  return binaryCount > 5;
}

export function parseBnx4OrBon4Log(name: string, bytes: Uint8Array): ParsedGPSFile {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const points: GPSPoint[] = [];
  const rawNmeaLines: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  interface RawPoint {
    lat: number;
    lon: number;
    v: number; // speed in km/h
    t: number; // Unix timestamp in seconds
    tp: number; // Unix timestamp in seconds with subseconds
    heading?: number;
  }

  const rawPoints: RawPoint[] = [];

  if (ext === "bon" || ext === "bon4") {
    // Parse .bon / .bon4 using the 26-byte record layout starting at offset 8
    const msMultiplier = ext === "bon4" ? 10 : 100;
    let c = 8;
    while (c + 26 <= bytes.length) {
      try {
        const f = view.getUint16(c + 2, true);
        const p = view.getInt32(c + 4, true);
        const d = view.getInt32(c + 8, true);
        const m = view.getUint16(c + 18, true);
        const g = view.getUint8(c + 20);
        const b = view.getUint8(c + 21);
        const x = view.getUint8(c + 22);
        const S = view.getUint8(c + 23);
        const _sec = view.getUint8(c + 24);
        const y_ms = view.getUint8(c + 25);

        const speedKmh = (f / 100) * 3.6;
        const lat = p / 1e7;
        const lon = d / 1e7;

        // Date in UTC
        const utcDate = new Date(Date.UTC(m, g - 1, b, x, S, _sec, y_ms * msMultiplier));
        const k = utcDate.getTime() / 1000;

        if (lat !== 0 && lon !== 0 && m > 2000 && !isNaN(lat) && !isNaN(lon)) {
          rawPoints.push({
            lat,
            lon,
            v: speedKmh,
            t: Math.floor(k),
            tp: k
          });
        }
      } catch (e) {
        // Skip corrupt record
      }
      c += 26;
    }
  } else {
    // Elegant, multi-layout scanning with auto-alignment for robust .bnx4 / .binx decoding
    interface Layout {
      name: string;
      recordSize: number;
      parse: (view: DataView, z: number) => { lat: number; lon: number; speedKmh: number; heading: number; ms: number; u_t: number } | null;
    }

    const layouts: Layout[] = [
      {
        name: "DigSpice 4 36-byte format",
        recordSize: 36,
        parse: (v, z) => {
          try {
            const lat = v.getFloat64(z + 0, true);
            const lon = v.getFloat64(z + 8, true);
            const speedKmh = v.getFloat32(z + 16, true);
            const heading = v.getFloat32(z + 20, true);
            const ms = v.getUint16(z + 26, true);
            const u_t = v.getUint32(z + 30, true);
            return { lat, lon, speedKmh, heading, ms, u_t };
          } catch {
            return null;
          }
        }
      },
      {
        name: "Legacy .bnx4 36-byte format",
        recordSize: 36,
        parse: (v, z) => {
          try {
            const u_t = v.getUint32(z + 0, true);
            const lat = v.getFloat64(z + 6, true);
            const lon = v.getFloat64(z + 14, true);
            const heading = v.getFloat32(z + 22, true);
            const speedKmh = v.getFloat32(z + 26, true);
            const ms = v.getUint16(z + 32, true);
            return { lat, lon, speedKmh, heading, ms, u_t };
          } catch {
            return null;
          }
        }
      },
      {
        name: "Legacy .binx 38-byte format",
        recordSize: 38,
        parse: (v, z) => {
          try {
            const u_t = v.getUint32(z + 0, true);
            const lat = v.getFloat64(z + 4, true);
            const lon = v.getFloat64(z + 12, true);
            const heading = v.getFloat32(z + 20, true);
            const speedKmh = v.getFloat32(z + 24, true);
            const ms = v.getUint16(z + 34, true);
            return { lat, lon, speedKmh, heading, ms, u_t };
          } catch {
            return null;
          }
        }
      }
    ];

    const isValidRecord = (rec: { lat: number; lon: number; speedKmh: number; heading: number; ms: number; u_t: number } | null): boolean => {
      if (!rec) return false;
      const { lat, lon, speedKmh, heading, ms, u_t } = rec;
      return (
        !isNaN(lat) && !isNaN(lon) &&
        Math.abs(lat) > 1 && Math.abs(lat) <= 90 &&
        Math.abs(lon) > 1 && Math.abs(lon) <= 180 &&
        !isNaN(speedKmh) && speedKmh >= 0 && speedKmh < 450 &&
        !isNaN(heading) && heading >= 0 && heading <= 360 &&
        ms >= 0 && ms < 1000 &&
        u_t > 5e8 && u_t < 2.5e9
      );
    };

    // Resilient, 1-byte sliding window multi-layout parser to prevent any startup data gaps.
    // Instead of relying on a rigid global offset detection which can easily ignore incomplete early records
    // (where speed, heading or ms might be NaN or invalid but coordinates and time are valid),
    // we scan the file from offset 0, byte-by-byte, looking for valid GPS coordinate pairs and Unix timestamps.
    const isPossiblyValidRecord = (lat: number, lon: number, u_t: number): boolean => {
      return (
        !isNaN(lat) && Math.abs(lat) > 1 && Math.abs(lat) <= 90 &&
        !isNaN(lon) && Math.abs(lon) > 1 && Math.abs(lon) <= 180 &&
        !isNaN(u_t) && u_t > 5e8 && u_t < 2.5e9
      );
    };

    let z = 0;
    while (z + 36 <= bytes.length) {
      let matchFound = false;

      for (const layout of layouts) {
        if (z + layout.recordSize > bytes.length) continue;

        const rec = layout.parse(view, z);
        if (rec) {
          const { lat, lon, speedKmh, heading, ms, u_t } = rec;
          if (isPossiblyValidRecord(lat, lon, u_t)) {
            // Extract the fields with fallback cleaning
            const cleanSpeed = (!isNaN(speedKmh) && speedKmh >= 0 && speedKmh < 450) ? speedKmh : 0;
            
            let cleanHeading: number | undefined = undefined;
            if (!isNaN(heading) && heading >= 0 && heading <= 360) {
              cleanHeading = heading;
            }

            const cleanMs = (ms >= 0 && ms < 1000) ? ms : 0;
            const tp = u_t + cleanMs / 1000;

            rawPoints.push({
              lat,
              lon,
              v: cleanSpeed,
              t: u_t,
              tp,
              heading: cleanHeading
            });

            // Advance the index by the record size of the matched layout to prevent duplicate/overlapping extractions
            z += layout.recordSize;
            matchFound = true;
            break;
          }
        }
      }

      if (!matchFound) {
        z += 1;
      }
    }
  }

  // Post-process rawPoints to standard GPSPoint format
  for (let i = 0; i < rawPoints.length; i++) {
    const rpt = rawPoints[i];
    const dt = new Date(rpt.tp * 1000);

    // Calculate heading (進行方向) sequentially from GPS coordinates if binary heading is missing or 0
    let heading = rpt.heading ?? 0;
    if (i > 0) {
      const prev = rawPoints[i - 1];
      const dist = calculateDistanceMeters(prev.lat, prev.lon, rpt.lat, rpt.lon);
      if (dist > 0.05) {
        const calcHeading = calculateBearingDegrees(prev.lat, prev.lon, rpt.lat, rpt.lon);
        if (!rpt.heading || rpt.heading === 0) {
          heading = calcHeading;
        }
      } else {
        heading = points[i - 1]?.heading ?? heading;
      }
    } else if (rawPoints.length > 1) {
      const next = rawPoints[1];
      const dist = calculateDistanceMeters(rpt.lat, rpt.lon, next.lat, next.lon);
      if (dist > 0.05 && (!rpt.heading || rpt.heading === 0)) {
        heading = calculateBearingDegrees(rpt.lat, rpt.lon, next.lat, next.lon);
      }
    }

    const satellites = 12;
    const altitude = 0.0;

    // NMEA formatting
    const hh = dt.getUTCHours().toString().padStart(2, "0");
    const mm = dt.getUTCMinutes().toString().padStart(2, "0");
    const ss = dt.getUTCSeconds().toString().padStart(2, "0");
    const msPart = Math.round(dt.getUTCMilliseconds()).toString().padStart(3, "0");
    const timeStr = `${hh}${mm}${ss}.${msPart}`;

    const dy = dt.getUTCDate().toString().padStart(2, "0");
    const mo = (dt.getUTCMonth() + 1).toString().padStart(2, "0");
    const yr = (dt.getUTCFullYear() % 100).toString().padStart(2, "0");
    const dateStr = `${dy}${mo}${yr}`;

    const { nmea: latNmea, dir: latDir } = formatNmeaCoord(rpt.lat, true);
    const { nmea: lonNmea, dir: lonDir } = formatNmeaCoord(rpt.lon, false);

    const speedKnots = rpt.v / 1.852;

    const ggaNoChecksum = `GPGGA,${timeStr},${latNmea},${latDir},${lonNmea},${lonDir},1,${satellites.toString().padStart(2, "0")},0.9,${altitude.toFixed(1)},M,,M,,`;
    const ggaSentence = createNmeaSentence(ggaNoChecksum);

    // Standard NMEA-0183 GPRMC sentence
    const rmcNoChecksum = `GPRMC,${timeStr},A,${latNmea},${latDir},${lonNmea},${lonDir},${speedKnots.toFixed(1)},${heading.toFixed(2)},${dateStr},,,A`;
    const rmcSentence = createNmeaSentence(rmcNoChecksum);

    rawNmeaLines.push(rmcSentence);

    points.push({
      time: dt,
      latitude: rpt.lat,
      longitude: rpt.lon,
      altitude: altitude,
      speedKnots: speedKnots,
      speedKmh: rpt.v,
      heading: heading,
      satellites: satellites,
      rawGga: ggaSentence,
      rawRmc: rmcSentence
    });
  }

  // Calculate statistics
  let startTime: Date | null = null;
  let endTime: Date | null = null;
  let maxSpeedKmh = 0;
  let speedSum = 0;
  let speedCount = 0;

  if (points.length > 0) {
    const validTimes = points.map(p => p.time).filter((t): t is Date => t !== null);
    if (validTimes.length > 0) {
      startTime = new Date(Math.min(...validTimes.map(t => t.getTime())));
      endTime = new Date(Math.max(...validTimes.map(t => t.getTime())));
    }

    points.forEach(p => {
      if (p.speedKmh !== null && p.speedKmh > maxSpeedKmh) {
        maxSpeedKmh = p.speedKmh;
      }
      if (p.speedKmh !== null) {
        speedSum += p.speedKmh;
        speedCount++;
      }
    });
  }

  const durationSeconds = startTime && endTime 
    ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) 
    : 0;

  const averageSpeedKmh = speedCount > 0 ? speedSum / speedCount : 0;

  return {
    metadata: {
      name,
      size: bytes.length,
      lastModified: Date.now(),
      extension: ext
    },
    points,
    rawNmeaLines,
    stats: {
      startTime,
      endTime,
      durationSeconds,
      pointCount: points.length,
      maxSpeedKmh,
      averageSpeedKmh,
      startLat: points[0]?.latitude ?? null,
      startLon: points[0]?.longitude ?? null,
      endLat: points[points.length - 1]?.latitude ?? null,
      endLon: points[points.length - 1]?.longitude ?? null
    }
  };
}

// Check if raw bytes starts as a text file
export function parseFile(name: string, bytes: Uint8Array): ParsedGPSFile {
  if (isBinaryFile(name, bytes)) {
    return parseBnx4OrBon4Log(name, bytes);
  }
  const text = arrayBufferToString(bytes);
  return parseNmeaLog(name, text);
}

// Generate realistic motorsport NMEA log (Suzuka Circuit, Japan)
export function generateMockSuzukaLog(name: string = "suzuka_hotlap_digspice.dg1"): ParsedGPSFile {
  const sentences: string[] = [];
  const numPoints = 120; // 120 seconds of telemetry

  // Base coordinates for Suzuka Circuit (near First Corner / Main Straight)
  const baseLat = 34.8450;
  const baseLon = 136.5390;

  const now = new Date();
  
  for (let i = 0; i < numPoints; i++) {
    const pointTime = new Date(now.getTime() + i * 1000);
    const timeStr = pointTime.getUTCHours().toString().padStart(2, "0") +
                    pointTime.getUTCMinutes().toString().padStart(2, "0") +
                    pointTime.getUTCSeconds().toString().padStart(2, "0") + ".00";

    const dateStr = pointTime.getUTCDate().toString().padStart(2, "0") +
                    (pointTime.getUTCMonth() + 1).toString().padStart(2, "0") +
                    (pointTime.getUTCFullYear() % 100).toString().padStart(2, "0");

    // Simulate car moving along a track: acceleration down straight, braking into corners
    const angle = (i / numPoints) * 2 * Math.PI * 1.5; // 1.5 laps around a race loop
    const radius = 0.003 + 0.001 * Math.sin(angle * 2); // complex circuit shape
    
    const lat = baseLat + radius * Math.cos(angle);
    const lon = baseLon + radius * Math.sin(angle) * 1.1; // scale longitude slightly

    // Speed profile (accelerating and braking)
    // High speed down straight, low speed in corners
    const straightMultiplier = Math.sin(angle * 3) > 0 ? 1 : 0.3;
    const speedKmh = 70 + 135 * Math.abs(Math.cos(angle * 1.5)) * straightMultiplier;
    const speedKnots = speedKmh / 1.852;

    // Course heading (tangent of circuit curve)
    const rawHeading = (angle * (180 / Math.PI) + 90) % 360;
    const heading = rawHeading < 0 ? rawHeading + 360 : rawHeading;

    const altitude = 18.5 + 4.5 * Math.sin(i * 0.1); // hills at Suzuka
    const satellites = 10 + (i % 3); // steady multi-GNSS sat lock

    // Format coordinates to DDMM.MMMM
    const latDeg = Math.floor(lat);
    const latMin = (lat - latDeg) * 60;
    const latNmea = `${latDeg.toString().padStart(2, "0")}${latMin.toFixed(4)}`;

    const lonDeg = Math.floor(lon);
    const lonMin = (lon - lonDeg) * 60;
    const lonNmea = `${lonDeg.toString().padStart(3, "0")}${lonMin.toFixed(4)}`;

    // 1. Generate $GPGGA Sentence
    const ggaNoChecksum = `GPGGA,${timeStr},${latNmea},N,${lonNmea},E,1,${satellites.toString().padStart(2, "0")},0.9,${altitude.toFixed(1)},M,35.2,M,,`;
    let ggaChecksum = 0;
    for (let c = 0; c < ggaNoChecksum.length; c++) {
      ggaChecksum ^= ggaNoChecksum.charCodeAt(c);
    }
    const ggaSentence = `$${ggaNoChecksum}*${ggaChecksum.toString(16).toUpperCase().padStart(2, "0")}`;
    sentences.push(ggaSentence);

    // 2. Generate $GPRMC Sentence
    const rmcNoChecksum = `GPRMC,${timeStr},A,${latNmea},N,${lonNmea},E,${speedKnots.toFixed(2)},${heading.toFixed(1)},${dateStr},,,A`;
    let rmcChecksum = 0;
    for (let c = 0; c < rmcNoChecksum.length; c++) {
      rmcChecksum ^= rmcNoChecksum.charCodeAt(c);
    }
    const rmcSentence = `$${rmcNoChecksum}*${rmcChecksum.toString(16).toUpperCase().padStart(2, "0")}`;
    sentences.push(rmcSentence);
  }

  const rawNmeaString = sentences.join("\n");
  return parseNmeaLog(name, rawNmeaString);
}
