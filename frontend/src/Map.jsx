import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function MapUpdater({ center, routeCoords }) {
  const map = useMap()

  useEffect(() => {
    if (routeCoords && routeCoords.length > 0) {
      map.fitBounds(routeCoords)
    } else {
      map.setView(center, 13)
    }
  }, [center, routeCoords, map])

  return null
}

function Map({ token, routeGeometry }) {
  const [center, setCenter] = useState([12.9716, 77.5946])

  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/last-location', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setCenter([data.lat, data.lon])
      })
  }, [token])

  const routeCoords = routeGeometry
    ? routeGeometry.coordinates.map(([lon, lat]) => [lat, lon])
    : null

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: '100%', width: '100%', borderRadius: '10px', overflow: 'hidden' }}
      dragging={true}
      scrollWheelZoom={true}
      doubleClickZoom={true}
      zoomControl={true}
      touchZoom={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      {routeCoords && (
        <>
          <Marker position={routeCoords[0]} />
          <Marker position={routeCoords[routeCoords.length - 1]} />
          <Polyline positions={routeCoords} color="#4f46e5" weight={4} />
        </>
      )}
      <MapUpdater center={center} routeCoords={routeCoords} />
    </MapContainer>
  )
}

export default Map