// Free map: Leaflet + OpenStreetMap data (CARTO tiles) inside a WebView.
// No Google API key or billing account needed. The same HTML/JS can be
// reused as-is in the iPhone web version.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const html = `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js"></script>
<style>
  html, body, #map { margin:0; height:100%; background:#ECE9E3; }
  .dot { border-radius:50%; border:3px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.4); }
  .me { animation: pulse 2s infinite; }
  @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(30,111,232,.5)} 70%{box-shadow:0 0 0 14px rgba(30,111,232,0)} 100%{box-shadow:0 0 0 0 rgba(30,111,232,0)} }
  .tag { background:#fff; border-radius:10px; padding:2px 7px; font:600 12px system-ui, sans-serif;
         white-space:nowrap; box-shadow:0 1px 3px rgba(0,0,0,.3); transform:translate(14px,-8px); display:inline-block; }
  .leaflet-control-attribution { font-size:9px; }
</style>
</head><body><div id="map"></div>
<script>
  const send = (msg) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  const map = L.map('map', { zoomControl:false, attributionControl:true }).setView([9.9816, 76.2999], 16);
  // Base map: OpenFreeMap (free, no API key). If the phone can't draw
  // vector maps (no WebGL), fall back to plain OpenStreetMap tiles.
  function useOsmTiles() {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  }
  try {
    if (!L.maplibreGL || !window.maplibregl) throw new Error('MapLibre not loaded');
    const gl = L.maplibreGL({
      style: 'https://tiles.openfreemap.org/styles/liberty',
      attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; OpenStreetMap contributors'
    }).addTo(map);
    const glMap = gl.getMaplibreMap && gl.getMaplibreMap();
    if (glMap) glMap.on('error', function (e) {
      if (!window.__fellBack && e && e.error && /webgl|style/i.test(String(e.error.message))) {
        window.__fellBack = true; map.removeLayer(gl); useOsmTiles();
      }
    });
  } catch (err) {
    useOsmTiles();
  }

  let zoneLayer = null, markers = {}, pickMode = false, fitted = false;

  function dotIcon(color, size, extra) {
    return L.divIcon({ className:'', iconSize:[size,size], iconAnchor:[size/2,size/2],
      html:'<div class="dot '+(extra||'')+'" style="width:'+(size-6)+'px;height:'+(size-6)+'px;background:'+color+'"></div>' });
  }
  function labelIcon(text) {
    return L.divIcon({ className:'', iconSize:[0,0], html:'<span class="tag">'+text+'</span>' });
  }

  window.__update = function (d) {
    pickMode = !!d.pickMode;

    // Zone circle
    if (zoneLayer) { map.removeLayer(zoneLayer); zoneLayer = null; }
    if (d.zone) {
      zoneLayer = L.circle([d.zone.center.lat, d.zone.center.lng], {
        radius: d.zone.radius, color:'#E8202A', weight:3, fillColor:'#E8202A', fillOpacity:0.06
      }).addTo(map);
    }

    // Player markers: add new, move existing, remove gone
    const seen = {};
    (d.markers || []).forEach(function (m) {
      seen[m.id] = true;
      const ll = [m.lat, m.lng];
      let mk = markers[m.id];
      const key = m.color + '|' + m.label + '|' + (m.isMe ? 1 : 0) + '|' + (m.faded ? 1 : 0);
      if (mk && mk.key !== key) { map.removeLayer(mk.dot); map.removeLayer(mk.lbl); mk = null; }
      if (!mk) {
        mk = {
          key: key,
          dot: L.marker(ll, { icon: dotIcon(m.color, m.isMe ? 24 : 20, m.isMe ? 'me' : ''), opacity: m.faded ? 0.55 : 1 }).addTo(map),
          lbl: L.marker(ll, { icon: labelIcon(m.label), interactive:false }).addTo(map)
        };
        markers[m.id] = mk;
      } else { mk.dot.setLatLng(ll); mk.lbl.setLatLng(ll); }
    });
    Object.keys(markers).forEach(function (id) {
      if (!seen[id]) { map.removeLayer(markers[id].dot); map.removeLayer(markers[id].lbl); delete markers[id]; }
    });

    // Centre the map once, on the zone or on me
    if (!fitted || d.recenter) {
      if (d.zone) { map.fitBounds(zoneLayer.getBounds(), { padding:[30,30] }); fitted = true; }
      else if (d.me) { map.setView([d.me.lat, d.me.lng], 16); fitted = true; }
    }
  };

  map.on('click', function (e) {
    if (pickMode) send({ type:'pick', lat:e.latlng.lat, lng:e.latlng.lng });
  });
  send({ type:'ready' });
</script></body></html>`;

/**
 * props:
 *  zone       { center:{lat,lng}, radius } | null
 *  markers    [{ id, lat, lng, label, color, isMe?, faded? }]
 *  me         { lat, lng } | null  (used to centre the map before a zone exists)
 *  pickMode   tap on map calls onPick({lat,lng})
 *  recenterKey change this number to re-centre the map
 */
export default function GameMap({ zone, markers = [], me, pickMode = false, onPick, recenterKey = 0 }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const lastRecenter = useRef(recenterKey);

  useEffect(() => {
    if (!ready || !ref.current) return;
    const recenter = lastRecenter.current !== recenterKey;
    lastRecenter.current = recenterKey;
    const data = JSON.stringify({ zone, markers, me, pickMode, recenter });
    ref.current.injectJavaScript(`window.__update(${data}); true;`);
  }, [ready, zone, markers, me, pickMode, recenterKey]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://pursuit.app/' }}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'ready') setReady(true);
            if (msg.type === 'pick' && onPick) onPick({ lat: msg.lat, lng: msg.lng });
          } catch {}
        }}
        style={{ backgroundColor: '#ECE9E3' }}
      />
    </View>
  );
}