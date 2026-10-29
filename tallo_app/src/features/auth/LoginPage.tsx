import { useActionState } from "react"
import { Navigate } from "react-router"
import { PiggyBank } from "@phosphor-icons/react"

import { Field, FormError } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { errorMessage } from "@/lib/errors"
import { supabase } from "@/lib/supabase"

type FormState = { error?: string }

export function LoginPage() {
  const { session } = useAuth()

  const [state, formAction, pending] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email")).trim(),
      password: String(formData.get("password")),
    })
    return error ? { error: errorMessage(error) } : {}
  }, {})

  if (session) return <Navigate to="/months" replace />

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <PiggyBank weight="light" className="size-8" />
          </span>
          <h1 className="text-2xl font-bold">Tallo</h1>
          <p className="text-sm text-muted-foreground">บันทึกเงินรายเดือน แบ่งยอด และส่งยอดให้กัน</p>
        </div>

        <form action={formAction} className="grid gap-4">
          <Field label="อีเมล">
            <Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
          </Field>
          <Field label="รหัสผ่าน">
            <Input name="password" type="password" required autoComplete="current-password" />
          </Field>
          <FormError message={state.error} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </Button>
        </form>
      </div>
    </main>
  )
}
