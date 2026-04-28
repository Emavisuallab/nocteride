'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { formatTime, cn } from '@/lib/utils'
import { formatCOP, SERVICE_AMOUNT } from '@/lib/constants'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ServiceDay, Profile } from '@/lib/types/database'

/* ── Status maps ───────────────────────────────────────────────── */

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

/* ── Weather helpers ───────────────────────────────────────────── */

interface WeatherData {
  temp: string
  condition: string
  emoji: string
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
  '311': { label: 'Lluvia helada', emoji: '🌧️' },
  '314': { label: 'Lluvia helada', emoji: '🌧️' },
  '353': { label: 'Aguacero', emoji: '🌧️' },
  '356': { label: 'Aguacero fuerte', emoji: '🌧️' },
  '359': { label: 'Aguacero torrencial', emoji: '🌧️' },
  '389': { label: 'Tormenta con lluvia', emoji: '⛈️' },
  '392': { label: 'Tormenta con nieve', emoji: '⛈️' },
  '395': { label: 'Nieve fuerte', emoji: '❄️' },
}

function mapWeatherCode(code: string): { label: string; emoji: string } {
  return weatherCodeMap[code] ?? { label: 'Variable', emoji: '🌤️' }
}

/* ── Greeting helper ───────────────────────────────────────────── */

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Buenos días,'
  if (h >= 12 && h < 18) return 'Buenas tardes,'
  return 'Buenas noches,'
}

/* ── Initials helper ───────────────────────────────────────────── */

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/* ── Component ─────────────────────────────────────────────────── */

export default function PassengerHome() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [nextTrip, setNextTrip] = useState<ServiceDay | null>(null)
  const [debt, setDebt] = useState(0)
  const [debtCount, setDebtCount] = useState(0)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const formattedDate = useMemo(() => {
    const now = new Date()
    const dayName = format(now, 'EEEE', { locale: es })
    const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1)
    const day = format(now, 'd')
    const month = format(now, 'MMMM', { locale: es })
    const capitalMonth = month.charAt(0).toUpperCase() + month.slice(1)
    return `${capitalized} ${day} · ${capitalMonth}`
  }, [])

  /* ── Data fetching ─────────────────────────────────────────── */

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(prof)

      // Today's trip or next upcoming
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: todayService } = await supabase
        .from('service_days')
        .select('*')
        .eq('date', today)
        .not('status', 'eq', 'cancelled')
        .single()

      if (todayService) {
        setNextTrip(todayService)
      } else {
        // Check next upcoming trip
        const { data: upcoming } = await supabase
          .from('service_days')
          .select('*')
          .gt('date', today)
          .not('status', 'eq', 'cancelled')
          .order('date', { ascending: true })
          .limit(1)
          .single()
        if (upcoming) setNextTrip(upcoming)
      }

      // Debt
      const { data: unpaid } = await supabase
        .from('service_days')
        .select('amount')
        .eq('is_paid', false)
        .in('status', ['completed'])
      const unpaidList = unpaid || []
      setDebt(unpaidList.reduce((sum, s) => sum + s.amount, 0))
      setDebtCount(unpaidList.length)

      setLoading(false)
    }
    load()
  }, [])

  /* ── Weather fetch ─────────────────────────────────────────── */

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch('https://wttr.in/Medellin?format=j1')
        const json = await res.json()
        const current = json.current_condition[0]
        const code = current.weatherCode
        const mapped = mapWeatherCode(code)
        setWeather({
          temp: current.temp_C,
          condition: mapped.label,
          emoji: mapped.emoji,
        })
      } catch {
        setWeather(null)
      }
    }
    fetchWeather()
  }, [])

  /* ── Loading skeleton ──────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0D14] px-5 pt-[env(safe-area-inset-top,20px)] pb-32">
        <div className="pt-6 space-y-6 max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-36 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48 rounded-xl" />
              <Skeleton className="h-9 w-32 rounded-xl" />
            </div>
            <Skeleton className="h-12 w-12 rounded-full" />
          </div>
          <Skeleton className="h-44 w-full rounded-3xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28 w-full rounded-3xl" />
            <Skeleton className="h-28 w-full rounded-3xl" />
          </div>
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </div>
    )
  }

  const userName = profile?.name || 'Pasajero'
  const tripIsToday = nextTrip?.date === format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="min-h-screen bg-[#0D0D14] px-5 pt-[env(safe-area-inset-top,20px)] pb-32">
      <div className="pt-6 space-y-7 max-w-lg mx-auto">

        {/* ── Top bar: date + notification bell ────────────────── */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[#8888A8] tracking-wide">{formattedDate}</p>
          <button
            type="button"
            className="relative h-10 w-10 flex items-center justify-center rounded-full bg-[#1A1A2E] border border-[rgba(155,127,232,0.1)] transition-colors hover:bg-[#2A2A45]"
            aria-label="Notificaciones"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#BBBBDD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
        </div>

        {/* ── Greeting + Avatar ─────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[22px] font-medium text-[#BBBBDD] leading-tight">
              {getGreeting()}
            </p>
            <p className="text-[28px] font-extrabold text-[#F0F0FF] leading-tight mt-0.5">
              {userName.split(' ')[0]}
            </p>
          </div>

          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={userName}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-[rgba(155,127,232,0.3)]"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-[#9B7FE8] flex items-center justify-center ring-2 ring-[rgba(155,127,232,0.3)]">
              <span className="text-sm font-bold text-[#0D0D14] leading-none">
                {getInitials(userName)}
              </span>
            </div>
          )}
        </div>

        {/* ── Today's Trip Card ─────────────────────────────────── */}
        <Card className="relative overflow-hidden">
          {/* Subtle gradient accent */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#9B7FE8] via-[#7B5FD8] to-transparent" />

          <p className="text-[11px] text-[#8888A8] uppercase tracking-[0.12em] font-semibold mb-4">
            {tripIsToday ? 'Próximo viaje' : nextTrip ? 'Próximo viaje programado' : 'Próximo viaje'}
          </p>

          {nextTrip ? (
            <div className="space-y-4">
              {/* Date + badge row */}
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

              {/* Contextual action / text */}
              {nextTrip.status === 'in_progress' && (
                <Button
                  onClick={() => router.push('/passenger/map')}
                  className="w-full"
                  size="lg"
                >
                  Ver en mapa
                </Button>
              )}
              {nextTrip.status === 'confirmed' && (
                <p className="text-sm text-[#4CAF82] font-medium flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#4CAF82]" />
                  Confirmado
                </p>
              )}
              {nextTrip.status === 'scheduled' && (
                <p className="text-sm text-[#F0A070] font-medium flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#F0A070] animate-pulse" />
                  Esperando confirmación
                </p>
              )}
            </div>
          ) : (
            <p className="text-[#8888A8] text-sm">Sin viajes programados</p>
          )}
        </Card>

        {/* ── Weather + Debt — side by side ─────────────────────── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Weather */}
          <Card className="flex flex-col justify-between">
            <p className="text-[11px] text-[#8888A8] uppercase tracking-[0.12em] font-semibold mb-3">
              Clima
            </p>
            {weather ? (
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl leading-none">{weather.emoji}</span>
                  <span className="text-2xl font-bold text-[#F0F0FF] tabular-nums">
                    {weather.temp}°
                  </span>
                </div>
                <p className="text-xs text-[#BBBBDD] leading-snug">{weather.condition}</p>
                <p className="text-[11px] text-[#8888A8]">Medellín</p>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-2xl font-bold text-[#F0F0FF]">--°</span>
                <p className="text-xs text-[#8888A8]">Sin datos</p>
              </div>
            )}
          </Card>

          {/* Debt */}
          <Card className="flex flex-col justify-between">
            <p className="text-[11px] text-[#8888A8] uppercase tracking-[0.12em] font-semibold mb-3">
              Deuda pendiente
            </p>
            <div className="space-y-1">
              <p
                className={cn(
                  'text-2xl font-extrabold tabular-nums',
                  debt > 0 ? 'text-[#F0F0FF]' : 'text-[#4CAF82]'
                )}
              >
                {formatCOP(debt)}
              </p>
              {debtCount > 0 && (
                <p className="text-xs text-[#8888A8]">
                  ({debtCount} {debtCount === 1 ? 'viaje' : 'viajes'})
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* ── Quick Actions ─────────────────────────────────────── */}
        <div className="-mx-5 px-5 overflow-x-auto scrollbar-none">
          <div className="flex gap-3 w-max">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push('/passenger/schedule')}
              className="whitespace-nowrap"
            >
              Programar viaje
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push('/passenger/payments')}
              className="whitespace-nowrap"
            >
              Ver pagos
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push('/passenger/profile')}
              className="whitespace-nowrap"
            >
              Mi perfil
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}
