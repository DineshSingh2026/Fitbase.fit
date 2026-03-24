"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiSiteBase } from "../../../lib/site-url";

export default function JoinTrainerPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params?.code || "").trim().toLowerCase();

  const [trainerName, setTrainerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    gender: "",
    city: "",
    whatsapp: "",
    email: "",
    password: "",
    confirm_password: ""
  });

  useEffect(() => {
    if (!code) {
      setLoadError("Invalid link.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${getApiSiteBase()}/api/public/referral/${encodeURIComponent(code)}`);
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !data?.ok) {
          setLoadError(data?.error || "This invite link is not valid.");
          setTrainerName(null);
        } else {
          setTrainerName(String(data.trainer_name || "Your coach"));
        }
      } catch {
        if (!cancelled) setLoadError("Could not verify invite. Check your connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (form.password !== form.confirm_password) {
      setFormError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${getApiSiteBase()}/api/public/client-signup-referral`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referral_code: code,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          date_of_birth: form.date_of_birth.trim(),
          gender: form.gender.trim(),
          city: form.city.trim(),
          whatsapp: form.whatsapp.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          confirm_password: form.confirm_password
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || "Sign-up failed.");
      setDone(true);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Sign-up failed.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    background: "var(--bg-card)",
    color: "var(--text-primary)",
    width: "100%",
    boxSizing: "border-box"
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        padding: "max(20px, env(safe-area-inset-top, 0px)) 20px max(24px, env(safe-area-inset-bottom, 0px))"
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <p style={{ margin: "0 0 16px", fontSize: 13 }}>
          <Link href="/" style={{ color: "var(--accent)" }}>
            ← FitBase
          </Link>
        </p>

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Checking invite…</p>
        ) : loadError ? (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <p style={{ margin: 0, color: "var(--red)" }}>{loadError}</p>
          </div>
        ) : done ? (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--green)", borderRadius: 12, padding: 24 }}>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, margin: "0 0 12px" }}>Request received</h1>
            <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {trainerName} will review your details. Once approved, you can log in with your email and password.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              style={{
                border: "none",
                borderRadius: 8,
                background: "var(--accent)",
                color: "#0f0f0f",
                padding: "12px 18px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Go to login
            </button>
          </div>
        ) : (
          <>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(36px, 8vw, 48px)", margin: "0 0 8px", lineHeight: 1 }}>
              Join {trainerName}
            </h1>
            <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.5 }}>
              Create your account. Your coach will approve you before you can access the full platform.
            </p>
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
              <input
                required
                placeholder="First name"
                value={form.first_name}
                onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                style={inputStyle}
              />
              <input
                required
                placeholder="Last name"
                value={form.last_name}
                onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                style={inputStyle}
              />
              <input
                type="date"
                required
                placeholder="Date of birth"
                value={form.date_of_birth}
                onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                style={inputStyle}
              />
              <select
                required
                value={form.gender}
                onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">Gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non_binary">Non-binary</option>
                <option value="prefer_not">Prefer not to say</option>
              </select>
              <input
                required
                placeholder="City"
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                style={inputStyle}
              />
              <input
                required
                placeholder="WhatsApp number"
                value={form.whatsapp}
                onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))}
                style={inputStyle}
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                style={inputStyle}
              />
              <input
                required
                type="password"
                placeholder="Password (min 6 characters)"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                style={inputStyle}
              />
              <input
                required
                type="password"
                placeholder="Confirm password"
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={(e) => setForm((p) => ({ ...p, confirm_password: e.target.value }))}
                style={inputStyle}
              />
              {formError ? <p style={{ margin: 0, color: "var(--red)", fontSize: 14 }}>{formError}</p> : null}
              <button
                type="submit"
                disabled={busy}
                style={{
                  marginTop: 6,
                  border: "none",
                  borderRadius: 8,
                  background: "var(--accent)",
                  color: "#0f0f0f",
                  padding: 14,
                  fontWeight: 700,
                  cursor: busy ? "wait" : "pointer"
                }}
              >
                {busy ? "Submitting…" : "Submit for approval"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
