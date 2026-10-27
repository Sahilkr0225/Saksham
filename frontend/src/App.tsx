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
import Exams from './pages/Exams';
import Fees from './pages/Fees';
import Notices from './pages/Notices';
import Documents from './pages/Documents';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Support from './pages/Support';
import Gallery from './pages/Gallery';
import Landing from './pages/Landing';
import DashboardLayout from './components/layout/DashboardLayout';
import { AuthProvider } from './context/AuthContext';



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
            <Route path="/exams" element={<Exams />} />
            <Route path="/fees" element={<Fees />} />
            <Route path="/notices" element={<Notices />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/support" element={<Support />} />
            <Route path="/gallery" element={<Gallery />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

