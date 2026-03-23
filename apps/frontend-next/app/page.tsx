import { redirect } from "next/navigation";

const APP_SITE_URL =
  process.env.NEXT_PUBLIC_APP_SITE_URL ||
  process.env.NEXT_PUBLIC_LEGACY_SITE_URL ||
  "http://localhost:3200/";

export default function Page() {
  const target = APP_SITE_URL.replace(/\/+$/, "");
  redirect(`${target}/fitbase.html`);
}
