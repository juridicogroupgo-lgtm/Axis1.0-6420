import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getStoredUser, setStoredUser, clearToken, setToken, apiJson } from "./api";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "gerente" | "loja" | "digitador";
  managerId?: string;
  storeId?: string;
  active: boolean;
}

interface AuthContextType {
  user: User | null;
  setUser: (u: User | null) => void;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  loading: true,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUserState(stored);
      // Verify token is still valid
      apiJson("/auth/me").then(data => {
        setUserState(data.user);
        setStoredUser(data.user);
      }).catch(() => {
        clearToken();
        setUserState(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  function setUser(u: User | null) {
    setUserState(u);
    if (u) setStoredUser(u);
    else clearToken();
  }

  function logout() {
    clearToken();
    setUserState(null);
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useRole() {
  const { user } = useAuth();
  return {
    role: user?.role,
    isAdmin: user?.role === "admin",
    isGerente: user?.role === "gerente",
    isLoja: user?.role === "loja",
    isDigitador: user?.role === "digitador",
    canCreateUsers: ["admin", "gerente", "loja"].includes(user?.role ?? ""),
    canSeeAllProposals: user?.role === "admin",
  };
}
