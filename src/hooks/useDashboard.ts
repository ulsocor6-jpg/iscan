import { useEffect, useState } from "react";

const API = "/api/v1/dashboard/";

export function useDashboard() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(API, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json) {
        setDashboard(json.data);
      } else {
        setError(json.message || "Failed to load dashboard");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return { dashboard, loading, error, reload: load };
}
