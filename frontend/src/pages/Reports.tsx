import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  CalendarCheck,
  Download,
  GraduationCap,
  Award,
  Loader2,
  X,
  FileText
} from 'lucide-react';
import { apiClient } from '../api/client';
import styles from './Reports.module.css';

interface OverviewReport {
  students: {
    active: number;
    pending_admissions: number;
  };
  academics: {
    teachers: number;
    classes: number;
    sections: number;
  };
  attendance: {
    average_rate: number;
    total_logged_last_30_days: number;
  };
  fees: {
    total_collected: number;
    total_assigned: number;
    total_pending: number;
    collection_rate_percentage: number;
  };
  documents: {
    total: number;
    verified: number;
    pending: number;
  };
}

interface ClassAttendanceSummary {
  class_name: string;
  section_name?: string;
  total_marked: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  attendance_rate: number;
}

interface DailyAttendanceTrend {
  date: string;
  total_students: number;
  present_students: number;
  percentage: number;
}

interface ClassFeeSummary {
  class_name: string;
  total_students: number;
  total_assigned: number;
  total_collected: number;
  total_pending: number;
  collection_rate: number;
}

interface AcademicReportRow {
  class_name: string;
  exam_name: string;
  subject_name: string;
  total_students_appeared: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
}

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'fees' | 'academics'>('overview');
  const [loading, setLoading] = useState<boolean>(true);

  // Data states
  const [overview, setOverview] = useState<OverviewReport | null>(null);
  const [attendanceData, setAttendanceData] = useState<{
    by_class: ClassAttendanceSummary[];
    daily_trends: DailyAttendanceTrend[];
  }>({ by_class: [], daily_trends: [] });
  const [feeData, setFeeData] = useState<{
    by_class: ClassFeeSummary[];
    payment_methods: { payment_mode: string; transaction_count: number; total_amount: number }[];
  }>({ by_class: [], payment_methods: [] });
  const [academicData, setAcademicData] = useState<AcademicReportRow[]>([]);

  // Export modal state
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [exportType, setExportType] = useState<string>('students');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  useEffect(() => {
    fetchActiveTabData();
  }, [activeTab]);

  const fetchActiveTabData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'overview') {
        const res = await apiClient.get('/reports/overview');
        if (res.data?.success) setOverview(res.data.data);
      } else if (activeTab === 'attendance') {
        const res = await apiClient.get('/reports/attendance');
        if (res.data?.success) setAttendanceData(res.data.data);
      } else if (activeTab === 'fees') {
        const res = await apiClient.get('/reports/fees');
        if (res.data?.success) setFeeData(res.data.data);
      } else if (activeTab === 'academics') {
        const res = await apiClient.get('/reports/academics');
        if (res.data?.success) setAcademicData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportDownload = async () => {
    try {
      setIsExporting(true);
      const res = await apiClient.get('/reports/export', {
        params: { report_type: exportType },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `saksham_${exportType}_report_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setIsExportOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to generate export file.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Reports & Analytics</h1>
          <p className={styles.subtitle}>
            Executive summaries, student attendance trends, academic outcomes, and fee collection financials
          </p>
        </div>
        <div className={styles.actionGroup}>
          <button className={styles.exportBtn} onClick={() => setIsExportOpen(true)}>
            <Download size={18} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'overview' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <BarChart3 size={18} />
          <span>Executive Overview</span>
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'attendance' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('attendance')}
        >
          <CalendarCheck size={18} />
          <span>Attendance Trends</span>
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'fees' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('fees')}
        >
          <DollarSign size={18} />
          <span>Fee Financials</span>
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'academics' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('academics')}
        >
          <Award size={18} />
          <span>Academic Performance</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: '#6366f1' }}>
          <Loader2 size={36} className="animate-spin" />
        </div>
      ) : (
        <>
          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {activeTab === 'overview' && overview && (
            <div>
              {/* KPI Stat Cards */}
              <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiIcon} style={{ background: '#e0e7ff', color: '#4f46e5' }}>
                    <GraduationCap size={24} />
                  </div>
                  <div className={styles.kpiInfo}>
                    <span className={styles.kpiLabel}>Enrolled Students</span>
                    <span className={styles.kpiValue}>{overview.students.active}</span>
                  </div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiIcon} style={{ background: '#dcfce7', color: '#16a34a' }}>
                    <TrendingUp size={24} />
                  </div>
                  <div className={styles.kpiInfo}>
                    <span className={styles.kpiLabel}>Avg Attendance (30D)</span>
                    <span className={styles.kpiValue}>{overview.attendance.average_rate}%</span>
                  </div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
                    <DollarSign size={24} />
                  </div>
                  <div className={styles.kpiInfo}>
                    <span className={styles.kpiLabel}>Total Fees Collected</span>
                    <span className={styles.kpiValue}>
                      ₹{overview.fees.total_collected.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiIcon} style={{ background: '#f3e8ff', color: '#9333ea' }}>
                    <FileText size={24} />
                  </div>
                  <div className={styles.kpiInfo}>
                    <span className={styles.kpiLabel}>Verified Documents</span>
                    <span className={styles.kpiValue}>{overview.documents.verified}</span>
                  </div>
                </div>
              </div>

              {/* Progress Gauges */}
              <div className={styles.gaugeGrid}>
                <div className={styles.gaugeCard}>
                  <div className={styles.gaugeHeader}>
                    <h3 className={styles.gaugeTitle}>Fee Collection Progress</h3>
                    <span style={{ fontWeight: 700, color: '#0284c7' }}>
                      {overview.fees.collection_rate_percentage}%
                    </span>
                  </div>
                  <div className={styles.progressBarContainer}>
                    <div
                      className={styles.progressBarFill}
                      style={{
                        width: `${Math.min(100, overview.fees.collection_rate_percentage)}%`,
                        background: 'linear-gradient(90deg, #0284c7, #38bdf8)'
                      }}
                    />
                  </div>
                  <div className={styles.gaugeStatsRow}>
                    <span>Collected: ₹{overview.fees.total_collected.toLocaleString('en-IN')}</span>
                    <span>Pending: ₹{overview.fees.total_pending.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className={styles.gaugeCard}>
                  <div className={styles.gaugeHeader}>
                    <h3 className={styles.gaugeTitle}>Campus Capacity & Faculty</h3>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>
                      {overview.academics.teachers} Faculty
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '24px', marginTop: '12px' }}>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                        {overview.academics.classes}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Active Classes</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                        {overview.academics.sections}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Class Sections</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                        {overview.students.pending_admissions}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Admissions Queue</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ATTENDANCE TRENDS */}
          {activeTab === 'attendance' && (
            <div>
              <div className={styles.tableCard}>
                <h3 className={styles.tableTitle}>Class-Wise Attendance Cohorts</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Class & Section</th>
                      <th>Total Marked</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Late</th>
                      <th>Attendance Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceData.by_class.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                          No attendance records found for this period.
                        </td>
                      </tr>
                    ) : (
                      attendanceData.by_class.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>
                            {row.class_name} {row.section_name ? `(${row.section_name})` : ''}
                          </td>
                          <td>{row.total_marked}</td>
                          <td style={{ color: '#16a34a', fontWeight: 600 }}>{row.present_count}</td>
                          <td style={{ color: '#dc2626', fontWeight: 600 }}>{row.absent_count}</td>
                          <td style={{ color: '#d97706' }}>{row.late_count}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  width: '80px',
                                  height: '8px',
                                  background: '#e2e8f0',
                                  borderRadius: '4px',
                                  overflow: 'hidden'
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(100, row.attendance_rate)}%`,
                                    background: row.attendance_rate >= 75 ? '#16a34a' : '#ef4444'
                                  }}
                                />
                              </div>
                              <span style={{ fontWeight: 600 }}>{row.attendance_rate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: FEE FINANCIALS */}
          {activeTab === 'fees' && (
            <div>
              <div className={styles.tableCard}>
                <h3 className={styles.tableTitle}>Class-Wise Fee Collections vs Outstanding Arrears</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Enrolled Students</th>
                      <th>Total Assigned</th>
                      <th>Total Collected</th>
                      <th>Outstanding Pending</th>
                      <th>Collection Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeData.by_class.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                          No fee records logged yet.
                        </td>
                      </tr>
                    ) : (
                      feeData.by_class.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{row.class_name}</td>
                          <td>{row.total_students}</td>
                          <td>₹{row.total_assigned.toLocaleString('en-IN')}</td>
                          <td style={{ color: '#16a34a', fontWeight: 600 }}>
                            ₹{row.total_collected.toLocaleString('en-IN')}
                          </td>
                          <td style={{ color: '#dc2626', fontWeight: 600 }}>
                            ₹{row.total_pending.toLocaleString('en-IN')}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  width: '80px',
                                  height: '8px',
                                  background: '#e2e8f0',
                                  borderRadius: '4px',
                                  overflow: 'hidden'
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(100, row.collection_rate)}%`,
                                    background: '#0284c7'
                                  }}
                                />
                              </div>
                              <span style={{ fontWeight: 600 }}>{row.collection_rate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ACADEMIC PERFORMANCE */}
          {activeTab === 'academics' && (
            <div>
              <div className={styles.tableCard}>
                <h3 className={styles.tableTitle}>Subject Examination Pass Rates & Grade Averages</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Exam Title</th>
                      <th>Subject</th>
                      <th>Students Appeared</th>
                      <th>Average Score</th>
                      <th>Highest Mark</th>
                      <th>Lowest Mark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {academicData.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                          No exam marks recorded yet.
                        </td>
                      </tr>
                    ) : (
                      academicData.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{row.class_name}</td>
                          <td>{row.exam_name}</td>
                          <td>{row.subject_name}</td>
                          <td>{row.total_students_appeared}</td>
                          <td style={{ fontWeight: 600, color: '#4f46e5' }}>{row.average_score}</td>
                          <td style={{ color: '#16a34a', fontWeight: 600 }}>{row.highest_score}</td>
                          <td style={{ color: '#dc2626' }}>{row.lowest_score}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Export CSV Modal */}
      {isExportOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsExportOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Export System Dataset</h2>
              <button className={styles.closeBtn} onClick={() => setIsExportOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.formLabel}>Select Dataset to Export *</label>
                <select
                  className={styles.formSelect}
                  value={exportType}
                  onChange={(e) => setExportType(e.target.value)}
                >
                  <option value="students">Student Enrollment Roster (CSV)</option>
                  <option value="teachers">Faculty Directory (CSV)</option>
                  <option value="fees">Fee Transaction Log (CSV)</option>
                </select>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                The CSV file will be automatically formatted and downloaded to your computer with all relevant fields.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setIsExportOpen(false)}>
                Cancel
              </button>
              <button
                className={styles.exportBtn}
                onClick={handleExportDownload}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                <span>{isExporting ? 'Generating...' : 'Download CSV'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
