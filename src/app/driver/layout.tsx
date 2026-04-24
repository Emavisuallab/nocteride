import BottomNav from '@/components/BottomNav'
import { HomeIcon, CalendarIcon, MapIcon, WalletIcon } from '@/components/icons'

const driverNav = [
  { href: '/driver', label: 'Inicio', icon: <HomeIcon /> },
  { href: '/driver/agenda', label: 'Agenda', icon: <CalendarIcon /> },
  { href: '/driver/map', label: 'Mapa', icon: <MapIcon /> },
  { href: '/driver/earnings', label: 'Cobros', icon: <WalletIcon /> },
]

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-[#0D0D14]">
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav items={driverNav} />
    </div>
  )
}
