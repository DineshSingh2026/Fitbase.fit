"use client";

import { useEffect, useMemo, useState } from "react";
import { FITBASE_SESSION_KEY, parseFitbaseSessionFromStorage, persistNormalizedSession } from "../../lib/fitbase-session";
import { getApiSiteBase } from "../../lib/site-url";

function passwordStrength(pw: string): "weak" | "good" | "strong" {
  if (pw.length < 8 || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return "weak";
  if (pw.length >= 12 && /[^a-zA-Z0-9]/.test(pw)) return "strong";
  if (pw.length >= 11) return "strong";
  return "good";
}

export default function ChangePasswordPage() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<"check" | "ok" | "redirect">("check");
  const apiBase = useMemo(() => getApiSiteBase(), []);
  const strength = passwordStrength(pw);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(FITBASE_SESSION_KEY) : null;
    const session = parseFitbaseSessionFromStorage(raw);
    if (!session?.token) {
      window.location.replace("/login");
      return;
    }
    const role = String(session.user.role || "").toLowerCase();
    if (role !== "admin") {
      window.location.replace("/dashboard");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`${apiBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${session.token}` }
        });
        const d = await r.json();
        if (cancelled) return;
        if (!d || d.error) {
          window.location.replace("/login");
          return;
        }
        if (!d.must_change_password) {
          window.location.replace("/dashboard");
          return;
        }
        setGate("ok");
      } catch {
        if (!cancelled) window.location.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (pw.length < 8) {
      setMsg("Use at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(pw)) {
      setMsg("Include at least one uppercase letter.");
      return;
    }
    if (!/\d/.test(pw)) {
      setMsg("Include at least one number.");
      return;
    }
    if (pw !== pw2) {
      setMsg("Passwords do not match.");
      return;
    }
    const raw = localStorage.getItem(FITBASE_SESSION_KEY);
    const prev = parseFitbaseSessionFromStorage(raw);
    if (!prev?.token) {
      window.location.replace("/login");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/auth/trainer/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${prev.token}`
        },
        body: JSON.stringify({ new_password: pw })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.success || !data?.token) {
        throw new Error(data?.error || "Could not update password.");
      }
      persistNormalizedSession({
        token: data.token,
        id: prev.user.id,
        email: prev.user.email,
        role: prev.user.role || "admin",
        first_name: prev.user.first_name,
        last_name: prev.user.last_name,
        profile_picture: prev.user.profile_picture,
        trainer_id: prev.user.trainer_id,
        country: prev.user.country,
        timezone: prev.user.timezone,
        must_change_password: false
      });
      if (typeof window !== "undefined") {
        window.alert("Password set. Welcome to FitBase!");
        window.location.replace("/trainer/dashboard");
      }
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (gate !== "ok") {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "var(--bg-primary)",
          color: "var(--text-secondary)"
        }}
      >
        Checking session…
      </main>
    );
  }

  const strengthColor =
    strength === "weak"
      ? "var(--red, #c0392b)"
      : strength === "good"
        ? "var(--accent)"
        : "var(--green, #27ae60)";

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-primary)",
        padding: 20
      }}
    >
      <form
        onSubmit={(e) => void submit(e)}
        style={{
          width: "min(100%, 420px)",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 22,
          boxShadow: "var(--shadow-lg)"
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 20, color: "var(--text-primary)" }}>
          Welcome to FitBase — set your password
        </h1>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
          Choose a secure password to protect your account. You only need to do this once.
        </p>
        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>New password</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6, marginBottom: 12 }}>
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            style={{
              flex: 1,
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "11px 12px",
              font: "inherit",
              background: "var(--bg-card)",
              color: "var(--text-primary)"
            }}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              padding: "0 12px",
              cursor: "pointer",
              fontSize: 12
            }}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <div style={{ fontSize: 12, marginBottom: 12, color: strengthColor, fontWeight: 600 }}>
          Strength: {strength === "weak" ? "Weak" : strength === "good" ? "Good" : "Strong"}
        </div>
        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Confirm password</label>
        <input
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          type={show ? "text" : "password"}
          required
          autoComplete="new-password"
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
          {busy ? "Saving…" : "Set password and enter dashboard"}
        </button>
        {msg ? <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{msg}</p> : null}
      </form>
    </main>
  );
}
