'use client'

import { useEffect, useRef, useState } from 'react'

export default function TestMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Iniciando...')
  const [token, setToken] = useState('')

  useEffect(() => {
    async function init() {
      try {
        setStatus('Importando mapbox-gl...')
        const mapboxgl = (await import('mapbox-gl')).default

        const tk = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
        setToken(tk ? tk.substring(0, 20) + '...' : 'VACÍO')

        if (!tk) {
          setStatus('ERROR: Token vacío')
          return
        }

        if (!mapContainer.current) {
          setStatus('ERROR: Container no encontrado')
          return
        }

        setStatus('Creando mapa...')
        mapboxgl.accessToken = tk

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [-75.565306, 6.225111],
          zoom: 11,
        })

        map.on('load', () => setStatus('Mapa cargado OK'))
        map.on('error', (e: any) => setStatus('Error mapa: ' + JSON.stringify(e.error)))
      } catch (err: any) {
        setStatus('EXCEPCIÓN: ' + err.message)
      }
    }
    init()
  }, [])

  return (
    <div style={{ height: '100vh', background: '#000', color: '#fff', fontFamily: 'monospace' }}>
      <div style={{ padding: 16, position: 'absolute', zIndex: 10, background: 'rgba(0,0,0,0.8)' }}>
        <p>Status: {status}</p>
        <p>Token: {token}</p>
      </div>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
