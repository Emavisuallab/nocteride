import { create } from 'zustand'
import type { Profile, ServiceDay } from '@/lib/types/database'

interface AppState {
  profile: Profile | null
  setProfile: (profile: Profile | null) => void
  todayService: ServiceDay | null
  setTodayService: (service: ServiceDay | null) => void
  isTracking: boolean
  setIsTracking: (tracking: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  todayService: null,
  setTodayService: (service) => set({ todayService: service }),
  isTracking: false,
  setIsTracking: (tracking) => set({ isTracking: tracking }),
}))
