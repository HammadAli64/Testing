function normalizeBaseUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.port) u.port = "8000";
    return `${u.protocol}//${u.host}`;
  } catch {
    // Common typo guard: "127.0.0.8000" should be "127.0.0.1:8000".
    if (value.includes("127.0.0.8000")) return "http://127.0.0.1:8000";
    return null;
  }
}

export function getCoachApiBaseUrls(): string[] {
  const urls: string[] = [];
  const env = process.env.NEXT_PUBLIC_COACH_API_BASE_URL;
  const envUrl = env ? normalizeBaseUrl(env) : null;
  if (envUrl) urls.push(envUrl);
  // When the app is opened via LAN (e.g. http://192.168.x.x:3001), prefer the same host for Django.
  if (typeof window !== "undefined" && window.location?.hostname) {
    const h = window.location.hostname;
    if (h && h !== "localhost" && h !== "127.0.0.1") {
      const hostUrl = normalizeBaseUrl(`http://${h}:8000`);
      if (hostUrl) urls.push(hostUrl);
    }
  }
  urls.push("http://127.0.0.1:8000");
  urls.push("http://localhost:8000");
  if (typeof window !== "undefined" && window.location?.hostname) {
    const hostUrl = normalizeBaseUrl(`http://${window.location.hostname}:8000`);
    if (hostUrl && !urls.includes(hostUrl)) urls.push(hostUrl);
  }
  return Array.from(new Set(urls));
}

export function getCoachApiBaseUrl(): string {
  return getCoachApiBaseUrls()[0] ?? "http://127.0.0.1:8000";
}

export async function fetchCoach(path: string, init?: RequestInit): Promise<Response> {
  const fetchWithTimeout = async (url: string, req?: RequestInit): Promise<Response> => {
    if (req?.signal) return fetch(url, req);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(url, { ...req, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  };

  let lastErr: unknown = null;
  let lastRes: Response | null = null;
  for (const base of getCoachApiBaseUrls()) {
    try {
      const res = await fetchWithTimeout(`${base}${path}`, init);
      lastRes = res;
      if (res.ok) return res;
      // Wrong origin or overloaded service: try the next candidate.
      if (res.status >= 500) continue;
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastRes) return lastRes;
  throw lastErr instanceof Error ? lastErr : new Error("Failed to fetch coach API");
}

