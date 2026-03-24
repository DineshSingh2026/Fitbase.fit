"use client";

import { useEffect, useRef, useState } from "react";
import { getApiSiteBase } from "../lib/site-url";

type FaqItem = { q: string; a: string };
type Plan = { name: string; price: string; featured?: boolean; badge?: string; features: string[] };
type CompareValue = "✓" | "✗" | "Limited" | "Basic" | "Paid" | "$24" | "$35" | "$19" | "$49";

const faqs: FaqItem[] = [
  { q: "How long does approval take?", a: "Most trainer applications are reviewed within 24 hours." },
  { q: "What does my client see?", a: "A mobile portal with check-in, workouts, and messages." },
  { q: "Can I import existing clients?", a: "Yes, you can import manually or through bulk upload." },
  { q: "Is there a mobile app?", a: "FitBase is mobile-optimized web first; native app is on the roadmap." },
  { q: "What does AI help trainers with?", a: "Feedback drafting, data analysis, and weekly progress summaries. Trainer only." },
  { q: "Can I upgrade or downgrade?", a: "Yes. Upgrades are immediate and downgrades apply on your next billing cycle." }
];

const plans: Plan[] = [
  { name: "Starter", price: "$24/mo", features: ["15 clients", "Check-ins", "Tracking", "Messaging", "Audit forms"] },
  {
    name: "Professional",
    price: "$49/mo",
    featured: true,
    badge: "Most Popular",
    features: ["Unlimited clients", "Analytics", "Campaigns", "Priority support", "AI for trainers", "Custom forms"]
  },
  {
    name: "Enterprise",
    price: "$124/mo",
    features: ["Multi-trainer", "White-label", "SLA", "Custom integrations", "Account manager"]
  }
];

export default function FitBaseLandingPage() {
  const loginHref = "/login";
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [submitted, setSubmitted] = useState(false);
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applyForm, setApplyForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    gym_name: "",
    city: "",
    message: ""
  });
  const [clientSubmitted, setClientSubmitted] = useState(false);
  const [clientSubmitting, setClientSubmitting] = useState(false);
  const [clientError, setClientError] = useState("");
  const [clientForm, setClientForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    city: "",
    goal_focus: "",
    message: "",
    heard_about: ""
  });
  const applyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { threshold: 0.16 }
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const sectionBase: React.CSSProperties = { maxWidth: 1180, margin: "0 auto" };

  return (
    <main style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;font-family:'DM Sans',sans-serif;scroll-behavior:smooth;background:var(--bg-primary);color:var(--text-primary)}
        #apply input,#apply textarea{color:var(--text-primary)}
        #apply input::placeholder,#apply textarea::placeholder{color:var(--text-muted)}
        #apply input:focus,#apply textarea:focus{border-color:var(--accent)!important;outline:none}
        a[href="#dashboard"]:hover{border-color:var(--accent)!important}
        .reveal{opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s ease}
        .reveal.is-visible{opacity:1;transform:translateY(0)}
        .float-card{animation:floatY 4s ease-in-out infinite}
        .pulse-dot{animation:pulseDot 2s ease-in-out infinite;background:var(--accent)!important}
        @keyframes floatY{0%{transform:translateY(0)}50%{transform:translateY(-8px)}100%{transform:translateY(0)}}
        @keyframes pulseDot{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}
        @media (max-width:860px){
          .stack-2,.stack-3,.stack-2-tight{grid-template-columns:1fr !important}
          .hide-mobile{display:none !important}
          .mobile-login{display:inline-flex !important}
          .pad{padding-left:max(20px, env(safe-area-inset-left, 0px)) !important;padding-right:max(20px, env(safe-area-inset-right, 0px)) !important}
          .hero{padding-top:max(120px, calc(96px + env(safe-area-inset-top, 0px))) !important}
        }
        @media (min-width:861px){
          .mobile-login{display:none !important}
        }
      `}</style>

      {/* 1. FIXED NAV */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          paddingTop: "max(14px, env(safe-area-inset-top, 0px))",
          paddingBottom: 14,
          paddingLeft: "max(36px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(36px, env(safe-area-inset-right, 0px))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
          background: scrolled ? "color-mix(in srgb, var(--bg-surface) 92%, transparent)" : "color-mix(in srgb, var(--bg-primary) 78%, transparent)",
          backdropFilter: "blur(12px)",
          transition: "all .25s ease"
        }}
      >
        <img src="/img/Fitbase_logo2.png" alt="FitBase" style={{ height: 60, width: "auto", objectFit: "contain" }} />
        <div className="hide-mobile" style={{ display: "flex", gap: 20, alignItems: "center", fontSize: 13 }}>
          <a href="#problem" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Problem</a>
          <a href="#how" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>How it works</a>
          <a href="#dashboard" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Dashboard</a>
          <a href="#client-portal" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Client Portal</a>
          <a href="#for-clients" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>For Clients</a>
          <a href="#request-a-coach" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Request a coach</a>
          <a href="#pricing" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Pricing</a>
          <a href={loginHref} style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Login</a>
          <button
            type="button"
            onClick={() => applyRef.current?.scrollIntoView({ behavior: "smooth" })}
            style={{ border: "none", background: "var(--accent)", color: "#0f0f0f", padding: "10px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
          >
            Get Access
          </button>
        </div>
        <a
          className="mobile-login"
          href={loginHref}
          style={{
            display: "none",
            textDecoration: "none",
            background: "var(--accent)",
            color: "#0f0f0f",
            padding: "9px 14px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13
          }}
        >
          Login
        </a>
      </nav>

      {/* 2. HERO */}
      <section className="pad hero" style={{ padding: "110px 36px 80px", background: "var(--bg-primary)" }}>
        <div className="stack-2" style={{ ...sectionBase, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, alignItems: "center" }}>
          <div className="reveal" data-reveal>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 16 }}>
              <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Now in Early Access</span>
            </div>
            <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(52px,7vw,96px)", margin: 0, letterSpacing: 1, lineHeight: 0.95 }}>
              THE PLATFORM THAT POWERS{" "}
              <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", color: "var(--accent)" }}>Modern Trainers</span>
            </h1>
            <p style={{ margin: "18px 0 24px", color: "var(--text-secondary)", maxWidth: 560, lineHeight: 1.7 }}>
              Professional coaching infrastructure for onboarding, tracking, communication, and measurable results
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="#apply" style={{ textDecoration: "none", background: "var(--accent)", color: "#0f0f0f", padding: "12px 16px", borderRadius: 8, fontWeight: 600 }}>Request Trainer Access</a>
              <a href="#dashboard" style={{ textDecoration: "none", background: "transparent", color: "var(--text-primary)", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--border)", fontWeight: 600 }}>See the Dashboard</a>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginTop: 24 }}>
              {["500+ Active Trainers", "12K+ Clients Managed", "4.9/5 Platform Rating"].map((t) => (
                <div key={t} style={{ padding: "12px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13 }}>{t}</div>
              ))}
            </div>
          </div>
          <div className="reveal" data-reveal style={{ position: "relative" }}>
            <div style={{ border: "1px solid var(--border)", borderRadius: 18, background: "var(--bg-card)", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,.35)" }}>
              <div style={{ display: "flex", gap: 8, padding: "12px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--red)" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent-light)" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--green)" }} />
              </div>
              <img src="/img/dashboard.png" alt="Dashboard" style={{ width: "100%", display: "block" }} />
            </div>
            <div className="float-card" style={{ position: "absolute", top: 24, left: -12, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", fontSize: 12, maxWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
              Client check-in logged ✓<br />94% weekly compliance
            </div>
            <div className="float-card" style={{ position: "absolute", bottom: 22, right: -8, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
              3× Revenue growth
            </div>
          </div>
        </div>
      </section>

      {/* 3. PROBLEM */}
      <section id="problem" className="pad" style={{ padding: "76px 36px", background: "var(--bg-surface)" }}>
        <div style={sectionBase}>
          <div className="reveal" data-reveal>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, letterSpacing: 1.2 }}>THE PROBLEM</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 20px" }}>
              You didn&apos;t build a coaching practice to manage chaos.
            </h2>
          </div>
          <div className="stack-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 }}>
            {[
              [
                "📊",
                "Fragmented Data",
                "Client intelligence scattered across spreadsheets, notes, and conversations—no single source of truth, no clarity, no control."
              ],
              [
                "👻",
                "Eroded Accountability",
                "Check-ins fade, compliance drops, and progress becomes inconsistent without a system enforcing discipline."
              ],
              [
                "🔧",
                "Operational Noise",
                "A stack of disconnected tools pretending to be a workflow—inefficient, distracting, and impossible to scale."
              ]
            ].map(([icon, title, body]) => (
              <div key={title} className="reveal" data-reveal style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 24 }}>{icon}</div>
                <div style={{ fontWeight: 600, marginTop: 8 }}>{title}</div>
                <p style={{ margin: "8px 0 0", color: "var(--text-secondary)", lineHeight: 1.6 }}>{body}</p>
              </div>
            ))}
          </div>
          <blockquote className="reveal" data-reveal style={{ margin: "20px 0 0", borderLeft: "4px solid var(--accent)", padding: "8px 0 8px 14px", color: "var(--text-primary)", fontStyle: "italic" }}>
            &ldquo;You didn&rsquo;t choose this profession to operate like an administrator&mdash;you chose it to deliver outcomes.&rdquo;
          </blockquote>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section id="how" className="pad" style={{ padding: "76px 36px", background: "var(--bg-primary)" }}>
        <div style={sectionBase}>
          <div className="reveal" data-reveal>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>How it works</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 20px" }}>From application to transformation</h2>
          </div>
          <div className="stack-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 }}>
            {[
              ["01", "Apply", "Submit your trainer application and get reviewed quickly."],
              ["02", "Onboard", "Set up forms, client structure, and coaching workflow."],
              ["03", "Grow", "Scale client outcomes and business revenue with confidence."]
            ].map(([n, t, d]) => (
              <div key={t} className="reveal" data-reveal style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                <div style={{ color: "var(--accent)", fontFamily: "'Bebas Neue',sans-serif", fontSize: 38 }}>{n}</div>
                <div style={{ fontWeight: 600 }}>{t}</div>
                <div style={{ color: "var(--text-secondary)", marginTop: 6 }}>{d}</div>
              </div>
            ))}
          </div>
          <div className="stack-2-tight reveal" data-reveal style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
            {["3× Faster onboarding", "94% Check-in rate", "40% More clients retained", "10h Saved weekly"].map((m) => (
              <div key={m} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, textAlign: "center", fontSize: 13 }}>{m}</div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. DASHBOARD */}
      <section id="dashboard" className="pad" style={{ padding: "76px 36px", background: "var(--bg-surface)" }}>
        <div className="stack-2" style={{ ...sectionBase, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "center" }}>
          <div className="reveal" data-reveal>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>Dashboard</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 16px" }}>Your coaching command center</h2>
            {["📋 Client Sign-ups & Onboarding", "✅ Daily & Weekly Check-Ins", "💬 Integrated Messaging", "📊 Analytics & Progress Tracking"].map((f) => (
              <div key={f} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>{f}</div>
            ))}
          </div>
          <div className="stack-2 reveal" data-reveal style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["/img/dashboard.png", "Dashboard view"],
              ["/img/forms.png", "Forms view"]
            ].map(([src, label]) => (
              <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "flex", gap: 8, padding: 10, borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--red)" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent-light)" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--green)" }} />
                </div>
                <img src={src} alt={label} style={{ width: "100%", display: "block" }} />
                <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 10 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. CLIENT PORTAL */}
      <section
        id="client-portal"
        className="pad"
        style={{
          padding: "88px 36px",
          background: "radial-gradient(circle at 8% 12%, var(--accent-dim), transparent 44%), var(--bg-primary)"
        }}
      >
        <div
          className="stack-2"
          style={{
            ...sectionBase,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 30,
            alignItems: "center",
            background: "linear-gradient(165deg, color-mix(in srgb, var(--bg-card) 94%, transparent), color-mix(in srgb, var(--bg-surface) 88%, transparent))",
            border: "1px solid var(--accent-border)",
            borderRadius: 24,
            padding: "24px",
            boxShadow: "0 26px 70px rgba(0,0,0,.35)"
          }}
        >
          <div
            className="reveal"
            data-reveal
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 18px 42px rgba(0,0,0,.4)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--red)" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent-light)" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--green)" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", letterSpacing: ".08em", textTransform: "uppercase" }}>Client Portal</div>
            </div>
            <img src="/img/checkin.png" alt="Client Portal" style={{ width: "100%", display: "block" }} />
          </div>
          <div className="reveal" data-reveal style={{ position: "relative" }}>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Client Portal</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(46px,5.6vw,84px)", margin: "0 0 8px", lineHeight: .95, letterSpacing: .4 }}>
              What your clients
              <br />
              actually see
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.7, maxWidth: 470, marginBottom: 20 }}>
              Every client touchpoint feels premium and simple. Clean flows improve adherence, clarity, and trust in your coaching process.
            </p>
            {[
              ["Daily check-in form", "Log core daily metrics in under 2 minutes"],
              ["Sunday progress review", "Structured weekly review with habits and outcomes"],
              ["Program & workout access", "See assigned workouts and progress history"],
              ["Trainer messaging", "Direct chat support inside the same portal"]
            ].map(([title, desc]) => (
              <div
                key={title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  gap: 10,
                  marginBottom: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--accent-border)",
                  background: "linear-gradient(180deg, var(--bg-card), var(--bg-surface))"
                }}
              >
                <span style={{ color: "var(--green)", fontWeight: 700, marginTop: 1 }}>✓</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{title}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6b. FOR CLIENTS — Built for your transformation */}
      <section id="for-clients" className="pad" style={{ padding: "76px 36px", background: "var(--bg-primary)" }}>
        <div style={sectionBase}>
          <div className="reveal" data-reveal style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 36px" }}>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>For Clients</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 16px" }}>Built for your transformation</h2>
            <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.7, fontSize: 16 }}>
              You don&apos;t just get a workout plan. You get a coach who sees your data, adjusts your program, and stays with you every step of the way.
            </p>
          </div>
          <div className="stack-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" }}>
            <div className="reveal" data-reveal style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["👁️", "A coach who actually sees you", "Your trainer reviews every check-in — your weight, sleep, energy, and workouts — before your next session. No more feeling like a forgotten number."],
                ["🔄", "A plan that evolves with you", "Your program isn't static. As your data comes in week by week, your trainer adjusts calories, workouts, and targets. Science-backed, not guesswork."],
                ["⚡", "Daily check-in in under 2 minutes", "Log weight, protein, sleep, and today's workout from your phone. No app download needed. Your trainer sees it instantly."],
                ["💬", "Direct line to your trainer", "Message your trainer anytime inside the portal. Questions, doubts, bad days — they're there. Not just on scheduled session days."],
                ["📈", "Progress you can actually see", "Weekly summaries, body composition trends, and progress graphs. You'll know exactly what's working and why — not just feel it."],
                ["🤖", "AI-assisted answers between sessions", "Get instant answers to nutrition and recovery questions 24/7 from the built-in AI — so you're never stuck waiting until your next check-in."]
              ].map(([icon, title, desc]) => (
                <div
                  key={title}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)"
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1.2 }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div
              className="reveal"
              data-reveal
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--accent)",
                borderRadius: 14,
                padding: 20,
                boxShadow: "0 18px 42px rgba(0,0,0,.35)"
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 18, textAlign: "center" }}>Client results on FitBase</div>
              {[
                ["94%", "of clients hit their 12-week goal"],
                ["3.2kg", "average fat loss in the first 4 weeks"],
                ["87%", "report feeling more accountable than ever before"],
                ["9/10", "clients would recommend their FitBase trainer"]
              ].map(([num, label]) => (
                <div key={num + label} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: "var(--accent)", lineHeight: 1 }}>{num}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>{label}</div>
                </div>
              ))}
              <a
                href="#apply"
                style={{
                  display: "block",
                  textAlign: "center",
                  textDecoration: "none",
                  background: "var(--accent)",
                  color: "#0f0f0f",
                  padding: "12px 16px",
                  borderRadius: 8,
                  fontWeight: 600,
                  marginTop: 16
                }}
              >
                Find your trainer →
              </a>
            </div>
          </div>
          <div
            className="reveal"
            data-reveal
            style={{
              marginTop: 28,
              padding: "18px 22px",
              background: "var(--bg-surface)",
              borderRadius: 12,
              border: "1px solid var(--border)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14
            }}
          >
            <div style={{ color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.55, flex: "1 1 240px" }}>
              Already have a trainer? Ask them to onboard you to FitBase.
            </div>
            <a
              href="#how"
              style={{
                textDecoration: "none",
                background: "transparent",
                color: "var(--text-primary)",
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontWeight: 600,
                fontSize: 13,
                whiteSpace: "nowrap"
              }}
            >
              Learn how it works
            </a>
          </div>
        </div>
      </section>

      {/* 7. AI FOR TRAINERS */}
      <section
        className="pad"
        style={{
          padding: "90px 36px",
          background: "linear-gradient(180deg, var(--bg-surface), var(--bg-primary))"
        }}
      >
        <div
          className="stack-2"
          style={{
            ...sectionBase,
            display: "grid",
            gridTemplateColumns: "1.15fr 1fr",
            gap: 22,
            padding: 22,
            borderRadius: 22,
            border: "1px solid var(--accent)",
            background:
              "radial-gradient(circle at top right, var(--accent-dim), transparent 45%), linear-gradient(180deg, var(--bg-card), var(--bg-surface))",
            boxShadow: "0 24px 64px rgba(0,0,0,.4)"
          }}
        >
          <div className="reveal" data-reveal>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 2 }}>Trainer AI</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(50px,6vw,88px)", margin: "8px 0 10px", lineHeight: .9 }}>
              Your AI coaching
              <br />
              co-pilot
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 18, lineHeight: 1.65, marginBottom: 16 }}>
              FitBase AI is built exclusively for trainers — not for clients.
            </p>
            {[
              "✍️ Draft client feedback in seconds",
              "📊 Analyze check-in data trends",
              "📋 Generate weekly progress summaries",
              "🎯 Build personalized program adjustments"
            ].map((f) => (
              <div
                key={f}
                style={{
                  marginTop: 8,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--accent-border)",
                  background: "var(--bg-card)"
                }}
              >
                {f}
              </div>
            ))}
          </div>
          <div
            className="reveal"
            data-reveal
            style={{
              background: "linear-gradient(180deg, var(--bg-card), var(--bg-surface))",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 14,
              boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--text-primary) 8%, transparent)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
              <strong>FitBase AI</strong>
              <span style={{ color: "var(--green)", fontSize: 12 }}>● Trainer only</span>
            </div>
            <div style={{ background: "var(--bg-surface)", padding: 10, borderRadius: 10, marginBottom: 8, fontSize: 14, border: "1px solid var(--border)" }}>
              Trainer: "Client is plateauing for 2 weeks. What should I adjust?"
            </div>
            <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", padding: 10, borderRadius: 10, fontSize: 14, lineHeight: 1.45 }}>
              AI: "Reduce calories by 150, increase steps by 2k, keep protein stable, and switch two sessions to higher volume lower load."
            </div>
          </div>
        </div>
      </section>

      {/* 8. TESTIMONIALS */}
      <section id="testimonials" className="pad" style={{ padding: "76px 36px", background: "var(--bg-primary)" }}>
        <div style={sectionBase}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>Results that speak</h2>
          <div className="stack-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14, marginTop: 16 }}>
            {[
              ["R", "Rahul Sharma", "Independent Trainer · Mumbai", "FitBase brought structure and scale to my coaching instantly."],
              ["P", "Priya Nair", "Online Coach · Bangalore", "My check-in consistency and client retention jumped fast."],
              ["A", "Arjun Mehta", "Gym Owner · Delhi", "This is the first platform my whole team actually sticks to."]
            ].map(([i, n, m, q]) => (
              <div key={n} className="reveal" data-reveal style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <div style={{ color: "var(--accent)", marginBottom: 8 }}>★★★★★</div>
                <p style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", marginTop: 0 }}>{q}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg-surface)", display: "grid", placeItems: "center" }}>{i}</div>
                  <div><strong>{n}</strong><div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. COMPARISON TABLE */}
      <section className="pad" style={{ padding: "76px 36px", background: "var(--bg-surface)" }}>
        <div style={sectionBase}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>How we compare</h2>
          <div className="reveal" data-reveal style={{ overflowX: "auto", marginTop: 14, border: "1px solid var(--border)", borderRadius: 12 }}>
            <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", background: "var(--bg-card)" }}>
              <thead>
                <tr>
                  {["Feature", "FitBase", "Trainerize", "TrueCoach", "PT Distinction"].map((h) => (
                    <th key={h} style={{ padding: 12, borderBottom: "1px solid var(--border)", textAlign: h === "Feature" ? "left" : "center", background: h === "FitBase" ? "var(--bg-surface)" : "var(--bg-primary)", color: h === "FitBase" ? "var(--accent)" : "var(--text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Daily check-in tracking", "✓", "✓", "Limited", "✓"],
                  ["AI assistant for trainers", "✓", "✗", "✗", "✗"],
                  ["Client audit forms", "✓", "Basic", "Basic", "✓"],
                  ["White-label option", "✓", "✓", "✗", "✓"],
                  ["Starts at per month", "$24", "$35", "$19", "$49"],
                  ["India-focused onboarding", "✓", "✗", "✗", "✗"],
                  ["Dedicated superadmin support", "✓", "✗", "✗", "Paid"]
                ].map((r) => (
                  <tr key={r[0]}>
                    <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>{r[0]}</td>
                    {[1, 2, 3, 4].map((idx) => {
                      const val = r[idx] as CompareValue;
                      return <td key={idx} style={{ padding: 12, borderBottom: "1px solid var(--border)", textAlign: "center" }}>{val}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 10. FAQ */}
      <section id="faq" className="pad" style={{ padding: "76px 36px", background: "var(--bg-primary)" }}>
        <div style={sectionBase}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>Questions answered</h2>
          <div className="stack-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
            {faqs.map((item, idx) => (
              <div key={item.q} className="reveal" data-reveal style={{ background: "var(--bg-card)", border: `1px solid ${activeFaq === idx ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, overflow: "hidden" }}>
                <button type="button" onClick={() => setActiveFaq(activeFaq === idx ? null : idx)} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: 12, fontWeight: 600, cursor: "pointer", color: "var(--text-primary)" }}>
                  {item.q}
                </button>
                <div style={{ maxHeight: activeFaq === idx ? 180 : 0, overflow: "hidden", transition: "max-height .35s ease" }}>
                  <p style={{ margin: 0, padding: "0 12px 12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 11. PRICING */}
      <section id="pricing" className="pad" style={{ padding: "76px 36px", background: "var(--bg-surface)" }}>
        <div style={sectionBase}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>Invest in your growth</h2>
          <div className="stack-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginTop: 16 }}>
            {plans.map((p) => (
              <div key={p.name} className="reveal" data-reveal style={{ background: "var(--bg-card)", border: `1px solid ${p.featured ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, padding: 16 }}>
                {p.badge ? <div style={{ display: "inline-block", background: "var(--accent)", color: "#0f0f0f", borderRadius: 999, fontSize: 11, padding: "4px 8px", marginBottom: 8 }}>{p.badge}</div> : null}
                <h3 style={{ margin: "0 0 4px" }}>{p.name}</h3>
                <div style={{ color: "var(--accent)", fontFamily: "'Bebas Neue',sans-serif", fontSize: 40 }}>{p.price}</div>
                <ul style={{ paddingLeft: 18, margin: "10px 0", color: "var(--text-secondary)" }}>
                  {p.features.map((f) => <li key={f} style={{ marginBottom: 6 }}>{f}</li>)}
                </ul>
                <a href="#apply" style={{ display: "block", textAlign: "center", textDecoration: "none", background: "var(--accent)", color: "#0f0f0f", padding: "10px 12px", borderRadius: 8, fontWeight: 600 }}>Get Access</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 11b. CLIENT — Request coaching */}
      <section id="request-a-coach" className="pad" style={{ padding: "76px 36px", background: "var(--bg-primary)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div className="reveal" data-reveal style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>For clients</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 12px" }}>Request a coach on FitBase</h2>
            <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.65, fontSize: 15 }}>
              Tell us about your goals. Our team reviews every request, assigns the right trainer, and your coach will send you a secure link to complete signup.
            </p>
          </div>
          {!clientSubmitted ? (
            <form
              className="reveal stack-2"
              data-reveal
              onSubmit={async (e) => {
                e.preventDefault();
                setClientError("");
                setClientSubmitting(true);
                try {
                  const r = await fetch(`${getApiSiteBase()}/api/client-requests`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      full_name: clientForm.full_name.trim(),
                      email: clientForm.email.trim(),
                      phone: clientForm.phone.trim(),
                      city: clientForm.city.trim(),
                      goal_focus: clientForm.goal_focus.trim(),
                      message: clientForm.message.trim(),
                      heard_about: clientForm.heard_about.trim()
                    })
                  });
                  const data = await r.json().catch(() => ({}));
                  if (!r.ok || data?.error) {
                    throw new Error(data?.error || "Could not submit your request.");
                  }
                  setClientSubmitted(true);
                } catch (err: unknown) {
                  setClientError(err instanceof Error ? err.message : "Something went wrong.");
                } finally {
                  setClientSubmitting(false);
                }
              }}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
            >
              <input
                required
                placeholder="Full name"
                value={clientForm.full_name}
                onChange={(ev) => setClientForm((p) => ({ ...p, full_name: ev.target.value }))}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={clientForm.email}
                onChange={(ev) => setClientForm((p) => ({ ...p, email: ev.target.value }))}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <input
                placeholder="Phone / WhatsApp"
                value={clientForm.phone}
                onChange={(ev) => setClientForm((p) => ({ ...p, phone: ev.target.value }))}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <input
                placeholder="City"
                value={clientForm.city}
                onChange={(ev) => setClientForm((p) => ({ ...p, city: ev.target.value }))}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <select
                required
                value={clientForm.goal_focus}
                onChange={(ev) => setClientForm((p) => ({ ...p, goal_focus: ev.target.value }))}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  gridColumn: "1 / -1",
                  cursor: "pointer"
                }}
              >
                <option value="">Primary goal</option>
                <option value="Fat loss">Fat loss</option>
                <option value="Muscle gain">Muscle gain</option>
                <option value="Performance / sport">Performance / sport</option>
                <option value="General health">General health</option>
                <option value="Other">Other</option>
              </select>
              <textarea
                placeholder="What are you looking for in coaching? (experience, timeline, constraints)"
                value={clientForm.message}
                onChange={(ev) => setClientForm((p) => ({ ...p, message: ev.target.value }))}
                rows={4}
                style={{
                  gridColumn: "1 / -1",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  resize: "vertical"
                }}
              />
              <input
                placeholder="How did you hear about FitBase? (optional)"
                value={clientForm.heard_about}
                onChange={(ev) => setClientForm((p) => ({ ...p, heard_about: ev.target.value }))}
                style={{ gridColumn: "1 / -1", border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              {clientError ? (
                <p style={{ gridColumn: "1 / -1", margin: 0, color: "var(--red)", fontSize: 14 }}>{clientError}</p>
              ) : null}
              <button
                type="submit"
                disabled={clientSubmitting}
                style={{
                  gridColumn: "1 / -1",
                  border: "none",
                  borderRadius: 8,
                  background: "var(--accent)",
                  color: "#0f0f0f",
                  padding: 14,
                  fontWeight: 600,
                  cursor: clientSubmitting ? "wait" : "pointer"
                }}
              >
                {clientSubmitting ? "Submitting…" : "Submit request"}
              </button>
            </form>
          ) : (
            <div className="reveal" data-reveal style={{ background: "var(--bg-card)", border: "1px solid var(--green)", borderRadius: 12, padding: 24, textAlign: "center" }}>
              <div style={{ color: "var(--green)", fontSize: 28, marginBottom: 8 }}>✓</div>
              <strong style={{ fontSize: 18 }}>Request received</strong>
              <p style={{ margin: "12px 0 0", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                We&apos;ll review your details and assign a coach. Watch your inbox — your trainer will send you a link to create your account when you&apos;re approved.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 12. APPLY FORM */}
      <section id="apply" ref={applyRef} className="pad" style={{ padding: "76px 36px", background: "var(--bg-primary)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>Ready to run a serious coaching business?</h2>
          {!submitted ? (
            <form
              className="reveal stack-2"
              data-reveal
              onSubmit={async (e) => {
                e.preventDefault();
                setApplyError("");
                setApplySubmitting(true);
                try {
                  const r = await fetch(`${getApiSiteBase()}/api/trainer-requests`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      full_name: applyForm.full_name.trim(),
                      email: applyForm.email.trim(),
                      phone: applyForm.phone.trim(),
                      gym_name: applyForm.gym_name.trim(),
                      city: applyForm.city.trim(),
                      message: applyForm.message.trim()
                    })
                  });
                  const data = await r.json().catch(() => ({}));
                  if (!r.ok || data?.error) {
                    throw new Error(data?.error || "Could not submit application.");
                  }
                  setSubmitted(true);
                } catch (err: unknown) {
                  setApplyError(err instanceof Error ? err.message : "Something went wrong.");
                } finally {
                  setApplySubmitting(false);
                }
              }}
              style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
            >
              <input
                required
                placeholder="Full Name"
                value={applyForm.full_name}
                onChange={(ev) => setApplyForm((p) => ({ ...p, full_name: ev.target.value }))}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={applyForm.email}
                onChange={(ev) => setApplyForm((p) => ({ ...p, email: ev.target.value }))}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <input
                placeholder="Phone"
                value={applyForm.phone}
                onChange={(ev) => setApplyForm((p) => ({ ...p, phone: ev.target.value }))}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <input
                placeholder="Gym / Brand"
                value={applyForm.gym_name}
                onChange={(ev) => setApplyForm((p) => ({ ...p, gym_name: ev.target.value }))}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <input
                placeholder="City"
                value={applyForm.city}
                onChange={(ev) => setApplyForm((p) => ({ ...p, city: ev.target.value }))}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <textarea
                placeholder="Anything else we should know? (optional)"
                value={applyForm.message}
                onChange={(ev) => setApplyForm((p) => ({ ...p, message: ev.target.value }))}
                style={{ gridColumn: "1 / -1", border: "1px solid var(--border)", borderRadius: 8, padding: 12, minHeight: 100, background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              {applyError ? (
                <p style={{ gridColumn: "1 / -1", margin: 0, color: "var(--red)", fontSize: 14 }}>{applyError}</p>
              ) : null}
              <button
                type="submit"
                disabled={applySubmitting}
                style={{
                  gridColumn: "1 / -1",
                  border: "none",
                  borderRadius: 8,
                  background: "var(--accent)",
                  color: "#0f0f0f",
                  padding: 12,
                  fontWeight: 600,
                  cursor: applySubmitting ? "wait" : "pointer",
                  opacity: applySubmitting ? 0.85 : 1
                }}
              >
                {applySubmitting ? "Submitting…" : "Submit Application →"}
              </button>
            </form>
          ) : (
            <div className="reveal" data-reveal style={{ marginTop: 14, background: "var(--bg-card)", border: "1px solid var(--green)", borderRadius: 12, padding: 20, color: "var(--text-primary)" }}>
              <div style={{ color: "var(--green)", fontSize: 24 }}>✓</div>
              <strong>Application received!</strong>
            </div>
          )}
        </div>
      </section>

      {/* 13. FOOTER */}
      <footer className="pad" style={{ padding: "30px 36px", background: "var(--bg-surface)", borderTop: "1px solid var(--border)" }}>
        <div style={{ ...sectionBase, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 3, color: "var(--accent)", fontSize: 36 }}>FITBASE</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {["Problem", "How it works", "Dashboard", "Client Portal", "For Clients", "Request a coach", "Pricing", "Login"].map((label) => (
              <a key={label} href={label === "Login" ? loginHref : `#${label.toLowerCase().replace(/\s+/g, "-")}`} style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 13 }}>{label}</a>
            ))}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>© 2026 FitBase. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
