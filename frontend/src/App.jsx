/**
 * App — TEMPORARY preview mode.
 * Renders EmployeeDashboard directly for quick viewing, wrapped in the same
 * providers the real app tree gives it (BrowserRouter for useNavigate(),
 * AuthProvider for useAuth(), SearchProvider in case Navbar needs it).
 *
 * Swap back to the commented-out AppRouter version below once you're
 * ready to view this through real routing/auth instead.
 */

import { useEffect } from "react";
import { AuthProvider } from "./context/AuthContext.jsx";
import { SearchProvider } from "./context/SearchContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { ErrorBoundary } from "./components/shared/ErrorBoundary.jsx";
import { initApm } from "./lib/apm.js";
import AppRouter from "./routes/AppRouter.jsx";

export default function App() {
  useEffect(() => {
    initApm();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <SearchProvider>
          <ToastProvider>
            <AppRouter />
          </ToastProvider>
        </SearchProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
