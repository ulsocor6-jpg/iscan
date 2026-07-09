import { useState, useEffect, useCallback, useRef } from "react";

const api = (url: string, opts: any = {}) =>
  fetch(url, { credentials: "include", ...opts }).then((r) => r.json());

export function useFlowerOrderWatcher() {
  const [order, setOrder] = useState<any>(null);
  const [retrying, setRetrying] = useState(false);
  const dismissedOrderId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await api("/api/v1/flower/mine/active");
        if (active && res.success) setOrder(res.order);
      } catch {
        // network hiccup — next poll will retry, don't surface this
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const retry = useCallback(async () => {
    if (!order) return;
    setRetrying(true);
    try {
      const res = await api(`/api/v1/flower/${order.orderId}/retry`, { method: "POST" });
      if (res.success) setOrder(res.order);
      else setOrder((o: any) => (o ? { ...o, failureReason: res.error } : o));
    } finally {
      setRetrying(false);
    }
  }, [order]);

  const dismiss = useCallback(() => {
    if (order) dismissedOrderId.current = order.orderId;
    setOrder((o: any) => (o ? { ...o } : o));
  }, [order]);

  const isFailed = !!order && String(order.status).startsWith("FAILED");
  const isDismissed = !!order && dismissedOrderId.current === order.orderId;

  return {
    order,
    failed: isFailed && !isDismissed,
    retrying,
    retry,
    dismiss,
  };
}
