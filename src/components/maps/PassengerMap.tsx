'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { createClient } from '@/lib/supabase/client'
import { FIXED_LOCATIONS, MAPBOX_STYLE } from '@/lib/constants'
import { format } from 'date-fns'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

const PICKUP = FIXED_LOCATIONS.pickup
const HOME = FIXED_LOCATIONS.passengerHome

export default function PassengerMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const mapLoadedRef = useRef(false)

  const [isActive, setIsActive] = useState(false)
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)

  const fitMapBounds = useCallback((driverLng?: number, driverLat?: number) => {
    const map = mapRef.current
    if (!map) return
    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend([PICKUP.lng, PICKUP.lat])
    bounds.extend([HOME.lng, HOME.lat])
    if (driverLng !== undefined && driverLat !== undefined) {
      bounds.extend([driverLng, driverLat])
    }
    map.fitBounds(bounds, { padding: 80, maxZoom: 14 })
  }, [])

  const updateDriverMarker = useCallback((lat: number, lng: number) => {
    setDriverLocation({ lat, lng })
    setLastUpdate(new Date())
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return

    if (!driverMarkerRef.current) {
      const el = document.createElement('div')
      el.style.cssText = 'width:22px;height:22px;background:#9B7FE8;border-radius:50%;border:3px solid #fff;box-shadow:0 0 20px rgba(155,127,232,0.6);animation:driverPulse 2s ease-in-out infinite;'
      driverMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map)
    } else {
      driverMarkerRef.current.setLngLat([lng, lat])
    }

    const src = map.getSource('driver-route') as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: [[lng, lat], [PICKUP.lng, PICKUP.lat]] },
      })
    }
    fitMapBounds(lng, lat)
  }, [fitMapBounds])

  // Map init
  useEffect(() => {
    if (!mapContainer.current) return

    if (!mapboxgl.accessToken) {
      setMapError('Token de Mapbox no configurado')
      return
    }

    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: mapContainer.current,
        style: MAPBOX_STYLE,
        center: [(PICKUP.lng + HOME.lng) / 2, (PICKUP.lat + HOME.lat) / 2],
        zoom: 11,
        attributionControl: false,
      })
    } catch (err: any) {
      setMapError('Error al inicializar mapa: ' + (err.message || err))
      return
    }
    mapRef.current = map

    map.on('error', (e) => {
      console.error('Mapbox error:', e)
      setMapError('Error de Mapbox: ' + (e.error?.message || 'desconocido'))
    })

    if (!document.getElementById('nocteride-pulse-style')) {
      const s = document.createElement('style')
      s.id = 'nocteride-pulse-style'
      s.textContent = '@keyframes driverPulse{0%,100%{box-shadow:0 0 20px rgba(155,127,232,0.6)}50%{box-shadow:0 0 40px rgba(155,127,232,1)}}'
      document.head.appendChild(s)
    }

    map.on('load', () => {
      mapLoadedRef.current = true

      // Pickup marker (green)
      const pickupEl = document.createElement('div')
      pickupEl.style.cssText = 'width:16px;height:16px;background:#4CAF82;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(76,175,130,0.5);'
      new mapboxgl.Marker(pickupEl)
        .setLngLat([PICKUP.lng, PICKUP.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(PICKUP.label))
        .addTo(map)

      // Home marker (purple)
      const homeEl = document.createElement('div')
      homeEl.style.cssText = 'width:16px;height:16px;background:#9B7FE8;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(155,127,232,0.5);'
      new mapboxgl.Marker(homeEl)
        .setLngLat([HOME.lng, HOME.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(HOME.label))
        .addTo(map)

      // Fixed dashed route
      map.addSource('fixed-route', {
        type: 'geojson',
        data: {
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [[PICKUP.lng, PICKUP.lat], [HOME.lng, HOME.lat]] },
        },
      })
      map.addLayer({
        id: 'fixed-route', type: 'line', source: 'fixed-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#9B7FE8', 'line-width': 3, 'line-opacity': 0.4, 'line-dasharray': [2, 4] },
      })

      // Driver route (solid, initially empty)
      map.addSource('driver-route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addLayer({
        id: 'driver-route', type: 'line', source: 'driver-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#9B7FE8', 'line-width': 4, 'line-opacity': 0.85 },
      })

      fitMapBounds()
    })

    return () => { mapLoadedRef.current = false; map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    let channelRef: ReturnType<typeof supabase.channel> | null = null

    async function check() {
      try {
        const today = format(new Date(), 'yyyy-MM-dd')
        const { data: service } = await supabase
          .from('service_days').select('id, status')
          .eq('date', today).eq('status', 'in_progress').single()

        if (!service) { setLoading(false); return }
        setIsActive(true)

        const { data: session } = await supabase
          .from('tracking_sessions').select('id')
          .eq('service_day_id', service.id).eq('is_active', true).single()

        if (!session) { setLoading(false); return }

        const { data: lastLoc } = await supabase
          .from('location_updates').select('lat, lng, recorded_at')
          .eq('tracking_session_id', session.id)
          .order('recorded_at', { ascending: false }).limit(1).single()

        if (lastLoc) {
          updateDriverMarker(lastLoc.lat, lastLoc.lng)
          if (lastLoc.recorded_at) setLastUpdate(new Date(lastLoc.recorded_at))
        }

        channelRef = supabase.channel('passenger-loc')
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'location_updates',
            filter: `tracking_session_id=eq.${session.id}`,
          }, (payload) => {
            const r = payload.new as { lat: number; lng: number }
            updateDriverMarker(r.lat, r.lng)
          }).subscribe()
      } catch { /* no active trip */ }
      finally { setLoading(false) }
    }

    check()
    return () => { if (channelRef) supabase.removeChannel(channelRef) }
  }, [updateDriverMarker])

  if (mapError) {
    return (
      <div className="h-[calc(100vh-80px)] w-full bg-[#0A0A14] flex items-center justify-center p-6">
        <div className="bg-[#1A1A2E] border border-[rgba(224,90,90,0.3)] rounded-3xl p-6 text-center max-w-sm">
          <p className="text-[#E05A5A] font-bold mb-2">Error del mapa</p>
          <p className="text-[#8888A8] text-sm">{mapError}</p>
          <p className="text-[#8888A8] text-xs mt-3">Token: {mapboxgl.accessToken ? 'configurado (' + mapboxgl.accessToken.substring(0, 10) + '...)' : 'VACÍO'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100vh-80px)] w-full bg-[#0A0A14]">
      <div ref={mapContainer} className="absolute inset-0" />
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <div className="bg-[#1A1A2E] border border-[rgba(155,127,232,0.2)] rounded-3xl p-5">
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#8888A8] animate-pulse" />
              <span className="text-sm text-[#8888A8]">Cargando...</span>
            </div>
          ) : isActive ? (
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-[#4CAF82]" />
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-[#4CAF82] animate-ping opacity-75" />
              </div>
              <div className="min-w-0">
                <p className="text-[#F0F0FF] font-semibold text-sm">Transportador en camino</p>
                {driverLocation && (
                  <p className="text-xs text-[#8888A8] mt-0.5 truncate">
                    {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}
                    {lastUpdate && <span className="ml-2 text-[#6B6B80]">{format(lastUpdate, 'HH:mm:ss')}</span>}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-[#6B6B80]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              <span className="text-sm text-[#6B6B80]">Sin viaje activo</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
