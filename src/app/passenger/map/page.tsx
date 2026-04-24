'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FIXED_LOCATIONS, MAPBOX_STYLE } from '@/lib/constants'
import { format } from 'date-fns'

const PICKUP = FIXED_LOCATIONS.pickup
const HOME = FIXED_LOCATIONS.passengerHome
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export default function PassengerMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const mapLoadedRef = useRef(false)

  const [isActive, setIsActive] = useState(false)
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load mapbox-gl dynamically on client
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!mapContainer.current) return
    if (mapRef.current) return

    let cancelled = false

    async function initMap() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default

        if (cancelled || !mapContainer.current) return

        mapboxgl.accessToken = TOKEN

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: MAPBOX_STYLE,
          center: [(PICKUP.lng + HOME.lng) / 2, (PICKUP.lat + HOME.lat) / 2],
          zoom: 11,
          attributionControl: false,
        })

        mapRef.current = map

        map.on('error', (e: any) => {
          console.error('Mapbox error:', e)
        })

        map.on('load', () => {
          if (cancelled) return
          mapLoadedRef.current = true
          setMapReady(true)

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

          // Fit bounds
          const bounds = new mapboxgl.LngLatBounds()
          bounds.extend([PICKUP.lng, PICKUP.lat])
          bounds.extend([HOME.lng, HOME.lat])
          map.fitBounds(bounds, { padding: 80, maxZoom: 14 })
        })
      } catch (err: any) {
        console.error('Map init error:', err)
        if (!cancelled) setError(err.message || 'Error al cargar el mapa')
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        mapLoadedRef.current = false
      }
    }
  }, [])

  // Realtime subscription for driver location
  useEffect(() => {
    const supabase = createClient()
    let channelRef: any = null

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
          updateDriverPosition(lastLoc.lat, lastLoc.lng)
          if (lastLoc.recorded_at) setLastUpdate(new Date(lastLoc.recorded_at))
        }

        channelRef = supabase.channel('passenger-loc')
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'location_updates',
            filter: `tracking_session_id=eq.${session.id}`,
          }, (payload: any) => {
            const r = payload.new as { lat: number; lng: number }
            updateDriverPosition(r.lat, r.lng)
          }).subscribe()
      } catch { /* no trip */ }
      finally { setLoading(false) }
    }

    check()
    return () => { if (channelRef) supabase.removeChannel(channelRef) }
  }, [])

  function updateDriverPosition(lat: number, lng: number) {
    setDriverLocation({ lat, lng })
    setLastUpdate(new Date())

    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (!driverMarkerRef.current) {
        const el = document.createElement('div')
        el.style.cssText = 'width:22px;height:22px;background:#9B7FE8;border-radius:50%;border:3px solid #fff;box-shadow:0 0 20px rgba(155,127,232,0.6);'
        if (!document.getElementById('nocteride-pulse')) {
          const s = document.createElement('style')
          s.id = 'nocteride-pulse'
          s.textContent = '@keyframes nrPulse{0%,100%{box-shadow:0 0 20px rgba(155,127,232,0.6)}50%{box-shadow:0 0 40px rgba(155,127,232,1)}}'
          document.head.appendChild(s)
        }
        el.style.animation = 'nrPulse 2s ease-in-out infinite'
        driverMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map)
      } else {
        driverMarkerRef.current.setLngLat([lng, lat])
      }

      const src = map.getSource('driver-route')
      if (src) {
        src.setData({
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [[lng, lat], [PICKUP.lng, PICKUP.lat]] },
        })
      }

      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([lng, lat])
      bounds.extend([PICKUP.lng, PICKUP.lat])
      bounds.extend([HOME.lng, HOME.lat])
      map.fitBounds(bounds, { padding: 80, maxZoom: 14 })
    })
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-80px)] w-full bg-[#0A0A14] flex items-center justify-center p-6">
        <div className="bg-[#1A1A2E] border border-[rgba(224,90,90,0.3)] rounded-3xl p-6 text-center max-w-sm">
          <p className="text-[#E05A5A] font-bold mb-2">Error del mapa</p>
          <p className="text-[#8888A8] text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100vh-80px)] w-full bg-[#0A0A14]">
      <div ref={mapContainer} className="absolute inset-0" />

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[#8888A8] text-sm animate-pulse">Cargando mapa...</div>
        </div>
      )}

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
