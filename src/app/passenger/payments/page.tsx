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
  const [pendingCount, setPendingCount] = useState(0)
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
    setPendingCount(unpaid.length)
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
      toast(err.message || 'Error', 'error')
    } finally {
      setPayingId(null)
    }
  }

  function copyKey() {
    navigator.clipboard.writeText('1001391552')
    toast('Llave copiada', 'success')
  }

  function getBadge(service: ServiceDay) {
    if (service.is_paid) return <Badge variant="paid">Pagado</Badge>
    if (service.status === 'cancelled') return <Badge variant="cancelled">Cancelado</Badge>
    return <Badge variant="pending">Pendiente</Badge>
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Debt Banner */}
      <div className="bg-gradient-to-br from-[#1A1A2E] to-[#2A2A45] border border-[rgba(155,127,232,0.2)] rounded-3xl p-6 text-center">
        <p className="text-xs text-[#8888A8] uppercase tracking-widest mb-2">Deuda pendiente</p>
        <p className="text-4xl font-extrabold text-[#F0F0FF] mb-1">{formatCOP(debt)}</p>
        <p className="text-sm text-[#BBBBDD]">({pendingCount} viaje{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''})</p>
      </div>

      {/* Payment Info Card */}
      <div className="bg-[#1A1A2E] border-l-4 border-[#9B7FE8] rounded-2xl p-4">
        <p className="text-xs text-[#8888A8] uppercase tracking-wider mb-3">Datos de pago</p>
        <p className="text-sm text-[#BBBBDD] mb-1">Transferir a:</p>
        <p className="text-[#F0F0FF] font-bold mb-1">Santiago — Nequi / Bancolombia</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xl font-mono font-bold text-[#9B7FE8]">1001391552</span>
          <button
            onClick={copyKey}
            className="bg-[#2A2A45] hover:bg-[#3A3A55] text-[#BBBBDD] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            Copiar
          </button>
        </div>
      </div>

      {/* History */}
      <div>
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
                    ['completed', 'confirmed', 'in_progress', 'scheduled'].includes(service.status) && (
                    <Button
                      size="sm"
                      onClick={() => handleMarkPaid(service)}
                      loading={payingId === service.id}
                    >
                      Marcar pagado
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
