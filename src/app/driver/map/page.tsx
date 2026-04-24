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

type GpsStatus = 'checking' | 'prompting' | 'active' | 'denied' | 'unavailable'

export default function DriverMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastSentRef = useRef<number>(0)

  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('checking')
  const [isTracking, setIsTracking] = useState(false)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [trackingSessionId, setTrackingSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const { toast } = useToast()

  // ── GPS permission request on mount ────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function requestGps() {
      // Check if geolocation is available at all
      if (!navigator.geolocation) {
        setGpsStatus('unavailable')
        return
      }

      // Query permission state if the API is available
      if (navigator.permissions) {
        try {
          const perm = await navigator.permissions.query({ name: 'geolocation' })

          if (perm.state === 'denied') {
            setGpsStatus('denied')
            return
          }

          // Listen for future changes (user revokes in browser settings)
          perm.addEventListener('change', () => {
            if (perm.state === 'denied') setGpsStatus('denied')
            if (perm.state === 'granted') setGpsStatus('active')
          })
        } catch {
          // permissions.query not supported for geolocation in some browsers — continue
        }
      }

      // Trigger the browser permission dialog immediately
      setGpsStatus('prompting')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setMyLocation(loc)
          setGpsStatus('active')
          updateDriverMarker(loc.lat, loc.lng)
          mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 13 })
        },
        (err) => {
          if (cancelled) return
          console.error('GPS permission error:', err)
          if (err.code === err.PERMISSION_DENIED) {
            setGpsStatus('denied')
          } else {
            setGpsStatus('unavailable')
          }
        },
        { enableHighAccuracy: true, timeout: 15000 }
      )
    }

    requestGps()
    return () => { cancelled = true }
  }, [])

  // ── Initialize map ─────────────────────────────────────────────
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
      pickupEl.style.cssText =
        'width:16px;height:16px;background:#4CAF82;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(76,175,130,0.5);'
      new mapboxgl.Marker(pickupEl)
        .setLngLat([FIXED_LOCATIONS.pickup.lng, FIXED_LOCATIONS.pickup.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(FIXED_LOCATIONS.pickup.label))
        .addTo(map)

      // Passenger home marker (light purple)
      const homeEl = document.createElement('div')
      homeEl.style.cssText =
        'width:16px;height:16px;background:#C4A8FF;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(196,168,255,0.5);'
      new mapboxgl.Marker(homeEl)
        .setLngLat([FIXED_LOCATIONS.passengerHome.lng, FIXED_LOCATIONS.passengerHome.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(FIXED_LOCATIONS.passengerHome.label))
        .addTo(map)

      // Route line source (driver → pickup)
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

  // ── Check for active trip today ────────────────────────────────
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
            startWatching(session.id)
          }
        }
      }
      setLoading(false)
    }

    checkTrip()

    return () => stopWatching()
  }, [])

  // ── Marker & route helpers ─────────────────────────────────────
  function updateDriverMarker(lat: number, lng: number) {
    const map = mapRef.current
    if (!map) return

    if (!driverMarkerRef.current) {
      const el = document.createElement('div')
      el.innerHTML = `
        <div style="position:relative;width:24px;height:24px;">
          <div style="position:absolute;inset:0;background:#9B7FE8;border-radius:50%;border:4px solid #fff;box-shadow:0 0 20px rgba(155,127,232,0.6);"></div>
          <div style="position:absolute;inset:-6px;background:rgba(155,127,232,0.25);border-radius:50%;animation:pulse 2s ease-in-out infinite;"></div>
        </div>
      `
      // Add keyframes for pulse if not present
      if (!document.getElementById('driver-pulse-style')) {
        const style = document.createElement('style')
        style.id = 'driver-pulse-style'
        style.textContent = `@keyframes pulse { 0%,100% { transform:scale(1); opacity:0.25; } 50% { transform:scale(1.5); opacity:0; } }`
        document.head.appendChild(style)
      }
      driverMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map)
    } else {
      driverMarkerRef.current.setLngLat([lng, lat])
    }

    // Update route line from driver to pickup
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

  // ── watchPosition-based tracking ───────────────────────────────
  function startWatching(sessionId: string) {
    if (watchIdRef.current !== null) return
    if (!navigator.geolocation) return

    const supabase = createClient()

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMyLocation(loc)
        setGpsStatus('active')
        updateDriverMarker(loc.lat, loc.lng)

        // Throttle Supabase writes to max once per 30 seconds
        const now = Date.now()
        if (now - lastSentRef.current >= 30000) {
          lastSentRef.current = now
          await supabase.from('location_updates').insert({
            tracking_session_id: sessionId,
            lat: loc.lat,
            lng: loc.lng,
          })
        }
      },
      (err) => {
        console.error('watchPosition error:', err)
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied')
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  function stopWatching() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }

  // ── Trip actions ───────────────────────────────────────────────
  async function handleStartTrip() {
    if (!serviceId) return
    if (gpsStatus !== 'active') {
      toast('Necesitas GPS activo para iniciar el viaje', 'error')
      return
    }
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
      startWatching(session.id)
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
      stopWatching()

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

  // ── GPS status indicator ───────────────────────────────────────
  function GpsIndicator() {
    const colors: Record<GpsStatus, string> = {
      checking: '#8888A8',
      prompting: '#F0A070',
      active: '#4CAF82',
      denied: '#EF4444',
      unavailable: '#EF4444',
    }
    const labels: Record<GpsStatus, string> = {
      checking: 'Verificando GPS...',
      prompting: 'Activando GPS...',
      active: 'GPS activo',
      denied: 'GPS denegado',
      unavailable: 'GPS no disponible',
    }
    return (
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${gpsStatus === 'active' ? 'animate-pulse' : ''}`}
          style={{ background: colors[gpsStatus] }}
        />
        <span className="text-xs" style={{ color: colors[gpsStatus] }}>
          {labels[gpsStatus]}
        </span>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="relative h-[calc(100vh-80px)]">
      {/* Fullscreen map */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Bottom overlay card */}
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <div className="bg-[#1A1A2E] border border-[rgba(155,127,232,0.15)] rounded-3xl p-4">
          <GpsIndicator />

          {/* GPS denied message */}
          {(gpsStatus === 'denied' || gpsStatus === 'unavailable') && (
            <div className="mb-3 p-3 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
              <p className="text-sm text-[#EF4444] font-medium mb-1">
                {gpsStatus === 'denied'
                  ? 'Permiso de ubicación denegado'
                  : 'GPS no disponible en este navegador'}
              </p>
              <p className="text-xs text-[#8888A8]">
                {gpsStatus === 'denied'
                  ? 'Abre la configuración de tu navegador → Permisos del sitio → Ubicación → Permitir. Luego recarga la página.'
                  : 'Asegúrate de usar HTTPS y un navegador compatible.'}
              </p>
            </div>
          )}

          {/* Loading */}
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#8888A8] animate-pulse" />
              <span className="text-[#8888A8]">Cargando...</span>
            </div>
          ) : isTracking ? (
            /* Tracking active */
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
              <Button
                variant="danger"
                className="w-full h-14 text-lg"
                size="lg"
                onClick={handleEndTrip}
                loading={actionLoading}
              >
                Llegué
              </Button>
            </div>
          ) : serviceId ? (
            /* Has confirmed trip */
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#F0A070]" />
                <span className="text-[#F0F0FF]">Viaje confirmado — listo para salir</span>
              </div>
              <Button
                className="w-full h-14 text-lg"
                size="lg"
                onClick={handleStartTrip}
                loading={actionLoading}
                disabled={gpsStatus !== 'active'}
              >
                Ya salí
              </Button>
            </div>
          ) : (
            /* No trip */
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#8888A8]" />
              <span className="text-[#8888A8]">Sin viaje activo hoy</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
