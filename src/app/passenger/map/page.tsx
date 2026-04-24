'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { createClient } from '@/lib/supabase/client'
import { FIXED_LOCATIONS, MAPBOX_STYLE } from '@/lib/constants'
import { format } from 'date-fns'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export default function PassengerMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!mapContainer.current) return

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center: [FIXED_LOCATIONS.pickup.lng, FIXED_LOCATIONS.pickup.lat],
      zoom: 11,
    })

    mapRef.current = map

    map.on('load', () => {
      // Pickup marker (green)
      const pickupEl = document.createElement('div')
      pickupEl.className = 'pickup-marker'
      pickupEl.style.cssText = 'width:16px;height:16px;background:#4CAF82;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(76,175,130,0.5);'
      new mapboxgl.Marker(pickupEl)
        .setLngLat([FIXED_LOCATIONS.pickup.lng, FIXED_LOCATIONS.pickup.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(FIXED_LOCATIONS.pickup.label))
        .addTo(map)

      // Passenger home marker (purple)
      const homeEl = document.createElement('div')
      homeEl.style.cssText = 'width:16px;height:16px;background:#9B7FE8;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(155,127,232,0.5);'
      new mapboxgl.Marker(homeEl)
        .setLngLat([FIXED_LOCATIONS.passengerHome.lng, FIXED_LOCATIONS.passengerHome.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(FIXED_LOCATIONS.passengerHome.label))
        .addTo(map)

      // Route source (empty initially)
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#9B7FE8', 'line-width': 4, 'line-opacity': 0.8 },
      })
    })

    return () => map.remove()
  }, [])

  useEffect(() => {
    const supabase = createClient()

    async function checkActiveTracking() {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: service } = await supabase
        .from('service_days')
        .select('id, status')
        .eq('date', today)
        .eq('status', 'in_progress')
        .single()

      if (!service) {
        setLoading(false)
        return
      }

      setIsActive(true)

      const { data: session } = await supabase
        .from('tracking_sessions')
        .select('id')
        .eq('service_day_id', service.id)
        .eq('is_active', true)
        .single()

      if (!session) {
        setLoading(false)
        return
      }

      // Get last known location
      const { data: lastLoc } = await supabase
        .from('location_updates')
        .select('lat, lng')
        .eq('tracking_session_id', session.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()

      if (lastLoc) {
        updateDriverMarker(lastLoc.lat, lastLoc.lng)
      }

      // Subscribe to realtime
      const channel = supabase
        .channel('location-updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'location_updates',
            filter: `tracking_session_id=eq.${session.id}`,
          },
          (payload) => {
            const { lat, lng } = payload.new as { lat: number; lng: number }
            updateDriverMarker(lat, lng)
          }
        )
        .subscribe()

      setLoading(false)

      return () => {
        supabase.removeChannel(channel)
      }
    }

    checkActiveTracking()
  }, [])

  function updateDriverMarker(lat: number, lng: number) {
    setDriverLocation({ lat, lng })
    const map = mapRef.current
    if (!map) return

    if (!driverMarkerRef.current) {
      const el = document.createElement('div')
      el.style.cssText = 'width:24px;height:24px;background:#9B7FE8;border-radius:50%;border:4px solid #fff;box-shadow:0 0 20px rgba(155,127,232,0.6);animation:pulse 2s infinite;'
      const style = document.createElement('style')
      style.textContent = '@keyframes pulse{0%,100%{box-shadow:0 0 20px rgba(155,127,232,0.6)}50%{box-shadow:0 0 40px rgba(155,127,232,0.9)}}'
      document.head.appendChild(style)
      driverMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map)
    } else {
      driverMarkerRef.current.setLngLat([lng, lat])
    }

    // Update route line
    const source = map.getSource('route') as mapboxgl.GeoJSONSource
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [lng, lat],
            [FIXED_LOCATIONS.pickup.lng, FIXED_LOCATIONS.pickup.lat],
          ],
        },
      })
    }

    // Fit bounds
    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend([lng, lat])
    bounds.extend([FIXED_LOCATIONS.pickup.lng, FIXED_LOCATIONS.pickup.lat])
    bounds.extend([FIXED_LOCATIONS.passengerHome.lng, FIXED_LOCATIONS.passengerHome.lat])
    map.fitBounds(bounds, { padding: 80, maxZoom: 14 })
  }

  return (
    <div className="relative h-[calc(100vh-80px)]">
      <div ref={mapContainer} className="absolute inset-0" />

      <div className="absolute bottom-4 left-4 right-4 z-10">
        <div className="bg-[#1A1A2E] border border-[rgba(155,127,232,0.15)] rounded-3xl p-4">
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#8888A8] animate-pulse" />
              <span className="text-[#8888A8]">Cargando...</span>
            </div>
          ) : isActive ? (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#4CAF82] animate-pulse" />
              <div>
                <p className="text-[#F0F0FF] font-bold">Transportador en camino</p>
                {driverLocation && (
                  <p className="text-xs text-[#8888A8]">
                    Última ubicación: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#8888A8]" />
              <span className="text-[#8888A8]">No hay viaje activo</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
