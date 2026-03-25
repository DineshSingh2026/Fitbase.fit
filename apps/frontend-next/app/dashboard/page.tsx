import dynamic from "next/dynamic";

export default dynamic(() => import("./dashboard-client"), {
  ssr: false,
  loading: () => <main style={{ minHeight: "100dvh", background: "var(--bg-primary)" }} aria-busy="true" />
});
