'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { formatDate, formatTime } from '@/lib/utils'
import { formatCOP, SERVICE_AMOUNT } from '@/lib/constants'
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

export default function PassengerHome() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [todayService, setTodayService] = useState<ServiceDay | null>(null)
  const [debt, setDebt] = useState(0)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(prof)

      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: service } = await supabase
        .from('service_days')
        .select('*')
        .eq('date', today)
        .single()
      setTodayService(service)

      const { data: unpaid } = await supabase
        .from('service_days')
        .select('amount')
        .eq('is_paid', false)
        .in('status', ['confirmed', 'completed', 'in_progress'])
      setDebt((unpaid || []).reduce((sum, s) => sum + s.amount, 0))

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F0FF]">Buenas noches</h1>
        <p className="text-[#8888A8]">{profile?.name || 'Pasajero'}</p>
      </div>

      <Card>
        <p className="text-xs text-[#8888A8] uppercase tracking-wider mb-3">Servicio de hoy</p>
        {todayService ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-[#F0F0FF]">
                {todayService.pickup_time ? formatTime(todayService.pickup_time) : '--:--'}
              </span>
              <Badge variant={statusBadge[todayService.status] || 'info'}>
                {statusLabels[todayService.status]}
              </Badge>
            </div>
            {todayService.status === 'in_progress' && (
              <Button onClick={() => router.push('/passenger/map')} className="w-full" size="lg">
                Ver en mapa
              </Button>
            )}
            {todayService.status === 'confirmed' && (
              <p className="text-[#4CAF82] text-sm">
                Servicio confirmado para las {formatTime(todayService.pickup_time || '')}
              </p>
            )}
            {todayService.status === 'scheduled' && (
              <p className="text-[#F0A070] text-sm">Esperando confirmación del transportador</p>
            )}
          </div>
        ) : (
          <p className="text-[#8888A8]">Sin servicio programado hoy</p>
        )}
      </Card>

      <Card>
        <p className="text-xs text-[#8888A8] uppercase tracking-wider mb-2">Deuda pendiente</p>
        <p className="text-3xl font-extrabold text-[#F0F0FF]">{formatCOP(debt)}</p>
      </Card>
    </div>
  )
}
