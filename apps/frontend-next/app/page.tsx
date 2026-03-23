"use client";

import { useEffect, useRef, useState } from "react";

const APP_SITE_URL =
  process.env.NEXT_PUBLIC_APP_SITE_URL ||
  process.env.NEXT_PUBLIC_LEGACY_SITE_URL ||
  "http://localhost:3200";

const APP_SITE_BASE = APP_SITE_URL.replace(/\/+$/, "");
const IMG_DASHBOARD = `${APP_SITE_BASE}/img/Dashboard%20png.png`;
const IMG_FORMS = `${APP_SITE_BASE}/img/forms.png`;
const IMG_CHECKIN = `${APP_SITE_BASE}/img/checkin.png`;

const PAIN_POINTS = [
  {
    icon: "📊",
    title: "Spreadsheet Hell",
    desc: "Client data scattered across sheets, WhatsApp, and outdated folders. Zero structure, maximum chaos."
  },
  {
    icon: "👻",
    title: "Zero Accountability",
    desc: "Clients ghost check-ins. You can't track what you can't see. Progress stalls and clients churn."
  },
  {
    icon: "🔧",
    title: "The Franken-Stack",
    desc: "Payments in one app, scheduling in another, programs in a notes app. Nothing talks to anything."
  }
];

const STEPS = [
  {
    n: "01",
    title: "Apply",
    desc: "Submit your trainer application. We review and onboard only serious, results-driven coaches. Credentials sent within 24 hours."
  },
  {
    n: "02",
    title: "Onboard",
    desc: "Import your existing clients, customize your check-in forms, and set up your coaching system in one clean workspace."
  },
  {
    n: "03",
    title: "Grow",
    desc: "Focus entirely on training. FitBase handles all admin, tracking, client communication, and compliance - automatically."
  }
];

const METRICS = [
  { val: "3x", desc: "Faster client onboarding" },
  { val: "94%", desc: "Weekly check-in rate" },
  { val: "40%", desc: "More clients retained" },
  { val: "10h", desc: "Saved every week" }
];

const DASH_FEATURES = [
  {
    icon: "📋",
    title: "Client Sign-ups & Onboarding",
    desc: "Manage new applications, send credentials, and activate clients in seconds from the dashboard."
  },
  {
    icon: "✅",
    title: "Daily & Weekly Check-Ins",
    desc: "Clients log weight, calories, protein, sleep, and workouts. You see it all in real time."
  },
  {
    icon: "💬",
    title: "Integrated Messaging",
    desc: "Message clients directly inside FitBase. No more scattered WhatsApp threads."
  },
  {
    icon: "📊",
    title: "Analytics & Progress Tracking",
    desc: "Visualize client progress over time. Spot trends, flag issues, and prove results with data."
  }
];

const PORTAL_FEATURES = [
  { title: "Daily check-in form", desc: "Weight, body fat, calories, protein, sleep, workouts - all in one 2-minute tap." },
  { title: "Sunday progress review", desc: "Weekly structured audit so trainer and client review the week together." },
  { title: "Program & workout access", desc: "Clients see their assigned programs directly in the portal." },
  { title: "Trainer messaging", desc: "Direct line to their trainer without leaving the platform." }
];

const TESTIMONIALS = [
  {
    initial: "R",
    name: "Rahul Sharma",
    meta: "Independent Trainer - Mumbai",
    quote:
      "FitBase changed how I run my business. I went from 15 clients to 45 with complete clarity. My revenue tripled in under 6 months."
  },
  {
    initial: "P",
    name: "Priya Nair",
    meta: "Online Coach - Bangalore",
    quote:
      "I tried every app on the market. FitBase is the first one that actually feels like it was built by someone who actually trains people."
  },
  {
    initial: "A",
    name: "Arjun Mehta",
    meta: "Gym Owner - Delhi",
    quote:
      "The check-in system alone saved me 8 hours every week. My clients love it because it takes them 2 minutes to complete."
  }
];

const COMPARE_ROWS = [
  { feature: "Daily check-in tracking", fitbase: true, trainerize: true, truecoach: "Limited", ptd: true },
  { feature: "AI assistant for trainers", fitbase: true, trainerize: false, truecoach: false, ptd: false },
  { feature: "Client audit forms", fitbase: true, trainerize: "Basic", truecoach: "Basic", ptd: true },
  { feature: "White-label option", fitbase: true, trainerize: true, truecoach: false, ptd: true },
  { feature: "Starts at (per month)", fitbase: "$24", trainerize: "$35", truecoach: "$19", ptd: "$49" },
  { feature: "India-focused onboarding", fitbase: true, trainerize: false, truecoach: false, ptd: false },
  { feature: "Dedicated superadmin support", fitbase: true, trainerize: false, truecoach: false, ptd: "Paid" }
];

const FAQS = [
  {
    q: "How long does approval take after I apply?",
    a: "Most applications are reviewed within 24 hours. Once approved, you'll receive your trainer login credentials directly by email."
  },
  {
    q: "What does my client see when they log in?",
    a: "Clients get a clean mobile-first portal with tabs for Home, Workouts, Programs, Check-In, and Messages. The daily check-in takes under 2 minutes."
  },
  {
    q: "Can I import my existing clients?",
    a: "Yes. Once onboarded, you can add clients manually or bulk-import them. Your FitBase admin helps set up your initial client list during onboarding."
  },
  {
    q: "Is there a mobile app for clients?",
    a: "FitBase is fully mobile-optimized and works on any smartphone browser without a download. A native app is on our roadmap."
  },
  {
    q: "What does the AI assistant help trainers with?",
    a: "The AI is exclusively for trainers. It helps draft client feedback, analyze check-in data, suggest program adjustments, and generate weekly summaries."
  },
  {
    q: "Can I upgrade or downgrade my plan?",
    a: "Yes. Upgrades take effect immediately; downgrades apply at the start of your next billing cycle."
  }
];

const PLANS = [
  {
    name: "Starter",
    price: "$24",
    featured: false,
    cta: "Get Started",
    features: ["Up to 15 clients", "Daily & weekly check-ins", "Progress tracking", "Basic messaging", "Audit forms"]
  },
  {
    name: "Professional",
    price: "$49",
    featured: true,
    cta: "Get Started",
    features: [
      "Unlimited clients",
      "Advanced analytics",
      "Campaign engine",
      "Priority support",
      "AI assistant for trainers",
      "Custom check-in forms"
    ]
  },
  {
    name: "Enterprise",
    price: "$124",
    featured: false,
    cta: "Contact Us",
    features: ["Multi-trainer support", "White-label option", "SLA guarantee", "Custom integrations", "Dedicated account manager"]
  }
];

function CheckCell({ val }: { val: boolean | string }) {
  if (val === true) return <span style={{ color: "#4caf7d", fontSize: 18 }}>✓</span>;
  if (val === false) return <span style={{ color: "#ccc", fontSize: 18 }}>✗</span>;
  return <span style={{ color: "#c9a84c", fontSize: 12, fontWeight: 700 }}>{val}</span>;
}

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVisible(true);
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function FadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, visible } = useInView();
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(22px)",
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`
      }}
    >
      {children}
    </div>
  );
}

function MacDots() {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "10px 14px",
        borderBottom: "1px solid #e8e2d6",
        background: "#ede7d9"
      }}
    >
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
      ))}
    </div>
  );
}

export default function FitBaseLandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    gym: "",
    city: "",
    clients: "",
    message: ""
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);
    const payload = {
      full_name: form.name,
      email: form.email,
      phone: form.phone,
      gym_name: form.gym,
      city: form.city,
      message: form.message
    };
    try {
      const res = await fetch(`${APP_SITE_BASE}/api/trainer-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        throw new Error(data?.error || "Failed to submit application");
      }
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to submit application");
    } finally {
      setIsSubmitting(false);
    }
  };

  const navLinks = [
    { href: "#problem", label: "Problem" },
    { href: "#how", label: "How it works" },
    { href: "#dashboard", label: "Dashboard" },
    { href: "#client-portal", label: "Client Portal" },
    { href: "#pricing", label: "Pricing" }
  ];

  const s = {
    bg: "#faf6ef",
    bg2: "#f4efe4",
    bg3: "#ede7d9",
    surface: "#ffffff",
    border: "#e8e2d6",
    gold: "#c9a84c",
    goldL: "#d9bc72",
    goldDim: "rgba(201,168,76,0.12)",
    text: "#2c2416",
    muted: "#9a8f7e",
    green: "#4caf7d",
    shadow: "0 2px 16px rgba(44,36,22,0.08)",
    shadowL: "0 12px 48px rgba(44,36,22,0.12)"
  } as const;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth}
        body{background:#faf6ef;color:#2c2416;font-family:'DM Sans',sans-serif;overflow-x:hidden}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        .fb-input{background:#f4efe4;border:1.5px solid #e8e2d6;border-radius:8px;padding:11px 14px;font-size:14px;color:#2c2416;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s;width:100%}
        .fb-input:focus{border-color:#c9a84c}
        @media(max-width:860px){
          .grid-2{grid-template-columns:1fr!important}
          .grid-3{grid-template-columns:1fr!important}
          .grid-4{grid-template-columns:1fr 1fr!important}
          .hide-mobile{display:none!important}
          .section-pad{padding:64px 20px!important}
          .hero-pad{padding:110px 20px 64px!important}
          .form-grid{grid-template-columns:1fr!important}
          .form-full{grid-column:span 1!important}
        }
      `}</style>

      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 48px",
          background: "rgba(250,246,239,0.93)",
          backdropFilter: "blur(18px)",
          borderBottom: `1px solid ${s.border}`,
          boxShadow: "0 1px 12px rgba(44,36,22,0.06)"
        }}
      >
        <a
          href="#"
          style={{
            fontFamily: "'Bebas Neue',sans-serif",
            fontSize: 22,
            letterSpacing: 4,
            color: s.gold,
            textDecoration: "none"
          }}
        >
          FITBASE
        </a>
        <ul className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: 28, listStyle: "none" }}>
          {navLinks.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                style={{
                  color: s.muted,
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase"
                }}
              >
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href={`${APP_SITE_BASE}/login.html`}
              style={{
                color: s.muted,
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "1.5px",
                textTransform: "uppercase"
              }}
            >
              Login
            </a>
          </li>
          <li>
            <a
              href="#apply"
              style={{
                background: s.gold,
                color: "#fff",
                padding: "9px 20px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
                letterSpacing: 0.5
              }}
            >
              Get Access
            </a>
          </li>
        </ul>
      </nav>

      <section
        className="hero-pad"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          padding: "130px 48px 90px",
          background: s.bg,
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "radial-gradient(circle,rgba(201,168,76,0.09) 0%,transparent 65%)",
            top: -200,
            right: -150,
            pointerEvents: "none"
          }}
        />
        <div
          className="grid-2"
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            width: "100%",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
            alignItems: "center",
            position: "relative",
            zIndex: 1
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: s.goldDim,
                border: "1px solid rgba(201,168,76,.35)",
                color: s.gold,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "2.5px",
                textTransform: "uppercase",
                padding: "6px 14px",
                borderRadius: 100,
                marginBottom: 24
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: s.gold,
                  animation: "pulse 2s infinite",
                  display: "inline-block"
                }}
              />
              Now in Early Access
            </div>
            <h1
              style={{
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: "clamp(54px,6vw,88px)",
                lineHeight: 0.95,
                letterSpacing: 2,
                color: s.text,
                marginBottom: 20
              }}
            >
              THE PLATFORM THAT POWERS{" "}
              <span
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontStyle: "italic",
                  color: s.gold,
                  fontSize: ".88em",
                  letterSpacing: 0
                }}
              >
                Modern Trainers
              </span>
            </h1>
            <p style={{ fontSize: 17, color: s.muted, maxWidth: 440, marginBottom: 36, lineHeight: 1.75 }}>
              Professional coaching infrastructure for onboarding, tracking, communication, and measurable results - all
              in one place.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <a
                href="#apply"
                style={{
                  background: s.gold,
                  color: "#fff",
                  padding: "13px 28px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: "none",
                  letterSpacing: 0.5,
                  display: "inline-block"
                }}
              >
                Request Trainer Access
              </a>
              <a
                href="#dashboard"
                style={{
                  background: "transparent",
                  color: s.text,
                  padding: "13px 28px",
                  borderRadius: 8,
                  border: `1.5px solid ${s.border}`,
                  fontWeight: 500,
                  fontSize: 14,
                  textDecoration: "none",
                  display: "inline-block"
                }}
              >
                See the Dashboard
              </a>
            </div>
            <div style={{ display: "flex", gap: 36, marginTop: 48, paddingTop: 32, borderTop: `1px solid ${s.border}` }}>
              {[
                ["500+", "Active Trainers"],
                ["12K+", "Clients Managed"],
                ["4.9/5", "Platform Rating"]
              ].map(([n, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 38, color: s.text, letterSpacing: 1, lineHeight: 1 }}>
                    {n}
                  </div>
                  <div style={{ fontSize: 11, color: s.muted, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <div
              style={{
                background: s.surface,
                border: `1px solid ${s.border}`,
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "0 40px 80px rgba(44,36,22,0.14),0 0 0 1px rgba(201,168,76,0.08)"
              }}
            >
              <MacDots />
              <img
                src={IMG_DASHBOARD}
                alt="FitBase Dashboard"
                style={{ width: "100%", display: "block", maxHeight: 440, objectFit: "cover", objectPosition: "top" }}
              />
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: s.border }} />

      <section id="problem" className="section-pad" style={{ padding: "96px 48px", background: s.bg2 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <FadeUp>
            <span
              style={{
                display: "block",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: s.gold,
                marginBottom: 14
              }}
            >
              The problem
            </span>
          </FadeUp>
          <FadeUp delay={60}>
            <h2
              style={{
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: "clamp(34px,4.5vw,58px)",
                color: s.text,
                lineHeight: 1,
                letterSpacing: 1,
                marginBottom: 14
              }}
            >
              You didn&apos;t become a trainer to{" "}
              <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", color: s.gold }}>
                fight admin
              </span>
            </h2>
          </FadeUp>
          <div
            className="grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 1,
              background: s.border,
              border: `1px solid ${s.border}`,
              borderRadius: 12,
              overflow: "hidden",
              marginTop: 24
            }}
          >
            {PAIN_POINTS.map((p, i) => (
              <FadeUp key={p.title} delay={i * 80}>
                <div style={{ background: s.bg2, padding: "32px 28px", height: "100%" }}>
                  <div style={{ fontSize: 26, marginBottom: 14 }}>{p.icon}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: s.text, marginBottom: 8 }}>{p.title}</div>
                  <p style={{ fontSize: 14, color: s.muted, lineHeight: 1.65 }}>{p.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: s.border }} />

      <section id="how" className="section-pad" style={{ padding: "96px 48px", background: s.bg }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <FadeUp>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(34px,4.5vw,58px)", color: s.text }}>
              How it works
            </h2>
          </FadeUp>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, marginTop: 24 }}>
            {STEPS.map((step, i) => (
              <FadeUp key={step.n} delay={i * 90}>
                <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 12, padding: "32px 26px" }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 52, color: s.gold, opacity: 0.25 }}>{step.n}</div>
                  <div style={{ fontSize: 17, fontWeight: 600, color: s.text, marginBottom: 8 }}>{step.title}</div>
                  <p style={{ fontSize: 14, color: s.muted, lineHeight: 1.65 }}>{step.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
          <div
            className="grid-4"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 1,
              background: s.border,
              border: `1px solid ${s.border}`,
              borderRadius: 12,
              overflow: "hidden",
              marginTop: 36
            }}
          >
            {METRICS.map((m) => (
              <div key={m.val} style={{ background: s.bg2, padding: 28, textAlign: "center" }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 44, color: s.gold, lineHeight: 1 }}>{m.val}</div>
                <div style={{ fontSize: 13, color: s.muted }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: s.border }} />

      <section id="dashboard" className="section-pad" style={{ padding: "96px 48px", background: s.bg2 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 70, alignItems: "center" }}>
            <div>
              <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(34px,4.5vw,58px)", color: s.text }}>
                Your coaching command center
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
                {DASH_FEATURES.map((f) => (
                  <div key={f.title} style={{ display: "flex", gap: 14, padding: 16, borderRadius: 12 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        background: s.goldDim,
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 19,
                        flexShrink: 0
                      }}
                    >
                      {f.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: s.text, marginBottom: 3 }}>{f.title}</div>
                      <p style={{ fontSize: 13, color: s.muted, lineHeight: 1.55 }}>{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridRow: "span 2", background: s.surface, border: `1px solid ${s.border}`, borderRadius: 16, overflow: "hidden" }}>
                <MacDots />
                <img src={IMG_DASHBOARD} alt="Trainer Dashboard" style={{ width: "100%", display: "block" }} />
              </div>
              <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 16, overflow: "hidden" }}>
                <MacDots />
                <img src={IMG_FORMS} alt="Forms" style={{ width: "100%", display: "block" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: s.border }} />

      <section id="client-portal" className="section-pad" style={{ padding: "96px 48px", background: s.bg }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
            <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 20, overflow: "hidden" }}>
              <MacDots />
              <img src={IMG_CHECKIN} alt="Client Check-In" style={{ width: "100%", display: "block" }} />
            </div>
            <div>
              <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(34px,4.5vw,58px)", color: s.text }}>
                What your clients actually see
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
                {PORTAL_FEATURES.map((f) => (
                  <div key={f.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        background: s.goldDim,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        color: s.gold,
                        flexShrink: 0,
                        marginTop: 2
                      }}
                    >
                      ✓
                    </div>
                    <p style={{ fontSize: 15, color: s.text, lineHeight: 1.55 }}>
                      <strong>{f.title}</strong> - {f.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: s.border }} />

      <section id="testimonials" className="section-pad" style={{ padding: "96px 48px", background: s.bg }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(34px,4.5vw,58px)", color: s.text }}>
            Trainer stories
          </h2>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, marginTop: 24 }}>
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                style={{
                  background: s.surface,
                  border: `1px solid ${s.border}`,
                  borderRadius: 12,
                  padding: 26,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16
                }}
              >
                <div style={{ color: s.gold, fontSize: 14, letterSpacing: 3 }}>★★★★★</div>
                <p style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", fontSize: 16, color: s.text, lineHeight: 1.65 }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: s.goldDim,
                      border: `2px solid ${s.gold}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {t.initial}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: s.text }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: s.muted, marginTop: 2 }}>{t.meta}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: s.border }} />

      <section id="comparison" className="section-pad" style={{ padding: "96px 48px", background: s.bg2 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(34px,4.5vw,58px)", color: s.text }}>
            How we compare
          </h2>
          <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${s.border}`, marginTop: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  {[
                    { l: "Feature", hl: false },
                    { l: "FitBase", hl: true },
                    { l: "Trainerize", hl: false },
                    { l: "TrueCoach", hl: false },
                    { l: "PT Distinction", hl: false }
                  ].map((h) => (
                    <th
                      key={h.l}
                      style={{
                        background: h.hl ? "rgba(201,168,76,0.10)" : s.bg3,
                        padding: "16px 20px",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        color: h.hl ? s.gold : s.muted,
                        textAlign: h.l === "Feature" ? "left" : "center",
                        borderBottom: `1px solid ${s.border}`
                      }}
                    >
                      {h.l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, ri) => (
                  <tr key={row.feature} style={{ background: ri % 2 === 0 ? s.surface : s.bg }}>
                    <td style={{ padding: "14px 20px", fontSize: 14, color: s.text, borderBottom: `1px solid ${s.border}` }}>
                      {row.feature}
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${s.border}` }}>
                      <CheckCell val={row.fitbase} />
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${s.border}` }}>
                      <CheckCell val={row.trainerize} />
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${s.border}` }}>
                      <CheckCell val={row.truecoach} />
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${s.border}` }}>
                      <CheckCell val={row.ptd} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: s.border }} />

      <section id="faq" className="section-pad" style={{ padding: "96px 48px", background: s.bg }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(34px,4.5vw,58px)", color: s.text }}>
            Questions answered
          </h2>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 24 }}>
            {FAQS.map((faq, i) => (
              <div
                key={faq.q}
                style={{
                  background: s.surface,
                  border: `1px solid ${openFaq === i ? "rgba(201,168,76,.5)" : s.border}`,
                  borderRadius: 12,
                  overflow: "hidden"
                }}
              >
                <div
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    padding: "18px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: s.text,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12
                  }}
                >
                  {faq.q}
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      background: s.goldDim,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: s.gold,
                      fontSize: 18
                    }}
                  >
                    +
                  </div>
                </div>
                <div style={{ maxHeight: openFaq === i ? 200 : 0, overflow: "hidden", transition: "max-height .4s ease" }}>
                  <p style={{ padding: "14px 20px 18px", fontSize: 14, color: s.muted, lineHeight: 1.7, borderTop: `1px solid ${s.border}` }}>
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: s.border }} />

      <section id="pricing" className="section-pad" style={{ padding: "96px 48px", background: s.bg2 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(34px,4.5vw,58px)", color: s.text }}>
            Invest in your growth
          </h2>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, marginTop: 24 }}>
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                style={{
                  background: plan.featured ? `linear-gradient(135deg,rgba(201,168,76,0.08),${s.surface})` : s.surface,
                  border: `1px solid ${plan.featured ? s.gold : s.border}`,
                  borderRadius: 12,
                  padding: "34px 28px",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: s.muted, marginBottom: 14 }}>
                  {plan.name}
                </div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 54, color: s.text, lineHeight: 1 }}>
                  {plan.price}
                  <span style={{ fontSize: 18, color: s.muted, fontFamily: "'DM Sans',sans-serif", fontWeight: 300 }}>/mo</span>
                </div>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 11, marginTop: 20, marginBottom: 24 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ fontSize: 14, color: s.text, display: "flex", gap: 9, alignItems: "flex-start" }}>
                      <span style={{ color: s.gold, fontSize: 12, marginTop: 3, flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#apply"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: 13,
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    background: plan.featured ? s.gold : "transparent",
                    color: plan.featured ? "#fff" : s.text,
                    border: plan.featured ? "none" : `1.5px solid ${s.border}`
                  }}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: s.border }} />

      <section id="apply" className="section-pad" style={{ padding: "96px 48px", background: s.bg }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(34px,4.5vw,58px)", color: s.text }}>
            Ready to run a serious coaching business?
          </h2>
          {submitted ? (
            <div style={{ background: s.surface, border: "1px solid rgba(76,175,125,0.4)", borderRadius: 16, padding: 48, textAlign: "center", marginTop: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: s.text, marginBottom: 10 }}>Application received!</h3>
              <p style={{ color: s.muted, fontSize: 15 }}>
                We&apos;ll review your details and send your trainer credentials within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 16, padding: 40, marginTop: 24 }}>
              <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {[
                  { key: "name", label: "Full Name", type: "text", ph: "Your full name", req: true },
                  { key: "email", label: "Email", type: "email", ph: "you@example.com", req: true },
                  { key: "phone", label: "Phone", type: "tel", ph: "+91 98765 43210", req: true },
                  { key: "gym", label: "Gym / Brand", type: "text", ph: "Your gym or brand", req: false },
                  { key: "city", label: "City", type: "text", ph: "Your city", req: false },
                  { key: "clients", label: "Approx. Clients", type: "number", ph: "e.g. 20", req: false }
                ].map((f) => (
                  <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", color: s.muted }}>
                      {f.label}
                    </label>
                    <input
                      type={f.type}
                      placeholder={f.ph}
                      required={f.req}
                      className="fb-input"
                      value={(form as Record<string, string>)[f.key]}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="form-full" style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", color: s.muted }}>
                    Message
                  </label>
                  <textarea
                    placeholder="Tell us about your coaching business..."
                    rows={4}
                    className="fb-input"
                    style={{ resize: "none" }}
                    value={form.message}
                    onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: 14,
                  background: s.gold,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: "'DM Sans',sans-serif",
                  cursor: "pointer",
                  letterSpacing: 0.5
                }}
              >
                {isSubmitting ? "Submitting..." : "Submit Application →"}
              </button>
              {submitError ? (
                <p style={{ fontSize: 12, color: "#c0392b", textAlign: "center", marginTop: 10 }}>{submitError}</p>
              ) : null}
            </form>
          )}
        </div>
      </section>

      <footer
        style={{
          background: s.bg3,
          borderTop: `1px solid ${s.border}`,
          padding: "40px 48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 20
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 4, color: s.gold }}>FITBASE</div>
        <ul style={{ display: "flex", gap: 24, listStyle: "none", flexWrap: "wrap" }}>
          {navLinks.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                style={{ color: s.muted, textDecoration: "none", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div style={{ fontSize: 12, color: s.muted }}>© 2026 FitBase. All rights reserved.</div>
      </footer>
    </>
  );
}
