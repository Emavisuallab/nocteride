import BottomNav from '@/components/BottomNav'
import { HomeIcon, CalendarIcon, MapIcon, WalletIcon } from '@/components/icons'

const passengerNav = [
  { href: '/passenger', label: 'Inicio', icon: <HomeIcon /> },
  { href: '/passenger/calendar', label: 'Calendario', icon: <CalendarIcon /> },
  { href: '/passenger/map', label: 'Mapa', icon: <MapIcon /> },
  { href: '/passenger/payments', label: 'Pagos', icon: <WalletIcon /> },
]

export default function PassengerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-[#0D0D14]">
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav items={passengerNav} />
    </div>
  )
}
