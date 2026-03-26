"use client";

import { useEffect, useRef, useState } from "react";
import { getApiSiteBase } from "../lib/site-url";

type FaqItem = { q: string; a: string };
type Plan = { name: string; price: string; featured?: boolean; badge?: string; features: string[] };
type CompareValue = "✓" | "✗" | "Limited" | "Basic" | "Paid" | "$24" | "$35" | "$19" | "$49";
type ApplyJoinType = "individual" | "enterprise";

const faqs: FaqItem[] = [
  { q: "How long does approval take?", a: "Most trainer applications are reviewed within 24 hours." },
  { q: "What does my client see?", a: "A mobile portal with check-in, workouts, and messages." },
  { q: "Can I import existing clients?", a: "Yes, you can import manually or through bulk upload." },
  { q: "Is there a mobile app?", a: "FitBase is mobile-optimized web first; native app is on the roadmap." },
  { q: "What does AI help trainers with?", a: "Feedback drafting, data analysis, and weekly progress summaries. Trainer only." },
  { q: "Can I upgrade or downgrade?", a: "Yes. Upgrades are immediate and downgrades apply on your next billing cycle." }
];

const plans: Plan[] = [
  { name: "Starter", price: "$24/mo", features: ["15 clients", "Check-ins", "Part 2 forms", "Tracking", "Messaging"] },
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
  const [applyJoinType, setApplyJoinType] = useState<ApplyJoinType>("individual");
  const [submittedJoinType, setSubmittedJoinType] = useState<ApplyJoinType>("individual");
  const [applyForm, setApplyForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    gym_name: "",
    city: "",
    message: ""
  });
  const [enterpriseForm, setEnterpriseForm] = useState({
    business_name: "",
    your_name: "",
    business_type: "",
    trainers_to_onboard: "",
    active_clients: "",
    white_labeling: "No",
    custom_integrations: "No",
    work_email: "",
    phone: "",
    notes: ""
  });
  const [clientSubmitted, setClientSubmitted] = useState(false);
  const [clientSubmitting, setClientSubmitting] = useState(false);
  const [clientError, setClientError] = useState("");
  const [submitNotice, setSubmitNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [clientForm, setClientForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    city: "",
    goal_focus: "",
    training_format: "",
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

  const socialProofTickerItems: { emoji: string; text: string }[] = [
    { emoji: "💪", text: "Ravi S. · Mumbai just completed Week 4 check-in" },
    { emoji: "✅", text: "Pooja T. · Bangalore hit her 12-week fat loss goal" },
    { emoji: "📋", text: "Coach Mehta onboarded 3 new clients today" },
    { emoji: "🔥", text: "Deepak R. logged his 6th consecutive check-in streak" },
    { emoji: "📈", text: "Coach Ananya's client down 3.2kg this month" },
    { emoji: "✅", text: "Trainer Kiran crossed 30 active clients" },
    { emoji: "💪", text: "Suresh M. · Delhi completed Sunday audit — Week 8" },
    { emoji: "🔥", text: "Preethi R. hit protein target 14 days in a row" }
  ];

  return (
    <main style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;font-family:'DM Sans',sans-serif;scroll-behavior:smooth;background:var(--bg-primary);color:var(--text-primary)}
        #apply input,#apply textarea,#apply select{color:var(--text-primary)}
        #apply input::placeholder,#apply textarea::placeholder{color:var(--text-muted)}
        #apply input:focus,#apply textarea:focus,#apply select:focus{border-color:var(--accent)!important;outline:none}
        .apply-join-shell{grid-column:1 / -1;display:grid;gap:12px;padding:16px;border-radius:20px;position:relative;overflow:hidden;background:linear-gradient(150deg,#fffdf9 0%,#faf4e9 46%,#f2e5ca 100%);border:1px solid color-mix(in srgb,var(--accent) 28%,#decaa0);box-shadow:0 14px 38px rgba(86,63,22,.16),inset 0 1px 0 rgba(255,255,255,.95)}
        .apply-join-shell::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(120deg,transparent 0%,rgba(255,255,255,.7) 22%,transparent 44%);transform:translateX(-120%);animation:applyLuxurySweep 6.4s ease-in-out infinite}
        @keyframes applyLuxurySweep{0%,86%,100%{transform:translateX(-120%)}38%{transform:translateX(130%)}}
        .apply-join-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;flex-wrap:wrap}
        .apply-join-kicker{margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#af8533}
        .apply-join-label{margin:2px 0 0;font-size:15px;font-weight:700;color:#20160a}
        .apply-join-note{margin:0;font-size:11px;color:#6f5b37}
        .apply-join-toggle{display:flex;flex-wrap:wrap;gap:10px;padding:0;background:transparent;border:none;border-radius:0;box-shadow:none}
        .apply-join-pill{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent) 22%,#d8c49a);padding:11px 18px;background:rgba(255,255,255,.72);color:#4f3d1d;font-weight:700;letter-spacing:.01em;cursor:pointer;transition:all .28s cubic-bezier(.2,.9,.2,1)}
        .apply-join-pill:hover{transform:translateY(-1px);border-color:#caa052;color:#2d210d;box-shadow:0 8px 18px rgba(192,145,57,.15)}
        .apply-join-pill[data-active="true"]{background:linear-gradient(140deg,#f6e8bf 0%,#e5c978 45%,#cda149 100%);border-color:transparent;color:#201508;box-shadow:0 10px 22px rgba(173,129,43,.24),inset 0 1px 0 rgba(255,255,255,.8)}
        .apply-mode-panel{grid-column:1 / -1;display:grid;grid-template-columns:1fr 1fr;gap:10px;opacity:1;transform:translateY(0);transition:opacity .24s ease,transform .24s ease}
        a[href="#dashboard"]:hover{border-color:var(--accent)!important}
        .reveal{opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s ease}
        .reveal.is-visible{opacity:1;transform:translateY(0)}
        @keyframes floatCard1{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes floatCard2{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes fbHeroFloat1Mob{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-7px)}}
        .fb-hero{position:relative;overflow:hidden;background:#faf7f2}
        .fb-hero-dotgrid{position:absolute;top:0;right:0;width:320px;height:320px;pointer-events:none;z-index:0;background-image:radial-gradient(circle,rgba(201,168,76,0.18) 1.2px,transparent 1.2px);background-size:22px 22px;-webkit-mask-image:radial-gradient(ellipse at top right,black 20%,transparent 70%);mask-image:radial-gradient(ellipse at top right,black 20%,transparent 70%)}
        .fb-hero-glow{position:absolute;right:80px;top:50%;transform:translateY(-50%);width:420px;height:380px;pointer-events:none;z-index:0;background:radial-gradient(ellipse at center,rgba(201,168,76,0.09) 0%,transparent 70%)}
        .fb-hero-row{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:40px;max-width:1180px;margin:0 auto;width:100%;box-sizing:border-box}
        .fb-hero-left{flex:1;min-width:0;max-width:620px}
        .fb-hero-screens-wrap{position:relative;width:400px;height:380px;flex-shrink:0;z-index:2}
        .fb-hero-stats{display:flex;flex-wrap:wrap;align-items:flex-start;border-top:1px solid #e8e0d0;padding-top:24px;margin-top:36px}
        .fb-hero-stat{display:flex;flex-direction:column;gap:4px;border-right:1px solid #e8e0d0;padding-right:32px;margin-right:32px}
        .fb-hero-stat:last-child{border-right:none;margin-right:0;padding-right:0}
        .fb-hero-stat-num{font-family:'Bebas Neue',sans-serif;font-size:36px;color:#0f1f3d;line-height:1}
        .fb-hero-stat-lbl{font-family:'DM Sans',sans-serif;font-size:10px;color:#9a8a70;letter-spacing:0.5px;font-weight:500}
        .fb-hero-float1{animation:floatCard1 4s ease-in-out infinite}
        .fb-hero-float2{animation:floatCard2 4s 1.5s ease-in-out infinite}
        @media (max-width:860px){
          .stack-2,.stack-3,.stack-2-tight,.apply-mode-panel{grid-template-columns:1fr !important}
          .apply-join-shell{padding:14px;border-radius:16px}
          .apply-join-pill{width:100%}
          .hide-mobile{display:none !important}
          .mobile-login{display:inline-flex !important}
          .pad{padding-left:max(20px, env(safe-area-inset-left, 0px)) !important;padding-right:max(20px, env(safe-area-inset-right, 0px)) !important}
          .hero{padding-top:max(120px, calc(96px + env(safe-area-inset-top, 0px))) !important}
          .fb-hero{display:flex!important;flex-direction:column!important;align-items:center!important;overflow:visible!important;padding:100px max(20px, env(safe-area-inset-left, 0px)) 60px max(20px, env(safe-area-inset-right, 0px))!important;padding-top:max(100px,calc(72px + env(safe-area-inset-top, 0px)))!important}
          .fb-hero-dotgrid{width:200px!important;height:200px!important}
          .fb-hero-glow{background:radial-gradient(ellipse at center,rgba(201,168,76,0.045) 0%,transparent 70%)!important}
          .fb-hero-row{flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;gap:0!important;width:100%!important;max-width:100%!important}
          .fb-hero-left{width:100%!important;max-width:100%!important;text-align:left!important;margin-bottom:48px!important;align-self:stretch!important}
          .fb-hero-h1{font-size:clamp(44px,10vw,64px)!important}
          .fb-hero-sub{max-width:100%!important}
          .fb-hero-btns{gap:10px!important}
          .fb-hero-stats{flex-direction:row!important;flex-wrap:wrap!important;gap:24px!important;align-items:flex-start!important}
          .fb-hero-stat{border-right:none!important;border-bottom:none!important;padding:0!important;margin:0!important;padding-right:0!important;margin-right:0!important;width:auto!important}
          .fb-hero-screens-wrap{display:block!important;width:100%!important;max-width:360px!important;height:320px!important;margin:0 auto 32px!important;position:relative!important;flex-shrink:0!important;overflow:visible!important}
          .fb-hero-back{width:160px!important;right:0!important;left:auto!important;top:24px!important;transform:rotate(-6deg)!important}
          .fb-hero-main{width:220px!important;left:50%!important;right:auto!important;top:0!important;transform:translateX(-50%)!important}
          .fb-hero-main .fb-hero-dash-title{font-size:13px!important;margin-bottom:10px!important}
          .fb-hero-main .fb-hero-welcome-name{font-size:10px!important}
          .fb-hero-main .fb-hero-welcome-date{font-size:8px!important}
          .fb-hero-main .fb-hero-metric-lbl{font-size:7px!important}
          .fb-hero-main .fb-hero-m-val{font-size:18px!important;line-height:1.1!important}
          .fb-hero-main .fb-hero-qa-head{font-size:7px!important;margin-bottom:6px!important}
          .fb-hero-main .fb-hero-qa-ic{font-size:12px!important;margin-bottom:2px!important}
          .fb-hero-main .fb-hero-qa-txt{font-size:7px!important}
          .fb-hero-main .fb-hero-main-body{padding:12px!important}
          .fb-hero-main .fb-hero-metric-card{padding:7px 9px!important}
          .fb-hero-float1{bottom:-10px!important;left:50%!important;right:auto!important;padding:8px 12px!important;white-space:nowrap!important;animation:fbHeroFloat1Mob 4s ease-in-out infinite!important}
          .fb-hero-float1 .fb-hero-f1-title{font-size:10px!important}
          .fb-hero-float1 .fb-hero-f1-sub{font-size:9px!important}
          .fb-hero-float2{top:8px!important;right:10px!important;left:auto!important}
          .fb-hero-float2 .fb-hero-f2-val{font-size:20px!important}
          .fb-hero-float2 .fb-hero-f2-lbl{font-size:8px!important}
        }
        @keyframes fbCpFloat1{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes fbCpFloat2{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        #client-portal.fb-cp-section{background:#faf7f2;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;overflow:hidden;min-height:480px;box-sizing:border-box}
        .fb-cp-dotgrid{position:absolute;top:0;left:0;width:280px;height:280px;pointer-events:none;z-index:0;background-image:radial-gradient(circle,rgba(201,168,76,0.16) 1.2px,transparent 1.2px);background-size:22px 22px;-webkit-mask-image:radial-gradient(ellipse at top left,black 20%,transparent 68%);mask-image:radial-gradient(ellipse at top left,black 20%,transparent 68%)}
        .fb-cp-glow{position:absolute;left:60px;top:50%;transform:translateY(-50%);width:380px;height:380px;pointer-events:none;z-index:0;background:radial-gradient(ellipse,rgba(201,168,76,0.07) 0%,transparent 70%)}
        .fb-cp-row{display:flex;align-items:center;gap:80px;width:100%;max-width:1180px;margin:0 auto;position:relative;z-index:2;box-sizing:border-box}
        .fb-cp-screens{position:relative;width:272px;height:400px;flex-shrink:0;z-index:2}
        .fb-cp-copy{flex:1;min-width:0;z-index:2;position:relative}
        .fb-cp-h2{font-family:'Bebas Neue',sans-serif;font-size:clamp(40px,4vw,52px);line-height:0.93;letter-spacing:1.5px;color:#0f1f3d;margin:0 0 18px}
        .fb-cp-feat{display:flex;gap:16px;align-items:flex-start;padding:18px 0;border-bottom:1px solid #e8e0d0}
        .fb-cp-feat:first-of-type{padding-top:0}
        .fb-cp-feat:last-of-type{border-bottom:none}
        .fb-cp-float1{animation:fbCpFloat1 4s ease-in-out infinite}
        .fb-cp-float2{animation:fbCpFloat2 4s 1.5s ease-in-out infinite}
        @media(max-width:860px){
          #client-portal.fb-cp-section{padding:48px max(20px, env(safe-area-inset-left, 0px)) 48px max(20px, env(safe-area-inset-right, 0px))!important;min-height:0;align-items:stretch}
          .fb-cp-dotgrid,.fb-cp-glow{display:none!important}
          .fb-cp-row{flex-direction:column-reverse;gap:0;max-width:100%}
          .fb-cp-screens{width:100%;height:340px;margin-top:40px}
          .fb-cp-back{display:none!important}
          .fb-cp-float1,.fb-cp-float2{display:none!important}
          .fb-cp-main{position:relative!important;right:auto!important;top:auto!important;left:auto!important;width:100%!important;max-width:300px!important;margin:0 auto!important}
          .fb-cp-h2{font-size:clamp(36px,8vw,52px)!important}
        }
        @media (min-width:861px){
          .mobile-login{display:none !important}
        }
        .fb-ticker-wrap{height:44px;overflow:hidden;background:var(--bg-surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border);width:100vw;margin-left:calc(50% - 50vw);position:relative}
        .fb-ticker-track{display:flex;width:max-content;align-items:center;animation:fbTicker 30s linear infinite}
        .fb-ticker-set{display:flex;align-items:center;gap:56px;flex-shrink:0;height:44px;padding-right:56px}
        .fb-ticker-item{font-size:13px;color:var(--text-secondary);white-space:nowrap;line-height:44px}
        .fb-ticker-accent{color:var(--accent)}
        @keyframes fbTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .fb-trainer-wins-band{background:#0f1f3d;padding:52px 48px;box-sizing:border-box}
        @media(max-width:860px){.fb-trainer-wins-band{padding:40px max(20px, env(safe-area-inset-left, 0px))}}
        .fb-wins-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;max-width:1180px;margin:0 auto;text-align:center}
        .fb-wins-stat{padding:0 20px;border-left:1px solid rgba(255,255,255,0.08)}
        .fb-wins-stat:first-child{border-left:none;padding-left:0}
        .fb-wins-stat:last-child{padding-right:0}
        @media(max-width:860px){
          .fb-wins-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .fb-wins-stat{border-left:none;padding:24px 16px;border-top:1px solid rgba(255,255,255,0.08)}
          .fb-wins-stat:nth-child(1),.fb-wins-stat:nth-child(2){border-top:none}
          .fb-wins-stat:nth-child(odd):not(:last-child){border-right:1px solid rgba(255,255,255,0.08)}
          .fb-wins-stat:last-child{grid-column:1 / -1;border-right:none;border-top:1px solid rgba(255,255,255,0.08)}
        }
        .fb-ba-table{width:100%;border-collapse:collapse}
        .fb-ba-table th{text-align:left;font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:14px 24px}
        .fb-ba-table td{font-size:14px;padding:16px 24px;vertical-align:top}
        .fb-ba-row-a td{background:var(--bg-primary)}
        .fb-ba-row-b td{background:var(--bg-surface)}
        .landing-ghost-cta{display:inline-block;margin:32px auto 0;padding:12px 22px;border:1px solid var(--accent-border);border-radius:10px;color:var(--olive);font-weight:600;font-size:14px;text-decoration:none;transition:border-color .2s ease,background .2s ease}
        .landing-ghost-cta:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
        .fb-case-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        @media(max-width:860px){.fb-case-grid{grid-template-columns:1fr}}
        .fb-case-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:32px 28px;box-shadow:var(--shadow-sm);transition:border-color .2s ease,box-shadow .2s ease}
        .fb-case-card:hover{border-color:var(--accent-border);box-shadow:var(--shadow-md)}
        .apply-urgency-bar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:14px 20px;margin-bottom:20px}
        @media(max-width:860px){
          .apply-urgency-bar{flex-direction:column;align-items:stretch}
          .apply-urgency-left{flex-direction:column;align-items:flex-start;gap:8px}
        }
        .apply-urgency-left{display:flex;flex-wrap:wrap;align-items:center;gap:8px 0;font-size:12px;color:var(--text-secondary)}
        .apply-urgency-sep{color:var(--text-muted);padding:0 10px}
        @media(max-width:860px){.apply-urgency-sep{display:none}}
        .apply-urgency-badge{align-self:center;background:var(--accent);color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:100px;white-space:nowrap}
        @media(max-width:860px){
          .fb-ba-section,.fb-case-studies-section{padding-top:64px!important;padding-bottom:64px!important}
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
          background: "color-mix(in srgb, var(--bg-primary) 93%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
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
            style={{
              border: "none",
              background: "linear-gradient(145deg, var(--accent-bright) 0%, var(--accent-light) 42%, var(--accent) 100%)",
              color: "var(--on-accent)",
              padding: "10px 18px",
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 6px 22px rgb(var(--accent-rgb) / 0.38)"
            }}
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
            background: "linear-gradient(145deg, var(--accent-bright) 0%, var(--accent-light) 42%, var(--accent) 100%)",
            color: "var(--on-accent)",
            padding: "9px 14px",
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 13,
            boxShadow: "0 4px 18px rgb(var(--accent-rgb) / 0.34)"
          }}
        >
          Login
        </a>
      </nav>

      {/* 2. HERO */}
      <section className="pad hero fb-hero" style={{ padding: "110px 36px 80px" }}>
        <div className="fb-hero-dotgrid" aria-hidden />
        <div className="fb-hero-glow" aria-hidden />
        <div className="fb-hero-row">
          <div className="fb-hero-left">
            <div className="reveal" data-reveal>
              <h1
                className="fb-hero-h1"
                style={{
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: "clamp(52px,7vw,96px)",
                  margin: 0,
                  letterSpacing: 1,
                  lineHeight: 0.95
                }}
              >
                THE PLATFORM THAT POWERS{" "}
                <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", color: "var(--accent)" }}>Modern Trainers</span>
              </h1>
              <p
                className="fb-hero-sub"
                style={{
                  margin: "18px 0 24px",
                  color: "var(--text-secondary)",
                  maxWidth: 560,
                  lineHeight: 1.75,
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: "clamp(18px,2.2vw,22px)"
                }}
              >
                Professional coaching infrastructure for onboarding, tracking, communication, and measurable results
              </p>
              <div className="fb-hero-btns" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <a
                  href="#apply"
                  style={{
                    textDecoration: "none",
                    background: "linear-gradient(145deg, var(--accent-bright) 0%, var(--accent-light) 42%, var(--accent) 100%)",
                    color: "var(--on-accent)",
                    padding: "12px 18px",
                    borderRadius: 10,
                    fontWeight: 600,
                    boxShadow: "0 8px 28px rgb(var(--accent-rgb) / 0.4)"
                  }}
                >
                  Request Trainer Access
                </a>
                <a
                  href="#dashboard"
                  style={{
                    textDecoration: "none",
                    background: "transparent",
                    color: "var(--olive)",
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--accent-border)",
                    fontWeight: 600
                  }}
                >
                  Explore the platform
                </a>
              </div>
              <div className="fb-hero-stats">
                {[
                  ["500+", "Active Trainers"],
                  ["12K+", "Clients Managed"],
                  ["4.9/5", "Platform Rating"]
                ].map(([num, lbl]) => (
                  <div key={lbl} className="fb-hero-stat">
                    <span className="fb-hero-stat-num">{num}</span>
                    <span className="fb-hero-stat-lbl">{lbl}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="fb-hero-screens-wrap" aria-hidden>
            {/* Back screen — Forms */}
            <div
              className="fb-hero-back"
              style={{
                position: "absolute",
                right: -10,
                top: 28,
                width: 210,
                background: "#ffffff",
                border: "1px solid #e8e0d0",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 8px 32px rgba(15,31,61,0.10)",
                transform: "rotate(-6deg)",
                zIndex: 1,
                opacity: 0.85
              }}
            >
              <div
                style={{
                  background: "#f0ebe0",
                  padding: "8px 12px",
                  display: "flex",
                  gap: 5,
                  borderBottom: "1px solid #e8e0d0"
                }}
              >
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <span key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                ))}
              </div>
              <div style={{ padding: 12 }}>
                <div
                  style={{
                    fontFamily: "'Bebas Neue',sans-serif",
                    fontSize: 13,
                    letterSpacing: 1,
                    color: "#c9a84c",
                    marginBottom: 8
                  }}
                >
                  Forms
                </div>
                {[
                  ["📋", "Audit Forms", "Review client audits"],
                  ["📅", "Sunday Check-In", "Weekly progress"],
                  ["📌", "Daily Check-In", "Steps, water, protein"]
                ].map(([ic, name, desc]) => (
                  <div
                    key={name}
                    style={{
                      background: "#f8f4ee",
                      borderRadius: 7,
                      padding: "8px 10px",
                      marginBottom: 5,
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{ic}</span>
                    <div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 600, color: "#0f1f3d" }}>{name}</div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 8, color: "#9a8a70", marginTop: 1 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Main screen — Dashboard */}
            <div
              className="fb-hero-main"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 252,
                background: "#ffffff",
                border: "1px solid #e8e0d0",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 20px 60px rgba(15,31,61,0.14), 0 4px 16px rgba(15,31,61,0.08)",
                zIndex: 3
              }}
            >
              <div
                style={{
                  background: "#f0ebe0",
                  padding: "9px 12px",
                  display: "flex",
                  gap: 5,
                  alignItems: "center",
                  borderBottom: "1px solid #e8e0d0"
                }}
              >
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <span key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                ))}
              </div>
              <div className="fb-hero-main-body" style={{ padding: 16 }}>
                <div
                  className="fb-hero-dash-title"
                  style={{
                    fontFamily: "'Bebas Neue',sans-serif",
                    fontSize: 16,
                    letterSpacing: 2,
                    color: "#c9a84c",
                    marginBottom: 12
                  }}
                >
                  Dashboard
                </div>
                <div style={{ background: "#f8f4ee", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                  <div
                    className="fb-hero-welcome-name"
                    style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: "#0f1f3d" }}
                  >
                    Welcome back Idris Kurnooli
                  </div>
                  <div className="fb-hero-welcome-date" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: "#9a8a70" }}>
                    Monday · 23 March 2026
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 7,
                    marginBottom: 12
                  }}
                >
                  {[
                    ["MEMBERS", "24", "#c9a84c"],
                    ["DAILY CHECK-IN", "18", "#c9a84c"],
                    ["PENDING", "3", "#0f1f3d"],
                    ["MESSAGES", "7", "#0f1f3d"]
                  ].map(([label, val, col]) => (
                    <div key={label} className="fb-hero-metric-card" style={{ background: "#f8f4ee", borderRadius: 8, padding: "9px 11px" }}>
                      <div
                        className="fb-hero-metric-lbl"
                        style={{
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: 8,
                          fontWeight: 600,
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                          color: "#9a8a70"
                        }}
                      >
                        {label}
                      </div>
                      <div className="fb-hero-m-val" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: col, lineHeight: 1.1 }}>
                        {val}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  className="fb-hero-qa-head"
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 8,
                    fontWeight: 600,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#9a8a70",
                    marginBottom: 7
                  }}
                >
                  QUICK ACCESS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                  {[
                    ["👤", "Sign-ups"],
                    ["📅", "Check-Ins"],
                    ["📊", "Analytics"]
                  ].map(([ic, lab]) => (
                    <div key={lab} style={{ background: "#f8f4ee", borderRadius: 8, padding: "9px 6px", textAlign: "center" }}>
                      <div className="fb-hero-qa-ic" style={{ fontSize: 14, marginBottom: 3 }}>
                        {ic}
                      </div>
                      <div className="fb-hero-qa-txt" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 8, color: "#6a7a8a" }}>
                        {lab}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Floating cards */}
            <div
              className="fb-hero-float1"
              style={{
                position: "absolute",
                bottom: -16,
                left: 20,
                padding: "10px 13px",
                gap: 9,
                display: "flex",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #e8e0d0",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(15,31,61,0.12)",
                zIndex: 5
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  background: "rgba(201,168,76,0.12)",
                  borderRadius: 7,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  flexShrink: 0
                }}
              >
                📈
              </div>
              <div>
                <div className="fb-hero-f1-title" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: "#0f1f3d" }}>
                  Client check-in logged
                </div>
                <div className="fb-hero-f1-sub" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: "#4caf7d", marginTop: 1 }}>
                  ✓ 94% weekly compliance
                </div>
              </div>
            </div>
            <div
              className="fb-hero-float2"
              style={{
                position: "absolute",
                top: 10,
                right: -20,
                padding: "10px 14px",
                background: "#ffffff",
                border: "1px solid #e8e0d0",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(15,31,61,0.12)",
                zIndex: 5,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start"
              }}
            >
              <div className="fb-hero-f2-val" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: "#c9a84c", lineHeight: 1 }}>
                3×
              </div>
              <div
                className="fb-hero-f2-lbl"
                style={{
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 9,
                  color: "#9a8a70",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  marginTop: 2
                }}
              >
                REVENUE GROWTH
              </div>
            </div>
          </div>
        </div>
        <div className="fb-ticker-wrap" role="region" aria-label="Recent platform activity">
          <div className="fb-ticker-track">
            <div className="fb-ticker-set">
              {socialProofTickerItems.map((item, idx) => (
                <span key={`a-${idx}`} className="fb-ticker-item">
                  <span className="fb-ticker-accent">{item.emoji}</span> {item.text}
                </span>
              ))}
            </div>
            <div className="fb-ticker-set" aria-hidden="true">
              {socialProofTickerItems.map((item, idx) => (
                <span key={`b-${idx}`} className="fb-ticker-item">
                  <span className="fb-ticker-accent">{item.emoji}</span> {item.text}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
          <p style={{ margin: "20px 0 0", fontSize: 13, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
            Stronger check-in discipline · Clearer client outcomes · Room to scale your practice
          </p>
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

      <section className="fb-trainer-wins-band" aria-label="Trainer results">
        <div className="fb-wins-grid">
          {[
            { n: "₹2.4L+", l1: "avg monthly revenue", l2: "for Professional plan trainers" },
            { n: "28 days", l1: "fastest time", l2: "to reach 20 active clients" },
            { n: "91%", l1: "avg check-in rate", l2: "across all FitBase trainers" },
            { n: "3×", l1: "avg revenue growth", l2: "within first 6 months" },
            { n: "48hrs", l1: "avg time", l2: "to onboard first 10 clients" }
          ].map((s) => (
            <div key={s.n + s.l1} className="fb-wins-stat">
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 52, lineHeight: 1.05, color: "var(--accent)", marginBottom: 8 }}>{s.n}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500, lineHeight: 1.35 }}>{s.l1}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4, lineHeight: 1.4 }}>{s.l2}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. DASHBOARD */}
      <section id="dashboard" className="pad" style={{ padding: "76px 36px", background: "var(--bg-surface)" }}>
        <div style={{ ...sectionBase, maxWidth: 720 }}>
          <div className="reveal" data-reveal>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>Dashboard</div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "8px 0 14px", lineHeight: 1.02 }}>
              Your coaching command center
            </h2>
            <p style={{ margin: "0 0 28px", color: "var(--text-secondary)", lineHeight: 1.65, fontSize: 16, maxWidth: 560 }}>
              One place to run sign-ups, forms, check-ins, messaging, and progress—without switching tools or losing context.
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {[
                ["Client sign-ups & onboarding", "Approve requests, assign coaches, and keep a clear pipeline."],
                ["Daily & weekly check-ins", "Structured habits and reviews so nothing slips through."],
                ["Integrated messaging", "Coach and client stay in one thread, tied to the same record."],
                ["Analytics & progress tracking", "See trends and act before small issues become big ones."]
              ].map(([title, desc]) => (
                <li key={title} style={{ padding: "18px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{title}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.55 }}>{desc}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="pad fb-ba-section" style={{ paddingTop: 96, paddingBottom: 96, background: "var(--bg-surface)" }}>
        <div style={{ ...sectionBase, textAlign: "center" }}>
          <div className="reveal" data-reveal style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
            The difference
          </div>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "0 0 32px", lineHeight: 1.02 }}>
            Life before and after FitBase
          </h2>
          <div className="reveal" data-reveal style={{ overflowX: "auto", textAlign: "left" }}>
            <table className="fb-ba-table">
              <thead>
                <tr>
                  <th style={{ background: "rgba(224,82,82,0.06)", color: "#c0392b" }}>Before FitBase</th>
                  <th style={{ background: "rgba(201,168,76,0.08)", color: "var(--accent)" }}>After FitBase</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Chasing clients on WhatsApp", "Automated check-in reminders"],
                  ["Separate Excel sheet per client", "One dashboard for all clients"],
                  ["3+ hours a day on admin", "20 minutes a day on admin"],
                  ["Clients drop off after 6 weeks", "40% higher client retention"],
                  ["No idea who needs attention", "Red flags surface automatically"],
                  ["Undercharging, overworking", "3× revenue in the same hours"],
                  ["Programs shared over WhatsApp PDFs", "Programs assigned inside the app"],
                  ["Guessing what's working", "Data-backed decisions every week"]
                ].map(([before, after], i) => (
                  <tr key={before} className={i % 2 === 0 ? "fb-ba-row-a" : "fb-ba-row-b"}>
                    <td style={{ color: "var(--text-secondary)" }}>
                      <span style={{ color: "#c0392b", marginRight: 8, fontWeight: 600 }}>✗</span>
                      {before}
                    </td>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                      <span style={{ color: "var(--green)", marginRight: 8, fontWeight: 600 }}>✓</span>
                      {after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: "center" }}>
            <a href="#how" className="landing-ghost-cta">
              See how it works →
            </a>
          </div>
        </div>
      </section>

      {/* 6. CLIENT PORTAL */}
      <section id="client-portal" className="fb-cp-section">
        <div className="fb-cp-dotgrid" aria-hidden />
        <div className="fb-cp-glow" aria-hidden />
        <div className="fb-cp-row">
          <div className="fb-cp-screens" aria-hidden>
            {/* Back — Forms */}
            <div
              className="fb-cp-back"
              style={{
                position: "absolute",
                left: -18,
                bottom: 20,
                width: 200,
                background: "#ffffff",
                border: "1px solid #e8e0d0",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 8px 32px rgba(15,31,61,0.10)",
                transform: "rotate(6deg)",
                zIndex: 1,
                opacity: 0.82
              }}
            >
              <div
                style={{
                  background: "#f0ebe0",
                  padding: "9px 12px",
                  display: "flex",
                  gap: 5,
                  alignItems: "center",
                  borderBottom: "1px solid #e8e0d0"
                }}
              >
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <span key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                ))}
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 9,
                    color: "#b0a080",
                    marginLeft: 6,
                    letterSpacing: 1.5,
                    textTransform: "uppercase"
                  }}
                >
                  Forms
                </span>
              </div>
              <div style={{ padding: 14 }}>
                <div
                  style={{
                    fontFamily: "'Bebas Neue',sans-serif",
                    fontSize: 14,
                    letterSpacing: 2,
                    color: "#c9a84c",
                    marginBottom: 10
                  }}
                >
                  Forms
                </div>
                {[
                  ["📋", "Audit Forms", "Client audits"],
                  ["📅", "Sunday Check-In", "Weekly progress"],
                  ["📌", "Daily Check-In", "Steps, water, protein"]
                ].map(([ic, name, desc]) => (
                  <div
                    key={name}
                    style={{
                      background: "#f8f4ee",
                      borderRadius: 7,
                      padding: "9px 10px",
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{ic}</span>
                    <div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 600, color: "#0f1f3d" }}>{name}</div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 8, color: "#9a8a70", marginTop: 1 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Main — Check-In */}
            <div
              className="fb-cp-main"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                width: 248,
                background: "#ffffff",
                border: "1px solid #e8e0d0",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 20px 60px rgba(15,31,61,0.13), 0 4px 16px rgba(15,31,61,0.07)",
                zIndex: 3
              }}
            >
              <div
                style={{
                  background: "#f0ebe0",
                  padding: "9px 12px",
                  display: "flex",
                  gap: 5,
                  alignItems: "center",
                  borderBottom: "1px solid #e8e0d0"
                }}
              >
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <span key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                ))}
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 9,
                    color: "#b0a080",
                    marginLeft: 6,
                    letterSpacing: 1.5,
                    textTransform: "uppercase"
                  }}
                >
                  Check-In
                </span>
              </div>
              <div style={{ padding: 16 }}>
                <div
                  style={{
                    fontFamily: "'Bebas Neue',sans-serif",
                    fontSize: 15,
                    letterSpacing: 2,
                    color: "#c9a84c",
                    marginBottom: 4
                  }}
                >
                  Check-In
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 9,
                    color: "#9a8a70",
                    marginBottom: 14,
                    lineHeight: 1.5
                  }}
                >
                  Daily check-in, Sunday check-in, or My progress.
                </div>
                <div
                  style={{
                    background: "#f8f4ee",
                    border: "1px solid #e8e0d0",
                    borderRadius: 7,
                    padding: "8px 11px",
                    marginBottom: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 8,
                        fontWeight: 600,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        color: "#9a8a70",
                        marginBottom: 2
                      }}
                    >
                      Date
                    </div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 500, color: "#0f1f3d" }}>03/23/2026</div>
                  </div>
                  <span style={{ fontSize: 12, opacity: 0.5 }}>📅</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 10 }}>
                  {[
                    ["WEIGHT (KG)", "e.g. 72.5"],
                    ["BODY FAT %", "e.g. 18"],
                    ["CALORIES", "e.g. 2000"],
                    ["PROTEIN (G)", "e.g. 120"],
                    ["SLEEP (HRS)", "e.g. 7.5"],
                    ["WORKOUT", "Upper body"]
                  ].map(([lab, val]) => (
                    <div
                      key={lab}
                      style={{
                        background: "#f8f4ee",
                        border: "1px solid #e8e0d0",
                        borderRadius: 7,
                        padding: "8px 10px"
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: 8,
                          fontWeight: 600,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          color: "#9a8a70",
                          marginBottom: 3
                        }}
                      >
                        {lab}
                      </div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: "#b0a898" }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
                  {[
                    ["BENCH", "e.g. 60kg"],
                    ["SQUAT", "e.g. 80kg"],
                    ["DEADLIFT", "e.g. 140kg"]
                  ].map(([lab, val]) => (
                    <div
                      key={lab}
                      style={{
                        background: "#f8f4ee",
                        border: "1px solid #e8e0d0",
                        borderRadius: 7,
                        padding: "7px 8px",
                        textAlign: "center"
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: 7,
                          fontWeight: 600,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          color: "#9a8a70",
                          marginBottom: 2
                        }}
                      >
                        {lab}
                      </div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: "#b0a898" }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div
              className="fb-cp-float1"
              style={{
                position: "absolute",
                bottom: -14,
                right: 10,
                zIndex: 6,
                background: "#ffffff",
                border: "1px solid #e8e0d0",
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 9,
                boxShadow: "0 8px 24px rgba(15,31,61,0.12)"
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  background: "rgba(201,168,76,0.10)",
                  borderRadius: 7,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  flexShrink: 0
                }}
              >
                ⚡
              </div>
              <div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: "#0f1f3d" }}>Check-in done</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: "#4caf7d", marginTop: 2 }}>✓ Under 2 minutes</div>
              </div>
            </div>
            <div
              className="fb-cp-float2"
              style={{
                position: "absolute",
                top: 14,
                left: -14,
                zIndex: 6,
                background: "#ffffff",
                border: "1px solid #e8e0d0",
                borderRadius: 10,
                padding: "10px 14px",
                boxShadow: "0 8px 24px rgba(15,31,61,0.12)",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start"
              }}
            >
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: "#c9a84c", lineHeight: 1 }}>87%</div>
              <div
                style={{
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 9,
                  color: "#9a8a70",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginTop: 2
                }}
              >
                FEEL ACCOUNTABLE
              </div>
            </div>
          </div>
          <div className="fb-cp-copy">
            <div className="reveal" data-reveal>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ width: 24, height: 1, background: "rgba(201,168,76,0.5)" }} />
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    color: "#c9a84c"
                  }}
                >
                  Client Portal
                </span>
              </div>
              <h2 className="fb-cp-h2">
                WHAT YOUR CLIENTS
                <br />
                <span
                  style={{
                    fontFamily: "'Instrument Serif',serif",
                    fontStyle: "italic",
                    color: "#c9a84c",
                    fontSize: "0.9em",
                    letterSpacing: 0
                  }}
                >
                  actually see
                </span>
              </h2>
              <p
                style={{
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 14,
                  fontWeight: 300,
                  color: "#6a7a8a",
                  lineHeight: 1.75,
                  maxWidth: 420,
                  margin: "0 0 36px"
                }}
              >
                Every client touchpoint stays clear and calm — so adherence, trust, and follow-through stay high.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[
                  ["Daily check-in", "Core daily metrics logged in under two minutes."],
                  ["Sunday progress review", "Structured weekly review with habits and outcomes."],
                  ["Programs & workouts", "Assigned plans and full history in one place."],
                  ["Trainer messaging", "Questions and support without leaving the portal."]
                ].map(([title, desc]) => (
                  <div key={title} className="fb-cp-feat">
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "rgba(201,168,76,0.10)",
                        border: "1px solid rgba(201,168,76,0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 2
                      }}
                    >
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: "#c9a84c" }}>✓</span>
                    </div>
                    <div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: "#0f1f3d", marginBottom: 4 }}>{title}</div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#9a8a70", lineHeight: 1.6 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(201,168,76,0.08)",
                  border: "1px solid rgba(201,168,76,0.20)",
                  borderRadius: 100,
                  padding: "5px 14px",
                  marginTop: 28
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4caf7d" }} />
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#9a8a70", letterSpacing: 0.5 }}>Average client check-in rate</span>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: "#c9a84c" }}>94%</span>
              </div>
            </div>
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
                boxShadow: "var(--shadow-md)"
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
                  color: "var(--on-accent)",
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

      <section className="pad fb-case-studies-section" style={{ paddingTop: 96, paddingBottom: 96, background: "var(--bg-primary)" }}>
        <div style={sectionBase}>
          <div className="reveal" data-reveal style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
            Case studies
          </div>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: "0 0 12px", lineHeight: 1.02 }}>
            Trainers already winning
          </h2>
          <p className="reveal" data-reveal style={{ margin: "0 0 32px", color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.65, maxWidth: 620 }}>
            Real numbers from real coaches on FitBase. No fluff, no stock photos.
          </p>
          <div className="fb-case-grid">
            {[
              {
                name: "Sneha Kulkarni",
                loc: "Pune · Fat Loss & Body Recomp",
                challenge: "Managing 22 clients across WhatsApp, Sheets, and a notes app.",
                metrics: [
                  ["Check-in compliance", "38%", "89%"],
                  ["Clients retained past 3 months", "4", "14"],
                  ["Admin time per day", "3.5 hrs", "45 mins"],
                  ["Monthly revenue", "₹62,000", "₹1.4L"]
                ],
                quote: "I finally look like I run a real business."
              },
              {
                name: "Vikram Iyer",
                loc: "Chennai · Strength & Performance",
                challenge: "Scaling past 15 clients felt impossible without dropping quality.",
                metrics: [
                  ["Active clients", "14", "38"],
                  ["Weekly check-in rate", "52%", "93%"],
                  ["Client complaints", "Weekly", "Zero"],
                  ["Monthly revenue", "₹48,000", "₹1.9L"]
                ],
                quote: "FitBase is the reason I could scale without burning out."
              },
              {
                name: "Meera Kapoor",
                loc: "Hyderabad · Online Coaching",
                challenge: "New trainer, no system, losing clients after week 4.",
                metrics: [
                  ["Client retention past 8 weeks", "30%", "78%"],
                  ["Check-in streak (avg)", "3 days", "19 days"],
                  ["Programs delivered on time", "60%", "100%"],
                  ["Monthly revenue", "₹18,000", "₹74,000"]
                ],
                quote: "I went from nearly quitting to fully booked in 3 months."
              }
            ].map((card) => (
              <div key={card.name} className="fb-case-card reveal" data-reveal>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{card.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{card.loc}</div>
                <div style={{ width: 32, height: 2, background: "var(--accent)", margin: "12px 0" }} />
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 2, color: "var(--text-muted)", marginBottom: 6 }}>Challenge</div>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>{card.challenge}</p>
                {card.metrics.map(([label, oldV, newV]) => (
                  <div key={label} style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.45 }}>
                    <span style={{ color: "var(--accent)", marginRight: 6 }}>→</span>
                    <span style={{ color: "var(--text-secondary)" }}>{label}: </span>
                    <span style={{ color: "var(--text-muted)", textDecoration: "line-through" }}>{oldV}</span>
                    <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>→</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{newV}</span>
                  </div>
                ))}
                <blockquote
                  style={{
                    margin: "20px 0 0",
                    paddingLeft: 14,
                    borderLeft: "2px solid var(--accent-border)",
                    fontFamily: "'Instrument Serif',serif",
                    fontStyle: "italic",
                    fontSize: 15,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5
                  }}
                >
                  {card.quote}
                </blockquote>
              </div>
            ))}
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
            boxShadow: "var(--shadow-lg)"
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
                  ["Part 2 & check-ins", "✓", "Basic", "Basic", "✓"],
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
              <div
                key={p.name}
                className="reveal"
                data-reveal
                style={{
                  background: p.featured ? "linear-gradient(168deg, var(--bg-surface), var(--bg-card))" : "var(--bg-card)",
                  border: p.featured ? "2px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: p.featured ? 16 : 12,
                  padding: p.featured ? 20 : 16,
                  boxShadow: p.featured ? "var(--shadow-lg)" : undefined,
                  transform: p.featured ? "translateY(-4px)" : undefined
                }}
              >
                {p.badge ? (
                  <div
                    style={{
                      display: "inline-block",
                      background: "linear-gradient(145deg, var(--accent-bright) 0%, var(--accent-light) 42%, var(--accent) 100%)",
                      color: "var(--on-accent)",
                      borderRadius: 999,
                      fontSize: 11,
                      padding: "5px 10px",
                      marginBottom: 8,
                      fontWeight: 600,
                      letterSpacing: 0.3
                    }}
                  >
                    {p.badge}
                  </div>
                ) : null}
                <h3 style={{ margin: "0 0 4px", color: p.featured ? "var(--olive)" : undefined }}>{p.name}</h3>
                <div style={{ color: "var(--accent)", fontFamily: "'Bebas Neue',sans-serif", fontSize: 40 }}>{p.price}</div>
                <ul style={{ paddingLeft: 18, margin: "10px 0", color: "var(--text-secondary)" }}>
                  {p.features.map((f) => <li key={f} style={{ marginBottom: 6 }}>{f}</li>)}
                </ul>
                <a
                  href="#apply"
                  style={{
                    display: "block",
                    textAlign: "center",
                    textDecoration: "none",
                    background: "linear-gradient(145deg, var(--accent-bright) 0%, var(--accent-light) 42%, var(--accent) 100%)",
                    color: "var(--on-accent)",
                    padding: "11px 12px",
                    borderRadius: 10,
                    fontWeight: 600,
                    boxShadow: "0 6px 22px rgb(var(--accent-rgb) / 0.38)"
                  }}
                >
                  Get Access
                </a>
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
                      training_format: clientForm.training_format.trim(),
                      message: clientForm.message.trim(),
                      heard_about: clientForm.heard_about.trim()
                    })
                  });
                  const data = await r.json().catch(() => ({}));
                  if (!r.ok || data?.error) {
                    throw new Error(data?.error || "Could not submit your request.");
                  }
                  setClientSubmitted(false);
                  setClientForm({
                    full_name: "",
                    email: "",
                    phone: "",
                    city: "",
                    goal_focus: "",
                    training_format: "",
                    message: "",
                    heard_about: ""
                  });
                  setSubmitNotice({
                    title: "Request Submitted Successfully",
                    message:
                      "Thank you for your interest in FitBase coaching. Our team will review your request and connect you with the most suitable trainer shortly."
                  });
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
              <select
                required
                value={clientForm.training_format}
                onChange={(ev) => setClientForm((p) => ({ ...p, training_format: ev.target.value }))}
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
                <option value="">Preferred coaching format</option>
                <option value="Remote coaching (virtual sessions)">Remote coaching (virtual sessions)</option>
                <option value="In-person coaching (gym or studio)">In-person coaching (gym or studio)</option>
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
                  color: "var(--on-accent)",
                  padding: 14,
                  fontWeight: 600,
                  cursor: clientSubmitting ? "wait" : "pointer"
                }}
              >
                {clientSubmitting ? "Sending request…" : "Send Coaching Request"}
              </button>
            </form>
          
        </div>
      </section>

      {/* 12. APPLY FORM */}
      <section id="apply" ref={applyRef} className="pad" style={{ padding: "76px 36px", background: "var(--bg-primary)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <h2 className="reveal" data-reveal style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(42px,5vw,74px)", margin: 0 }}>
            Apply for early access — limited spots this month
          </h2>
          <p className="reveal" data-reveal style={{ margin: "14px 0 0", color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.65, maxWidth: 640 }}>
            We review every application personally. Serious coaches only. If approved, your credentials arrive within 24 hours.
          </p>
          <>
              <div className="reveal apply-urgency-bar" data-reveal style={{ marginTop: 22 }}>
                <div className="apply-urgency-left">
                  <span>⏱ Avg response: under 4 hours</span>
                  <span className="apply-urgency-sep">·</span>
                  <span>🔒 Every application reviewed personally</span>
                  <span className="apply-urgency-sep">·</span>
                  <span>👥 23 trainers approved last month</span>
                </div>
                <div className="apply-urgency-badge">12 spots left</div>
              </div>
              <form
                className="reveal stack-2"
                data-reveal
                onSubmit={async (e) => {
                e.preventDefault();
                setApplyError("");
                setApplySubmitting(true);
                try {
                  const payload =
                    applyJoinType === "individual"
                      ? {
                          full_name: applyForm.full_name.trim(),
                          email: applyForm.email.trim(),
                          phone: applyForm.phone.trim(),
                          gym_name: applyForm.gym_name.trim(),
                          city: applyForm.city.trim(),
                          message: applyForm.message.trim(),
                          request_type: "individual"
                        }
                      : {
                          full_name: enterpriseForm.your_name.trim(),
                          email: enterpriseForm.work_email.trim(),
                          phone: enterpriseForm.phone.trim(),
                          gym_name: enterpriseForm.business_name.trim(),
                          city: enterpriseForm.business_type.trim(),
                          request_type: "enterprise",
                          message: [
                            "Enterprise / Business Request",
                            `Business Type: ${enterpriseForm.business_type.trim() || "—"}`,
                            `Trainers to onboard: ${enterpriseForm.trainers_to_onboard.trim() || "—"}`,
                            `Approx active clients: ${enterpriseForm.active_clients.trim() || "—"}`,
                            `Need white-labeling: ${enterpriseForm.white_labeling}`,
                            `Need custom integrations: ${enterpriseForm.custom_integrations}`,
                            enterpriseForm.notes.trim() ? `Notes: ${enterpriseForm.notes.trim()}` : ""
                          ]
                            .filter(Boolean)
                            .join(" | ")
                        };
                  const r = await fetch(`${getApiSiteBase()}/api/trainer-requests`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                  });
                  const data = await r.json().catch(() => ({}));
                  if (!r.ok || data?.error) {
                    throw new Error(data?.error || "Could not submit application.");
                  }
                  setSubmittedJoinType(applyJoinType);
                  setSubmitted(false);
                  setApplyForm({
                    full_name: "",
                    email: "",
                    phone: "",
                    gym_name: "",
                    city: "",
                    message: ""
                  });
                  setEnterpriseForm({
                    business_name: "",
                    your_name: "",
                    business_type: "",
                    trainers_to_onboard: "",
                    active_clients: "",
                    white_labeling: "No",
                    custom_integrations: "No",
                    work_email: "",
                    phone: "",
                    notes: ""
                  });
                  setSubmitNotice({
                    title: applyJoinType === "enterprise" ? "Enterprise Request Submitted" : "Application Submitted Successfully",
                    message:
                      applyJoinType === "enterprise"
                        ? "Thank you for your enterprise interest. Our onboarding team will contact you within 24 hours to schedule your consultation."
                        : "Thank you for applying to FitBase. Our team will review your profile and get back to you with the next steps shortly."
                  });
                } catch (err: unknown) {
                  setApplyError(err instanceof Error ? err.message : "Something went wrong.");
                } finally {
                  setApplySubmitting(false);
                }
              }}
                style={{ marginTop: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
              >
              <div className="apply-join-shell">
                <div className="apply-join-head">
                  <div>
                    <p className="apply-join-kicker">Access Path</p>
                    <label className="apply-join-label">How are you joining FitBase?</label>
                  </div>
                  <p className="apply-join-note">Elite onboarding for individual or enterprise teams</p>
                </div>
                <div className="apply-join-toggle" role="radiogroup" aria-label="How are you joining FitBase?">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={applyJoinType === "individual"}
                    data-active={applyJoinType === "individual"}
                    className="apply-join-pill"
                    onClick={() => setApplyJoinType("individual")}
                  >
                    <span aria-hidden>🧑</span>
                    <span>Individual Trainer</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={applyJoinType === "enterprise"}
                    data-active={applyJoinType === "enterprise"}
                    className="apply-join-pill"
                    onClick={() => setApplyJoinType("enterprise")}
                  >
                    <span aria-hidden>🏢</span>
                    <span>Enterprise / Business</span>
                  </button>
                </div>
              </div>
              {applyJoinType === "individual" ? (
                <div className="apply-mode-panel">
                  <input
                    required
                    placeholder="Full Name*"
                    value={applyForm.full_name}
                    onChange={(ev) => setApplyForm((p) => ({ ...p, full_name: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email*"
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
                </div>
              ) : (
                <div className="apply-mode-panel">
                  <input
                    required
                    placeholder="Business / Gym Name*"
                    value={enterpriseForm.business_name}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, business_name: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
                  />
                  <input
                    required
                    placeholder="Your Name*"
                    value={enterpriseForm.your_name}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, your_name: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
                  />
                  <select
                    required
                    value={enterpriseForm.business_type}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, business_type: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer" }}
                  >
                    <option value="">Business Type*</option>
                    <option value="Gym / Fitness Studio">Gym / Fitness Studio</option>
                    <option value="Corporate Wellness">Corporate Wellness</option>
                    <option value="Sports Academy">Sports Academy</option>
                    <option value="Rehabilitation Center">Rehabilitation Center</option>
                    <option value="Other">Other</option>
                  </select>
                  <select
                    required
                    value={enterpriseForm.trainers_to_onboard}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, trainers_to_onboard: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer" }}
                  >
                    <option value="">Number of Trainers to Onboard*</option>
                    <option value="2–5">2–5</option>
                    <option value="6–15">6–15</option>
                    <option value="16–30">16–30</option>
                    <option value="30+">30+</option>
                  </select>
                  <select
                    required
                    value={enterpriseForm.active_clients}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, active_clients: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer" }}
                  >
                    <option value="">Approximate Active Clients*</option>
                    <option value="Under 100">Under 100</option>
                    <option value="100–500">100–500</option>
                    <option value="500–1000">500–1000</option>
                    <option value="1000+">1000+</option>
                  </select>
                  <select
                    value={enterpriseForm.white_labeling}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, white_labeling: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer" }}
                  >
                    <option value="No">Do you need White-Labeling? — No</option>
                    <option value="Yes">Do you need White-Labeling? — Yes</option>
                  </select>
                  <select
                    value={enterpriseForm.custom_integrations}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, custom_integrations: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer" }}
                  >
                    <option value="No">Do you need Custom Integrations? — No</option>
                    <option value="Yes">Do you need Custom Integrations? — Yes</option>
                  </select>
                  <input
                    required
                    type="email"
                    placeholder="Work Email*"
                    value={enterpriseForm.work_email}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, work_email: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
                  />
                  <input
                    required
                    placeholder="Phone Number*"
                    value={enterpriseForm.phone}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, phone: ev.target.value }))}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-card)", color: "var(--text-primary)" }}
                  />
                  <textarea
                    placeholder="Anything else you'd like us to know? (optional)"
                    value={enterpriseForm.notes}
                    onChange={(ev) => setEnterpriseForm((p) => ({ ...p, notes: ev.target.value }))}
                    style={{ gridColumn: "1 / -1", border: "1px solid var(--border)", borderRadius: 8, padding: 12, minHeight: 100, background: "var(--bg-card)", color: "var(--text-primary)" }}
                  />
                </div>
              )}
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
                  color: "var(--on-accent)",
                  padding: 12,
                  fontWeight: 600,
                  cursor: applySubmitting ? "wait" : "pointer",
                  opacity: applySubmitting ? 0.85 : 1
                }}
              >
                {applySubmitting ? "Submitting…" : applyJoinType === "enterprise" ? "Request Enterprise Consultation" : "Submit Trainer Application"}
              </button>
                <div
                  style={{
                    gridColumn: "1 / -1",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 16,
                    justifyContent: "center",
                    marginTop: 16
                  }}
                >
                  {[
                    ["🔒", "No credit card required"],
                    ["✓", "Cancel anytime"],
                    ["💬", "Setup support included"]
                  ].map(([ic, lab]) => (
                    <div key={lab} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
                      <span aria-hidden>{ic}</span>
                      <span>{lab}</span>
                    </div>
                  ))}
                </div>
              </form>
            </>
        </div>
      </section>

      {submitNotice ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSubmitNotice(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            background: "rgba(0,0,0,.52)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              background: "var(--bg-card)",
              border: "1px solid var(--accent-border)",
              borderRadius: 14,
              boxShadow: "0 20px 44px rgba(0,0,0,.24)",
              padding: 22
            }}
          >
            <div style={{ color: "var(--green)", fontSize: 26, marginBottom: 8 }}>✓</div>
            <h3 style={{ margin: 0, fontSize: 20, color: "var(--text-primary)" }}>{submitNotice.title}</h3>
            <p style={{ margin: "10px 0 0", color: "var(--text-secondary)", lineHeight: 1.65 }}>
              {submitNotice.message}
            </p>
            <button
              type="button"
              onClick={() => setSubmitNotice(null)}
              style={{
                marginTop: 16,
                border: "none",
                borderRadius: 10,
                background: "var(--accent)",
                color: "var(--on-accent)",
                padding: "11px 16px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

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
        <div
          style={{
            marginTop: 32,
            padding: "clamp(20px, 4vw, 36px) max(20px, env(safe-area-inset-left, 0px))",
            paddingRight: "max(20px, env(safe-area-inset-right, 0px))",
            background: "#0a0a0a",
            borderTop: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center"
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              color: "rgba(255,255,255,0.55)",
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontWeight: 600
            }}
          >
            Co-powered by Bodybank.fit
          </p>
          <a
            href="https://bodybank.fit"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              lineHeight: 0,
              borderRadius: 8,
              maxWidth: "min(260px, 84vw)"
            }}
            aria-label="Visit Bodybank.fit"
          >
            <img
              src="/img/Bodybank%20logo.png"
              alt="Bodybank"
              width={260}
              height={52}
              loading="lazy"
              decoding="async"
              style={{
                width: "auto",
                maxWidth: "100%",
                maxHeight: 48,
                height: "auto",
                objectFit: "contain",
                objectPosition: "50% 50%",
                display: "block"
              }}
            />
          </a>
          <a
            href="https://bodybank.fit"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: 10,
              color: "var(--accent)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "0.04em"
            }}
          >
            bodybank.fit
          </a>
        </div>
      </footer>
    </main>
  );
}
