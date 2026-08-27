import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Lenis from "lenis";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { LangProvider } from "@/i18n";
import api from "@/lib/api";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import AdminPage from "@/pages/AdminPage";
import ContactPage from "@/pages/ContactPage";

function Tracker() {
  const loc = useLocation();
  useEffect(() => {
    api.post("/track", { path: loc.pathname }).catch(() => {});
  }, [loc.pathname]);
  return null;
}

function App() {
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.15 });
    let raf;
    const loop = (t) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);

  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter>
          <Tracker />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/panel" element={<Dashboard />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/kontakt" element={<ContactPage />} />
          </Routes>
          <Toaster theme="dark" position="bottom-right" toastOptions={{
            style: { background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 0, color: "#fff", fontFamily: "JetBrains Mono, monospace", fontSize: 12 },
          }} />
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  );
}

export default App;
