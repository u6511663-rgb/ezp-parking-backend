export function getApiBase() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
  return String(base).replace(/\/+$/, "");
}

