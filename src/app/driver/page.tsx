'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { formatTime } from '@/lib/utils'
import { formatCOP } from '@/lib/constants'
import { format } from 'date-fns'
import type { ServiceDay, Profile } from '@/lib/types/database'

const statusLabels: Record<string, string> = {
  scheduled: 'Programado',
  negotiating: 'Negociando',
  confirmed: 'Confirmado',
  in_progress: 'En camino',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const statusBadge: Record<string, 'info' | 'pending' | 'paid' | 'cancelled'> = {
  scheduled: 'info',
  negotiating: 'pending',
  confirmed: 'paid',
  in_progress: 'info',
  completed: 'paid',
  cancelled: 'cancelled',
}

export default function DriverHome() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [todayService, setTodayService] = useState<ServiceDay | null>(null)
  const [trackingSessionId, setTrackingSessionId] = useState<string | null>(null)
  const [earnings, setEarnings] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)

    const today = format(new Date(), 'yyyy-MM-dd')
    const { data: service } = await supabase.from('service_days').select('*').eq('date', today).single()
    setTodayService(service)

    if (service?.status === 'in_progress') {
      const { data: session } = await supabase
        .from('tracking_sessions')
        .select('id')
        .eq('service_day_id', service.id)
        .eq('is_active', true)
        .single()
      if (session) {
        setTrackingSessionId(session.id)
        startLocationTracking(session.id)
      }
    }

    const { data: unpaid } = await supabase
      .from('service_days')
      .select('amount')
      .eq('is_paid', false)
      .in('status', ['confirmed', 'completed', 'in_progress'])
    setEarnings((unpaid || []).reduce((sum, s) => sum + s.amount, 0))

    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [loadData])

  function startLocationTracking(sessionId: string) {
    if (watchIdRef.current !== null) return
    const supabase = createClient()

    function sendLocation() {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await supabase.from('location_updates').insert({
            tracking_session_id: sessionId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
        },
        (err) => console.error('Geo error:', err),
        { enableHighAccuracy: true }
      )
    }

    sendLocation()
    intervalRef.current = setInterval(sendLocation, 30000)
    watchIdRef.current = 1 // marker that tracking is active
  }

  function stopLocationTracking() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    watchIdRef.current = null
  }

  async function handleStartTrip() {
    if (!todayService) return
    setActionLoading(true)
    try {
      const supabase = createClient()
      const { data: session, error } = await supabase
        .from('tracking_sessions')
        .insert({
          service_day_id: todayService.id,
          is_active: true,
          started_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (error) throw error

      await supabase.from('service_days').update({ status: 'in_progress' }).eq('id', todayService.id)

      setTrackingSessionId(session.id)
      setTodayService({ ...todayService, status: 'in_progress' })
      startLocationTracking(session.id)
      toast('Viaje iniciado', 'success')
    } catch (err: any) {
      toast(err.message || 'Error al iniciar viaje', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleEndTrip() {
    if (!todayService || !trackingSessionId) return
    setActionLoading(true)
    try {
      const supabase = createClient()
      stopLocationTracking()

      await supabase
        .from('tracking_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('id', trackingSessionId)

      await supabase.from('service_days').update({ status: 'completed' }).eq('id', todayService.id)

      setTodayService({ ...todayService, status: 'completed' })
      setTrackingSessionId(null)
      toast('Viaje completado', 'success')
    } catch (err: any) {
      toast(err.message || 'Error al finalizar viaje', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F0FF]">Buenas noches</h1>
        <p className="text-[#8888A8]">{profile?.name || 'Transportador'}</p>
      </div>

      <Card>
        <p className="text-xs text-[#8888A8] uppercase tracking-wider mb-3">Servicio de hoy</p>
        {todayService ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-[#F0F0FF]">
                {todayService.pickup_time ? formatTime(todayService.pickup_time) : '--:--'}
              </span>
              <Badge variant={statusBadge[todayService.status] || 'info'}>
                {statusLabels[todayService.status]}
              </Badge>
            </div>

            {todayService.status === 'confirmed' && (
              <Button className="w-full h-16 text-lg" size="lg" onClick={handleStartTrip} loading={actionLoading}>
                Ya salí
              </Button>
            )}

            {todayService.status === 'in_progress' && (
              <Button variant="danger" className="w-full h-16 text-lg" size="lg" onClick={handleEndTrip} loading={actionLoading}>
                Llegué
              </Button>
            )}

            {todayService.status === 'completed' && (
              <p className="text-[#4CAF82] text-sm text-center">Viaje completado</p>
            )}
          </div>
        ) : (
          <p className="text-[#8888A8]">Sin servicio programado hoy</p>
        )}
      </Card>

      <Card>
        <p className="text-xs text-[#8888A8] uppercase tracking-wider mb-2">Por cobrar</p>
        <p className="text-3xl font-extrabold text-[#F0F0FF]">{formatCOP(earnings)}</p>
      </Card>
    </div>
  )
}
