import { useState, useEffect } from "react";
import { getMe } from "../services/authService";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  authenticated: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    authenticated: false,
  });

  useEffect(() => {
    getMe()
      .then((data) => {
        setState({ user: data.user || data, loading: false, authenticated: true });
      })
      .catch(() => {
        setState({ user: null, loading: false, authenticated: false });
      });
  }, []);

  return state;
}
