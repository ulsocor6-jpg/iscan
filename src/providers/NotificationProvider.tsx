import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

type Notification = {
  id: number;
  type: string;
  data: any;
  createdAt: Date;
};

type NotificationContextType = {
  notifications: Notification[];
  unread: number;
  clearUnread: () => void;
};

const NotificationContext =
  createContext<NotificationContextType>({
    notifications: [],
    unread: 0,
    clearUnread: () => {}
  });

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {

    const es = new EventSource(
      "/api/v1/dashboard/stream",
      {
        withCredentials: true,
      }
    );

    es.onopen = () => {
      console.log("[SSE] Connected");
    };

    es.onmessage = (event) => {

      const payload = JSON.parse(event.data);

      console.log("[SSE]", payload);

      setNotifications(prev => [
        {
          id: Date.now(),
          type: payload.type,
          data: payload.data,
          createdAt: new Date()
        },
        ...prev
      ]);

      setUnread(x => x + 1);

    };

    es.onerror = () => {
      console.warn("[SSE] disconnected");
    };

    return () => es.close();

  }, []);

  const value = useMemo(() => ({
    notifications,
    unread,
    clearUnread: () => setUnread(0)
  }), [notifications, unread]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
