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
