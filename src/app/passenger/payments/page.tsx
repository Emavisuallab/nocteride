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
  const [completedUnpaid, setCompletedUnpaid] = useState<ServiceDay[]>([])
  const [paidServices, setPaidServices] = useState<ServiceDay[]>([])
  const [debt, setDebt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const { toast } = useToast()

  async function loadData() {
    const supabase = createClient()
    const { data } = await supabase
      .from('service_days')
      .select('*')
      .in('status', ['completed'])
      .order('date', { ascending: false })

    const all = data || []
    const unpaid = all.filter((s) => !s.is_paid)
    const paid = all.filter((s) => s.is_paid)

    setCompletedUnpaid(unpaid)
    setPaidServices(paid)
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
      toast(err.message || 'Error', 'error')
    } finally {
      setPayingId(null)
    }
  }

  async function handleMarkAllPaid() {
    setPayingId('all')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      for (const s of completedUnpaid) {
        await supabase.from('payments').insert({
          service_day_id: s.id,
          amount: SERVICE_AMOUNT,
          paid_at: new Date().toISOString(),
          marked_by: user.id,
        })
        await supabase.from('service_days').update({ is_paid: true }).eq('id', s.id)
      }

      toast('Todos los pagos registrados', 'success')
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

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">

      {/* Debt Banner — tappable to expand */}
      <button
        onClick={() => debt > 0 && setShowBreakdown(!showBreakdown)}
        className="w-full text-left"
      >
        <div className="bg-gradient-to-br from-[#1A1A2E] to-[#2A2A45] border border-[rgba(155,127,232,0.2)] rounded-3xl p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#8888A8] uppercase tracking-widest">Deuda pendiente</p>
            {debt > 0 && (
              <svg className={`w-5 h-5 text-[#8888A8] transition-transform ${showBreakdown ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            )}
          </div>
          <p className={`text-4xl font-extrabold mb-1 ${debt > 0 ? 'text-[#F0F0FF]' : 'text-[#4CAF82]'}`}>
            {formatCOP(debt)}
          </p>
          {completedUnpaid.length > 0 && (
            <p className="text-sm text-[#BBBBDD]">
              {completedUnpaid.length} viaje{completedUnpaid.length !== 1 ? 's' : ''} completado{completedUnpaid.length !== 1 ? 's' : ''}
            </p>
          )}
          {debt === 0 && <p className="text-sm text-[#4CAF82]">Al día</p>}

          {/* Breakdown */}
          {showBreakdown && completedUnpaid.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[rgba(155,127,232,0.15)] space-y-2">
              {completedUnpaid.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-[#BBBBDD] capitalize">
                    {formatDate(s.date, "EEE d 'de' MMM")}
                  </span>
                  <span className="text-sm font-semibold text-[#F0F0FF]">{formatCOP(SERVICE_AMOUNT)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-[rgba(155,127,232,0.1)]">
                <span className="text-sm font-bold text-[#F0F0FF]">Total</span>
                <span className="text-sm font-bold text-[#9B7FE8]">{formatCOP(debt)}</span>
              </div>
            </div>
          )}
        </div>
      </button>

      {/* Payment Info Card */}
      {debt > 0 && (
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

          <Button
            className="w-full mt-4"
            size="lg"
            onClick={handleMarkAllPaid}
            loading={payingId === 'all'}
          >
            Marcar todo como pagado
          </Button>
        </div>
      )}

      {/* Paid history */}
      {paidServices.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-[#F0F0FF] mb-4">Pagos realizados</h2>
          <div className="space-y-2">
            {paidServices.map((service) => (
              <div key={service.id} className="flex items-center justify-between py-3 px-4 bg-[#1A1A2E] rounded-2xl">
                <p className="text-sm text-[#BBBBDD] capitalize">
                  {formatDate(service.date, "EEE d 'de' MMM")}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#BBBBDD]">{formatCOP(SERVICE_AMOUNT)}</span>
                  <Badge variant="paid">Pagado</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
