"use client";

import { useState } from "react";
import { persistNormalizedSession } from "../../lib/fitbase-session";
import { API_SITE_BASE } from "../../lib/site-url";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const r = await fetch(`${API_SITE_BASE}/api/auth/login`, {
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
        throw new Error("Invalid session from server.");
      }
      window.location.replace("/dashboard");
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "Network error. Please try again.";
      setMsg(text);
      setBusy(false);
    }
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
      <form
        className="fb-login-form"
        onSubmit={submit}
        style={{
          width: "min(100%, 420px)",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 20,
          boxShadow: "0 20px 45px rgba(0,0,0,.45)"
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
            color: "#0f0f0f",
            fontWeight: 700,
            padding: "11px 12px",
            cursor: "pointer"
          }}
        >
          {busy ? "Signing in..." : "Login"}
        </button>
        {msg ? <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{msg}</p> : null}
      </form>
    </main>
  );
}
