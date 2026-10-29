import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import "./index.css"
import { AppShell } from "@/components/AppShell"
import { AuthProvider } from "@/components/AuthProvider"
import { Toaster } from "@/components/ui/sonner"
import { LoginPage } from "@/features/auth/LoginPage"
import { MonthPage } from "@/features/month/MonthPage"
import { MonthsPage } from "@/features/months/MonthsPage"
import { PeoplePage } from "@/features/people/PeoplePage"
import { RequestsPage } from "@/features/requests/RequestsPage"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route path="/months" element={<MonthsPage />} />
            <Route path="/months/:monthId" element={<MonthPage />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/people" element={<PeoplePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/months" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" />
    </AuthProvider>
  </StrictMode>,
)
