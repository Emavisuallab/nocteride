'use client'

import { useState } from 'react'
import Map, { Marker } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN } from '@/lib/constants'

export default function TestMap() {
  const [viewState, setViewState] = useState({
    longitude: -75.565306,
    latitude: 6.225111,
    zoom: 11,
  })

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <div style={{ position: 'absolute', zIndex: 10, padding: 12, background: 'rgba(0,0,0,0.8)', color: '#fff', fontFamily: 'monospace', fontSize: 12 }}>
        Token: {MAPBOX_TOKEN ? MAPBOX_TOKEN.substring(0, 15) + '...' : 'VACÍO'}
      </div>
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
      >
        <Marker longitude={-75.565306} latitude={6.225111} anchor="center">
          <div style={{ width: 20, height: 20, background: '#4CAF82', borderRadius: '50%', border: '3px solid #fff' }} />
        </Marker>
      </Map>
    </div>
  )
}
