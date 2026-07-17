import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type BackgroundPref = { type: "none" | "preset" | "custom"; value: string };

const DEFAULT_BG: BackgroundPref = { type: "none", value: "" };

const BackgroundContext = createContext<{
  background: BackgroundPref;
  setBackground: (b: BackgroundPref) => void;
}>({
  background: DEFAULT_BG,
  setBackground: () => {},
});

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [background, setBackgroundState] = useState<BackgroundPref>(() => {
    try {
      const cached = localStorage.getItem("iscan_background");
      return cached ? JSON.parse(cached) : DEFAULT_BG;
    } catch {
      return DEFAULT_BG;
    }
  });

  useEffect(() => {
    fetch("/api/v1/user/background", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.background) {
          setBackgroundState(d.background);
          localStorage.setItem("iscan_background", JSON.stringify(d.background));
        }
      })
      .catch(() => {
        // silent — falls back to cached/local value
      });
  }, []);

  function setBackground(b: BackgroundPref) {
    setBackgroundState(b);
    localStorage.setItem("iscan_background", JSON.stringify(b));
  }

  return (
    <BackgroundContext.Provider value={{ background, setBackground }}>
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  return useContext(BackgroundContext);
}
