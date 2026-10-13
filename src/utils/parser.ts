import { ParsedGPSFile, GPSPoint, FileMetadata } from "../types";

// Helper to format coordinate to NMEA DDMM.MMMMMM (6 decimal places for minutes)
export const formatNmeaCoord = (val: number, isLat: boolean): { nmea: string; dir: string } => {
  const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
  const absVal = Math.abs(val);
  let deg = Math.floor(absVal);
  let min = (absVal - deg) * 60;
  // 丸めで 60.000000 分になる場合は度へ繰り上げる
  if (Number(min.toFixed(6)) >= 60) {
    deg += 1;
    min = 0;
  }
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

// AdjustParsedFile shifting timezone, changing talker ID, and filtering by optional trim time range
export function adjustParsedFile(
  file: ParsedGPSFile, 
  timezoneOffsetHours: number, 
  talkerId: "GP" | "GN",
  trimStartMs?: number | null,
  trimEndMs?: number | null
): ParsedGPSFile {
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

  return trimAdjustedFile({ ...file, points: shiftedPoints }, trimStartMs, trimEndMs);
}

// Reuse generated sentences when only the trim range changes.
export function trimAdjustedFile(
  file: ParsedGPSFile,
  trimStartMs?: number | null,
  trimEndMs?: number | null
): ParsedGPSFile {
  let shiftedPoints = file.points;

  // Filter points by trimStartMs and trimEndMs (applied on the shifted time scale)
  if (trimStartMs != null || trimEndMs != null) {
    shiftedPoints = shiftedPoints.filter(p => {
      if (!p.time) return true;
      const t = p.time.getTime();
      if (trimStartMs != null && t < trimStartMs) return false;
      if (trimEndMs != null && t > trimEndMs) return false;
      return true;
    });
  }

  const validTimes = shiftedPoints.map(p => p.time).filter((t): t is Date => t !== null);
  const startTime = validTimes.length > 0 ? new Date(validTimes.reduce((m, t) => Math.min(m, t.getTime()), Infinity)) : null;
  const endTime = validTimes.length > 0 ? new Date(validTimes.reduce((m, t) => Math.max(m, t.getTime()), -Infinity)) : null;

  const rawNmeaLines: string[] = [];
  shiftedPoints.forEach(p => {
    // Preserve altitude and satellite count with GGA before each RMC.
    if (p.rawGga) rawNmeaLines.push(p.rawGga);
    if (p.rawRmc) rawNmeaLines.push(p.rawRmc);
  });

  let maxSpeedKmh = 0;
  let speedSum = 0;
  let speedCount = 0;

  shiftedPoints.forEach(p => {
    if (p.speedKmh !== null && p.speedKmh > maxSpeedKmh) {
      maxSpeedKmh = p.speedKmh;
    }
    if (p.speedKmh !== null) {
      speedSum += p.speedKmh;
      speedCount++;
    }
  });

  const durationSeconds = startTime && endTime 
    ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) 
    : 0;

  const averageSpeedKmh = speedCount > 0 ? speedSum / speedCount : 0;

  return {
    ...file,
    points: shiftedPoints,
    rawNmeaLines,
    stats: {
      ...file.stats,
      startTime,
      endTime,
      durationSeconds,
      pointCount: shiftedPoints.length,
      maxSpeedKmh,
      averageSpeedKmh,
      startLat: shiftedPoints[0]?.latitude ?? null,
      startLon: shiftedPoints[0]?.longitude ?? null,
      endLat: shiftedPoints[shiftedPoints.length - 1]?.latitude ?? null,
      endLon: shiftedPoints[shiftedPoints.length - 1]?.longitude ?? null
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
  // 車速・方位が RMC に記録されていた点 (記録された 0 を推定値で上書きしないため)
  const recordedSpeed = new Set<Partial<GPSPoint>>();
  const recordedHeading = new Set<Partial<GPSPoint>>();
  // 時刻だけでは別の日の同時刻を区別できないので、日の通し番号をキーに含める。
  // 時刻が半日以上戻ったとき、または RMC の日付が変わったときに次の日とみなす
  let dayIndex = 0;
  let lastSecOfDay: number | null = null;
  let lastRmcDate = "";
  let rolledSinceLastRmc = false;
  const keyFor = (timeStr: string, dateStr?: string): string => {
    const sec = parseInt(timeStr.substring(0, 2), 10) * 3600 + parseInt(timeStr.substring(2, 4), 10) * 60 + parseFloat(timeStr.substring(4));
    if (dateStr && lastRmcDate && dateStr !== lastRmcDate) {
      // 時刻の巻き戻りで既に日を進めていれば、日付の変化では重ねて進めない
      if (!rolledSinceLastRmc) dayIndex++;
    } else if (Number.isFinite(sec) && lastSecOfDay !== null && sec < lastSecOfDay - 43200) {
      dayIndex++;
      rolledSinceLastRmc = true;
    }
    if (dateStr) {
      lastRmcDate = dateStr;
      rolledSinceLastRmc = false;
    }
    if (Number.isFinite(sec)) lastSecOfDay = sec;
    return `${dayIndex.toString().padStart(6, "0")}|${timeStr}`;
  };
  const dayOfKey = (key: string): number => parseInt(key.split("|")[0], 10);
  const timeOfKey = (key: string): string => key.split("|")[1];

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
      // 測位品質 0 (未測位) の行は採用しない
      if (parts[6] === "0") continue;
      const key = keyFor(timeStr);

      const lat = parseNmeaCoordinate(parts[2], parts[3]);
      const lon = parseNmeaCoordinate(parts[4], parts[5]);
      const sat = parseInt(parts[7], 10);
      const alt = parseFloat(parts[9]);

      const existing = pointMap.get(key) || {};
      existing.rawGga = line;
      if (lat !== null) existing.latitude = lat;
      if (lon !== null) existing.longitude = lon;
      if (!isNaN(sat)) existing.satellites = sat;
      if (!isNaN(alt)) existing.altitude = alt;

      pointMap.set(key, existing);
    } else if (isRMC && parts.length >= 10) {
      const timeStr = parts[1];
      if (!timeStr) continue;
      // 状態 V (無効な測位) の行は採用しない
      if (parts[2] === "V") continue;
      const dayBefore = dayIndex;
      const key = keyFor(timeStr, /^\d{6}$/.test(parts[9]) ? parts[9] : undefined);
      // 同じ時刻の GGA が先に来ていて、この RMC で日付が変わったと分かった場合は、GGA 側の点をこちらへ移す
      if (dayIndex !== dayBefore) {
        const oldKey = `${dayBefore.toString().padStart(6, "0")}|${timeStr}`;
        const stray = pointMap.get(oldKey);
        if (stray && !stray.rawRmc) {
          pointMap.delete(oldKey);
          pointMap.set(key, stray);
        }
      }

      const lat = parseNmeaCoordinate(parts[3], parts[4]);
      const lon = parseNmeaCoordinate(parts[5], parts[6]);
      const speedKnots = parseFloat(parts[7]);
      const heading = parseFloat(parts[8]);
      const dateStr = parts[9];

      const existing = pointMap.get(key) || {};
      existing.rawRmc = line;
      if (lat !== null) existing.latitude = lat;
      if (lon !== null) existing.longitude = lon;
      if (!isNaN(speedKnots)) {
        existing.speedKnots = speedKnots;
        existing.speedKmh = speedKnots * 1.852;
        recordedSpeed.add(existing);
      }
      if (!isNaN(heading)) {
        existing.heading = heading;
        recordedHeading.add(existing);
      }

      // Parse full date-time
      const dt = parseUtcDateTime(timeStr, dateStr, name);
      if (dt) existing.time = dt;

      // Provide default altitude and satellites if they aren't filled by GGA (since DigSpice official tools export RMC-only)
      if (existing.altitude === undefined) existing.altitude = 0.0;
      if (existing.satellites === undefined) existing.satellites = 12;

      pointMap.set(key, existing);
    }
  }

  // Convert map to sorted point list
  const points: GPSPoint[] = [];
  const sortedKeys = Array.from(pointMap.keys()).sort();
  // 推定で埋めてよい点 (RMC に車速・方位が無かった点)
  const needsSpeed = new Set<GPSPoint>();
  const needsHeading = new Set<GPSPoint>();

  for (const key of sortedKeys) {
    const pt = pointMap.get(key)!;
    
    // Fill in default Date if it wasn't parsed from RMC
    if (!pt.time) {
      const dt = parseUtcDateTime(timeOfKey(key), undefined, name);
      // 日付の無い行 (GGA のみ) は、日をまたいだ分だけ日付を進める
      if (dt) pt.time = new Date(dt.getTime() + dayOfKey(key) * 86400000);
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
      const added = points[points.length - 1];
      if (!recordedSpeed.has(pt)) needsSpeed.add(added);
      if (!recordedHeading.has(pt)) needsHeading.add(added);
    }
  }

  // If we have points but speeds/headings are absent (common for GGA-only converted logs)
  // dynamically calculate speed and heading from sequential latitude/longitude values.
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      if (curr.time && prev.time && curr.latitude !== null && curr.longitude !== null && prev.latitude !== null && prev.longitude !== null) {
        // 車速が記録されていない点だけ、位置の差から推定する (記録された 0 km/h は停止として尊重する)
        if (needsSpeed.has(curr)) {
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

            if (needsHeading.has(curr)) {
              curr.heading = calculateBearingDegrees(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
            }
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
      startTime = new Date(validTimes.reduce((m, t) => Math.min(m, t.getTime()), Infinity));
      endTime = new Date(validTimes.reduce((m, t) => Math.max(m, t.getTime()), -Infinity));
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
    alt?: number; // altitude in metres (when recorded)
    sat?: number; // satellites in use (when recorded)
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
    // DigSpice IV の 36 バイトレコード (実走ログで確認した構成):
    //   +0  uint32  UTC 時刻 (秒)        +22 float32 標高 (m)
    //   +4  uint16  測位状態 (2D=2, 3D=3) +26 float32 車速 (km/h)
    //   +6  float64 緯度                  +30 uint8 x2 衛星数
    //   +14 float64 経度                  +32 uint16  ミリ秒
    //   +34 '*'  +35 先頭 34 バイトの XOR
    // 方位は記録されていないので、後段で前後の位置から求める。
    // セクタ先頭の管理領域や設定タグはチェックサムが合わないので、1 バイトずつ送って読み飛ばす
    let q = 0;
    // チェックサムの合うレコードを 1 件でも見つけたか (見つけたら従来レイアウトでは読まない)
    let checksummedFormat = false;
    while (q + 36 <= bytes.length) {
      if (bytes[q + 34] === 0x2a) {
        let x = 0;
        for (let k = 0; k < 34; k++) x ^= bytes[q + k];
        if (x === bytes[q + 35]) {
          checksummedFormat = true;
          const u_t = view.getUint32(q, true);
          const fix = view.getUint16(q + 4, true);
          const lat = view.getFloat64(q + 6, true);
          const lon = view.getFloat64(q + 14, true);
          const alt = view.getFloat32(q + 22, true);
          const spd = view.getFloat32(q + 26, true);
          const sat = bytes[q + 31];
          const ms = view.getUint16(q + 32, true);
          if (
            (fix === 2 || fix === 3) &&
            Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0) &&
            u_t > 946684800 && u_t < 2524608000
          ) {
            rawPoints.push({
              lat,
              lon,
              v: !isNaN(spd) && spd >= 0 && spd < 450 ? spd : 0,
              t: u_t,
              tp: u_t + (ms < 1000 ? ms / 1000 : 0),
              alt: !isNaN(alt) && alt > -500 && alt < 10000 ? alt : 0,
              sat
            });
          }
          q += 36;
          continue;
        }
      }
      q += 1;
    }

    // チェックサム付きのレコードが 1 件も無いファイルだけ、従来の推定レイアウトで読む。
    // チェックサム付きの形式と分かったファイルでは、検証に通らなかったレコードを拾い直さない
    if (!checksummedFormat) {
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
            // +22 は標高 (方位ではない)。方位は後段で位置から求める
            const speedKmh = v.getFloat32(z + 26, true);
            const ms = v.getUint16(z + 32, true);
            return { lat, lon, speedKmh, heading: NaN, ms, u_t };
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

        // +34 が '*' のレコードはチェックサム付きの形式。ここに来るのは検証に通らなかったもの (破損) なので拾わない
        if (layout.recordSize === 36 && bytes[z + 34] === 0x2a) continue;
        // 先頭のレイアウトは、同じレコードを 6 バイトずれた位置から読んだ形にも一致する (その場合 '*' は +28 に来る)
        if (layout === layouts[0] && bytes[z + 28] === 0x2a) continue;

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
  }

  // Post-process rawPoints to standard GPSPoint format
  for (let i = 0; i < rawPoints.length; i++) {
    const rpt = rawPoints[i];
    const dt = new Date(rpt.tp * 1000);

    // Calculate heading (進行方向) sequentially from GPS coordinates if binary heading is missing or 0
    let heading = rpt.heading ?? 0;
    if (!rpt.heading) {
      // 連続した記録 (2 秒以内) で、走行中 (1 km/h 以上) に実際に動いた区間だけを方位の計算に使う。
      // 停止中の位置の揺れや、別セッションとの間の移動を方位にしない
      const usable = (a: RawPoint, b: RawPoint): boolean => {
        const dt = b.tp - a.tp;
        return dt > 0 && dt <= 2 && b.v >= 1 && calculateDistanceMeters(a.lat, a.lon, b.lat, b.lon) > 0.05;
      };
      const prev = i > 0 ? rawPoints[i - 1] : undefined;
      const next = i + 1 < rawPoints.length ? rawPoints[i + 1] : undefined;
      if (prev && usable(prev, rpt)) {
        heading = calculateBearingDegrees(prev.lat, prev.lon, rpt.lat, rpt.lon);
      } else if (next && usable(rpt, next) && rpt.v >= 1) {
        // セッションの先頭など、前の点が使えないときは次の点への向き
        heading = calculateBearingDegrees(rpt.lat, rpt.lon, next.lat, next.lon);
      } else if (prev && rpt.tp - prev.tp > 0 && rpt.tp - prev.tp <= 2) {
        // 停止中は直前の方位を保つ
        heading = points[i - 1]?.heading ?? 0;
      }
    }

    // 記録されていない形式 (.bon / .bon4 など) では従来どおりの既定値
    const satellites = rpt.sat ?? 12;
    const altitude = rpt.alt ?? 0.0;

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

    // Export altitude and satellites alongside position, speed and date.
    rawNmeaLines.push(ggaSentence, rmcSentence);

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
      startTime = new Date(validTimes.reduce((m, t) => Math.min(m, t.getTime()), Infinity));
      endTime = new Date(validTimes.reduce((m, t) => Math.max(m, t.getTime()), -Infinity));
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
