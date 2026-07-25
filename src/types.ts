export interface FileMetadata {
  name: string;
  size: number;
  lastModified: number;
  extension: string;
}

export interface GPSPoint {
  time: Date | null;        // UTC time
  latitude: number | null;  // Decimal degrees
  longitude: number | null; // Decimal degrees
  altitude: number | null;  // Meters
  speedKnots: number | null;
  speedKmh: number | null;  // speed in km/h
  heading: number | null;   // degrees
  satellites: number | null;
  rawGga?: string;
  rawRmc?: string;
}

export interface ParsedGPSFile {
  metadata: FileMetadata;
  points: GPSPoint[];
  rawNmeaLines: string[];
  stats: {
    startTime: Date | null;
    endTime: Date | null;
    durationSeconds: number;
    pointCount: number;
    maxSpeedKmh: number;
    averageSpeedKmh: number;
    startLat: number | null;
    startLon: number | null;
    endLat: number | null;
    endLon: number | null;
  };
}
