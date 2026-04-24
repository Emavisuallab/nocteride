'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function ProfilePage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email || '')
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        setName(data.name)
        setRole(data.role)
        setAvatarUrl(data.avatar_url)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No auth')
      await supabase.from('profiles').update({ name }).eq('id', user.id)
      toast('Perfil actualizado', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No auth')

      const ext = file.name.split('.').pop()
      const path = `${user.id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()

      await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
      setAvatarUrl(url)
      toast('Foto actualizada', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (loading) return <div className="p-6"><div className="h-40 rounded-3xl bg-[#1A1A2E] animate-pulse" /></div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[#F0F0FF]">Mi perfil</h1>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-[#9B7FE8] hover:opacity-80 transition-opacity"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#2A2A45] flex items-center justify-center text-2xl font-bold text-[#9B7FE8]">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </button>
        <p className="text-sm text-[#8888A8]">Toca para cambiar foto</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[#BBBBDD] mb-1.5">Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div>
            <label className="block text-sm text-[#BBBBDD] mb-1.5">Email</label>
            <input value={email} disabled className="opacity-50 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm text-[#BBBBDD] mb-1.5">Rol</label>
            <input value={role === 'passenger' ? 'Pasajero' : 'Transportador'} disabled className="opacity-50 cursor-not-allowed" />
          </div>
          <Button onClick={handleSave} loading={saving} className="w-full" size="lg">
            Guardar cambios
          </Button>
        </div>
      </Card>

      <Button variant="danger" onClick={handleLogout} className="w-full">
        Cerrar sesión
      </Button>
    </div>
  )
}
