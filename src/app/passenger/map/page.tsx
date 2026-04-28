'use client'

import { useEffect, useState, useMemo } from 'react'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { createClient } from '@/lib/supabase/client'
import { FIXED_LOCATIONS, MAPBOX_TOKEN, MAPBOX_STYLE } from '@/lib/constants'
import { haversineDistance } from '@/lib/utils'
import { format } from 'date-fns'

const PICKUP = FIXED_LOCATIONS.pickup
const HOME = FIXED_LOCATIONS.passengerHome
const AVG_SPEED_KMH = 45 // velocidad promedio estimada en zona urbana/rural nocturna

export default function PassengerMapPage() {
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [arriving, setArriving] = useState(false)

  const [viewState, setViewState] = useState({
    longitude: (PICKUP.lng + HOME.lng) / 2,
    latitude: (PICKUP.lat + HOME.lat) / 2,
    zoom: 11,
  })

  // Distance & ETA calculations
  const distanceToPickup = useMemo(() => {
    if (!driverLocation) return null
    return haversineDistance(driverLocation.lat, driverLocation.lng, PICKUP.lat, PICKUP.lng)
  }, [driverLocation])

  const etaMinutes = useMemo(() => {
    if (!distanceToPickup) return null
    const hours = (distanceToPickup / 1000) / AVG_SPEED_KMH
    return Math.max(1, Math.round(hours * 60))
  }, [distanceToPickup])

  const distanceText = useMemo(() => {
    if (!distanceToPickup) return null
    if (distanceToPickup < 1000) return `${Math.round(distanceToPickup)} m`
    return `${(distanceToPickup / 1000).toFixed(1)} km`
  }, [distanceToPickup])

  // Check arriving (< 500m)
  useEffect(() => {
    if (distanceToPickup !== null && distanceToPickup <= 500) {
      setArriving(true)
    }
  }, [distanceToPickup])

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
          setDriverLocation({ lat: lastLoc.lat, lng: lastLoc.lng })
          if (lastLoc.recorded_at) setLastUpdate(new Date(lastLoc.recorded_at))
        }

        channelRef = supabase.channel('passenger-loc')
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'location_updates',
            filter: `tracking_session_id=eq.${session.id}`,
          }, (payload: any) => {
            const r = payload.new as { lat: number; lng: number }
            setDriverLocation({ lat: r.lat, lng: r.lng })
            setLastUpdate(new Date())
          }).subscribe()
      } catch { /* no trip */ }
      finally { setLoading(false) }
    }
    check()
    return () => { if (channelRef) supabase.removeChannel(channelRef) }
  }, [])

  const fixedRouteData: GeoJSON.Feature = {
    type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: [[PICKUP.lng, PICKUP.lat], [HOME.lng, HOME.lat]] },
  }

  const driverRouteData: GeoJSON.Feature = {
    type: 'Feature', properties: {},
    geometry: {
      type: 'LineString',
      coordinates: driverLocation
        ? [[driverLocation.lng, driverLocation.lat], [PICKUP.lng, PICKUP.lat]]
        : [],
    },
  }

  return (
    <div className="relative h-[calc(100vh-80px)] w-full bg-[#0A0A14]">
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAPBOX_STYLE}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        {/* Pickup marker (green) */}
        <Marker longitude={PICKUP.lng} latitude={PICKUP.lat} anchor="center">
          <div style={{ width: 16, height: 16, background: '#4CAF82', borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 0 12px rgba(76,175,130,0.5)' }} />
        </Marker>

        {/* Passenger home marker (purple) */}
        <Marker longitude={HOME.lng} latitude={HOME.lat} anchor="center">
          <div style={{ width: 16, height: 16, background: '#9B7FE8', borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 0 12px rgba(155,127,232,0.5)' }} />
        </Marker>

        {/* Driver home marker (orange) */}
        <Marker longitude={FIXED_LOCATIONS.driverHome.lng} latitude={FIXED_LOCATIONS.driverHome.lat} anchor="center">
          <div style={{ width: 16, height: 16, background: '#F0A070', borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 0 12px rgba(240,160,112,0.5)' }} />
        </Marker>

        {/* Driver live marker (pulsing) */}
        {driverLocation && (
          <Marker longitude={driverLocation.lng} latitude={driverLocation.lat} anchor="center">
            <div className="relative">
              <div style={{
                width: 26, height: 26,
                background: arriving ? '#4CAF82' : '#9B7FE8',
                borderRadius: '50%', border: '4px solid #fff',
                boxShadow: `0 0 20px ${arriving ? 'rgba(76,175,130,0.6)' : 'rgba(155,127,232,0.6)'}`,
              }} />
              <div className={`absolute inset-[-4px] rounded-full ${arriving ? 'bg-[#4CAF82]' : 'bg-[#9B7FE8]'} animate-ping opacity-30`} />
            </div>
          </Marker>
        )}

        {/* Fixed dashed route */}
        <Source id="fixed-route" type="geojson" data={fixedRouteData}>
          <Layer id="fixed-route" type="line"
            paint={{ 'line-color': '#9B7FE8', 'line-width': 3, 'line-opacity': 0.4, 'line-dasharray': [2, 4] }} />
        </Source>

        {/* Driver route (solid) */}
        {driverLocation && (
          <Source id="driver-route" type="geojson" data={driverRouteData}>
            <Layer id="driver-route" type="line"
              paint={{ 'line-color': arriving ? '#4CAF82' : '#9B7FE8', 'line-width': 4, 'line-opacity': 0.85 }} />
          </Source>
        )}
      </Map>

      {/* Arriving banner */}
      {arriving && (
        <div className="absolute top-4 left-4 right-4 z-10">
          <div className="bg-[#4CAF82] rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
            <span className="text-xl">⚡</span>
            <p className="text-[#0D0D14] font-bold text-sm">Tu transportador está llegando</p>
          </div>
        </div>
      )}

      {/* Bottom card */}
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <div className="bg-[#1A1A2E] border border-[rgba(155,127,232,0.2)] rounded-3xl p-5">
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#8888A8] animate-pulse" />
              <span className="text-sm text-[#8888A8]">Cargando...</span>
            </div>
          ) : isActive ? (
            <div className="space-y-3">
              {/* Status row */}
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <div className={`w-3 h-3 rounded-full ${arriving ? 'bg-[#4CAF82]' : 'bg-[#4CAF82]'}`} />
                  <div className={`absolute inset-0 w-3 h-3 rounded-full bg-[#4CAF82] animate-ping opacity-75`} />
                </div>
                <p className="text-[#F0F0FF] font-semibold text-sm">
                  {arriving ? 'Está llegando' : 'Transportador en camino'}
                </p>
              </div>

              {/* Distance + ETA */}
              {distanceText && etaMinutes && (
                <div className="flex gap-3">
                  <div className="flex-1 bg-[#2A2A45] rounded-2xl p-3 text-center">
                    <p className="text-xl font-bold text-[#F0F0FF] tabular-nums">{distanceText}</p>
                    <p className="text-[10px] text-[#8888A8] uppercase mt-0.5">Distancia</p>
                  </div>
                  <div className="flex-1 bg-[#2A2A45] rounded-2xl p-3 text-center">
                    <p className="text-xl font-bold text-[#9B7FE8] tabular-nums">{etaMinutes} min</p>
                    <p className="text-[10px] text-[#8888A8] uppercase mt-0.5">Tiempo est.</p>
                  </div>
                </div>
              )}

              {/* Last update */}
              {lastUpdate && (
                <p className="text-xs text-[#6B6B80] text-center">
                  Última actualización: {format(lastUpdate, 'HH:mm:ss')}
                </p>
              )}
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
