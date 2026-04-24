import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

export const scheduleServiceSchema = z.object({
  date: z.string(),
  pickup_time: z.string().refine((time) => {
    const hour = parseInt(time.split(':')[0])
    return hour >= 23 || hour <= 2
  }, 'La hora debe estar entre 23:00 y 02:00'),
})

export const timeProposalSchema = z.object({
  proposed_time: z.string().refine((time) => {
    const hour = parseInt(time.split(':')[0])
    return hour >= 23 || hour <= 2
  }, 'La hora debe estar entre 23:00 y 02:00'),
  reason: z.string().min(1, 'El motivo es obligatorio'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ScheduleServiceInput = z.infer<typeof scheduleServiceSchema>
export type TimeProposalInput = z.infer<typeof timeProposalSchema>
