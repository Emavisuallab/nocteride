'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'
import { formatCOP, SERVICE_AMOUNT } from '@/lib/constants'
import type { ServiceDay } from '@/lib/types/database'

export default function PassengerPayments() {
  const [services, setServices] = useState<ServiceDay[]>([])
  const [debt, setDebt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState<string | null>(null)
  const { toast } = useToast()

  async function loadData() {
    const supabase = createClient()
    const { data } = await supabase
      .from('service_days')
      .select('*')
      .order('date', { ascending: false })
    setServices(data || [])

    const unpaid = (data || []).filter(
      (s) => !s.is_paid && ['confirmed', 'completed', 'in_progress'].includes(s.status)
    )
    setDebt(unpaid.length * SERVICE_AMOUNT)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function handleMarkPaid(service: ServiceDay) {
    setPayingId(service.id)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      await supabase.from('payments').insert({
        service_day_id: service.id,
        amount: SERVICE_AMOUNT,
        paid_at: new Date().toISOString(),
        marked_by: user.id,
      })
      await supabase.from('service_days').update({ is_paid: true }).eq('id', service.id)

      toast('Pago registrado', 'success')
      loadData()
    } catch (err: any) {
      toast(err.message || 'Error al registrar pago', 'error')
    } finally {
      setPayingId(null)
    }
  }

  function getBadge(service: ServiceDay) {
    if (service.is_paid) return <Badge variant="paid">Pagado</Badge>
    if (service.status === 'cancelled') return <Badge variant="cancelled">Cancelado</Badge>
    return <Badge variant="pending">Pendiente</Badge>
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-24 w-full" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    )
  }

  return (
    <div className="p-6">
      <Card className="mb-6 text-center">
        <p className="text-xs text-[#8888A8] uppercase tracking-wider mb-1">Deuda total</p>
        <p className="text-4xl font-extrabold text-[#F0F0FF]">{formatCOP(debt)}</p>
      </Card>

      <h2 className="text-lg font-bold text-[#F0F0FF] mb-4">Historial</h2>

      {services.length === 0 ? (
        <p className="text-[#8888A8] text-center py-12">Sin servicios registrados</p>
      ) : (
        <div className="space-y-3">
          {services.map((service) => (
            <Card key={service.id}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[#F0F0FF] font-semibold capitalize">
                  {formatDate(service.date, "EEE d 'de' MMM")}
                </p>
                {getBadge(service)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#BBBBDD]">{formatCOP(SERVICE_AMOUNT)}</span>
                {!service.is_paid && service.status !== 'cancelled' &&
                  ['completed', 'confirmed', 'in_progress'].includes(service.status) && (
                  <Button
                    size="sm"
                    onClick={() => handleMarkPaid(service)}
                    loading={payingId === service.id}
                  >
                    Marcar como pagado
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
