import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  CheckCheck,
  X,
  Trash2,
  DollarSign,
  CalendarCheck,
  BookOpen,
  Award,
  UserPlus,
  FileText,
  Megaphone,
  Loader2
} from 'lucide-react';
import { apiClient } from '../../api/client';
import styles from './NotificationDrawer.module.css';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'system' | 'notice' | 'fee' | 'attendance' | 'homework' | 'exam' | 'admission' | 'document';
  link?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onUnreadCountChange
}) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [markingAll, setMarkingAll] = useState<boolean>(false);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/notifications', {
        params: {
          unread_only: filter === 'unread' ? 'true' : undefined,
          limit: 30
        }
      });
      if (res.data?.success) {
        setNotifications(res.data.data || []);
        const unread = res.data.pagination?.unread_count ?? 0;
        setUnreadCount(unread);
        onUnreadCountChange(unread);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, filter]);

  const handleMarkAsRead = async (id: string, link?: string | null) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => {
        const next = Math.max(0, prev - 1);
        onUnreadCountChange(next);
        return next;
      });
      if (link) {
        onClose();
        navigate(link);
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setMarkingAll(true);
      await apiClient.patch('/notifications/mark-all-read');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      onUnreadCountChange(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiClient.delete(`/notifications/${id}`);
      setNotifications((prev) => {
        const item = prev.find((n) => n.id === id);
        if (item && !item.is_read) {
          setUnreadCount((count) => {
            const next = Math.max(0, count - 1);
            onUnreadCountChange(next);
            return next;
          });
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'fee':
        return <DollarSign size={18} />;
      case 'notice':
        return <Megaphone size={18} />;
      case 'attendance':
        return <CalendarCheck size={18} />;
      case 'homework':
        return <BookOpen size={18} />;
      case 'exam':
        return <Award size={18} />;
      case 'admission':
        return <UserPlus size={18} />;
      case 'document':
        return <FileText size={18} />;
      default:
        return <Bell size={18} />;
    }
  };

  const getTypeClass = (type: string) => {
    switch (type) {
      case 'fee': return styles.typeFee;
      case 'notice': return styles.typeNotice;
      case 'attendance': return styles.typeAttendance;
      case 'homework': return styles.typeHomework;
      case 'exam': return styles.typeExam;
      case 'admission': return styles.typeAdmission;
      default: return styles.typeSystem;
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>Notifications</h2>
            {unreadCount > 0 && (
              <span className={styles.countChip}>{unreadCount} new</span>
            )}
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close notifications"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter Tabs & Quick Action */}
        <div className={styles.actionsBar}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${filter === 'all' ? styles.tabActive : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`${styles.tabBtn} ${filter === 'unread' ? styles.tabActive : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unread
            </button>
          </div>
          <button
            className={styles.markAllBtn}
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0 || markingAll}
            title="Mark all as read"
          >
            <CheckCheck size={16} />
            <span>Mark all read</span>
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className={styles.loadingSpinner}>
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <BellOff size={28} />
            </div>
            <h3 className={styles.emptyTitle}>No notifications yet</h3>
            <p className={styles.emptySubtitle}>
              {filter === 'unread'
                ? "You're all caught up with unread notifications!"
                : 'All school alerts and updates will show up here.'}
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {notifications.map((item) => (
              <div
                key={item.id}
                className={`${styles.item} ${!item.is_read ? styles.itemUnread : ''}`}
                onClick={() => handleMarkAsRead(item.id, item.link)}
              >
                <div className={`${styles.iconWrapper} ${getTypeClass(item.type)}`}>
                  {getTypeIcon(item.type)}
                </div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitleRow}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    {!item.is_read && <span className={styles.unreadDot} />}
                  </div>
                  <p className={styles.itemMessage}>{item.message}</p>
                  <div className={styles.itemFooter}>
                    <span className={styles.itemTime}>{formatTime(item.created_at)}</span>
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Delete notification"
                      aria-label="Delete notification"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationDrawer;
