'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import { formatDate } from '@/lib/utils'
import { formatCOP, SERVICE_AMOUNT } from '@/lib/constants'
import type { ServiceDay, Payment } from '@/lib/types/database'

export default function DriverEarnings() {
  const [services, setServices] = useState<ServiceDay[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [owed, setOwed] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const { data: svcData } = await supabase
        .from('service_days')
        .select('*')
        .order('date', { ascending: false })
      setServices(svcData || [])

      const unpaid = (svcData || []).filter(
        (s) => !s.is_paid && ['confirmed', 'completed', 'in_progress'].includes(s.status)
      )
      setOwed(unpaid.length * SERVICE_AMOUNT)

      const { data: payData } = await supabase
        .from('payments')
        .select('*')
        .order('paid_at', { ascending: false })
      setPayments(payData || [])

      setLoading(false)
    }
    load()
  }, [])

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
        <p className="text-xs text-[#8888A8] uppercase tracking-wider mb-1">Por cobrar</p>
        <p className="text-4xl font-extrabold text-[#F0F0FF]">{formatCOP(owed)}</p>
      </Card>

      <h2 className="text-lg font-bold text-[#F0F0FF] mb-4">Servicios</h2>
      {services.length === 0 ? (
        <p className="text-[#8888A8] text-center py-8">Sin servicios registrados</p>
      ) : (
        <div className="space-y-3 mb-8">
          {services.map((service) => (
            <Card key={service.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#F0F0FF] font-semibold capitalize">
                    {formatDate(service.date, "EEE d 'de' MMM")}
                  </p>
                  <span className="text-sm text-[#BBBBDD]">{formatCOP(SERVICE_AMOUNT)}</span>
                </div>
                {getBadge(service)}
              </div>
            </Card>
          ))}
        </div>
      )}

      {payments.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-[#F0F0FF] mb-4">Pagos recibidos</h2>
          <div className="space-y-3">
            {payments.map((payment) => (
              <Card key={payment.id}>
                <div className="flex items-center justify-between">
                  <p className="text-[#F0F0FF]">{formatCOP(payment.amount)}</p>
                  <span className="text-sm text-[#8888A8]">
                    {formatDate(payment.paid_at, "d MMM yyyy")}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
