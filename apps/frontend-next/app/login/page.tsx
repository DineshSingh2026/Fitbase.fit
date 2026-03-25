"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clearFitbaseSessionStorage,
  loadFitbaseSessionFromBrowser,
  persistNormalizedSession
} from "../../lib/fitbase-session";
import { getApiSiteBase } from "../../lib/site-url";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionCheck, setSessionCheck] = useState(true);

  const apiBase = getApiSiteBase();

  useEffect(() => {
    const s = loadFitbaseSessionFromBrowser();
    if (!s?.token) {
      setSessionCheck(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`${apiBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${s.token}` }
        });
        if (cancelled) return;
        if (r.ok) {
          window.location.replace("/dashboard");
          return;
        }
        if (r.status === 401) {
          clearFitbaseSessionStorage();
        }
      } catch {
        /* stay on login */
      } finally {
        if (!cancelled) setSessionCheck(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error || !data?.token) {
        throw new Error(data?.message || data?.error || "Login failed.");
      }
      const session = persistNormalizedSession(data);
      if (!session?.token) {
        throw new Error("Could not save your session. Allow storage for this site or turn off private browsing.");
      }
      const userRole = String(session.user.role || "").toLowerCase();
      if (userRole === "admin" && session.user.must_change_password === true) {
        window.location.replace("/change-password");
        return;
      }
      window.location.replace("/dashboard");
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "Network error. Please try again.";
      setMsg(text);
      setBusy(false);
    }
  }

  if (sessionCheck) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "var(--bg-primary)",
          padding: 20,
          color: "var(--text-secondary)",
          fontSize: 14
        }}
      >
        Checking session…
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-primary)",
        padding: 20,
        paddingTop: "max(20px, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))",
        paddingLeft: "max(20px, env(safe-area-inset-left, 0px))",
        paddingRight: "max(20px, env(safe-area-inset-right, 0px))"
      }}
    >
      <div style={{ width: "min(100%, 420px)", display: "flex", flexDirection: "column", gap: 14 }}>
        <Link
          href="/"
          style={{
            alignSelf: "flex-start",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--accent)",
            textDecoration: "none"
          }}
        >
          ← Back to website
        </Link>
        <form
          className="fb-login-form"
          onSubmit={submit}
          style={{
            width: "100%",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 20,
            boxShadow: "var(--shadow-lg)"
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <img src="/img/Fitbase_logo2.png" alt="FitBase" style={{ height: 76, width: "auto", objectFit: "contain" }} />
          </div>
          <h1 style={{ margin: "0 0 12px", fontFamily: "sans-serif", fontSize: 20, color: "var(--text-primary)" }}>Login</h1>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={{
              width: "100%",
              marginTop: 6,
              marginBottom: 12,
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "11px 12px",
              font: "inherit",
              background: "var(--bg-card)",
              color: "var(--text-primary)"
            }}
          />
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            style={{
              width: "100%",
              marginTop: 6,
              marginBottom: 16,
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "11px 12px",
              font: "inherit",
              background: "var(--bg-card)",
              color: "var(--text-primary)"
            }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 8,
              background: "var(--accent)",
              color: "var(--on-accent)",
              fontWeight: 700,
              padding: "11px 12px",
              cursor: "pointer"
            }}
          >
            {busy ? "Signing in..." : "Login"}
          </button>
          {msg ? <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{msg}</p> : null}
        </form>
      </div>
    </main>
  );
}
