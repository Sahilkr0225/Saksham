import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  Pin,
  PinOff,
  Calendar as CalendarIcon,
  Plus,
  Search,
  Trash2,
  Edit3,
  Eye,
  X,
  Clock,
  Users,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  Send,
  FileText
} from 'lucide-react';
import styles from './Notices.module.css';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface Notice {
  id: string;
  title: string;
  content: string;
  type: 'general' | 'academic' | 'event' | 'urgent';
  priority: 'low' | 'normal' | 'high';
  target_audience: 'all' | 'role' | 'class';
  target_role?: string | null;
  target_class_id?: string | null;
  academic_year_id?: string | null;
  published: boolean;
  published_at?: string | null;
  created_at: string;
  updated_at?: string;
  author_name?: string | null;
  class_name?: string | null;
}

export interface SchoolEvent {
  id: string;
  title: string;
  description?: string | null;
  event_type: 'exam' | 'holiday' | 'sports_day' | 'ptm' | 'cultural' | 'other';
  start_date: string;
  end_date?: string | null;
  target_audience: 'all' | 'class';
  target_class_id?: string | null;
  class_name?: string | null;
  created_at?: string;
}

export interface ClassItem {
  id: string;
  name: string;
  code?: string;
}

export interface AcademicYearItem {
  id: string;
  name: string;
  is_current?: boolean;
}

export const Notices: React.FC = () => {
  const { user } = useAuth();
  const userRole = (user?.role || '').toLowerCase();

  // Role permissions
  const isStudentOrParent = userRole === 'student' || userRole === 'parent';
  const canManageNotices = ['super_admin', 'principal', 'office_staff', 'teacher'].includes(userRole);
  const canPinNotices = ['super_admin', 'principal'].includes(userRole);
  const canManageEvents = ['super_admin', 'principal', 'office_staff'].includes(userRole);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'notices' | 'events'>('notices');

  // Data states
  const [notices, setNotices] = useState<Notice[]>([]);
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Notice Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterAudience, setFilterAudience] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Event Filters
  const [eventFilterType, setEventFilterType] = useState<string>('');

  // Modals
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState<boolean>(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);

  const [isEventModalOpen, setIsEventModalOpen] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<SchoolEvent | null>(null);

  const [viewingNotice, setViewingNotice] = useState<Notice | null>(null);

  // Form states for Notice
  const [noticeFormData, setNoticeFormData] = useState({
    title: '',
    content: '',
    type: 'general' as 'general' | 'academic' | 'event' | 'urgent',
    priority: 'normal' as 'low' | 'normal' | 'high',
    target_audience: 'all' as 'all' | 'role' | 'class',
    target_role: '',
    target_class_id: '',
    academic_year_id: '',
    published: true,
  });

  // Form states for Event
  const [eventFormData, setEventFormData] = useState({
    title: '',
    description: '',
    event_type: 'other' as 'exam' | 'holiday' | 'sports_day' | 'ptm' | 'cultural' | 'other',
    start_date: '',
    end_date: '',
    target_audience: 'all' as 'all' | 'class',
    target_class_id: '',
    academic_year_id: '',
  });

  const [submitting, setSubmitting] = useState<boolean>(false);

  // Auto-dismiss notification alerts
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Load Classes and Academic Years
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [classesRes, yearsRes] = await Promise.allSettled([
          apiClient.get('/academics/classes'),
          apiClient.get('/academics/years'),
        ]);

        if (classesRes.status === 'fulfilled' && classesRes.value.data?.data?.classes) {
          setClasses(classesRes.value.data.data.classes);
        }
        if (yearsRes.status === 'fulfilled' && yearsRes.value.data?.data?.academic_years) {
          setAcademicYears(yearsRes.value.data.data.academic_years);
        }
      } catch (err) {
        console.error('Failed to load classes/academic years:', err);
      }
    };

    fetchMetadata();
  }, []);

  // Fetch Notices
  const fetchNotices = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      if (isStudentOrParent) {
        // Students/Parents fetch personal targeted circulars
        const res = await apiClient.get('/notices/my');
        if (res.data.success && res.data.data?.notices) {
          setNotices(res.data.data.notices);
        }
      } else {
        // Staff/Teachers/Admins fetch all notices with filters
        const params: Record<string, string> = {};
        if (filterType) params.type = filterType;
        if (filterAudience) params.target_audience = filterAudience;
        if (filterStatus) params.status = filterStatus;
        if (searchQuery.trim()) params.search = searchQuery.trim();

        const res = await apiClient.get('/notices', { params });
        if (res.data.success && res.data.data?.notices) {
          setNotices(res.data.data.notices);
        }
      }
    } catch (err: any) {
      console.error('Fetch notices error:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load notices');
    } finally {
      setLoading(false);
    }
  }, [isStudentOrParent, filterType, filterAudience, filterStatus, searchQuery]);

  // Fetch Events
  const fetchEvents = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (eventFilterType) params.event_type = eventFilterType;

      const res = await apiClient.get('/notices/events', { params });
      if (res.data.success && res.data.data?.events) {
        setEvents(res.data.data.events);
      }
    } catch (err: any) {
      console.error('Fetch events error:', err);
    }
  }, [eventFilterType]);

  // Trigger data fetches
  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Client-side search & priority filter for student/parent or fast filtering
  const filteredNotices = useMemo(() => {
    return notices.filter((n) => {
      if (filterPriority && n.priority !== filterPriority) return false;
      if (isStudentOrParent) {
        if (filterType && n.type !== filterType) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = n.title.toLowerCase().includes(q);
          const matchContent = n.content.toLowerCase().includes(q);
          if (!matchTitle && !matchContent) return false;
        }
      }
      return true;
    });
  }, [notices, filterPriority, filterType, searchQuery, isStudentOrParent]);

  // Metrics computation
  const metrics = useMemo(() => {
    const total = notices.length;
    const pinnedCount = notices.filter((n) => n.priority === 'high').length;
    const urgentCount = notices.filter((n) => n.type === 'urgent').length;
    const eventsCount = events.length;
    return { total, pinnedCount, urgentCount, eventsCount };
  }, [notices, events]);

  // ─── Modal Openers ──────────────────────────────────────────────────────────

  const handleOpenCreateNotice = () => {
    setEditingNotice(null);
    setNoticeFormData({
      title: '',
      content: '',
      type: 'general',
      priority: 'normal',
      target_audience: 'all',
      target_role: '',
      target_class_id: classes[0]?.id || '',
      academic_year_id: academicYears[0]?.id || '',
      published: true,
    });
    setIsNoticeModalOpen(true);
  };

  const handleOpenEditNotice = (n: Notice) => {
    setEditingNotice(n);
    setNoticeFormData({
      title: n.title,
      content: n.content,
      type: n.type,
      priority: n.priority,
      target_audience: n.target_audience,
      target_role: n.target_role || '',
      target_class_id: n.target_class_id || '',
      academic_year_id: n.academic_year_id || '',
      published: n.published,
    });
    setIsNoticeModalOpen(true);
  };

  const handleOpenCreateEvent = () => {
    setEditingEvent(null);
    const todayStr = new Date().toISOString().split('T')[0];
    setEventFormData({
      title: '',
      description: '',
      event_type: 'other',
      start_date: todayStr,
      end_date: '',
      target_audience: 'all',
      target_class_id: classes[0]?.id || '',
      academic_year_id: academicYears[0]?.id || '',
    });
    setIsEventModalOpen(true);
  };

  const handleOpenEditEvent = (ev: SchoolEvent) => {
    setEditingEvent(ev);
    setEventFormData({
      title: ev.title,
      description: ev.description || '',
      event_type: ev.event_type,
      start_date: ev.start_date ? ev.start_date.split('T')[0] : '',
      end_date: ev.end_date ? ev.end_date.split('T')[0] : '',
      target_audience: ev.target_audience,
      target_class_id: ev.target_class_id || '',
      academic_year_id: '',
    });
    setIsEventModalOpen(true);
  };

  // ─── Notice CRUD Actions ───────────────────────────────────────────────────

  const handleSubmitNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeFormData.title.trim() || !noticeFormData.content.trim()) {
      setErrorMsg('Please fill in both the title and content.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const payload: any = {
        title: noticeFormData.title.trim(),
        content: noticeFormData.content.trim(),
        type: noticeFormData.type,
        priority: noticeFormData.priority,
        target_audience: noticeFormData.target_audience,
        published: noticeFormData.published,
      };

      if (noticeFormData.target_audience === 'role') {
        payload.target_role = noticeFormData.target_role;
      }
      if (noticeFormData.target_audience === 'class' && noticeFormData.target_class_id) {
        payload.target_class_id = noticeFormData.target_class_id;
      }
      if (noticeFormData.academic_year_id) {
        payload.academic_year_id = noticeFormData.academic_year_id;
      }

      if (editingNotice) {
        await apiClient.patch(`/notices/${editingNotice.id}`, payload);
        setSuccessMsg('Notice circular updated successfully.');
      } else {
        await apiClient.post('/notices', payload);
        setSuccessMsg('Notice circular posted successfully.');
      }

      setIsNoticeModalOpen(false);
      fetchNotices();
    } catch (err: any) {
      console.error('Submit notice error:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to save notice.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePin = async (noticeId: string, currentPriority: string) => {
    try {
      const action = currentPriority === 'high' ? 'unpin' : 'pin';
      await apiClient.patch(`/notices/${noticeId}/pin`, { action });
      setSuccessMsg(`Notice successfully ${action}ned.`);
      fetchNotices();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to update pin state.');
    }
  };

  const handleTogglePublish = async (notice: Notice) => {
    try {
      await apiClient.patch(`/notices/${notice.id}`, { published: !notice.published });
      setSuccessMsg(`Notice marked as ${!notice.published ? 'Published' : 'Draft'}.`);
      fetchNotices();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to update publication status.');
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    if (!window.confirm('Are you sure you want to delete this notice circular?')) return;

    try {
      await apiClient.delete(`/notices/${noticeId}`);
      setSuccessMsg('Notice circular removed.');
      fetchNotices();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to delete notice.');
    }
  };

  // ─── Event CRUD Actions ────────────────────────────────────────────────────

  const handleSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventFormData.title.trim() || !eventFormData.start_date) {
      setErrorMsg('Please specify an event title and start date.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const payload: any = {
        title: eventFormData.title.trim(),
        description: eventFormData.description.trim() || undefined,
        event_type: eventFormData.event_type,
        start_date: eventFormData.start_date,
        end_date: eventFormData.end_date || undefined,
        target_audience: eventFormData.target_audience,
      };

      if (eventFormData.target_audience === 'class' && eventFormData.target_class_id) {
        payload.target_class_id = eventFormData.target_class_id;
      }
      if (eventFormData.academic_year_id) {
        payload.academic_year_id = eventFormData.academic_year_id;
      }

      if (editingEvent) {
        await apiClient.patch(`/notices/events/${editingEvent.id}`, payload);
        setSuccessMsg('School event updated.');
      } else {
        await apiClient.post('/notices/events', payload);
        setSuccessMsg('New school event scheduled.');
      }

      setIsEventModalOpen(false);
      fetchEvents();
    } catch (err: any) {
      console.error('Submit event error:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to save event.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('Are you sure you want to delete this scheduled event?')) return;

    try {
      await apiClient.delete(`/notices/events/${eventId}`);
      setSuccessMsg('School event removed.');
      fetchEvents();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to delete event.');
    }
  };

  // ─── Formatting Helpers ────────────────────────────────────────────────────

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const parseEventDateBox = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      const day = d.getDate();
      return { month, day };
    } catch {
      return { month: 'EVT', day: '01' };
    }
  };

  const getNoticeBadgeClass = (type: string) => {
    switch (type) {
      case 'academic':
        return styles.badgeAcademic;
      case 'event':
        return styles.badgeEvent;
      case 'urgent':
        return styles.badgeUrgent;
      default:
        return styles.badgeGeneral;
    }
  };

  const getEventTypeBadgeClass = (eventType: string) => {
    switch (eventType) {
      case 'holiday':
        return styles.typeHoliday;
      case 'exam':
        return styles.typeExam;
      case 'sports_day':
        return styles.typeSports;
      case 'ptm':
        return styles.typePTM;
      case 'cultural':
        return styles.typeCultural;
      default:
        return styles.typeOther;
    }
  };

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Notices & School Events</h1>
          <p className={styles.subtitle}>
            Official circulars, urgent announcements, and academic events calendar.
          </p>
        </div>

        <div className={styles.actionGroup}>
          {canManageNotices && (
            <button className={styles.primaryBtn} onClick={handleOpenCreateNotice}>
              <Plus size={16} />
              <span>Create Circular</span>
            </button>
          )}

          {canManageEvents && (
            <button className={styles.secondaryBtn} onClick={handleOpenCreateEvent}>
              <CalendarIcon size={16} />
              <span>Schedule Event</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Status Notifications ── */}
      {errorMsg && (
        <div className={styles.alertError}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setErrorMsg(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className={styles.alertSuccess}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setSuccessMsg(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── KPI Metric Cards ── */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span>TOTAL CIRCULARS</span>
            <div className={`${styles.metricIcon} ${styles.metricIconIndigo}`}>
              <Bell size={18} />
            </div>
          </div>
          <div className={styles.metricValue}>{metrics.total}</div>
          <div className={styles.metricSubtext}>Published and active bulletins</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span>PINNED NOTICES</span>
            <div className={`${styles.metricIcon} ${styles.metricIconAmber}`}>
              <Pin size={18} />
            </div>
          </div>
          <div className={styles.metricValue}>{metrics.pinnedCount}</div>
          <div className={styles.metricSubtext}>High-priority pinned updates</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span>URGENT ALERTS</span>
            <div className={`${styles.metricIcon} ${styles.metricIconRose}`}>
              <AlertCircle size={18} />
            </div>
          </div>
          <div className={styles.metricValue}>{metrics.urgentCount}</div>
          <div className={styles.metricSubtext}>Immediate action required</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span>SCHEDULED EVENTS</span>
            <div className={`${styles.metricIcon} ${styles.metricIconEmerald}`}>
              <CalendarDays size={18} />
            </div>
          </div>
          <div className={styles.metricValue}>{metrics.eventsCount}</div>
          <div className={styles.metricSubtext}>Holidays, exams & PTMs</div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className={styles.tabNav}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'notices' ? styles.activeTabBtn : ''}`}
          onClick={() => setActiveTab('notices')}
        >
          <Bell size={16} />
          <span>Notice Board & Circulars</span>
          <span className={styles.tabBadge}>{filteredNotices.length}</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'events' ? styles.activeTabBtn : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <CalendarIcon size={16} />
          <span>School Calendar & Events</span>
          <span className={styles.tabBadge}>{events.length}</span>
        </button>
      </div>

      {/* ── TAB 1: NOTICES FEED ── */}
      {activeTab === 'notices' && (
        <div>
          {/* Filters Bar */}
          <div className={styles.filterBar}>
            <div className={styles.filterGrid}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Search</label>
                <div className={styles.searchWrapper}>
                  <Search size={16} className={styles.searchIcon} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search by title or keyword..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Type</label>
                <select
                  className={styles.select}
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="">All Types</option>
                  <option value="general">General</option>
                  <option value="academic">Academic</option>
                  <option value="event">Event</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Priority</label>
                <select
                  className={styles.select}
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                >
                  <option value="">All Priorities</option>
                  <option value="high">High (Pinned)</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </div>

              {!isStudentOrParent && (
                <>
                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Audience</label>
                    <select
                      className={styles.select}
                      value={filterAudience}
                      onChange={(e) => setFilterAudience(e.target.value)}
                    >
                      <option value="">All Audiences</option>
                      <option value="all">Whole School</option>
                      <option value="role">Role Specific</option>
                      <option value="class">Class Specific</option>
                    </select>
                  </div>

                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Status</label>
                    <select
                      className={styles.select}
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="">All Statuses</option>
                      <option value="published">Published</option>
                      <option value="draft">Drafts Only</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notices Feed List */}
          {loading ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner} />
              <p>Loading school circulars...</p>
            </div>
          ) : filteredNotices.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText size={48} className={styles.emptyStateIcon} />
              <h3 className={styles.emptyStateTitle}>No notices found</h3>
              <p className={styles.emptyStateText}>
                There are currently no circulars matching your selected criteria.
              </p>
              {canManageNotices && (
                <button className={styles.primaryBtn} onClick={handleOpenCreateNotice}>
                  <Plus size={16} />
                  <span>Create First Notice</span>
                </button>
              )}
            </div>
          ) : (
            <div className={styles.noticeFeed}>
              {filteredNotices.map((n) => {
                const isHighPriority = n.priority === 'high';
                const audienceLabel =
                  n.target_audience === 'all'
                    ? 'Whole School'
                    : n.target_audience === 'role'
                    ? `Role: ${n.target_role || 'Staff'}`
                    : `Class: ${n.class_name || 'Assigned'}`;

                return (
                  <div
                    key={n.id}
                    className={`${styles.noticeCard} ${isHighPriority ? styles.noticeCardPinned : ''}`}
                  >
                    {/* Header */}
                    <div className={styles.noticeCardHeader}>
                      <div className={styles.noticeHeaderLeft}>
                        {isHighPriority && (
                          <span className={`${styles.badge} ${styles.badgePinned}`}>
                            <Pin size={12} />
                            <span>Pinned</span>
                          </span>
                        )}
                        <span className={`${styles.badge} ${getNoticeBadgeClass(n.type)}`}>
                          {n.type}
                        </span>
                        <span className={`${styles.badge} ${styles.badgeAudience}`}>
                          <Users size={12} />
                          <span>{audienceLabel}</span>
                        </span>
                        {!n.published && (
                          <span className={`${styles.badge} ${styles.badgeDraft}`}>
                            Draft
                          </span>
                        )}
                      </div>

                      <div className={styles.noticeMeta}>
                        {n.author_name && (
                          <div className={styles.noticeMetaItem}>
                            <span>By {n.author_name}</span>
                          </div>
                        )}
                        <div className={styles.noticeMetaItem}>
                          <Clock size={13} />
                          <span>{formatDate(n.published_at || n.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className={styles.noticeTitle}>{n.title}</h3>

                    {/* Content */}
                    <div className={styles.noticeContent}>
                      {n.content.length > 280 ? (
                        <>
                          {n.content.slice(0, 280)}...{' '}
                          <button
                            onClick={() => setViewingNotice(n)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#4f46e5',
                              cursor: 'pointer',
                              fontWeight: 600,
                              padding: 0,
                              fontFamily: 'inherit',
                            }}
                          >
                            Read Full Notice
                          </button>
                        </>
                      ) : (
                        n.content
                      )}
                    </div>

                    {/* Footer with Card Actions */}
                    <div className={styles.noticeFooter}>
                      <button
                        className={styles.iconBtn}
                        onClick={() => setViewingNotice(n)}
                        title="Read full circular"
                      >
                        <Eye size={14} />
                        <span>View Details</span>
                      </button>

                      {/* Staff & Admin Actions */}
                      <div className={styles.cardActions}>
                        {canPinNotices && (
                          <button
                            className={`${styles.iconBtn} ${isHighPriority ? styles.iconBtnPinned : ''}`}
                            onClick={() => handleTogglePin(n.id, n.priority)}
                            title={isHighPriority ? 'Unpin Notice' : 'Pin to top'}
                          >
                            {isHighPriority ? <PinOff size={14} /> : <Pin size={14} />}
                            <span>{isHighPriority ? 'Unpin' : 'Pin'}</span>
                          </button>
                        )}

                        {canManageNotices && (
                          <>
                            <button
                              className={styles.iconBtn}
                              onClick={() => handleTogglePublish(n)}
                              title={n.published ? 'Unpublish to draft' : 'Publish notice now'}
                            >
                              <Send size={14} />
                              <span>{n.published ? 'Set Draft' : 'Publish'}</span>
                            </button>

                            <button
                              className={styles.iconBtn}
                              onClick={() => handleOpenEditNotice(n)}
                              title="Edit notice"
                            >
                              <Edit3 size={14} />
                              <span>Edit</span>
                            </button>

                            <button
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              onClick={() => handleDeleteNotice(n.id)}
                              title="Delete notice"
                            >
                              <Trash2 size={14} />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: EVENTS CALENDAR ── */}
      {activeTab === 'events' && (
        <div>
          {/* Events Filter Toolbar */}
          <div className={styles.filterBar}>
            <div className={styles.filterGrid}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Event Category</label>
                <select
                  className={styles.select}
                  value={eventFilterType}
                  onChange={(e) => setEventFilterType(e.target.value)}
                >
                  <option value="">All Event Categories</option>
                  <option value="holiday">Holiday</option>
                  <option value="exam">Examinations</option>
                  <option value="sports_day">Sports Day</option>
                  <option value="ptm">Parent-Teacher Meeting (PTM)</option>
                  <option value="cultural">Cultural / Annual Function</option>
                  <option value="other">Other School Activities</option>
                </select>
              </div>
            </div>
          </div>

          {events.length === 0 ? (
            <div className={styles.emptyState}>
              <CalendarDays size={48} className={styles.emptyStateIcon} />
              <h3 className={styles.emptyStateTitle}>No scheduled events</h3>
              <p className={styles.emptyStateText}>
                No events currently scheduled in the academic calendar.
              </p>
              {canManageEvents && (
                <button className={styles.primaryBtn} onClick={handleOpenCreateEvent}>
                  <CalendarIcon size={16} />
                  <span>Schedule Event</span>
                </button>
              )}
            </div>
          ) : (
            <div className={styles.eventsGrid}>
              {events.map((ev) => {
                const { month, day } = parseEventDateBox(ev.start_date);
                const audienceText =
                  ev.target_audience === 'all'
                    ? 'All Students & Staff'
                    : `Class: ${ev.class_name || 'Assigned'}`;

                const dateSpan = ev.end_date
                  ? `${formatDate(ev.start_date)} - ${formatDate(ev.end_date)}`
                  : formatDate(ev.start_date);

                return (
                  <div key={ev.id} className={styles.eventCard}>
                    <div className={styles.eventCardHeader}>
                      <div className={styles.eventDateBox}>
                        <span className={styles.eventMonth}>{month}</span>
                        <span className={styles.eventDay}>{day}</span>
                      </div>

                      <div style={{ flex: 1 }}>
                        <span
                          className={`${styles.badge} ${getEventTypeBadgeClass(ev.event_type)}`}
                        >
                          {ev.event_type.replace('_', ' ')}
                        </span>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: '#64748b',
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Clock size={12} />
                          <span>{dateSpan}</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.eventCardBody}>
                      <h4 className={styles.eventTitle}>{ev.title}</h4>
                      {ev.description && (
                        <p className={styles.eventDescription}>{ev.description}</p>
                      )}
                    </div>

                    <div className={styles.eventCardFooter}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Users size={12} />
                        <span>{audienceText}</span>
                      </span>

                      {canManageEvents && (
                        <div className={styles.cardActions}>
                          <button
                            className={styles.iconBtn}
                            onClick={() => handleOpenEditEvent(ev)}
                            title="Edit Event"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={() => handleDeleteEvent(ev.id)}
                            title="Delete Event"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CREATE / EDIT NOTICE MODAL ── */}
      {isNoticeModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsNoticeModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingNotice ? 'Edit Notice Circular' : 'Create Notice Circular'}</h2>
              <button
                className={styles.closeBtn}
                onClick={() => setIsNoticeModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitNotice}>
              <div className={styles.modalBody}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Notice Title <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="e.g. Annual Sports Meet 2026 Registration"
                      value={noticeFormData.title}
                      onChange={(e) =>
                        setNoticeFormData({ ...noticeFormData, title: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className={styles.formGridTwoCol}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Notice Category</label>
                      <select
                        className={styles.select}
                        value={noticeFormData.type}
                        onChange={(e: any) =>
                          setNoticeFormData({ ...noticeFormData, type: e.target.value })
                        }
                      >
                        <option value="general">General</option>
                        <option value="academic">Academic</option>
                        <option value="event">Event</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Priority</label>
                      <select
                        className={styles.select}
                        value={noticeFormData.priority}
                        onChange={(e: any) =>
                          setNoticeFormData({ ...noticeFormData, priority: e.target.value })
                        }
                      >
                        <option value="normal">Normal</option>
                        <option value="high">High (Pinned to Top)</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formGridTwoCol}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Target Audience</label>
                      <select
                        className={styles.select}
                        value={noticeFormData.target_audience}
                        onChange={(e: any) =>
                          setNoticeFormData({
                            ...noticeFormData,
                            target_audience: e.target.value,
                          })
                        }
                      >
                        <option value="all">Whole School (Everyone)</option>
                        <option value="role">Specific Role</option>
                        <option value="class">Specific Class</option>
                      </select>
                    </div>

                    {noticeFormData.target_audience === 'role' ? (
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                          Target Role <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <select
                          className={styles.select}
                          value={noticeFormData.target_role}
                          onChange={(e) =>
                            setNoticeFormData({
                              ...noticeFormData,
                              target_role: e.target.value,
                            })
                          }
                          required
                        >
                          <option value="">Select Role</option>
                          <option value="teacher">Teachers</option>
                          <option value="student">Students</option>
                          <option value="parent">Parents</option>
                          <option value="office_staff">Office Staff</option>
                        </select>
                      </div>
                    ) : noticeFormData.target_audience === 'class' ? (
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                          Target Class <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <select
                          className={styles.select}
                          value={noticeFormData.target_class_id}
                          onChange={(e) =>
                            setNoticeFormData({
                              ...noticeFormData,
                              target_class_id: e.target.value,
                            })
                          }
                          required
                        >
                          <option value="">Select Class</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.code ? `(${c.code})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Academic Year (Optional)</label>
                        <select
                          className={styles.select}
                          value={noticeFormData.academic_year_id}
                          onChange={(e) =>
                            setNoticeFormData({
                              ...noticeFormData,
                              academic_year_id: e.target.value,
                            })
                          }
                        >
                          <option value="">Default Current Year</option>
                          {academicYears.map((y) => (
                            <option key={y.id} value={y.id}>
                              {y.name} {y.is_current ? '(Active)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Notice Circular Content <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <textarea
                      className={styles.textarea}
                      placeholder="Write full circular message, instructions, and dates here..."
                      value={noticeFormData.content}
                      onChange={(e) =>
                        setNoticeFormData({ ...noticeFormData, content: e.target.value })
                      }
                      rows={5}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkboxInput}
                        checked={noticeFormData.published}
                        onChange={(e) =>
                          setNoticeFormData({
                            ...noticeFormData,
                            published: e.target.checked,
                          })
                        }
                      />
                      <span>Publish immediately to notice board</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsNoticeModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : editingNotice ? 'Update Notice' : 'Post Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT EVENT MODAL ── */}
      {isEventModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsEventModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingEvent ? 'Edit School Event' : 'Schedule School Event'}</h2>
              <button
                className={styles.closeBtn}
                onClick={() => setIsEventModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitEvent}>
              <div className={styles.modalBody}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Event Title <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="e.g. First Term Mathematics Examination"
                      value={eventFormData.title}
                      onChange={(e) =>
                        setEventFormData({ ...eventFormData, title: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className={styles.formGridTwoCol}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Event Category</label>
                      <select
                        className={styles.select}
                        value={eventFormData.event_type}
                        onChange={(e: any) =>
                          setEventFormData({ ...eventFormData, event_type: e.target.value })
                        }
                      >
                        <option value="holiday">Holiday</option>
                        <option value="exam">Examination</option>
                        <option value="sports_day">Sports Day</option>
                        <option value="ptm">PTM (Parent-Teacher Meeting)</option>
                        <option value="cultural">Cultural Festival</option>
                        <option value="other">Other Event</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Audience</label>
                      <select
                        className={styles.select}
                        value={eventFormData.target_audience}
                        onChange={(e: any) =>
                          setEventFormData({
                            ...eventFormData,
                            target_audience: e.target.value,
                          })
                        }
                      >
                        <option value="all">Whole School</option>
                        <option value="class">Class Specific</option>
                      </select>
                    </div>
                  </div>

                  {eventFormData.target_audience === 'class' && (
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Target Class <span className={styles.requiredAsterisk}>*</span>
                      </label>
                      <select
                        className={styles.select}
                        value={eventFormData.target_class_id}
                        onChange={(e) =>
                          setEventFormData({
                            ...eventFormData,
                            target_class_id: e.target.value,
                          })
                        }
                        required
                      >
                        <option value="">Select Target Class</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.code ? `(${c.code})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={styles.formGridTwoCol}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Start Date <span className={styles.requiredAsterisk}>*</span>
                      </label>
                      <input
                        type="date"
                        className={styles.input}
                        value={eventFormData.start_date}
                        onChange={(e) =>
                          setEventFormData({ ...eventFormData, start_date: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>End Date (Optional)</label>
                      <input
                        type="date"
                        className={styles.input}
                        value={eventFormData.end_date}
                        min={eventFormData.start_date}
                        onChange={(e) =>
                          setEventFormData({ ...eventFormData, end_date: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Event Description</label>
                    <textarea
                      className={styles.textarea}
                      placeholder="Add details, instructions, timing, and venue..."
                      value={eventFormData.description}
                      onChange={(e) =>
                        setEventFormData({ ...eventFormData, description: e.target.value })
                      }
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsEventModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : editingEvent ? 'Update Event' : 'Schedule Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── NOTICE READER MODAL ── */}
      {viewingNotice && (
        <div className={styles.modalOverlay} onClick={() => setViewingNotice(null)}>
          <div
            className={styles.modal}
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`${styles.badge} ${getNoticeBadgeClass(viewingNotice.type)}`}>
                  {viewingNotice.type}
                </span>
                {viewingNotice.priority === 'high' && (
                  <span className={`${styles.badge} ${styles.badgePinned}`}>
                    <Pin size={12} />
                    <span>Pinned</span>
                  </span>
                )}
              </div>
              <button className={styles.closeBtn} onClick={() => setViewingNotice(null)}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <h2
                style={{
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  marginBottom: '10px',
                  lineHeight: 1.35,
                }}
              >
                {viewingNotice.title}
              </h2>

              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  fontSize: '0.8125rem',
                  color: '#64748b',
                  marginBottom: '20px',
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: '12px',
                  flexWrap: 'wrap',
                }}
              >
                {viewingNotice.author_name && (
                  <span>Posted by: <strong>{viewingNotice.author_name}</strong></span>
                )}
                <span>Date: {formatDate(viewingNotice.published_at || viewingNotice.created_at)}</span>
                <span>
                  Target:{' '}
                  {viewingNotice.target_audience === 'all'
                    ? 'Whole School'
                    : viewingNotice.target_audience === 'role'
                    ? `Role: ${viewingNotice.target_role}`
                    : `Class: ${viewingNotice.class_name || 'Assigned'}`}
                </span>
              </div>

              <div
                style={{
                  fontSize: '0.95rem',
                  color: '#1e293b',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-line',
                }}
              >
                {viewingNotice.content}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setViewingNotice(null)}
              >
                Close Reader
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notices;
