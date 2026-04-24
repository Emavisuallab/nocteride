'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FIXED_LOCATIONS, MAPBOX_STYLE } from '@/lib/constants'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { format } from 'date-fns'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
type GpsStatus = 'checking' | 'prompting' | 'active' | 'denied' | 'unavailable'

export default function DriverMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastSentRef = useRef<number>(0)

  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('checking')
  const [isTracking, setIsTracking] = useState(false)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [trackingSessionId, setTrackingSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  function updateMarker(lat: number, lng: number) {
    const map = mapRef.current
    if (!map) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (!driverMarkerRef.current) {
        const el = document.createElement('div')
        el.innerHTML = '<div style="position:relative;width:24px;height:24px;"><div style="position:absolute;inset:0;background:#9B7FE8;border-radius:50%;border:4px solid #fff;box-shadow:0 0 20px rgba(155,127,232,0.6);"></div><div style="position:absolute;inset:-6px;background:rgba(155,127,232,0.25);border-radius:50%;animation:drvP 2s ease-in-out infinite;"></div></div>'
        if (!document.getElementById('drvP-style')) {
          const s = document.createElement('style')
          s.id = 'drvP-style'
          s.textContent = '@keyframes drvP{0%,100%{transform:scale(1);opacity:.25}50%{transform:scale(1.5);opacity:0}}'
          document.head.appendChild(s)
        }
        driverMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map)
      } else {
        driverMarkerRef.current.setLngLat([lng, lat])
      }

      const src = map.getSource('route')
      if (src) {
        src.setData({
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [[lng, lat], [FIXED_LOCATIONS.pickup.lng, FIXED_LOCATIONS.pickup.lat]] },
        })
      }
    })
  }

  // Init map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainer.current || mapRef.current) return
    let cancelled = false

    async function init() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default
        await import('mapbox-gl/dist/mapbox-gl.css')
        if (cancelled || !mapContainer.current) return

        mapboxgl.accessToken = TOKEN
        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: MAPBOX_STYLE,
          center: [FIXED_LOCATIONS.driverHome.lng, FIXED_LOCATIONS.driverHome.lat],
          zoom: 11,
          attributionControl: false,
        })
        mapRef.current = map

        map.on('load', () => {
          if (cancelled) return
          setMapReady(true)

          const pickupEl = document.createElement('div')
          pickupEl.style.cssText = 'width:16px;height:16px;background:#4CAF82;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(76,175,130,0.5);'
          new mapboxgl.Marker(pickupEl)
            .setLngLat([FIXED_LOCATIONS.pickup.lng, FIXED_LOCATIONS.pickup.lat])
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(FIXED_LOCATIONS.pickup.label))
            .addTo(map)

          const homeEl = document.createElement('div')
          homeEl.style.cssText = 'width:16px;height:16px;background:#C4A8FF;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(196,168,255,0.5);'
          new mapboxgl.Marker(homeEl)
            .setLngLat([FIXED_LOCATIONS.passengerHome.lng, FIXED_LOCATIONS.passengerHome.lat])
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(FIXED_LOCATIONS.passengerHome.label))
            .addTo(map)

          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
          })
          map.addLayer({
            id: 'route', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#9B7FE8', 'line-width': 4, 'line-opacity': 0.8 },
          })
        })
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Error al cargar mapa')
      }
    }

    init()
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, [])

  // GPS
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    async function requestGps() {
      if (!navigator.geolocation) { setGpsStatus('unavailable'); return }
      if (navigator.permissions) {
        try {
          const perm = await navigator.permissions.query({ name: 'geolocation' })
          if (perm.state === 'denied') { setGpsStatus('denied'); return }
          perm.addEventListener('change', () => {
            if (perm.state === 'denied') setGpsStatus('denied')
            if (perm.state === 'granted') setGpsStatus('active')
          })
        } catch { /* continue */ }
      }
      setGpsStatus('prompting')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setMyLocation(loc)
          setGpsStatus('active')
          updateMarker(loc.lat, loc.lng)
          mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 13 })
        },
        (err) => {
          if (cancelled) return
          setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
        },
        { enableHighAccuracy: true, timeout: 15000 }
      )
    }
    requestGps()
    return () => { cancelled = true }
  }, [])

  // Check trip
  useEffect(() => {
    async function checkTrip() {
      const supabase = createClient()
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: service } = await supabase
        .from('service_days').select('*')
        .eq('date', today).in('status', ['confirmed', 'in_progress', 'scheduled'])
        .order('created_at', { ascending: false }).limit(1).single()

      if (service) {
        setServiceId(service.id)
        if (service.status === 'in_progress') {
          const { data: session } = await supabase
            .from('tracking_sessions').select('id')
            .eq('service_day_id', service.id).eq('is_active', true).single()
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

  function startWatching(sessionId: string) {
    if (watchIdRef.current !== null || !navigator.geolocation) return
    const supabase = createClient()
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMyLocation(loc)
        setGpsStatus('active')
        updateMarker(loc.lat, loc.lng)
        const now = Date.now()
        if (now - lastSentRef.current >= 30000) {
          lastSentRef.current = now
          await supabase.from('location_updates').insert({ tracking_session_id: sessionId, lat: loc.lat, lng: loc.lng })
        }
      },
      (err) => { if (err.code === err.PERMISSION_DENIED) setGpsStatus('denied') },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  function stopWatching() {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null }
  }

  async function handleStartTrip() {
    if (!serviceId) return
    if (gpsStatus !== 'active') { toast('Necesitas GPS activo', 'error'); return }
    setActionLoading(true)
    try {
      const supabase = createClient()
      const { data: session, error } = await supabase
        .from('tracking_sessions')
        .insert({ service_day_id: serviceId, is_active: true, started_at: new Date().toISOString() })
        .select().single()
      if (error) throw error
      await supabase.from('service_days').update({ status: 'in_progress' }).eq('id', serviceId)
      setTrackingSessionId(session.id)
      setIsTracking(true)
      startWatching(session.id)
      toast('Viaje iniciado', 'success')
    } catch (err: any) { toast(err.message, 'error') }
    finally { setActionLoading(false) }
  }

  async function handleEndTrip() {
    if (!serviceId || !trackingSessionId) return
    setActionLoading(true)
    try {
      const supabase = createClient()
      stopWatching()
      await supabase.from('tracking_sessions').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', trackingSessionId)
      await supabase.from('service_days').update({ status: 'completed' }).eq('id', serviceId)
      setIsTracking(false); setTrackingSessionId(null); setServiceId(null)
      toast('Viaje completado', 'success')
    } catch (err: any) { toast(err.message, 'error') }
    finally { setActionLoading(false) }
  }

  const gpsColors: Record<GpsStatus, string> = { checking: '#8888A8', prompting: '#F0A070', active: '#4CAF82', denied: '#EF4444', unavailable: '#EF4444' }
  const gpsLabels: Record<GpsStatus, string> = { checking: 'Verificando GPS...', prompting: 'Activando GPS...', active: 'GPS activo', denied: 'GPS denegado', unavailable: 'GPS no disponible' }

  if (error) {
    return (
      <div className="h-[calc(100vh-80px)] w-full bg-[#0A0A14] flex items-center justify-center p-6">
        <div className="bg-[#1A1A2E] rounded-3xl p-6 text-center">
          <p className="text-[#E05A5A] font-bold mb-2">Error del mapa</p>
          <p className="text-[#8888A8] text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100vh-80px)]">
      <div ref={mapContainer} className="absolute inset-0" />

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0A0A14]">
          <div className="text-[#8888A8] text-sm animate-pulse">Cargando mapa...</div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 right-4 z-10">
        <div className="bg-[#1A1A2E] border border-[rgba(155,127,232,0.15)] rounded-3xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2.5 h-2.5 rounded-full ${gpsStatus === 'active' ? 'animate-pulse' : ''}`} style={{ background: gpsColors[gpsStatus] }} />
            <span className="text-xs" style={{ color: gpsColors[gpsStatus] }}>{gpsLabels[gpsStatus]}</span>
          </div>

          {(gpsStatus === 'denied' || gpsStatus === 'unavailable') && (
            <div className="mb-3 p-3 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
              <p className="text-sm text-[#EF4444] font-medium mb-1">{gpsStatus === 'denied' ? 'Permiso de ubicación denegado' : 'GPS no disponible'}</p>
              <p className="text-xs text-[#8888A8]">{gpsStatus === 'denied' ? 'Abre configuración del navegador → Permisos → Ubicación → Permitir. Luego recarga.' : 'Usa HTTPS y un navegador compatible.'}</p>
            </div>
          )}

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
                  {myLocation && <p className="text-xs text-[#8888A8]">{myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}</p>}
                </div>
              </div>
              <Button variant="danger" className="w-full h-14 text-lg" size="lg" onClick={handleEndTrip} loading={actionLoading}>Llegué</Button>
            </div>
          ) : serviceId ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#F0A070]" />
                <span className="text-[#F0F0FF]">Viaje listo para salir</span>
              </div>
              <Button className="w-full h-14 text-lg" size="lg" onClick={handleStartTrip} loading={actionLoading} disabled={gpsStatus !== 'active'}>Ya salí</Button>
            </div>
          ) : (
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
