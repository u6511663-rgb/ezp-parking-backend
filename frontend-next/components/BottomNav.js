"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavButton({ href, label, isActive }) {
  return (
    <Link
      href={href}
      className={`nav-btn${isActive ? " active" : ""}`}
      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
    >
      {label}
    </Link>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <div className="bottom-nav">
      <NavButton href="/" label="Home" isActive={pathname === "/"} />
      <NavButton href="/alerts" label="Alerts" isActive={pathname === "/alerts"} />
      <NavButton href="/settings" label="Settings" isActive={pathname === "/settings"} />
    </div>
  );
}

