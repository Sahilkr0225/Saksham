import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Admissions from './pages/Admissions';
import Academics from './pages/Academics';
import Teachers from './pages/Teachers';
import Parents from './pages/Parents';
import Attendance from './pages/Attendance';
import Homework from './pages/Homework';
import Fees from './pages/Fees';
import Landing from './pages/Landing';
import DashboardLayout from './components/layout/DashboardLayout';
import { AuthProvider } from './context/AuthContext';

// Placeholder pages for modules — to be fully built next
const Placeholder = ({ name }: { name: string }) => (
  <div style={{ padding: '40px 0', fontFamily: 'Inter, sans-serif' }}>
    <h2 style={{ fontSize: '1.5rem', color: '#0f172a' }}>{name}</h2>
    <p style={{ color: '#64748b', marginTop: '8px' }}>This module is being built. Coming up next!</p>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* ── Public Website Routes ── */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/demo" element={<Landing />} />

          {/* ── Protected / Dashboard Routes ── */}
          <Route element={<DashboardLayout title="Saksham School Portal" />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/academics" element={<Academics />} />
            <Route path="/admissions" element={<Admissions />} />
            <Route path="/students" element={<Students />} />
            <Route path="/parents" element={<Parents />} />
            <Route path="/teachers" element={<Teachers />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/homework" element={<Homework />} />
            <Route path="/fees" element={<Fees />} />
            <Route path="/notices" element={<Placeholder name="Notices & Events" />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

