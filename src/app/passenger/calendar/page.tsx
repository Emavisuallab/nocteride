'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, isSameMonth, isToday, isSameDay,
  getDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import TimePicker from '@/components/ui/TimePicker'
import { useToast } from '@/components/ui/Toast'
import { formatTime, cn } from '@/lib/utils'
import type { ServiceDay, TimeNegotiation } from '@/lib/types/database'

const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const statusColors: Record<string, string> = {
  scheduled: 'bg-[#9B7FE8]/20 text-[#C4A8FF]',
  negotiating: 'bg-[#F0A070]/20 text-[#F0A070]',
  confirmed: 'bg-[#9B7FE8] text-[#0D0D14]',
  in_progress: 'bg-[#9B7FE8] text-[#0D0D14]',
  completed: 'bg-[#4CAF82] text-[#0D0D14]',
  cancelled: 'bg-[#E05A5A]/20 text-[#E05A5A]',
}

const statusLabels: Record<string, string> = {
  scheduled: 'Programado',
  negotiating: 'Negociando',
  confirmed: 'Confirmado',
  in_progress: 'En camino',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [services, setServices] = useState<ServiceDay[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedService, setSelectedService] = useState<ServiceDay | null>(null)
  const [negotiations, setNegotiations] = useState<TimeNegotiation[]>([])
  const [showModal, setShowModal] = useState(false)
  const [pickupTime, setPickupTime] = useState('23:00')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const loadServices = useCallback(async () => {
    const supabase = createClient()
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('service_days')
      .select('*')
      .gte('date', start)
      .lte('date', end)
    setServices(data || [])
  }, [currentMonth])

  useEffect(() => { loadServices() }, [loadServices])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  function getServiceForDay(date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    return services.find((s) => s.date === dateStr) || null
  }

  async function handleDayClick(date: Date) {
    setSelectedDate(date)
    const service = getServiceForDay(date)
    setSelectedService(service)
    if (service) {
      const supabase = createClient()
      const { data } = await supabase
        .from('time_negotiations')
        .select('*')
        .eq('service_day_id', service.id)
        .order('created_at', { ascending: false })
      setNegotiations(data || [])
    } else {
      setNegotiations([])
    }
    setPickupTime('23:00')
    setShowModal(true)
  }

  async function handleSchedule() {
    if (!selectedDate) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('service_days').insert({
        date: format(selectedDate, 'yyyy-MM-dd'),
        pickup_time: pickupTime,
        status: 'scheduled',
        amount: 45000,
        is_paid: false,
      })
      if (error) throw error
      toast('Servicio programado', 'success')
      setShowModal(false)
      loadServices()
    } catch (err: any) {
      toast(err.message || 'Error al programar', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!selectedService) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('service_days')
        .update({ status: 'cancelled' })
        .eq('id', selectedService.id)
      if (error) throw error
      toast('Servicio cancelado', 'info')
      setShowModal(false)
      loadServices()
    } catch (err: any) {
      toast(err.message || 'Error al cancelar', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleAcceptProposal(negotiation: TimeNegotiation) {
    setLoading(true)
    try {
      const supabase = createClient()
      await supabase
        .from('time_negotiations')
        .update({ status: 'accepted' })
        .eq('id', negotiation.id)
      await supabase
        .from('service_days')
        .update({ pickup_time: negotiation.proposed_time, status: 'confirmed' })
        .eq('id', negotiation.service_day_id)
      toast('Hora aceptada', 'success')
      setShowModal(false)
      loadServices()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleRejectProposal(negotiation: TimeNegotiation) {
    setLoading(true)
    try {
      const supabase = createClient()
      await supabase
        .from('time_negotiations')
        .update({ status: 'rejected' })
        .eq('id', negotiation.id)
      await supabase
        .from('service_days')
        .update({ status: 'negotiating' })
        .eq('id', negotiation.service_day_id)
      toast('Propuesta rechazada', 'info')
      setShowModal(false)
      loadServices()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="text-[#8888A8] hover:text-[#F0F0FF] p-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2 className="text-lg font-bold text-[#F0F0FF] capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </h2>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="text-[#8888A8] hover:text-[#F0F0FF] p-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-xs text-[#8888A8] font-semibold py-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const service = getServiceForDay(day)
          const inMonth = isSameMonth(day, currentMonth)
          const today = isToday(day)
          const dayOfWeek = getDay(day)
          const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5

          return (
            <button
              key={day.toISOString()}
              onClick={() => inMonth && handleDayClick(day)}
              disabled={!inMonth}
              className={cn(
                'aspect-square flex flex-col items-center justify-center rounded-2xl text-sm font-medium transition-all relative',
                !inMonth && 'opacity-20',
                inMonth && !service && 'hover:bg-[#1A1A2E]',
                today && 'ring-2 ring-[#9B7FE8]',
                service && statusColors[service.status]
              )}
            >
              {format(day, 'd')}
              {isWeekday && !service && inMonth && (
                <div className="w-1 h-1 rounded-full bg-[#8888A8]/40 mt-0.5" />
              )}
            </button>
          )
        })}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={selectedDate ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es }) : ''}
      >
        {selectedService ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[#BBBBDD]">Estado</span>
              <Badge variant={
                selectedService.status === 'completed' || selectedService.status === 'confirmed' ? 'paid' :
                selectedService.status === 'cancelled' ? 'cancelled' : 'pending'
              }>
                {statusLabels[selectedService.status]}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#BBBBDD]">Hora de recogida</span>
              <span className="text-[#F0F0FF] font-bold">
                {selectedService.pickup_time ? formatTime(selectedService.pickup_time) : '--:--'}
              </span>
            </div>

            {negotiations.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-[rgba(155,127,232,0.1)]">
                <p className="text-xs text-[#8888A8] uppercase tracking-wider">Negociaciones</p>
                {negotiations.map((n) => (
                  <div key={n.id} className="bg-[#2A2A45] rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#BBBBDD]">
                        {n.proposed_by === 'driver' ? 'Transportador' : 'Pasajero'} propone: {formatTime(n.proposed_time)}
                      </span>
                      <Badge variant={n.status === 'accepted' ? 'paid' : n.status === 'rejected' ? 'cancelled' : 'pending'}>
                        {n.status === 'accepted' ? 'Aceptada' : n.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                      </Badge>
                    </div>
                    {n.reason && <p className="text-xs text-[#8888A8]">Motivo: {n.reason}</p>}
                    {n.status === 'pending' && n.proposed_by === 'driver' && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => handleAcceptProposal(n)} loading={loading}>Aceptar</Button>
                        <Button size="sm" variant="danger" onClick={() => handleRejectProposal(n)} loading={loading}>Rechazar</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {['scheduled', 'confirmed', 'negotiating'].includes(selectedService.status) && (
              <Button variant="danger" className="w-full" onClick={handleCancel} loading={loading}>
                Cancelar servicio
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[#BBBBDD]">Selecciona la hora de recogida</p>
            <TimePicker value={pickupTime} onChange={setPickupTime} />
            <Button className="w-full" size="lg" onClick={handleSchedule} loading={loading}>
              Programar servicio
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
