// src/hooks/useAdminAlerts.ts
// Drop this file into src/hooks/
// Polls every 15 s for new PHP deposits & withdrawal requests.
// Returns: alerts array, unread count, and a function to mark all read.

import { useState, useEffect, useCallback, useRef } from "react";

export type AlertType = "deposit" | "withdrawal";

export interface AdminAlert {
  id: string;
  type: AlertType;
  title: string;
  body: string;
  amount: number;
  user: string;
  createdAt: string;
  read: boolean;
}

const POLL_MS = 15_000;

async function fetchAlerts(): Promise<AdminAlert[]> {
  try {
    const [depRes, wdRes] = await Promise.all([
      fetch("/api/v1/admin/deposits/pending",   { credentials: "include" }),
      fetch("/api/v1/admin/withdrawals/pending", { credentials: "include" }),
    ]);
    const depData = depRes.ok ? await depRes.json() : { deposits: [] };
    const wdData  = wdRes.ok  ? await wdRes.json()  : { withdrawals: [] };

    const deposits: AdminAlert[] = (depData.deposits || []).map((d: any) => ({
      id:        d._id,
      type:      "deposit" as AlertType,
      title:     "💰 New PHP Deposit",
      body:      `₱${(d.usdAmount ?? d.amount ?? 0).toFixed(2)} — ${d.token ?? "PHP"}`,
      amount:    d.usdAmount ?? d.amount ?? 0,
      user:      d.userId?.email ?? d.userId ?? "unknown",
      createdAt: d.createdAt,
      read:      false,
    }));

    const withdrawals: AdminAlert[] = (wdData.withdrawals || []).map((w: any) => ({
      id:        w._id,
      type:      "withdrawal" as AlertType,
      title:     "🏧 Withdrawal Request",
      body:      `₱${(w.amount ?? 0).toFixed(2)} via ${w.destinationType ?? w.channel ?? "—"}`,
      amount:    w.amount ?? 0,
      user:      w.userId?.email ?? w.userId ?? "unknown",
      createdAt: w.createdAt,
      read:      false,
    }));

    return [...deposits, ...withdrawals].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

export function useAdminAlerts(isAdmin: boolean) {
  const [alerts,   setAlerts]   = useState<AdminAlert[]>([]);
  const [toasts,   setToasts]   = useState<AdminAlert[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    if (!isAdmin) return;
    const fresh = await fetchAlerts();

    // Fire toasts only for truly new items
    const newOnes = fresh.filter(a => !seenIds.current.has(a.id));
    newOnes.forEach(a => seenIds.current.add(a.id));

    if (newOnes.length) {
      setToasts(prev => [...newOnes, ...prev].slice(0, 5));
      // Auto-dismiss each toast after 6 s
      newOnes.forEach(a => {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== a.id));
        }, 6_000);
      });
    }

    setAlerts(fresh.map(a => ({ ...a, read: seenIds.current.has(a.id) && !newOnes.find(n => n.id === a.id) })));
  }, [isAdmin]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const markAllRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
    setToasts([]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const unread = alerts.filter(a => !a.read).length;

  return { alerts, toasts, unread, markAllRead, dismissToast };
}
