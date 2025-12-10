import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Home from './pages/Home';
import Admin from './pages/Admin';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// --- Redirect Handler for GitHub Pages 404 Hack ---
const RedirectHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // CRITICAL FIX: HashRouter's useSearchParams only looks at the hash part (e.g. #/page?q=1)
    // But our 404.html puts the param in the main URL (e.g. /?redirect=/admin)
    // So we MUST use window.location.search to read it.
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');

    if (redirect) {
      console.log(`[Router] Redirecting to ${redirect}`);
      // Navigate to the correct route
      navigate(redirect, { replace: true });
    }
  }, [navigate]);

  return null;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <RedirectHandler />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
