import { useCallback, useEffect, useState, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { toast } from "sonner"

import { AuthContext } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase"
import type { Profile } from "@/lib/types"

// One toast even if several checks notice the same stale session.
const staleSessionToast = () =>
  toast.error("session หมดอายุหรือบัญชีนี้ไม่มีอยู่แล้ว กรุณาเข้าสู่ระบบใหม่", { id: "stale-session" })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // A stored session can outlive its user (e.g. after `supabase db reset`). Every read would then
  // come back empty and every write would be denied, so sign out instead of showing an empty app.
  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
    if (!data) {
      await supabase.auth.signOut()
      staleSessionToast()
      return
    }
    setProfile(data)
  }, [])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        // getUser() asks the auth server, so it fails for users that no longer exist.
        const { error } = await supabase.auth.getUser()
        if (error) {
          await supabase.auth.signOut()
          staleSessionToast()
          setLoading(false)
          return
        }
      }
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setLoading(false)
    })()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      void loadProfile(next?.user.id)
    })
    return () => listener.subscription.unsubscribe()
  }, [loadProfile])

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session])

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
