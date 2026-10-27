import React, { useState, useEffect } from 'react';
import {
  Building,
  Clock,
  UserCheck,
  Database,
  Save,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Globe,
  Mail
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import styles from './Settings.module.css';

interface SchoolSettings {
  school_name: string;
  affiliation_number?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  motto?: string;
  currency: string;
  period_duration_minutes: number;
  attendance_cutoff_time: string;
  working_days: string[];
}

interface ClassOption {
  id: string;
  name: string;
  sections?: { id: string; name: string }[];
}

const Settings: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'rules' | 'promotion' | 'backup' | 'cms'>('profile');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // CMS state
  const [cmsPages, setCmsPages] = useState<any[]>([]);
  const [cmsInquiries, setCmsInquiries] = useState<any[]>([]);

  // Form states
  const [settings, setSettings] = useState<SchoolSettings>({
    school_name: '',
    affiliation_number: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo_url: '',
    motto: '',
    currency: 'INR',
    period_duration_minutes: 45,
    attendance_cutoff_time: '09:00',
    working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  });

  // Bulk promotion states
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sourceClassId, setSourceClassId] = useState<string>('');
  const [targetClassId, setTargetClassId] = useState<string>('');
  const [targetSectionId, setTargetSectionId] = useState<string>('');
  const [isPromoting, setIsPromoting] = useState<boolean>(false);

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [settingsRes, classesRes] = await Promise.all([
        apiClient.get('/admin/settings').catch(() => ({ data: { success: false, data: null } })),
        apiClient.get('/academic/classes').catch(() => ({ data: { success: false, data: [] } }))
      ]);

      if (settingsRes.data?.success && settingsRes.data?.data) {
        let rawWorkingDays = settingsRes.data.data.working_days;
        if (typeof rawWorkingDays === 'string') {
          try {
            rawWorkingDays = JSON.parse(rawWorkingDays);
          } catch {
            rawWorkingDays = [];
          }
        }
        if (!Array.isArray(rawWorkingDays) || rawWorkingDays.length === 0) {
          rawWorkingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        }

        const d = settingsRes.data.data;
        setSettings({
          school_name: d.school_name || 'Saksham International Academy',
          affiliation_number: d.affiliation_number || '',
          address: d.address || '',
          phone: d.phone || '',
          email: d.email || '',
          website: d.website || '',
          logo_url: d.logo_url || '',
          motto: d.motto || '',
          currency: d.currency || 'INR',
          period_duration_minutes: Number(d.period_duration_minutes) || 45,
          attendance_cutoff_time: d.attendance_cutoff_time || '09:00',
          working_days: rawWorkingDays
        });
      }

      if (classesRes.data?.data) {
        const raw = classesRes.data.data;
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.classes)
          ? raw.classes
          : [];
        setClasses(list);
      }
    } catch (err) {
      console.error('Failed to load initial settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;

    try {
      setSaving(true);
      setMessage(null);
      const res = await apiClient.put('/admin/settings', settings);
      if (res.data?.success) {
        setMessage({ type: 'success', text: 'School settings saved successfully!' });
      }
    } catch (err: any) {
      console.error('Failed to update settings:', err);
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePromotionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceClassId || !targetClassId) return;

    if (!confirm('Are you sure you want to promote all active students in this cohort? This action will update student academic assignments.')) {
      return;
    }

    try {
      setIsPromoting(true);
      setMessage(null);
      const res = await apiClient.post('/admin/promote-students', {
        source_class_id: sourceClassId,
        target_class_id: targetClassId,
        target_section_id: targetSectionId || undefined
      });
      if (res.data?.success) {
        setMessage({
          type: 'success',
          text: `Promotion completed: ${res.data.data?.promoted_count} student(s) promoted to ${res.data.data?.target_class}!`
        });
        setSourceClassId('');
        setTargetClassId('');
        setTargetSectionId('');
      }
    } catch (err: any) {
      console.error('Promotion failed:', err);
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to promote students. Check section capacity.'
      });
    } finally {
      setIsPromoting(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await apiClient.get('/admin/backup', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `saksham_backup_${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup download failed:', err);
      alert('Failed to generate system backup.');
    }
  };

  const fetchCmsData = async () => {
    try {
      const [pagesRes, inqRes] = await Promise.all([
        apiClient.get('/cms/pages').catch(() => ({ data: { data: [] } })),
        apiClient.get('/cms/inquiries').catch(() => ({ data: { data: [] } }))
      ]);
      const rawPages = pagesRes.data?.data;
      setCmsPages(Array.isArray(rawPages) ? rawPages : Array.isArray(rawPages?.pages) ? rawPages.pages : []);
      const rawInq = inqRes.data?.data;
      setCmsInquiries(Array.isArray(rawInq) ? rawInq : Array.isArray(rawInq?.inquiries) ? rawInq.inquiries : []);
    } catch (err) {
      console.warn('Failed to load CMS data:', err);
    }
  };

  const safeClasses = Array.isArray(classes) ? classes : [];
  const targetClassSections = (safeClasses.find((c) => c.id === targetClassId)?.sections) || [];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Administration & Settings</h1>
          <p className={styles.subtitle}>
            Institutional branding, academic timetable parameters, bulk cohort promotions, and data backups
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'profile' ? styles.tabActive : ''}`}
          onClick={() => { setActiveTab('profile'); setMessage(null); }}
        >
          <Building size={18} />
          <span>School Profile</span>
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'rules' ? styles.tabActive : ''}`}
          onClick={() => { setActiveTab('rules'); setMessage(null); }}
        >
          <Clock size={18} />
          <span>Timetable & Rules</span>
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'promotion' ? styles.tabActive : ''}`}
          onClick={() => { setActiveTab('promotion'); setMessage(null); }}
        >
          <UserCheck size={18} />
          <span>Bulk Promotion</span>
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'backup' ? styles.tabActive : ''}`}
          onClick={() => { setActiveTab('backup'); setMessage(null); }}
        >
          <Database size={18} />
          <span>System Backup</span>
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'cms' ? styles.tabActive : ''}`}
          onClick={() => {
            setActiveTab('cms');
            setMessage(null);
            fetchCmsData();
          }}
        >
          <Globe size={18} />
          <span>Website CMS & Inquiries</span>
        </button>
      </div>

      {/* Alert Notification */}
      {message && (
        <div
          className={`${styles.alertBox} ${
            message.type === 'success' ? styles.alertSuccess : styles.alertError
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: '#6366f1' }}>
          <Loader2 size={36} className="animate-spin" />
        </div>
      ) : (
        <>
          {/* TAB 1: SCHOOL PROFILE */}
          {activeTab === 'profile' && (
            <div className={styles.formCard}>
              <form onSubmit={handleSettingsSubmit}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>School Name *</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={settings.school_name}
                      onChange={(e) => setSettings({ ...settings, school_name: e.target.value })}
                      disabled={!isSuperAdmin}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Affiliation / Board Code</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. CBSE-2026-998"
                      value={settings.affiliation_number || ''}
                      onChange={(e) => setSettings({ ...settings, affiliation_number: e.target.value })}
                      disabled={!isSuperAdmin}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Official Email Address</label>
                    <input
                      type="email"
                      className={styles.formInput}
                      value={settings.email || ''}
                      onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      disabled={!isSuperAdmin}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Phone / Helpdesk</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={settings.phone || ''}
                      onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                      disabled={!isSuperAdmin}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>School Website</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="https://..."
                      value={settings.website || ''}
                      onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                      disabled={!isSuperAdmin}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Base Currency</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={settings.currency}
                      onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                      disabled={!isSuperAdmin}
                    />
                  </div>
                </div>

                <div className={styles.formGroup} style={{ marginBottom: '24px' }}>
                  <label className={styles.formLabel}>School Motto / Vision</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g. Empowering Excellence, Inspiring Tomorrow"
                    value={settings.motto || ''}
                    onChange={(e) => setSettings({ ...settings, motto: e.target.value })}
                    disabled={!isSuperAdmin}
                  />
                </div>

                <div className={styles.formGroup} style={{ marginBottom: '24px' }}>
                  <label className={styles.formLabel}>Campus Physical Address</label>
                  <textarea
                    rows={3}
                    className={styles.formTextarea}
                    value={settings.address || ''}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    disabled={!isSuperAdmin}
                  />
                </div>

                {isSuperAdmin && (
                  <button type="submit" className={styles.saveBtn} disabled={saving}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{saving ? 'Saving...' : 'Save School Profile'}</span>
                  </button>
                )}
              </form>
            </div>
          )}

          {/* TAB 2: TIMETABLE & RULES */}
          {activeTab === 'rules' && (
            <div className={styles.formCard}>
              <form onSubmit={handleSettingsSubmit}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Period Duration (Minutes) *</label>
                    <input
                      type="number"
                      className={styles.formInput}
                      min={15}
                      max={180}
                      value={settings.period_duration_minutes}
                      onChange={(e) =>
                        setSettings({ ...settings, period_duration_minutes: parseInt(e.target.value) || 45 })
                      }
                      disabled={!isSuperAdmin}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Morning Attendance Cutoff Time *</label>
                    <input
                      type="time"
                      className={styles.formInput}
                      value={settings.attendance_cutoff_time}
                      onChange={(e) => setSettings({ ...settings, attendance_cutoff_time: e.target.value })}
                      disabled={!isSuperAdmin}
                      required
                    />
                  </div>
                </div>

                <div className={styles.formGroup} style={{ marginBottom: '24px' }}>
                  <label className={styles.formLabel}>Institutional Working Days</label>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
                      const currentDays = Array.isArray(settings?.working_days) ? settings.working_days : [];
                      const isChecked = currentDays.includes(day);
                      return (
                        <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isSuperAdmin}
                            onChange={(e) => {
                              const nextDays = e.target.checked
                                ? [...currentDays, day]
                                : currentDays.filter((d) => d !== day);
                              setSettings({ ...settings, working_days: nextDays });
                            }}
                          />
                          <span style={{ fontSize: '0.88rem' }}>{day}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {isSuperAdmin && (
                  <button type="submit" className={styles.saveBtn} disabled={saving}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{saving ? 'Saving...' : 'Save Academic Rules'}</span>
                  </button>
                )}
              </form>
            </div>
          )}

          {/* TAB 3: BULK PROMOTION */}
          {activeTab === 'promotion' && (
            <div className={styles.formCard}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#0f172a' }}>
                End-of-Session Cohort Promotion
              </h3>
              <p style={{ margin: '0 0 24px 0', fontSize: '0.85rem', color: '#64748b' }}>
                Promote all enrolled students from an existing class into the next grade level. Section capacity constraints will be validated automatically.
              </p>

              <form onSubmit={handlePromotionSubmit}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Current Class (Source) *</label>
                    <select
                      className={styles.formSelect}
                      value={sourceClassId}
                      onChange={(e) => setSourceClassId(e.target.value)}
                      required
                    >
                      <option value="">Select source class...</option>
                      {safeClasses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Next Class (Target) *</label>
                    <select
                      className={styles.formSelect}
                      value={targetClassId}
                      onChange={(e) => {
                        setTargetClassId(e.target.value);
                        setTargetSectionId('');
                      }}
                      required
                    >
                      <option value="">Select target class...</option>
                      {safeClasses
                        .filter((c) => c.id !== sourceClassId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Target Section (Optional)</label>
                    <select
                      className={styles.formSelect}
                      value={targetSectionId}
                      onChange={(e) => setTargetSectionId(e.target.value)}
                    >
                      <option value="">Unassigned (Class level only)</option>
                      {(Array.isArray(targetClassSections) ? targetClassSections : []).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className={styles.saveBtn}
                  disabled={isPromoting || !sourceClassId || !targetClassId}
                >
                  {isPromoting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  <span>{isPromoting ? 'Promoting Cohort...' : 'Execute Promotion'}</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: SYSTEM BACKUP */}
          {activeTab === 'backup' && (
            <div className={styles.formCard}>
              <div className={styles.backupCard}>
                <div className={styles.backupInfo}>
                  <h3>Complete System Data Snapshot</h3>
                  <p>
                    Download a full JSON database backup containing school configuration, academic years, class cohorts, subjects, and aggregated metadata.
                  </p>
                </div>
                {isSuperAdmin && (
                  <button className={styles.backupBtn} onClick={handleDownloadBackup}>
                    <Download size={18} />
                    <span>Download JSON Backup</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: WEBSITE CMS & INQUIRIES */}
          {activeTab === 'cms' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Section 1: CMS Pages */}
              <div className={styles.formCard}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Globe size={20} color="#4f46e5" /> Published Website Pages
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  {(Array.isArray(cmsPages) ? cmsPages : []).map((page) => (
                    <div
                      key={page.id}
                      style={{
                        padding: '1.25rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        background: '#f8fafc',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '1rem', color: '#1e293b' }}>{page.title}</strong>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '1rem',
                            background: page.is_published ? '#dcfce7' : '#f1f5f9',
                            color: page.is_published ? '#15803d' : '#64748b',
                            fontWeight: 600
                          }}
                        >
                          {page.is_published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.85rem', color: '#4f46e5', fontFamily: 'monospace' }}>
                        /api/v1/cms/pages/{page.slug}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Incoming Inquiries */}
              <div className={styles.formCard}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Mail size={20} color="#4f46e5" /> Incoming Public Admissions & General Inquiries
                </h3>
                {(!Array.isArray(cmsInquiries) || cmsInquiries.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No public inquiries received yet. Inquiries submitted via the landing page will appear here.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '0.75rem 1rem' }}>Name</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Contact</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Subject</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(cmsInquiries) ? cmsInquiries : []).map((inq) => (
                          <tr key={inq.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{inq.name}</td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div>{inq.email}</div>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{inq.phone}</span>
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div>{inq.subject}</div>
                              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>{inq.message}</p>
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '1rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  background: inq.status === 'new' ? '#dbeafe' : inq.status === 'contacted' ? '#fef3c7' : '#dcfce7',
                                  color: inq.status === 'new' ? '#1e40af' : inq.status === 'contacted' ? '#92400e' : '#15803d'
                                }}
                              >
                                {inq.status}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              {inq.status === 'new' && (
                                <button
                                  className={styles.saveBtn}
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                                  onClick={async () => {
                                    await apiClient.patch(`/cms/inquiries/${inq.id}`, { status: 'contacted' });
                                    fetchCmsData();
                                  }}
                                >
                                  Mark Contacted
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Settings;
