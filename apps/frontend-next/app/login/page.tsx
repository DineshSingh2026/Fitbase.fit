"use client";

import { useState } from "react";

const APP_SITE_URL =
  process.env.NEXT_PUBLIC_APP_SITE_URL ||
  process.env.NEXT_PUBLIC_LEGACY_SITE_URL ||
  "https://www.fitbase.fit";
const APP_SITE_BASE = APP_SITE_URL.replace(/\/+$/, "");
const SESSION_KEY = "fitbase_session";

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
      const r = await fetch(`${APP_SITE_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error || !data?.token) {
        throw new Error(data?.message || data?.error || "Login failed.");
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
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
        background: "#faf6ef",
        padding: 20
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "min(100%, 420px)",
          background: "#fff",
          border: "1px solid #e8e2d6",
          borderRadius: 14,
          padding: 20,
          boxShadow: "0 20px 45px rgba(44,36,22,.10)"
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <img src="/img/Fitbase_logo2.png" alt="FitBase" style={{ height: 56, width: "auto", objectFit: "contain" }} />
        </div>
        <h1 style={{ margin: "0 0 12px", fontFamily: "sans-serif", fontSize: 20, color: "#2c2416" }}>Login</h1>
        <label style={{ fontSize: 12, color: "#9a8f7e" }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          style={{
            width: "100%",
            marginTop: 6,
            marginBottom: 12,
            border: "1px solid #e8e2d6",
            borderRadius: 8,
            padding: "11px 12px",
            font: "inherit"
          }}
        />
        <label style={{ fontSize: 12, color: "#9a8f7e" }}>Password</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          style={{
            width: "100%",
            marginTop: 6,
            marginBottom: 16,
            border: "1px solid #e8e2d6",
            borderRadius: 8,
            padding: "11px 12px",
            font: "inherit"
          }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 8,
            background: "#c9a84c",
            color: "#fff",
            fontWeight: 700,
            padding: "11px 12px",
            cursor: "pointer"
          }}
        >
          {busy ? "Signing in..." : "Login"}
        </button>
        {msg ? <p style={{ color: "#b04747", fontSize: 13, marginTop: 10 }}>{msg}</p> : null}
      </form>
    </main>
  );
}
