import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';

import Login       from './pages/Login';
import Register    from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import MapView     from './pages/MapView';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login"        element={<Login />} />
          <Route path="/register"     element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          {/* Protected routes */}
          <Route
            path="/map"
            element={
              <ProtectedRoute>
                <MapView />
              </ProtectedRoute>
            }
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="*" element={<Navigate to="/"   replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
