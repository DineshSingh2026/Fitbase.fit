"use client";

import { useEffect, useRef, useState } from "react";

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
  const backendBase = (
    process.env.NEXT_PUBLIC_APP_SITE_URL ||
    process.env.NEXT_PUBLIC_LEGACY_SITE_URL ||
    ""
  ).replace(/\/+$/, "");
  const loginHref = backendBase ? `${backendBase}/login.html` : "/login.html";
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [submitted, setSubmitted] = useState(false);
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
    <main style={{ background: "#faf6ef", color: "#2c2416" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;font-family:'DM Sans',sans-serif;scroll-behavior:smooth}
        .reveal{opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s ease}
        .reveal.is-visible{opacity:1;transform:translateY(0)}
        .float-card{animation:floatY 4s ease-in-out infinite}
        .pulse-dot{animation:pulseDot 2s ease-in-out infinite}
        @keyframes floatY{0%{transform:translateY(0)}50%{transform:translateY(-8px)}100%{transform:translateY(0)}}
        @keyframes pulseDot{0%{opacity:1}50%{opacity:.3}100%{opacity:1}}
        @media (max-width:860px){
          .stack-2,.stack-3,.stack-2-tight{grid-template-columns:1fr !important}
          .hide-mobile{display:none !important}
          .pad{padding-left:20px !important;padding-right:20px !important}
          .hero{padding-top:120px !important}
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
          padding: "14px 36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${scrolled ? "#e8e2d6" : "transparent"}`,
          background: scrolled ? "rgba(250,246,239,.86)" : "rgba(250,246,239,.55)",
          backdropFilter: "blur(12px)",
          transition: "all .25s ease"
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 3, color: "#c9a84c", fontSize: 30 }}>FITBASE</div>
        <div className="hide-mobile" style={{ display: "flex", gap: 20, alignItems: "center", fontSize: 13 }}>
          <a href="#problem" style={{ color: "#9a8f7e", textDecoration: "none" }}>Problem</a>
          <a href="#how" style={{ color: "#9a8f7e", textDecoration: "none" }}>How it works</a>
          <a href="#dashboard" style={{ color: "#9a8f7e", textDecoration: "none" }}>Dashboard</a>
          <a href="#client-portal" style={{ color: "#9a8f7e", textDecoration: "none" }}>Client Portal</a>
          <a href="#pricing" style={{ color: "#9a8f7e", textDecoration: "none" }}>Pricing</a>
          <a href={loginHref} style={{ color: "#9a8f7e", textDecoration: "none" }}>Login</a>
          <button
            type="button"
            onClick={() => applyRef.current?.scrollIntoView({ behavior: "smooth" })}
            style={{ border: "none", background: "#c9a84c", color: "#fff", padding: "10px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
          >
            Get Access
          </button>
        </div>
      </nav>

      {/* 2. HERO */}
      <section className="pad hero" style={{ padding: "110px 36px 80px", background: "#faf6ef" }}>
        <div className="stack-2" style={{ ...sectionBase, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, alignItems: "center" }}>
          <div className="reveal" data-reveal>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "#fff", border: "1px solid #e8e2d6", marginBottom: 16 }}>
              <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#c9a84c", display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "#9a8f7e" }}>Now in Early Access</span>
            </div>
            <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(52px,7vw,96px)", margin: 0, letterSpacing: 1, lineHeight: 0.95 }}>
              THE PLATFORM THAT POWERS{" "}
              <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", color: "#c9a84c" }}>Modern Trainers</span>
            </h1>
            <p style={{ margin: "18px 0 24px", color: "#9a8f7e", maxWidth: 560, lineHeight: 1.7 }}>
              Professional coaching infrastructure for onboarding, tracking, communication, and measurable results
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="#apply" style={{ textDecoration: "none", background: "#c9a84c", color: "#fff", padding: "12px 16px", borderRadius: 8, fontWeight: 600 }}>Request Trainer Access</a>
              <a href="#dashboard" style={{ textDecoration: "none", background: "transparent", color: "#2c2416", padding: "12px 16px", borderRadius: 8, border: "1px solid #e8e2d6", fontWeight: 600 }}>See the Dashboard</a>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginTop: 24 }}>
              {["500+ Active Trainers", "12K+ Clients Managed", "4.9/5 Platform Rating"].map((t) => (
                <div key={t} style={{ padding: "12px", background: "#fff", border: "1px solid #e8e2d6", borderRadius: 10, fontSize: 13 }}>{t}</div>
              ))}
            </div>
          </div>
          <div className="reveal" data-reveal style={{ position: "relative" }}>
            <div style={{ border: "1px solid #e8e2d6", borderRadius: 18, background: "#fff", overflow: "hidden", boxShadow: "0 20px 50px rgba(44,36,22,.10)" }}>
              <div style={{ display: "flex", gap: 8, padding: "12px", borderBottom: "1px solid #e8e2d6", background: "#ede7d9" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
              </div>
              <img src="/img/dashboard.png" alt="Dashboard" style={{ width: "100%", display: "block" }} />
            </div>
            <div className="float-card" style={{ position: "absolute", top: 24, left: -12, background: "#fff", border: "1px solid #e8e2d6", borderRadius: 12, padding: "10px 12px", fontSize: 12, maxWidth: 200, boxShadow: "0 8px 24px rgba(44,36,22,.12)" }}>
              Client check-in logged ✓<br />94% weekly compliance
            </div>
            <div className="float-card" style={{ position: "absolute", bottom: 22, right: -8, background: "#fff", border: "1px solid #e8e2d6", borderRadius: 12, padding: "10px 12px", fontSize: 12, boxShadow: "0 8px 24px rgba(44,36,22,.12)" }}>
              3× Revenue growth
            </div>
          </div>
        </div>
      </section>

      {/* 3. PROBLEM */}
      <section id="problem" className="pad" style={{ padding: "76px 36px", background: "#f4efe4" }}>
        <div style={sectionBase}>
          <div className="reveal" data-reveal>
            <div style={{ color: "#9a8f7e", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>The problem</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 20px" }}>You didn't become a trainer to fight admin</h2>
          </div>
          <div className="stack-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 }}>
            {[
              ["📊", "Spreadsheet Hell", "Client data everywhere, no single source of truth."],
              ["👻", "Zero Accountability", "Check-ins disappear and progress stalls without consistency."],
              ["🔧", "The Franken-Stack", "Too many tools, no clean workflow between them."]
            ].map(([icon, title, body]) => (
              <div key={title} className="reveal" data-reveal style={{ background: "#fff", border: "1px solid #e8e2d6", borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 24 }}>{icon}</div>
                <div style={{ fontWeight: 600, marginTop: 8 }}>{title}</div>
                <p style={{ margin: "8px 0 0", color: "#9a8f7e", lineHeight: 1.6 }}>{body}</p>
              </div>
            ))}
          </div>
          <blockquote className="reveal" data-reveal style={{ margin: "20px 0 0", borderLeft: "4px solid #c9a84c", padding: "8px 0 8px 14px", color: "#2c2416", fontStyle: "italic" }}>
            "You did not become a trainer to spend your evenings buried in spreadsheets..."
          </blockquote>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section id="how" className="pad" style={{ padding: "76px 36px", background: "#faf6ef" }}>
        <div style={sectionBase}>
          <div className="reveal" data-reveal>
            <div style={{ color: "#9a8f7e", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>How it works</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 20px" }}>From application to transformation</h2>
          </div>
          <div className="stack-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 }}>
            {[
              ["01", "Apply", "Submit your trainer application and get reviewed quickly."],
              ["02", "Onboard", "Set up forms, client structure, and coaching workflow."],
              ["03", "Grow", "Scale client outcomes and business revenue with confidence."]
            ].map(([n, t, d]) => (
              <div key={t} className="reveal" data-reveal style={{ background: "#fff", border: "1px solid #e8e2d6", borderRadius: 12, padding: 18 }}>
                <div style={{ color: "#c9a84c", fontFamily: "'Bebas Neue',sans-serif", fontSize: 38 }}>{n}</div>
                <div style={{ fontWeight: 600 }}>{t}</div>
                <div style={{ color: "#9a8f7e", marginTop: 6 }}>{d}</div>
              </div>
            ))}
          </div>
          <div className="stack-2-tight reveal" data-reveal style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
            {["3× Faster onboarding", "94% Check-in rate", "40% More clients retained", "10h Saved weekly"].map((m) => (
              <div key={m} style={{ background: "#fff", border: "1px solid #e8e2d6", borderRadius: 10, padding: 12, textAlign: "center", fontSize: 13 }}>{m}</div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. DASHBOARD */}
      <section id="dashboard" className="pad" style={{ padding: "76px 36px", background: "#f4efe4" }}>
        <div className="stack-2" style={{ ...sectionBase, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "center" }}>
          <div className="reveal" data-reveal>
            <div style={{ color: "#9a8f7e", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>Dashboard</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 16px" }}>Your coaching command center</h2>
            {["📋 Client Sign-ups & Onboarding", "✅ Daily & Weekly Check-Ins", "💬 Integrated Messaging", "📊 Analytics & Progress Tracking"].map((f) => (
              <div key={f} style={{ padding: "12px 0", borderBottom: "1px solid #e8e2d6" }}>{f}</div>
            ))}
          </div>
          <div className="stack-2 reveal" data-reveal style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["/img/dashboard.png", "Dashboard view"],
              ["/img/forms.png", "Forms view"]
            ].map(([src, label]) => (
              <div key={label} style={{ background: "#fff", border: "1px solid #e8e2d6", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "flex", gap: 8, padding: 10, borderBottom: "1px solid #e8e2d6", background: "#ede7d9" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
                </div>
                <img src={src} alt={label} style={{ width: "100%", display: "block" }} />
                <div style={{ fontSize: 12, color: "#9a8f7e", padding: 10 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. CLIENT PORTAL */}
      <section id="client-portal" className="pad" style={{ padding: "76px 36px", background: "#faf6ef" }}>
        <div className="stack-2" style={{ ...sectionBase, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "center" }}>
          <div className="reveal" data-reveal style={{ background: "#fff", border: "1px solid #e8e2d6", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 8, padding: 10, borderBottom: "1px solid #e8e2d6", background: "#ede7d9" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
            </div>
            <img src="/img/checkin.png" alt="Client Portal" style={{ width: "100%", display: "block" }} />
            <div style={{ fontSize: 12, color: "#9a8f7e", padding: 10 }}>Client Portal</div>
          </div>
          <div className="reveal" data-reveal>
            <div style={{ color: "#9a8f7e", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>Client Portal</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 16px" }}>What your clients actually see</h2>
            {["Daily check-in form", "Sunday progress review", "Program & workout access", "Trainer messaging"].map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ color: "#4caf7d", fontWeight: 700 }}>✓</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. AI FOR TRAINERS */}
      <section className="pad" style={{ padding: "76px 36px", background: "#f4efe4" }}>
        <div className="stack-2" style={{ ...sectionBase, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20, padding: 18, borderRadius: 16, border: "1px solid #c9a84c", background: "linear-gradient(180deg,#fff,#faf6ef)" }}>
          <div className="reveal" data-reveal>
            <div style={{ color: "#9a8f7e", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>Trainer AI</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 14px" }}>Your AI coaching co-pilot</h2>
            <p style={{ color: "#9a8f7e" }}>FitBase AI is built exclusively for trainers — not for clients.</p>
            {[
              "✍️ Draft client feedback in seconds",
              "📊 Analyze check-in data trends",
              "📋 Generate weekly progress summaries",
              "🎯 Build personalized program adjustments"
            ].map((f) => (
              <div key={f} style={{ marginTop: 8 }}>{f}</div>
            ))}
          </div>
          <div className="reveal" data-reveal style={{ background: "#fff", border: "1px solid #e8e2d6", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong>FitBase AI</strong>
              <span style={{ color: "#4caf7d", fontSize: 12 }}>● Trainer only</span>
            </div>
            <div style={{ background: "#f4efe4", padding: 10, borderRadius: 10, marginBottom: 8, fontSize: 14 }}>
              Trainer: "Client is plateauing for 2 weeks. What should I adjust?"
            </div>
            <div style={{ background: "#faf6ef", border: "1px solid #e8e2d6", padding: 10, borderRadius: 10, fontSize: 14 }}>
              AI: "Reduce calories by 150, increase steps by 2k, keep protein stable, and switch two sessions to higher volume lower load."
            </div>
          </div>
        </div>
      </section>

      {/* 8. TESTIMONIALS */}
      <section id="testimonials" className="pad" style={{ padding: "76px 36px", background: "#faf6ef" }}>
        <div style={sectionBase}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>Results that speak</h2>
          <div className="stack-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14, marginTop: 16 }}>
            {[
              ["R", "Rahul Sharma", "Independent Trainer · Mumbai", "FitBase brought structure and scale to my coaching instantly."],
              ["P", "Priya Nair", "Online Coach · Bangalore", "My check-in consistency and client retention jumped fast."],
              ["A", "Arjun Mehta", "Gym Owner · Delhi", "This is the first platform my whole team actually sticks to."]
            ].map(([i, n, m, q]) => (
              <div key={n} className="reveal" data-reveal style={{ background: "#fff", border: "1px solid #e8e2d6", borderRadius: 12, padding: 16 }}>
                <div style={{ color: "#c9a84c", marginBottom: 8 }}>★★★★★</div>
                <p style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", marginTop: 0 }}>{q}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ede7d9", display: "grid", placeItems: "center" }}>{i}</div>
                  <div><strong>{n}</strong><div style={{ fontSize: 12, color: "#9a8f7e" }}>{m}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. COMPARISON TABLE */}
      <section className="pad" style={{ padding: "76px 36px", background: "#f4efe4" }}>
        <div style={sectionBase}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>How we compare</h2>
          <div className="reveal" data-reveal style={{ overflowX: "auto", marginTop: 14, border: "1px solid #e8e2d6", borderRadius: 12 }}>
            <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", background: "#fff" }}>
              <thead>
                <tr>
                  {["Feature", "FitBase", "Trainerize", "TrueCoach", "PT Distinction"].map((h) => (
                    <th key={h} style={{ padding: 12, borderBottom: "1px solid #e8e2d6", textAlign: h === "Feature" ? "left" : "center", background: h === "FitBase" ? "#ede7d9" : "#faf6ef", color: h === "FitBase" ? "#c9a84c" : "#9a8f7e" }}>{h}</th>
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
                    <td style={{ padding: 12, borderBottom: "1px solid #e8e2d6" }}>{r[0]}</td>
                    {[1, 2, 3, 4].map((idx) => {
                      const val = r[idx] as CompareValue;
                      return <td key={idx} style={{ padding: 12, borderBottom: "1px solid #e8e2d6", textAlign: "center" }}>{val}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 10. FAQ */}
      <section id="faq" className="pad" style={{ padding: "76px 36px", background: "#faf6ef" }}>
        <div style={sectionBase}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>Questions answered</h2>
          <div className="stack-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
            {faqs.map((item, idx) => (
              <div key={item.q} className="reveal" data-reveal style={{ background: "#fff", border: `1px solid ${activeFaq === idx ? "#c9a84c" : "#e8e2d6"}`, borderRadius: 10, overflow: "hidden" }}>
                <button type="button" onClick={() => setActiveFaq(activeFaq === idx ? null : idx)} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: 12, fontWeight: 600, cursor: "pointer" }}>
                  {item.q}
                </button>
                <div style={{ maxHeight: activeFaq === idx ? 180 : 0, overflow: "hidden", transition: "max-height .35s ease" }}>
                  <p style={{ margin: 0, padding: "0 12px 12px", color: "#9a8f7e", lineHeight: 1.6 }}>{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 11. PRICING */}
      <section id="pricing" className="pad" style={{ padding: "76px 36px", background: "#f4efe4" }}>
        <div style={sectionBase}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>Invest in your growth</h2>
          <div className="stack-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginTop: 16 }}>
            {plans.map((p) => (
              <div key={p.name} className="reveal" data-reveal style={{ background: "#fff", border: `1px solid ${p.featured ? "#c9a84c" : "#e8e2d6"}`, borderRadius: 12, padding: 16 }}>
                {p.badge ? <div style={{ display: "inline-block", background: "#c9a84c", color: "#fff", borderRadius: 999, fontSize: 11, padding: "4px 8px", marginBottom: 8 }}>{p.badge}</div> : null}
                <h3 style={{ margin: "0 0 4px" }}>{p.name}</h3>
                <div style={{ color: "#c9a84c", fontFamily: "'Bebas Neue',sans-serif", fontSize: 40 }}>{p.price}</div>
                <ul style={{ paddingLeft: 18, margin: "10px 0", color: "#9a8f7e" }}>
                  {p.features.map((f) => <li key={f} style={{ marginBottom: 6 }}>{f}</li>)}
                </ul>
                <a href="#apply" style={{ display: "block", textAlign: "center", textDecoration: "none", background: "#c9a84c", color: "#fff", padding: "10px 12px", borderRadius: 8, fontWeight: 600 }}>Get Access</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 12. APPLY FORM */}
      <section id="apply" ref={applyRef} className="pad" style={{ padding: "76px 36px", background: "#faf6ef" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>Ready to run a serious coaching business?</h2>
          {!submitted ? (
            <form
              className="reveal stack-2"
              data-reveal
              onSubmit={(e) => {
                e.preventDefault();
                // TODO: POST to NestJS /api/trainer-applications
                setSubmitted(true);
              }}
              style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
            >
              {["Full Name", "Email", "Phone", "Gym/Brand", "City", "Approx Clients"].map((label) => (
                <input key={label} required placeholder={label} style={{ border: "1px solid #e8e2d6", borderRadius: 8, padding: 12, background: "#fff" }} />
              ))}
              <textarea placeholder="Message" style={{ gridColumn: "1 / -1", border: "1px solid #e8e2d6", borderRadius: 8, padding: 12, minHeight: 120, background: "#fff" }} />
              <button type="submit" style={{ gridColumn: "1 / -1", border: "none", borderRadius: 8, background: "#c9a84c", color: "#fff", padding: 12, fontWeight: 600, cursor: "pointer" }}>
                Submit Application →
              </button>
            </form>
          ) : (
            <div className="reveal" data-reveal style={{ marginTop: 14, background: "#fff", border: "1px solid #4caf7d", borderRadius: 12, padding: 20, color: "#2c2416" }}>
              <div style={{ color: "#4caf7d", fontSize: 24 }}>✓</div>
              <strong>Application received!</strong>
            </div>
          )}
        </div>
      </section>

      {/* 13. FOOTER */}
      <footer className="pad" style={{ padding: "30px 36px", background: "#ede7d9", borderTop: "1px solid #e8e2d6" }}>
        <div style={{ ...sectionBase, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 3, color: "#c9a84c", fontSize: 28 }}>FITBASE</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {["Problem", "How it works", "Dashboard", "Client Portal", "Pricing", "Login"].map((label) => (
              <a key={label} href={label === "Login" ? loginHref : `#${label.toLowerCase().replace(/\s+/g, "-")}`} style={{ color: "#9a8f7e", textDecoration: "none", fontSize: 13 }}>{label}</a>
            ))}
          </div>
          <div style={{ color: "#9a8f7e", fontSize: 13 }}>© 2026 FitBase. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
