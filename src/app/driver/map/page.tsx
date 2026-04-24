'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { createClient } from '@/lib/supabase/client'
import { FIXED_LOCATIONS, MAPBOX_STYLE } from '@/lib/constants'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { format } from 'date-fns'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export default function DriverMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [trackingSessionId, setTrackingSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const { toast } = useToast()

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center: [FIXED_LOCATIONS.driverHome.lng, FIXED_LOCATIONS.driverHome.lat],
      zoom: 11,
    })

    mapRef.current = map

    map.on('load', () => {
      // Pickup marker (green)
      const pickupEl = document.createElement('div')
      pickupEl.style.cssText = 'width:16px;height:16px;background:#4CAF82;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(76,175,130,0.5);'
      new mapboxgl.Marker(pickupEl)
        .setLngLat([FIXED_LOCATIONS.pickup.lng, FIXED_LOCATIONS.pickup.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(FIXED_LOCATIONS.pickup.label))
        .addTo(map)

      // Passenger home marker (purple light)
      const homeEl = document.createElement('div')
      homeEl.style.cssText = 'width:16px;height:16px;background:#C4A8FF;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(196,168,255,0.5);'
      new mapboxgl.Marker(homeEl)
        .setLngLat([FIXED_LOCATIONS.passengerHome.lng, FIXED_LOCATIONS.passengerHome.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(FIXED_LOCATIONS.passengerHome.label))
        .addTo(map)

      // Route source
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

    // Get current position immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMyLocation(loc)
        updateMyMarker(loc.lat, loc.lng)
        map.flyTo({ center: [loc.lng, loc.lat], zoom: 13 })
      },
      (err) => {
        console.error('Geo error:', err)
        toast('No se pudo obtener tu ubicación. Activa el GPS.', 'error')
      },
      { enableHighAccuracy: true }
    )

    return () => map.remove()
  }, [])

  // Check if there's an active trip today
  useEffect(() => {
    async function checkTrip() {
      const supabase = createClient()
      const today = format(new Date(), 'yyyy-MM-dd')

      const { data: service } = await supabase
        .from('service_days')
        .select('*')
        .eq('date', today)
        .in('status', ['confirmed', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (service) {
        setServiceId(service.id)
        if (service.status === 'in_progress') {
          const { data: session } = await supabase
            .from('tracking_sessions')
            .select('id')
            .eq('service_day_id', service.id)
            .eq('is_active', true)
            .single()
          if (session) {
            setTrackingSessionId(session.id)
            setIsTracking(true)
            startSendingLocation(session.id)
          }
        }
      }
      setLoading(false)
    }
    checkTrip()

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function updateMyMarker(lat: number, lng: number) {
    const map = mapRef.current
    if (!map) return

    if (!driverMarkerRef.current) {
      const el = document.createElement('div')
      el.style.cssText = 'width:24px;height:24px;background:#9B7FE8;border-radius:50%;border:4px solid #fff;box-shadow:0 0 20px rgba(155,127,232,0.6);'
      driverMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map)
    } else {
      driverMarkerRef.current.setLngLat([lng, lat])
    }

    // Update route to pickup
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
  }

  function startSendingLocation(sessionId: string) {
    if (intervalRef.current) return
    const supabase = createClient()

    function sendAndUpdate() {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setMyLocation(loc)
          updateMyMarker(loc.lat, loc.lng)
          await supabase.from('location_updates').insert({
            tracking_session_id: sessionId,
            lat: loc.lat,
            lng: loc.lng,
          })
        },
        (err) => console.error('Geo error:', err),
        { enableHighAccuracy: true }
      )
    }

    sendAndUpdate()
    intervalRef.current = setInterval(sendAndUpdate, 30000)
  }

  async function handleStartTrip() {
    if (!serviceId) return
    setActionLoading(true)
    try {
      const supabase = createClient()
      const { data: session, error } = await supabase
        .from('tracking_sessions')
        .insert({ service_day_id: serviceId, is_active: true, started_at: new Date().toISOString() })
        .select()
        .single()
      if (error) throw error

      await supabase.from('service_days').update({ status: 'in_progress' }).eq('id', serviceId)

      setTrackingSessionId(session.id)
      setIsTracking(true)
      startSendingLocation(session.id)
      toast('Viaje iniciado — compartiendo ubicación', 'success')
    } catch (err: any) {
      toast(err.message || 'Error', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleEndTrip() {
    if (!serviceId || !trackingSessionId) return
    setActionLoading(true)
    try {
      const supabase = createClient()
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }

      await supabase
        .from('tracking_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('id', trackingSessionId)
      await supabase.from('service_days').update({ status: 'completed' }).eq('id', serviceId)

      setIsTracking(false)
      setTrackingSessionId(null)
      setServiceId(null)
      toast('Viaje completado', 'success')
    } catch (err: any) {
      toast(err.message || 'Error', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="relative h-[calc(100vh-80px)]">
      <div ref={mapContainer} className="absolute inset-0" />

      <div className="absolute bottom-4 left-4 right-4 z-10 space-y-3">
        {/* Status card */}
        <div className="bg-[#1A1A2E] border border-[rgba(155,127,232,0.15)] rounded-3xl p-4">
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#8888A8] animate-pulse" />
              <span className="text-[#8888A8]">Cargando...</span>
            </div>
          ) : isTracking ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#4CAF82] animate-pulse" />
                <div>
                  <p className="text-[#F0F0FF] font-bold">Compartiendo ubicación</p>
                  {myLocation && (
                    <p className="text-xs text-[#8888A8]">
                      {myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="danger" className="w-full h-14 text-lg" size="lg" onClick={handleEndTrip} loading={actionLoading}>
                Llegué
              </Button>
            </div>
          ) : serviceId ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#F0A070]" />
                <span className="text-[#F0F0FF]">Viaje confirmado — listo para salir</span>
              </div>
              <Button className="w-full h-14 text-lg" size="lg" onClick={handleStartTrip} loading={actionLoading}>
                Ya salí
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#8888A8]" />
              <span className="text-[#8888A8]">No hay viaje activo hoy</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
