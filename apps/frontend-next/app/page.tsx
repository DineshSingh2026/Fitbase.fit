const LEGACY_SITE_URL = process.env.NEXT_PUBLIC_LEGACY_SITE_URL || "http://localhost:3200/";

export default function Page() {
  return (
    <iframe
      className="legacy-frame"
      src={LEGACY_SITE_URL}
      title="FitBase"
      allow="clipboard-read; clipboard-write"
      loading="eager"
    />
  );
}
