"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { loadFitbaseSessionFromBrowser } from "../../../lib/fitbase-session";
import { getApiSiteBase } from "../../../lib/site-url";

type Tab = "pending" | "approved" | "rejected";

function formatAppliedAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(String(iso)).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function AdminTrainersPage() {
  const apiBase = useMemo(() => getApiSiteBase(), []);
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [credModal, setCredModal] = useState<{
    full_name: string;
    email: string;
    temp_password: string;
    trainer_code: string;
    login_url: string;
  } | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [token, setToken] = useState("");
  const [role, setRole] = useState("");

  const load = useCallback(
    async (overrideTab?: Tab) => {
      if (!token || role !== "superadmin") return;
      const st = overrideTab ?? tab;
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`${apiBase}/api/admin/trainers?status=${encodeURIComponent(st)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error((data as { error?: string })?.error || "Failed to load");
        }
        setRows(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [apiBase, token, role, tab]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = loadFitbaseSessionFromBrowser();
    if (!s?.token) {
      window.location.replace("/login");
      return;
    }
    setToken(s.token);
    setRole(String(s.user.role || "").toLowerCase());
    if (String(s.user.role || "").toLowerCase() !== "superadmin") {
      window.location.replace("/dashboard");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  async function approve(id: string) {
    if (!token) return;
    setBusy(id);
    setErr("");
    try {
      const r = await fetch(`${apiBase}/api/admin/trainers/${encodeURIComponent(id)}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || (data as { error?: string }).error) {
        throw new Error((data as { error?: string }).error || "Approve failed");
      }
      const tr = (data as { trainer?: Record<string, string> }).trainer;
      if (tr?.temp_password) {
        setCredModal({
          full_name: String(tr.full_name || ""),
          email: String(tr.email || ""),
          temp_password: String(tr.temp_password || ""),
          trainer_code: String(tr.trainer_code || ""),
          login_url: String(tr.login_url || `${window.location.origin}/login`)
        });
      }
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy("");
    }
  }

  async function submitReject() {
    if (!token || !rejectModal) return;
    const id = rejectModal.id;
    setBusy(id);
    setErr("");
    try {
      const r = await fetch(`${apiBase}/api/admin/trainers/${encodeURIComponent(id)}/reject`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: rejectReason.trim() || undefined })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || (data as { error?: string }).error) {
        throw new Error((data as { error?: string }).error || "Reject failed");
      }
      setRejectModal(null);
      setRejectReason("");
      setToast("Trainer rejected");
      setTab("rejected");
      await load("rejected");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusy("");
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label} copied`);
    } catch {
      window.prompt(`Copy ${label}`, text);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const tableScrollWrap: CSSProperties = {
    width: "100%",
    maxWidth: "100%",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--bg-card)",
    boxSizing: "border-box"
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg-primary)",
        paddingTop: "max(24px, calc(env(safe-area-inset-top, 0px) + 12px))",
        paddingRight: "max(20px, env(safe-area-inset-right, 0px))",
        paddingBottom: "max(48px, env(safe-area-inset-bottom, 0px))",
        paddingLeft: "max(20px, env(safe-area-inset-left, 0px))",
        boxSizing: "border-box"
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 10,
            marginBottom: 20
          }}
        >
          <a href="/dashboard" style={{ color: "var(--accent)", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            ← Back to dashboard
          </a>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(1.2rem, 4.2vw, 1.5rem)",
              lineHeight: 1.25,
              color: "var(--text-primary)"
            }}
          >
            Trainer applications
          </h1>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {(["pending", "approved", "rejected"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: tab === t ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: tab === t ? "rgba(201,168,76,0.12)" : "var(--bg-card)",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontWeight: tab === t ? 700 : 500,
                textTransform: "capitalize"
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {toast ? (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              fontSize: 13,
              color: "var(--text-secondary)"
            }}
          >
            {toast}
          </div>
        ) : null}
        {err ? (
          <p style={{ color: "var(--red)", marginBottom: 12 }}>{err}</p>
        ) : null}

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
        ) : tab === "pending" ? (
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)" }}>
              On a phone, scroll sideways inside the table to see all columns.
            </p>
            <div style={tableScrollWrap}>
            <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 13, tableLayout: "auto" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Name</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", minWidth: 160 }}>Email</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Phone</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", minWidth: 120 }}>City / Gym</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Applied</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                    <td style={{ padding: "12px 14px", color: "var(--text-primary)", whiteSpace: "nowrap" }}>{r.full_name || "—"}</td>
                    <td style={{ padding: "12px 14px", color: "var(--text-secondary)", wordBreak: "break-word", maxWidth: 220 }}>{r.email || "—"}</td>
                    <td style={{ padding: "12px 14px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.phone || "—"}</td>
                    <td style={{ padding: "12px 14px", color: "var(--text-secondary)", wordBreak: "break-word" }}>
                      {[r.city, r.gym_name].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td style={{ padding: "12px 14px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatAppliedAgo(r.created_at)}</td>
                    <td style={{ padding: "12px 14px", minWidth: 200 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => void approve(String(r.id))}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: "none",
                            background: "var(--accent)",
                            color: "var(--on-accent)",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: 12
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => {
                            setRejectModal({ id: String(r.id) });
                            setRejectReason("");
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            background: "var(--bg-surface)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                            fontSize: 12
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? (
              <p style={{ padding: 20, margin: 0, color: "var(--text-muted)" }}>No pending applications.</p>
            ) : null}
            </div>
          </div>
        ) : tab === "approved" ? (
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)" }}>
              On a phone, scroll sideways inside the table to see all columns.
            </p>
            <div style={tableScrollWrap}>
            <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse", fontSize: 13, tableLayout: "auto" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Name</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", minWidth: 160 }}>Email</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)" }}>City</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Approved</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Trainer code</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Invite</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Clients</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const code = String(r.trainer_code || "").trim();
                  const join = code ? `${origin}/join/${code}` : "";
                  const susp = r.suspended === true || r.suspended === "t";
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                      <td style={{ padding: "12px 14px", color: "var(--text-primary)", whiteSpace: "nowrap" }}>{r.full_name || "—"}</td>
                      <td style={{ padding: "12px 14px", color: "var(--text-secondary)", wordBreak: "break-word", maxWidth: 200 }}>{r.email || "—"}</td>
                      <td style={{ padding: "12px 14px", color: "var(--text-secondary)", wordBreak: "break-word" }}>{r.city || "—"}</td>
                      <td style={{ padding: "12px 14px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {r.approved_at ? new Date(String(r.approved_at)).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <code style={{ fontSize: 12 }}>{code || "—"}</code>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        {join ? (
                          <a href={join} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                            Open link
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", color: "var(--text-secondary)" }}>
                        {Number(r.clients_total ?? 0)}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: susp ? "rgba(224,82,82,0.12)" : "rgba(39,174,96,0.12)",
                            color: susp ? "#c0392b" : "var(--green, #27ae60)"
                          }}
                        >
                          {susp ? "Inactive" : "Active"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length ? (
              <p style={{ padding: 20, margin: 0, color: "var(--text-muted)" }}>No approved trainers yet.</p>
            ) : null}
            </div>
          </div>
        ) : (
          <div style={tableScrollWrap}>
            <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)" }}>Name</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)" }}>Email</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)" }}>Reason</th>
                  <th style={{ padding: "12px 14px", color: "var(--text-muted)" }}>Applied</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 14px", color: "var(--text-primary)" }}>{r.full_name || "—"}</td>
                    <td style={{ padding: "12px 14px", color: "var(--text-secondary)" }}>{r.email || "—"}</td>
                    <td style={{ padding: "12px 14px", color: "var(--text-secondary)" }}>{r.rejection_reason || "—"}</td>
                    <td style={{ padding: "12px 14px", color: "var(--text-secondary)" }}>{formatAppliedAgo(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? (
              <p style={{ padding: 20, margin: 0, color: "var(--text-muted)" }}>No rejected applications.</p>
            ) : null}
          </div>
        )}
      </div>

      {credModal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}
          onClick={() => setCredModal(null)}
        >
          <div
            style={{
              maxWidth: 440,
              width: "100%",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 22,
              boxShadow: "var(--shadow-lg)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Trainer approved</h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
              Share these credentials with <strong>{credModal.full_name}</strong>
            </p>
            {(() => {
              const joinFull = `${origin}/join/${credModal.trainer_code}`;
              const copyAll = () =>
                void copyText(
                  "All details",
                  `---
Welcome to FitBase!
Login: ${credModal.login_url}
Email: ${credModal.email}
Password: ${credModal.temp_password}
Your client invite link: ${joinFull}
Change your password on first login.
---`
                );
              const row = (lab: string, val: string, full: string) => (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{lab}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <code
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        padding: "8px 10px",
                        background: "var(--bg-surface)",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        wordBreak: "break-all"
                      }}
                    >
                      {val}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyText(lab, full)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--bg-surface)",
                        cursor: "pointer",
                        fontSize: 12
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              );
              return (
                <>
                  {row("Login URL", credModal.login_url.replace(/^https?:\/\//, ""), credModal.login_url)}
                  {row("Email", credModal.email, credModal.email)}
                  {row("Password", credModal.temp_password, credModal.temp_password)}
                  {row("Client invite link", joinFull.replace(/^https?:\/\//, ""), joinFull)}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                    <button type="button" onClick={() => void copyAll()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", cursor: "pointer" }}>
                      Copy all
                    </button>
                    <button
                      type="button"
                      onClick={() => setCredModal(null)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "none",
                        background: "var(--accent)",
                        color: "var(--on-accent)",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      Done
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {rejectModal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}
          onClick={() => !busy && setRejectModal(null)}
        >
          <div
            style={{
              maxWidth: 400,
              width: "100%",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 20
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Reject application</h3>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>Optional reason (stored for admin reference):</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                marginBottom: 14,
                borderRadius: 8,
                border: "1px solid var(--border)",
                padding: 10,
                font: "inherit",
                background: "var(--bg-primary)",
                color: "var(--text-primary)"
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" disabled={!!busy} onClick={() => setRejectModal(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void submitReject()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#c0392b",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                {busy ? "…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
