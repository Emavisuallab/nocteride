'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loginSchema } from '@/lib/schemas'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [role, setRole] = useState<'passenger' | 'driver'>('passenger')
  const router = useRouter()
  const { toast } = useToast()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, 'error')
      return
    }

    if (isSignUp && !name.trim()) {
      toast('El nombre es obligatorio', 'error')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim(), role } },
        })
        if (error) throw error

        // Update the auto-created profile with the correct role and name
        if (data.user) {
          await supabase
            .from('profiles')
            .update({ role, name: name.trim() })
            .eq('id', data.user.id)
        }

        // If email confirmation is disabled, redirect directly
        if (data.session) {
          router.push(role === 'driver' ? '/driver' : '/passenger')
          router.refresh()
        } else {
          toast('Cuenta creada. Revisa tu email para confirmar.', 'success')
          setIsSignUp(false)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .single()

        router.push(profile?.role === 'driver' ? '/driver' : '/passenger')
        router.refresh()
      }
    } catch (err: any) {
      toast(err.message || 'Error', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0D0D14]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-[#9B7FE8] mb-2">NocteRide</h1>
          <p className="text-[#8888A8]">Transporte nocturno privado</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label className="block text-sm text-[#BBBBDD] mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="block text-sm text-[#BBBBDD] mb-3">Rol</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('passenger')}
                    className={`flex-1 py-3 rounded-full text-sm font-bold transition-all ${
                      role === 'passenger'
                        ? 'bg-[#9B7FE8] text-[#0D0D14]'
                        : 'bg-[#2A2A45] text-[#BBBBDD]'
                    }`}
                  >
                    Pasajero
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('driver')}
                    className={`flex-1 py-3 rounded-full text-sm font-bold transition-all ${
                      role === 'driver'
                        ? 'bg-[#9B7FE8] text-[#0D0D14]'
                        : 'bg-[#2A2A45] text-[#BBBBDD]'
                    }`}
                  >
                    Transportador
                  </button>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-[#BBBBDD] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm text-[#BBBBDD] mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            {isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
          </Button>
        </form>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="w-full text-center text-sm text-[#8888A8] hover:text-[#9B7FE8] mt-6 transition-colors"
        >
          {isSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
        </button>
      </div>
    </div>
  )
}
