/* eslint-disable @next/next/no-html-link-for-pages */
import type { NextPage } from "next";

const Custom404: NextPage = () => {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", textAlign: "center" }}>
      <div>
        <h1 style={{ fontSize: "2rem", fontWeight: 600, marginBottom: "0.75rem" }}>Page not found</h1>
        <p style={{ marginBottom: "1rem", color: "#475569" }}>This route does not exist in ReachIQ.</p>
        <a href="/" style={{ color: "#0f172a", textDecoration: "underline" }}>
          Return home
        </a>
      </div>
    </main>
  );
};

export default Custom404;
