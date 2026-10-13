import { samplePoints } from "./sampling";
import { ParsedGPSFile } from "../types";

// Convert parsed GPS points to standard GPX XML format
export function convertToGPX(file: ParsedGPSFile): string {
  const pointsXml = file.points
    .map(pt => {
      const lat = pt.latitude !== null ? pt.latitude.toFixed(6) : "0.000000";
      const lon = pt.longitude !== null ? pt.longitude.toFixed(6) : "0.000000";
      
      let elements = "";
      elements += `\n        <ele>${(pt.altitude ?? 0).toFixed(1)}</ele>`;
      if (pt.time !== null) {
        elements += `\n        <time>${pt.time.toISOString()}</time>`;
      }
      if (pt.heading !== null && pt.heading !== undefined) {
        elements += `\n        <course>${pt.heading.toFixed(2)}</course>`;
      }
      if (pt.speedKmh !== null) {
        // speed in GPX is usually meters per second
        const speedMps = pt.speedKmh / 3.6;
        elements += `\n        <extensions>\n          <speed>${speedMps.toFixed(2)}</speed>\n        </extensions>`;
      }

      return `      <trkpt lat="${lat}" lon="${lon}">${elements}\n      </trkpt>`;
    })
    .join("\n");

  // ファイル名に & や < が含まれても XML が壊れないようにする
  const escapeXml = (v: string): string =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const nameWithoutExtension = escapeXml(file.metadata.name.replace(/\.[^/.]+$/, ""));

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DigSpice GPS Converter" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(file.metadata.name)}</name>
    <desc>Converted from DigSpice GPS log file</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${nameWithoutExtension}</name>
    <desc>Circuit Driving Tracklog</desc>
    <trkseg>
${pointsXml}
    </trkseg>
  </trk>
</gpx>`;
}

// Convert parsed GPS points to standard CSV format
export function convertToCSV(file: ParsedGPSFile): string {
  const headers = [
    "Timestamp",
    "Latitude(DecimalDegrees)",
    "Longitude(DecimalDegrees)",
    "Altitude(Meters)",
    "Speed(km/h)",
    "Speed(knots)",
    "Heading(Degrees)",
    "Satellites"
  ];

  const rows = file.points.map(pt => [
    pt.time ? pt.time.toISOString() : "",
    pt.latitude !== null ? pt.latitude.toFixed(6) : "",
    pt.longitude !== null ? pt.longitude.toFixed(6) : "",
    (pt.altitude ?? 0).toFixed(1),
    pt.speedKmh !== null ? pt.speedKmh.toFixed(2) : "",
    pt.speedKnots !== null ? pt.speedKnots.toFixed(2) : "",
    pt.heading !== null ? pt.heading.toFixed(1) : "",
    pt.satellites !== null ? pt.satellites.toString() : ""
  ]);

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

// Convert to validated standard NMEA-0183 output
export function convertToNMEA(file: ParsedGPSFile): string {
  // Return all filtered and valid NMEA sentences, ending with proper \r\n endings for hardware parses
  return file.rawNmeaLines.map(line => line.endsWith("\r") ? line : line).join("\r\n") + "\r\n";
}

// Convert parsed GPS points to space-separated text file exactly like Python script
export function convertToTXT(file: ParsedGPSFile): string {
  const lines = ["Timestamp Latitude Longitude Speed(km/h) Heading(deg)"];
  
  file.points.forEach(pt => {
    if (pt.time && pt.latitude !== null && pt.longitude !== null) {
      const dt = pt.time;
      const yr = dt.getUTCFullYear();
      const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const dy = String(dt.getUTCDate()).padStart(2, "0");
      const hr = String(dt.getUTCHours()).padStart(2, "0");
      const mi = String(dt.getUTCMinutes()).padStart(2, "0");
      const sc = String(dt.getUTCSeconds()).padStart(2, "0");
      const ms = String(dt.getUTCMilliseconds()).padStart(3, "0");
      
      const timeStr = `${yr}-${mo}-${dy}T${hr}:${mi}:${sc}.${ms}`;
      const speed = pt.speedKmh !== null ? pt.speedKmh.toFixed(2) : "0.00";
      const heading = pt.heading !== null ? pt.heading.toFixed(2) : "0.00";
      
      lines.push(`${timeStr} ${pt.latitude.toFixed(7)} ${pt.longitude.toFixed(7)} ${speed} ${heading}`);
    }
  });

  return lines.join("\n") + "\n";
}

// Export a Leaflet HTML map with a sampled trace and sparse telemetry markers
export function convertToHTMLMap(file: ParsedGPSFile): string {
  const validPoints = file.points.filter(pt => pt.latitude !== null && pt.longitude !== null);
  const coordinatesData = samplePoints(validPoints, 20000)
    .map(pt => [pt.latitude, pt.longitude]);
  const markersData = samplePoints(validPoints, 300).map(pt => [
    pt.latitude, pt.longitude, pt.speedKmh || 0, pt.heading || 0,
    pt.time ? pt.time.toISOString() : ""
  ]);
  const coordinatesJson = JSON.stringify(coordinatesData);
  const markersJson = JSON.stringify(markersData);
  const maxSpeedStr = file.stats.maxSpeedKmh.toFixed(1);
  const escapedName = file.metadata.name.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  return `<!DOCTYPE html>
<html>
<head>
    <title>Race Track Map - ${escapedName}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        #map {
            width: 100%;
            height: 100%;
        }
        .info-panel {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(15, 23, 42, 0.9);
            color: #f8fafc;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid #1e293b;
            z-index: 1000;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            max-width: 300px;
        }
        .info-title {
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 4px;
            color: #10b981;
        }
        .info-detail {
            font-size: 11px;
            color: #94a3b8;
            margin-top: 2px;
            font-family: monospace;
        }
        .leaflet-popup-content-wrapper, .leaflet-tooltip {
            background: #1e293b !important;
            color: #f8fafc !important;
            border: 1px solid #334155 !important;
            border-radius: 6px !important;
            font-size: 11px !important;
        }
        .leaflet-tooltip-top:before {
            border-top-color: #1e293b !important;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <div class="info-panel">
        <div class="info-title">Race Track Map</div>
        <div class="info-detail">File: ${escapedName}</div>
        <div class="info-detail">Points: ${validPoints.length.toLocaleString()}</div>
        <div class="info-detail">Max Speed: ${maxSpeedStr} km/h</div>
    </div>
    <script>
        const coordinates = ${coordinatesJson};
        const markers = ${markersJson};
        
        if (coordinates.length > 0) {
            // Find coordinates centered on 35.3 if any exist (to match python script logic for fuji / etc)
            // Otherwise average of all coordinates
            const fujiCoords = coordinates.filter(c => c[0] >= 35.3 && c[0] < 35.4);
            const targetCoords = fujiCoords.length > 0 ? fujiCoords : coordinates;

            const centerLat = targetCoords.reduce((sum, c) => sum + c[0], 0) / targetCoords.length;
            const centerLon = targetCoords.reduce((sum, c) => sum + c[1], 0) / targetCoords.length;
            
            const map = L.map('map').setView([centerLat, centerLon], 16);
            
            // Add clean dark map tiles
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(map);
            
            // Sparse telemetry markers include both endpoints.
            markers.forEach((coord, index) => {
                const lat = coord[0];
                const lon = coord[1];
                const speed = coord[2];
                const heading = coord[3];
                const time = coord[4];
                
                // Format timestamp beautifully
                let displayTime = time;
                if (time) {
                    try {
                        const d = new Date(time);
                        displayTime = d.getUTCHours().toString().padStart(2, "0") + ":" +
                                      d.getUTCMinutes().toString().padStart(2, "0") + ":" +
                                      d.getUTCSeconds().toString().padStart(2, "0") + "." +
                                      d.getUTCMilliseconds().toString().padStart(3, "0");
                    } catch (e) {}
                }

                L.circleMarker([lat, lon], {
                    radius: index === 0 || index === markers.length - 1 ? 6 : 3.5,
                    color: "#ffffff",
                    weight: 0.5,
                    fill: true,
                    fillColor: index === 0 ? "#10b981" : index === markers.length - 1 ? "#ef4444" : "#3b82f6",
                    fillOpacity: 0.85
                })
                .bindTooltip(
                    \`<b>Time:</b> \${displayTime}<br><b>Speed:</b> \${speed.toFixed(1)} km/h<br><b>Heading:</b> \${heading.toFixed(1)}°<br><b>Lat:</b> \${lat.toFixed(6)}<br><b>Lon:</b> \${lon.toFixed(6)}\`,
                    { direction: 'top', sticky: true }
                )
                .addTo(map);
            });

            // Draw trace line connecting points
            const latLons = coordinates.map(c => [c[0], c[1]]);
            L.polyline(latLons, {
                color: '#10b981',
                weight: 1.5,
                opacity: 0.4
            }).addTo(map);
        }
    </script>
</body>
</html>`;
}
