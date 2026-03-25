"use client";

import { useEffect } from "react";

export default function TrainerDashboardRedirectPage() {
  useEffect(() => {
    window.location.replace("/dashboard");
  }, []);
  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg-primary)", display: "grid", placeItems: "center" }}>
      <p style={{ color: "var(--text-secondary)" }}>Opening dashboard…</p>
    </main>
  );
}
