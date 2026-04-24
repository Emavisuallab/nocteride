export const FIXED_LOCATIONS = {
  driverHome: {
    lat: parseFloat(process.env.NEXT_PUBLIC_DRIVER_HOME_LAT || '6.348778'),
    lng: parseFloat(process.env.NEXT_PUBLIC_DRIVER_HOME_LNG || '-75.502361'),
    label: 'Casa del transportador',
  },
  pickup: {
    lat: parseFloat(process.env.NEXT_PUBLIC_PICKUP_LAT || '6.225111'),
    lng: parseFloat(process.env.NEXT_PUBLIC_PICKUP_LNG || '-75.565306'),
    label: 'Punto de recogida (trabajo)',
  },
  passengerHome: {
    lat: parseFloat(process.env.NEXT_PUBLIC_PASSENGER_HOME_LAT || '6.341194'),
    lng: parseFloat(process.env.NEXT_PUBLIC_PASSENGER_HOME_LNG || '-75.508333'),
    label: 'Casa del pasajero',
  },
} as const

export const SERVICE_AMOUNT = 45000

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export const MAPBOX_STYLE = 'mapbox://styles/mapbox/navigation-night-v1'

export const formatCOP = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)
