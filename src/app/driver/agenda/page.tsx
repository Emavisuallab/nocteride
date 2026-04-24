'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import TimePicker from '@/components/ui/TimePicker'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatTime } from '@/lib/utils'
import type { ServiceDay } from '@/lib/types/database'

const statusLabels: Record<string, string> = {
  scheduled: 'Pendiente',
  negotiating: 'Negociando',
  confirmed: 'Confirmado',
  in_progress: 'En camino',
}

const statusBadge: Record<string, 'info' | 'pending' | 'paid' | 'cancelled'> = {
  scheduled: 'pending',
  negotiating: 'pending',
  confirmed: 'paid',
  in_progress: 'info',
}

export default function DriverAgenda() {
  const [services, setServices] = useState<ServiceDay[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedService, setSelectedService] = useState<ServiceDay | null>(null)
  const [showModifyModal, setShowModifyModal] = useState(false)
  const [proposedTime, setProposedTime] = useState('23:00')
  const [reason, setReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const { toast } = useToast()

  async function loadServices() {
    const supabase = createClient()
    const { data } = await supabase
      .from('service_days')
      .select('*')
      .in('status', ['scheduled', 'negotiating', 'confirmed', 'in_progress'])
      .order('date', { ascending: true })
    setServices(data || [])
    setLoading(false)
  }

  useEffect(() => { loadServices() }, [])

  async function handleAccept(service: ServiceDay) {
    setActionLoading(true)
    try {
      const supabase = createClient()
      await supabase.from('service_days').update({ status: 'confirmed' }).eq('id', service.id)
      toast('Servicio aceptado', 'success')
      loadServices()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handlePropose() {
    if (!selectedService) return
    if (!reason.trim()) {
      toast('El motivo es obligatorio', 'error')
      return
    }
    setActionLoading(true)
    try {
      const supabase = createClient()
      await supabase.from('time_negotiations').insert({
        service_day_id: selectedService.id,
        proposed_by: 'driver',
        proposed_time: proposedTime,
        reason: reason.trim(),
        status: 'pending',
      })
      await supabase.from('service_days').update({ status: 'negotiating' }).eq('id', selectedService.id)
      toast('Propuesta enviada', 'success')
      setShowModifyModal(false)
      setReason('')
      loadServices()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-3xl bg-[#1A1A2E] animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#F0F0FF] mb-6">Agenda</h1>

      {services.length === 0 ? (
        <p className="text-[#8888A8] text-center py-12">No hay servicios pendientes</p>
      ) : (
        <div className="space-y-3">
          {services.map((service) => (
            <Card key={service.id}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[#F0F0FF] font-bold capitalize">{formatDate(service.date, "EEEE d 'de' MMM")}</p>
                  <p className="text-sm text-[#8888A8]">
                    {service.pickup_time ? formatTime(service.pickup_time) : '--:--'}
                  </p>
                </div>
                <Badge variant={statusBadge[service.status] || 'info'}>
                  {statusLabels[service.status] || service.status}
                </Badge>
              </div>

              {service.status === 'scheduled' && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleAccept(service)} loading={actionLoading}>
                    Aceptar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelectedService(service)
                      setProposedTime(service.pickup_time || '23:00')
                      setShowModifyModal(true)
                    }}
                  >
                    Modificar hora
                  </Button>
                </div>
              )}

              {service.status === 'negotiating' && (
                <p className="text-sm text-[#F0A070]">Esperando respuesta del pasajero</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showModifyModal}
        onClose={() => setShowModifyModal(false)}
        title="Proponer nueva hora"
      >
        <div className="space-y-4">
          <TimePicker value={proposedTime} onChange={setProposedTime} />
          <div>
            <label className="block text-sm text-[#BBBBDD] mb-1.5">Motivo del cambio *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explica por qué necesitas cambiar la hora..."
              rows={3}
            />
          </div>
          <Button className="w-full" size="lg" onClick={handlePropose} loading={actionLoading}>
            Enviar propuesta
          </Button>
        </div>
      </Modal>
    </div>
  )
}
