"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.add("light");
    }
  }, [theme, mounted]);

  // Prevent hydration mismatch by rendering children only after mounting
  // Actually, wait, keeping children rendered is fine, we just want to avoid
  // flashing if possible, but the `useAppStore` defaults to 'light'.
  // However, local storage hydration in Zustand is async or immediate depending on setup.
  if (!mounted) {
    return <div style={{ visibility: "hidden" }}>{children}</div>;
  }

  return <>{children}</>;
}
