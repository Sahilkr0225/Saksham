import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  ClipboardList,
  Users,
  UserCheck,
  BookOpen,
  DollarSign,
  Bell,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  CalendarCheck,
  Award,
  FileText,
  BarChart3,
  Settings as SettingsIcon,
  HelpCircle,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import styles from './Sidebar.module.css';

const navItems = [
  { to: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { to: '/academics', icon: <Layers size={20} />, label: 'Academics' },
  { to: '/admissions', icon: <ClipboardList size={20} />, label: 'Admissions' },
  { to: '/students', icon: <GraduationCap size={20} />, label: 'Students' },
  { to: '/parents', icon: <Users size={20} />, label: 'Parents' },
  { to: '/teachers', icon: <UserCheck size={20} />, label: 'Teachers' },
  { to: '/attendance', icon: <CalendarCheck size={20} />, label: 'Attendance' },
  { to: '/homework', icon: <BookOpen size={20} />, label: 'Homework' },
  { to: '/exams', icon: <Award size={20} />, label: 'Exams & Results' },
  { to: '/fees', icon: <DollarSign size={20} />, label: 'Fee Management' },
  { to: '/notices', icon: <Bell size={20} />, label: 'Notices & Events' },
  { to: '/documents', icon: <FileText size={20} />, label: 'Documents' },
  { to: '/reports', icon: <BarChart3 size={20} />, label: 'Reports' },
  { to: '/settings', icon: <SettingsIcon size={20} />, label: 'Settings' },
  { to: '/support', icon: <HelpCircle size={20} />, label: 'Help & Support' },
  { to: '/gallery', icon: <ImageIcon size={20} />, label: 'Gallery & Media' },
];

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen = false, onCloseMobile }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${
        isMobileOpen ? styles.mobileOpen : ''
      }`}
    >
      {/* Brand Logo & Mobile Close */}
      <div className={styles.brand}>
        <div className={styles.brandContent}>
          <div className={styles.brandIcon}>
            <GraduationCap size={22} color="#fff" />
          </div>
          {!collapsed && <span className={styles.brandName}>Saksham</span>}
        </div>

        {/* Close button visible only on mobile drawer */}
        <button
          className={styles.mobileCloseBtn}
          onClick={onCloseMobile}
          aria-label="Close navigation"
          title="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
            {collapsed && (
              <span className={styles.tooltip}>{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse Toggle (Desktop only) */}
      <button
        className={styles.collapseBtn}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
};

export default Sidebar;
