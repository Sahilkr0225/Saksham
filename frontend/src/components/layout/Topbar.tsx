import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut, Menu } from 'lucide-react';
import styles from './Topbar.module.css';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import NotificationDrawer from './NotificationDrawer';

interface TopbarProps {
  title: string;
  onToggleSidebar?: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ title, onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const displayName = user?.name || 'Admin';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AD';

  const fetchUnreadCount = async () => {
    try {
      const res = await apiClient.get('/notifications/unread-count');
      if (res.data?.success) {
        setUnreadCount(res.data.data?.unread_count ?? 0);
      }
    } catch {
      // Gracefully suppress if session is not yet active
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    // Refresh unread count every 60 seconds
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.titleContainer}>
          <button
            className={styles.menuBtn}
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
            title="Open menu"
          >
            <Menu size={20} />
          </button>
          <h1 className={styles.pageTitle}>{title}</h1>
        </div>

        <div className={styles.controls}>
          {/* Search */}
          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} />
            <input type="text" placeholder="Search anything..." className={styles.searchInput} />
          </div>

          {/* Notification Bell */}
          <button
            className={styles.iconBtn}
            title="Notifications"
            onClick={() => setIsDrawerOpen(true)}
            aria-label={`Notifications (${unreadCount} unread)`}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className={styles.badge}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
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

      {/* Slide-out Notification Drawer */}
      <NotificationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onUnreadCountChange={(count) => setUnreadCount(count)}
      />
    </>
  );
};

export default Topbar;
