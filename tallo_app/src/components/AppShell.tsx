import { NavLink, Navigate, Outlet } from "react-router"
import { CalendarBlank, PaperPlaneTilt, SignOut, UsersThree } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationBell } from "@/features/notifications/NotificationBell"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/months", label: "เดือน", icon: CalendarBlank },
  { to: "/requests", label: "ยอดเรียกเก็บ", icon: PaperPlaneTilt },
  { to: "/people", label: "คน", icon: UsersThree },
]

export function AppShell() {
  const { session, profile, loading } = useAuth()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-4 pb-24">
      <header className="flex items-center justify-between py-4">
        <NavLink to="/months" className="text-xl font-bold">
          Tallo
        </NavLink>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="บัญชี">
                <span
                  className="grid size-8 place-items-center rounded-full text-sm font-bold text-[#3a3347]"
                  style={{ backgroundColor: profile?.color ?? "#B8A9F0" }}
                >
                  {profile?.display_name.slice(0, 1).toUpperCase()}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{profile?.display_name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void supabase.auth.signOut()}>
                <SignOut weight="light" />
                ออกจากระบบ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t bg-card/90 backdrop-blur">
        <ul className="mx-auto flex max-w-2xl justify-around px-4 py-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 text-xs text-muted-foreground",
                    isActive && "bg-secondary text-secondary-foreground",
                  )
                }
              >
                <Icon weight="light" className="size-6" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
