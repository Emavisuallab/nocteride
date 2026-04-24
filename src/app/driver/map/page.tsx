'use client'

import dynamic from 'next/dynamic'

const DriverMapInner = dynamic(() => import('@/components/maps/DriverMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[calc(100vh-80px)] w-full bg-[#0A0A14] flex items-center justify-center">
      <div className="text-[#8888A8] text-sm animate-pulse">Cargando mapa...</div>
    </div>
  ),
})

export default function DriverMapPage() {
  return <DriverMapInner />
}
