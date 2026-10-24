import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, GraduationCap, DollarSign, ClipboardList, TrendingUp, Bell
} from 'lucide-react';
import styles from './Dashboard.module.css';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface StatItemState {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  change: string;
  loading: boolean;
  error: boolean;
}

// Temporary preview activity data until dedicated activity/audit log endpoint is integrated
const recentActivity = [
  { message: 'New admission submitted for Aryan Mehta', time: '5 min ago', type: 'admission' },
  { message: 'Fee payment of ₹12,000 received from Priya Sharma', time: '22 min ago', type: 'fee' },
  { message: 'Homework "Algebra - Chapter 5" assigned to Class 9A', time: '1 hr ago', type: 'homework' },
  { message: 'Notice: Annual Sports Day scheduled for Oct 20', time: '3 hrs ago', type: 'notice' },
  { message: 'Parent profile updated for Rajesh Kumar', time: 'Yesterday', type: 'parent' },
];

const typeColor: Record<string, string> = {
  admission: '#6366f1',
  fee: '#10b981',
  homework: '#f59e0b',
  notice: '#ec4899',
  parent: '#0ea5e9',
};

const formatCurrencyINR = (amount: number): string => {
  if (isNaN(amount) || amount === 0) return '₹0';
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2).replace(/\.00$/, '')}Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2).replace(/\.00$/, '')}L`;
  }
  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatItemState[]>([
    {
      label: 'Total Students',
      value: '',
      icon: <GraduationCap size={22} />,
      color: '#6366f1',
      change: '',
      loading: true,
      error: false,
    },
    {
      label: 'Total Parents',
      value: '',
      icon: <Users size={22} />,
      color: '#ec4899',
      change: '',
      loading: true,
      error: false,
    },
    {
      label: 'Fee Collected',
      value: '',
      icon: <DollarSign size={22} />,
      color: '#10b981',
      change: '',
      loading: true,
      error: false,
    },
    {
      label: 'Admissions',
      value: '',
      icon: <ClipboardList size={22} />,
      color: '#f59e0b',
      change: '',
      loading: true,
      error: false,
    },
  ]);

  useEffect(() => {
    let isMounted = true;

    const fetchKPIs = async () => {
      const [studentsRes, parentsRes, feesRes, admissionsRes, admissionsPendingRes] = await Promise.allSettled([
        apiClient.get('/students?limit=1'),
        apiClient.get('/parents?limit=1'),
        apiClient.get('/fees/analytics/summary'),
        apiClient.get('/admissions?limit=1'),
        apiClient.get('/admissions?status=submitted&limit=1'),
      ]);

      if (!isMounted) return;

      setStats((prev) => [
        // 1. Total Students
        (() => {
          const item = { ...prev[0], loading: false };
          if (studentsRes.status === 'fulfilled' && studentsRes.value.data?.success) {
            const total = studentsRes.value.data.data?.pagination?.total;
            if (typeof total === 'number') {
              item.value = total.toLocaleString('en-IN');
              item.change = 'Total registered';
              item.error = false;
              return item;
            }
          }
          item.value = '—';
          item.change = studentsRes.status === 'rejected' && studentsRes.reason?.response?.status === 403
            ? 'Access restricted'
            : 'Unavailable';
          item.error = true;
          return item;
        })(),

        // 2. Total Parents
        (() => {
          const item = { ...prev[1], loading: false };
          if (parentsRes.status === 'fulfilled' && parentsRes.value.data?.success) {
            const total = parentsRes.value.data.data?.pagination?.total;
            if (typeof total === 'number') {
              item.value = total.toLocaleString('en-IN');
              item.change = 'Total linked guardians';
              item.error = false;
              return item;
            }
          }
          item.value = '—';
          item.change = parentsRes.status === 'rejected' && parentsRes.reason?.response?.status === 403
            ? 'Access restricted'
            : 'Unavailable';
          item.error = true;
          return item;
        })(),

        // 3. Fee Collected
        (() => {
          const item = { ...prev[2], loading: false };
          if (feesRes.status === 'fulfilled' && feesRes.value.data?.success) {
            const summary = feesRes.value.data.data?.summary;
            if (summary && summary.total_collected !== undefined) {
              const collectedNum = parseFloat(summary.total_collected) || 0;
              item.value = formatCurrencyINR(collectedNum);
              const rate = summary.collection_rate_percent;
              item.change = rate !== undefined ? `${rate}% collection rate` : 'All sessions';
              item.error = false;
              return item;
            }
          }
          item.value = '—';
          item.change = feesRes.status === 'rejected' && feesRes.reason?.response?.status === 403
            ? 'Access restricted'
            : 'Unavailable';
          item.error = true;
          return item;
        })(),

        // 4. Admissions
        (() => {
          const item = { ...prev[3], loading: false };
          if (admissionsRes.status === 'fulfilled' && admissionsRes.value.data?.success) {
            const total = admissionsRes.value.data.data?.pagination?.total;
            if (typeof total === 'number') {
              item.value = total.toLocaleString('en-IN');
              let pendingCount = 0;
              if (admissionsPendingRes.status === 'fulfilled' && admissionsPendingRes.value.data?.success) {
                pendingCount = admissionsPendingRes.value.data.data?.pagination?.total || 0;
              }
              item.change = `${pendingCount} pending review`;
              item.error = false;
              return item;
            }
          }
          item.value = '—';
          item.change = admissionsRes.status === 'rejected' && admissionsRes.reason?.response?.status === 403
            ? 'Access restricted'
            : 'Unavailable';
          item.error = true;
          return item;
        })(),
      ]);
    };

    fetchKPIs();

    return () => {
      isMounted = false;
    };
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = user?.name ? user.name.split(' ')[0] : 'Admin';

  return (
    <div className={styles.page}>
      <div className={styles.greeting}>
        <h2>{getGreeting()}, {displayName} 👋</h2>
        <p>Here's what's happening at Saksham today.</p>
      </div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: `${stat.color}1a`, color: stat.color }}>
              {stat.icon}
            </div>
            <div className={styles.statInfo}>
              {stat.loading ? (
                <>
                  <span className={styles.skeletonValue} />
                  <span className={styles.statLabel}>{stat.label}</span>
                  <span className={styles.skeletonChange} />
                </>
              ) : (
                <>
                  <span className={`${styles.statValue} ${stat.error ? styles.errorValue : ''}`}>
                    {stat.value}
                  </span>
                  <span className={styles.statLabel}>{stat.label}</span>
                  <span
                    className={`${styles.statChange} ${
                      stat.error ? styles.errorChange : styles.statChangeNeutral
                    }`}
                  >
                    {stat.change}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row: Activity Feed + Quick Actions */}
      <div className={styles.bottomGrid}>
        {/* Activity Feed */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <TrendingUp size={18} />
            <h3>Recent Activity</h3>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto', fontWeight: 500 }}>
              (Preview)
            </span>
          </div>
          <ul className={styles.activityList}>
            {recentActivity.map((item, idx) => (
              <li key={idx} className={styles.activityItem}>
                <span
                  className={styles.activityDot}
                  style={{ background: typeColor[item.type] }}
                />
                <div className={styles.activityText}>
                  <span>{item.message}</span>
                  <span className={styles.activityTime}>{item.time}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Actions */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Bell size={18} />
            <h3>Quick Actions</h3>
          </div>
          <div className={styles.quickActions}>
            {[
              { label: 'New Admission', color: '#6366f1', href: '/admissions' },
              { label: 'Record Fee', color: '#10b981', href: '/fees' },
              { label: 'Assign Homework', color: '#f59e0b', href: '/homework' },
              { label: 'Post Notice', color: '#ec4899', href: '/notices' },
            ].map((action) => (
              <Link
                key={action.label}
                to={action.href}
                className={styles.quickBtn}
                style={{ borderColor: action.color + '44', color: action.color, background: action.color + '12' }}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

