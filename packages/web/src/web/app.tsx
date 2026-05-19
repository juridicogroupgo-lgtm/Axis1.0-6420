import { Route, Switch, Redirect, useLocation } from "wouter";
import { AgentFeedback } from "@runablehq/website-runtime";
import { Provider } from "./components/provider";
import { AuthProvider, useAuth } from "./lib/auth-context";

// Pages
import { LoginPage } from "./pages/login";
import { DashboardPage } from "./pages/dashboard";
import { EsteiraPage } from "./pages/esteira";
import { NovaProposta as NovaPropostaPage } from "./pages/nova-proposta";
import PropostaDetalhePage from "./pages/proposta-detalhe";
import SignPage from "./pages/sign";
import RelatoriosPage from "./pages/relatorios";
import UsuariosPage from "./pages/usuarios";
import LojasPage from "./pages/lojas";
import AuditoriaPage from "./pages/auditoria";
import ConfiguracoesPage from "./pages/configuracoes";

function ProtectedRoute({
  component: Component,
  roles,
}: {
  component: React.ComponentType;
  roles?: string[];
}) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function AppRoutes() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/login" component={LoginPage} />
      <Route path="/sign/:id" component={SignPage} />

      {/* Protected */}
      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route path="/esteira">
        <ProtectedRoute component={EsteiraPage} />
      </Route>
      <Route path="/propostas/nova">
        <ProtectedRoute component={NovaPropostaPage} />
      </Route>
      <Route path="/propostas/:id">
        <ProtectedRoute component={PropostaDetalhePage} />
      </Route>
      <Route path="/relatorios">
        <ProtectedRoute component={RelatoriosPage} />
      </Route>
      <Route path="/usuarios">
        <ProtectedRoute component={UsuariosPage} roles={["admin", "gerente"]} />
      </Route>
      <Route path="/lojas">
        <ProtectedRoute component={LojasPage} roles={["admin", "gerente"]} />
      </Route>
      <Route path="/auditoria">
        <ProtectedRoute component={AuditoriaPage} roles={["admin"]} />
      </Route>
      <Route path="/configuracoes">
        <ProtectedRoute component={ConfiguracoesPage} />
      </Route>

      {/* Default */}
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route>
        <Redirect to="/dashboard" />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <Provider>
      <AuthProvider>
        <AppRoutes />
        {import.meta.env.DEV && <AgentFeedback />}
      </AuthProvider>
    </Provider>
  );
}

export default App;
