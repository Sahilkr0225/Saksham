import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut } from 'lucide-react';
import styles from './Topbar.module.css';
import { useAuth } from '../../context/AuthContext';

interface TopbarProps {
  title: string;
}

const Topbar: React.FC<TopbarProps> = ({ title }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.name || 'Admin';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AD';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className={styles.topbar}>
      <h1 className={styles.pageTitle}>{title}</h1>

      <div className={styles.controls}>
        {/* Search */}
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input type="text" placeholder="Search anything..." className={styles.searchInput} />
        </div>

        {/* Notification Bell */}
        <button className={styles.iconBtn} title="Notifications">
          <Bell size={18} />
          <span className={styles.badge}>3</span>
        </button>

        {/* User Avatar */}
        <div className={styles.avatar} title={`Logged in as ${displayName}`}>
          {initials}
        </div>

        {/* Logout */}
        <button className={styles.iconBtn} title="Sign out" onClick={handleLogout}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};

export default Topbar;

