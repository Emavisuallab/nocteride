'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import Modal from '@/components/ui/Modal'
import TimePicker from '@/components/ui/TimePicker'
import { useToast } from '@/components/ui/Toast'
import { formatTime, cn } from '@/lib/utils'
import { formatCOP, SERVICE_AMOUNT } from '@/lib/constants'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
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
  scheduled: 'pending',
  negotiating: 'pending',
  confirmed: 'paid',
  in_progress: 'info',
  completed: 'paid',
  cancelled: 'cancelled',
}

interface WeatherData {
  temp: string
  feelsLike: string
  condition: string
  emoji: string
  humidity: string
  windSpeed: string
  chanceOfRain: string
  visibility: string
}

const weatherCodeMap: Record<string, { label: string; emoji: string }> = {
  '113': { label: 'Despejado', emoji: '☀️' },
  '116': { label: 'Parcialmente nublado', emoji: '⛅' },
  '119': { label: 'Nublado', emoji: '☁️' },
  '122': { label: 'Muy nublado', emoji: '☁️' },
  '143': { label: 'Neblina', emoji: '🌫️' },
  '176': { label: 'Lluvia ligera', emoji: '🌦️' },
  '200': { label: 'Tormenta eléctrica', emoji: '⛈️' },
  '263': { label: 'Llovizna', emoji: '🌧️' },
  '266': { label: 'Llovizna', emoji: '🌧️' },
  '293': { label: 'Lluvia ligera', emoji: '🌦️' },
  '296': { label: 'Lluvia ligera', emoji: '🌦️' },
  '299': { label: 'Lluvia moderada', emoji: '🌧️' },
  '302': { label: 'Lluvia moderada', emoji: '🌧️' },
  '305': { label: 'Lluvia fuerte', emoji: '🌧️' },
  '308': { label: 'Lluvia fuerte', emoji: '🌧️' },
  '353': { label: 'Aguacero', emoji: '🌧️' },
  '356': { label: 'Aguacero fuerte', emoji: '🌧️' },
  '389': { label: 'Tormenta con lluvia', emoji: '⛈️' },
}

function mapWeatherCode(code: string) {
  return weatherCodeMap[code] ?? { label: 'Variable', emoji: '🌤️' }
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Buenos días,'
  if (h >= 12 && h < 18) return 'Buenas tardes,'
  return 'Buenas noches,'
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

export default function PassengerHome() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [nextTrip, setNextTrip] = useState<ServiceDay | null>(null)
  const [debt, setDebt] = useState(0)
  const [debtCount, setDebtCount] = useState(0)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [newTime, setNewTime] = useState('01:00')
  const [actionLoading, setActionLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const formattedDate = useMemo(() => {
    const now = new Date()
    const dayName = format(now, 'EEEE', { locale: es })
    const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1)
    const day = format(now, 'd')
    const month = format(now, 'MMMM', { locale: es })
    const capitalMonth = month.charAt(0).toUpperCase() + month.slice(1)
    return `${capitalized} ${day} · ${capitalMonth}`
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: todayService } = await supabase
        .from('service_days').select('*')
        .eq('date', today).not('status', 'eq', 'cancelled').single()

      if (todayService) {
        setNextTrip(todayService)
      } else {
        const { data: upcoming } = await supabase
          .from('service_days').select('*')
          .gt('date', today).not('status', 'eq', 'cancelled')
          .order('date', { ascending: true }).limit(1).single()
        if (upcoming) setNextTrip(upcoming)
      }

      const { data: unpaid } = await supabase
        .from('service_days').select('amount')
        .eq('is_paid', false).in('status', ['completed'])
      const unpaidList = unpaid || []
      setDebt(unpaidList.reduce((sum, s) => sum + s.amount, 0))
      setDebtCount(unpaidList.length)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch('https://wttr.in/Medellin?format=j1')
        const json = await res.json()
        const current = json.current_condition[0]
        const mapped = mapWeatherCode(current.weatherCode)
        // Get chance of rain from nearest hour forecast
        const hourly = json.weather?.[0]?.hourly || []
        const currentHour = new Date().getHours()
        const nearestHour = hourly.find((h: any) => parseInt(h.time) / 100 >= currentHour) || hourly[0]
        setWeather({
          temp: current.temp_C,
          feelsLike: current.FeelsLikeC,
          condition: mapped.label,
          emoji: mapped.emoji,
          humidity: current.humidity,
          windSpeed: current.windspeedKmph,
          chanceOfRain: nearestHour?.chanceofrain || '0',
          visibility: current.visibility,
        })
      } catch {
        setWeather(null)
      }
    }
    fetchWeather()
  }, [])

  async function handleChangeTime() {
    if (!nextTrip) return
    setActionLoading(true)
    try {
      const supabase = createClient()
      await supabase.from('time_negotiations').insert({
        service_day_id: nextTrip.id,
        proposed_by: 'passenger',
        proposed_time: newTime,
        reason: note.trim() || null,
        status: 'pending',
      })
      await supabase.from('service_days').update({
        pickup_time: newTime,
        status: 'negotiating',
      }).eq('id', nextTrip.id)

      setNextTrip({ ...nextTrip, pickup_time: newTime, status: 'negotiating' })
      setShowTimeModal(false)
      setNote('')
      toast('Cambio de hora enviado', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0D14] px-5 pt-[env(safe-area-inset-top,20px)] pb-32">
        <div className="pt-6 space-y-6 max-w-lg mx-auto">
          <Skeleton className="h-5 w-36 rounded-full" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-3xl" />
          <Skeleton className="h-40 w-full rounded-3xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28 w-full rounded-3xl" />
            <Skeleton className="h-28 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    )
  }

  const userName = profile?.name || 'Pasajero'
  const tripIsToday = nextTrip?.date === format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="min-h-screen bg-[#0D0D14] px-5 pt-[env(safe-area-inset-top,20px)] pb-32">
      <div className="pt-6 space-y-7 max-w-lg mx-auto">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[#8888A8] tracking-wide">{formattedDate}</p>
          <button className="relative h-10 w-10 flex items-center justify-center rounded-full bg-[#1A1A2E] border border-[rgba(155,127,232,0.1)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#BBBBDD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
        </div>

        {/* Greeting + Avatar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[22px] font-medium text-[#BBBBDD] leading-tight">{getGreeting()}</p>
            <p className="text-[28px] font-extrabold text-[#F0F0FF] leading-tight mt-0.5">{userName.split(' ')[0]}</p>
          </div>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={userName} className="h-12 w-12 rounded-full object-cover ring-2 ring-[rgba(155,127,232,0.3)]" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-[#9B7FE8] flex items-center justify-center ring-2 ring-[rgba(155,127,232,0.3)]">
              <span className="text-sm font-bold text-[#0D0D14]">{getInitials(userName)}</span>
            </div>
          )}
        </div>

        {/* Trip Card */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#9B7FE8] via-[#7B5FD8] to-transparent" />
          <p className="text-[11px] text-[#8888A8] uppercase tracking-[0.12em] font-semibold mb-4">
            {tripIsToday ? 'Viaje de hoy' : nextTrip ? 'Próximo viaje' : 'Próximo viaje'}
          </p>

          {nextTrip ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-2xl font-bold text-[#F0F0FF] tabular-nums">
                    {nextTrip.pickup_time ? formatTime(nextTrip.pickup_time) : '--:--'}
                  </span>
                  {!tripIsToday && (
                    <span className="text-sm text-[#8888A8]">
                      {format(new Date(nextTrip.date + 'T12:00:00'), 'EEE d MMM', { locale: es })}
                    </span>
                  )}
                </div>
                <Badge variant={statusBadge[nextTrip.status] || 'info'}>
                  {statusLabels[nextTrip.status]}
                </Badge>
              </div>

              {nextTrip.status === 'in_progress' && (
                <Button onClick={() => router.push('/passenger/map')} className="w-full" size="lg">
                  Ver en mapa
                </Button>
              )}

              {nextTrip.status === 'confirmed' && (
                <div className="space-y-3">
                  <p className="text-sm text-[#4CAF82] font-medium flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#4CAF82]" />
                    Confirmado
                  </p>

                  {/* Notes */}
                  <div className="bg-[#2A2A45] rounded-2xl p-3">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Agregar nota para el transportador..."
                      rows={2}
                      className="!bg-transparent !border-none !p-0 !text-sm !rounded-none"
                    />
                  </div>

                  {/* Modify time */}
                  <button
                    onClick={() => {
                      setNewTime(nextTrip.pickup_time || '01:00')
                      setShowTimeModal(true)
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[#2A2A45] rounded-2xl text-sm text-[#BBBBDD] hover:bg-[#3A3A55] transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#9B7FE8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Modificar hora
                    </span>
                    <span className="text-[#8888A8]">{nextTrip.pickup_time ? formatTime(nextTrip.pickup_time) : '--:--'}</span>
                  </button>
                </div>
              )}

              {nextTrip.status === 'scheduled' && (
                <div className="space-y-3">
                  <p className="text-sm text-[#F0A070] font-medium flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#F0A070] animate-pulse" />
                    Esperando confirmación
                  </p>

                  {/* Modify time */}
                  <button
                    onClick={() => {
                      setNewTime(nextTrip.pickup_time || '01:00')
                      setShowTimeModal(true)
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[#2A2A45] rounded-2xl text-sm text-[#BBBBDD] hover:bg-[#3A3A55] transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#9B7FE8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Modificar hora
                    </span>
                    <span className="text-[#8888A8]">{nextTrip.pickup_time ? formatTime(nextTrip.pickup_time) : '--:--'}</span>
                  </button>
                </div>
              )}

              {nextTrip.status === 'negotiating' && (
                <p className="text-sm text-[#F0A070] font-medium flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#F0A070] animate-pulse" />
                  Negociando hora...
                </p>
              )}
            </div>
          ) : (
            <p className="text-[#8888A8] text-sm">Sin viajes programados</p>
          )}
        </Card>

        {/* Weather Card — expanded */}
        <Card>
          <p className="text-[11px] text-[#8888A8] uppercase tracking-[0.12em] font-semibold mb-3">
            Clima en Medellín
          </p>
          {weather ? (
            <div className="space-y-3">
              {/* Main row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{weather.emoji}</span>
                  <div>
                    <span className="text-3xl font-bold text-[#F0F0FF] tabular-nums">{weather.temp}°C</span>
                    <p className="text-sm text-[#BBBBDD]">{weather.condition}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#8888A8]">Sensación</p>
                  <p className="text-lg font-bold text-[#F0F0FF]">{weather.feelsLike}°</p>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[rgba(155,127,232,0.1)]">
                <div className="text-center">
                  <p className="text-lg font-bold text-[#9B7FE8]">{weather.chanceOfRain}%</p>
                  <p className="text-[10px] text-[#8888A8] uppercase">Lluvia</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-[#F0F0FF]">{weather.humidity}%</p>
                  <p className="text-[10px] text-[#8888A8] uppercase">Humedad</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-[#F0F0FF]">{weather.windSpeed}</p>
                  <p className="text-[10px] text-[#8888A8] uppercase">km/h</p>
                </div>
              </div>

              {/* Rain warning */}
              {parseInt(weather.chanceOfRain) >= 50 && (
                <div className="bg-[rgba(155,127,232,0.1)] border border-[rgba(155,127,232,0.2)] rounded-2xl px-3 py-2 flex items-center gap-2">
                  <span>🌧️</span>
                  <p className="text-xs text-[#C4A8FF]">Alta probabilidad de lluvia en el trayecto</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-3xl">🌤️</span>
              <div>
                <span className="text-2xl font-bold text-[#F0F0FF]">--°</span>
                <p className="text-xs text-[#8888A8]">Sin datos disponibles</p>
              </div>
            </div>
          )}
        </Card>

        {/* Debt */}
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#8888A8] uppercase tracking-[0.12em] font-semibold mb-1">Deuda pendiente</p>
            <p className={cn('text-2xl font-extrabold tabular-nums', debt > 0 ? 'text-[#F0F0FF]' : 'text-[#4CAF82]')}>
              {formatCOP(debt)}
            </p>
            {debtCount > 0 && <p className="text-xs text-[#8888A8]">({debtCount} {debtCount === 1 ? 'viaje' : 'viajes'})</p>}
          </div>
          {debt > 0 && (
            <Button size="sm" variant="secondary" onClick={() => router.push('/passenger/payments')}>
              Pagar
            </Button>
          )}
        </Card>

        {/* Quick Actions */}
        <div className="-mx-5 px-5 overflow-x-auto scrollbar-none">
          <div className="flex gap-3 w-max">
            <Button variant="secondary" size="sm" onClick={() => router.push('/passenger/calendar')} className="whitespace-nowrap">Programar viaje</Button>
            <Button variant="secondary" size="sm" onClick={() => router.push('/passenger/payments')} className="whitespace-nowrap">Ver pagos</Button>
            <Button variant="secondary" size="sm" onClick={() => router.push('/passenger/profile')} className="whitespace-nowrap">Mi perfil</Button>
          </div>
        </div>
      </div>

      {/* Time Change Modal */}
      <Modal open={showTimeModal} onClose={() => setShowTimeModal(false)} title="Modificar hora de recogida">
        <div className="space-y-4">
          <TimePicker value={newTime} onChange={setNewTime} />
          <div>
            <label className="block text-sm text-[#BBBBDD] mb-1.5">Nota (opcional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motivo del cambio..."
              rows={2}
            />
          </div>
          <Button className="w-full" size="lg" onClick={handleChangeTime} loading={actionLoading}>
            Confirmar cambio
          </Button>
        </div>
      </Modal>
    </div>
  )
}
