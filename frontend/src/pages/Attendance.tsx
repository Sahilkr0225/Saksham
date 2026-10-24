import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CalendarCheck,
  Calendar,
  Layers,
  Filter,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Check,
  X,
  History,
  AlertTriangle,
  UserCheck,
  UserX,
  Users,
  ShieldAlert,
  TrendingUp,
  PieChart,
  Info,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import styles from './Attendance.module.css';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface Section {
  id: string;
  name: string;
  capacity?: number;
}

export interface ClassItem {
  id: string;
  name: string;
  code?: string;
  sections?: Section[];
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day';

export interface AttendanceRecordItem {
  id?: string | null;
  student_id: string;
  admission_number: string;
  roll_number?: string | null;
  current_section_id?: string | null;
  section_name?: string | null;
  student_name: string;
  status: AttendanceStatus | null;
  remarks?: string | null;
  // Local tracking
  originalStatus: AttendanceStatus | null;
  originalRemarks: string;
}

export interface StudentHistoryRecord {
  date: string;
  status: AttendanceStatus;
  remarks?: string | null;
  subject_id?: string | null;
  marked_by?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const getTodayString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateReadable = (dateStr: string): string => {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

const getInitials = (name: string): string => {
  if (!name) return 'S';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// ─── SVG Doughnut Chart Subcomponent ────────────────────────────────────────

interface DoughnutProps {
  total: number;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  unmarked: number;
  rate: number;
  selectedDate: string;
}

const AttendanceDoughnutChart: React.FC<DoughnutProps> = ({
  total,
  present,
  absent,
  late,
  halfDay,
  unmarked,
  rate,
  selectedDate,
}) => {
  const cx = 110;
  const cy = 110;
  const R = 95; // Outer radius
  const r = 65; // Inner radius

  const slices = useMemo(() => {
    return [
      {
        key: 'present',
        label: 'Present',
        count: present,
        color: '#10b981',
        pct: total > 0 ? Math.round((present / total) * 100) : 0,
      },
      {
        key: 'absent',
        label: 'Absent',
        count: absent,
        color: '#ef4444',
        pct: total > 0 ? Math.round((absent / total) * 100) : 0,
      },
      {
        key: 'late',
        label: 'Late',
        count: late,
        color: '#f59e0b',
        pct: total > 0 ? Math.round((late / total) * 100) : 0,
      },
      {
        key: 'half_day',
        label: 'Half Day',
        count: halfDay,
        color: '#0284c7',
        pct: total > 0 ? Math.round((halfDay / total) * 100) : 0,
      },
      {
        key: 'unmarked',
        label: 'Unmarked',
        count: unmarked,
        color: '#cbd5e1',
        pct: total > 0 ? Math.round((unmarked / total) * 100) : 0,
      },
    ];
  }, [total, present, absent, late, halfDay, unmarked]);

  const nonZeroSlices = useMemo(() => slices.filter((s) => s.count > 0), [slices]);

  // Compute arc SVG paths
  const arcPaths = useMemo(() => {
    if (total === 0 || nonZeroSlices.length === 0) return [];
    if (nonZeroSlices.length === 1) {
      return [
        {
          ...nonZeroSlices[0],
          isFullCircle: true,
        },
      ];
    }

    let currentAngle = -Math.PI / 2; // Start at 12 o'clock
    const gap = nonZeroSlices.length > 1 ? 0.035 : 0;

    return nonZeroSlices.map((slice) => {
      const sliceAngle = (slice.count / total) * 2 * Math.PI;
      const a1 = currentAngle + gap / 2;
      const a2 = currentAngle + sliceAngle - gap / 2;
      currentAngle += sliceAngle;

      const x1Outer = cx + R * Math.cos(a1);
      const y1Outer = cy + R * Math.sin(a1);
      const x2Outer = cx + R * Math.cos(a2);
      const y2Outer = cy + R * Math.sin(a2);
      const x1Inner = cx + r * Math.cos(a2);
      const y1Inner = cy + r * Math.sin(a2);
      const x2Inner = cx + r * Math.cos(a1);
      const y2Inner = cy + r * Math.sin(a1);
      const largeArc = a2 - a1 > Math.PI ? 1 : 0;

      const d = `M ${x1Outer.toFixed(2)} ${y1Outer.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${x2Outer.toFixed(
        2
      )} ${y2Outer.toFixed(2)} L ${x1Inner.toFixed(2)} ${y1Inner.toFixed(
        2
      )} A ${r} ${r} 0 ${largeArc} 0 ${x2Inner.toFixed(2)} ${y2Inner.toFixed(2)} Z`;

      return {
        ...slice,
        isFullCircle: false,
        d,
      };
    });
  }, [total, nonZeroSlices]);

  return (
    <div className={styles.chartBody}>
      <div className={styles.doughnutContainer}>
        {/* SVG Ring */}
        <div className={styles.doughnutWrapper}>
          <svg
            className={styles.doughnutSvg}
            viewBox="0 0 220 220"
            role="img"
            aria-label={`Attendance distribution doughnut chart for ${selectedDate}`}
          >
            <title>Attendance Distribution Chart</title>
            <desc>
              {`Total ${total} students: ${present} present (${slices[0].pct}%), ${absent} absent (${slices[1].pct}%), ${late} late (${slices[2].pct}%), ${halfDay} half day (${slices[3].pct}%), ${unmarked} unmarked (${slices[4].pct}%).`}
            </desc>

            {total === 0 ? (
              // Empty Cohort Ring
              <circle
                cx={cx}
                cy={cy}
                r={80}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth={28}
              />
            ) : unmarked === total ? (
              // 100% Unmarked Roster
              <circle
                cx={cx}
                cy={cy}
                r={80}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={28}
                strokeDasharray="6 4"
              />
            ) : (
              // Render Arc Segments
              arcPaths.map((slice: any) =>
                slice.isFullCircle ? (
                  <circle
                    key={slice.key}
                    cx={cx}
                    cy={cy}
                    r={80}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={28}
                  />
                ) : (
                  <path
                    key={slice.key}
                    d={slice.d}
                    fill={slice.color}
                    className={styles.doughnutSlice}
                  >
                    <title>{`${slice.label}: ${slice.count} student(s) (${slice.pct}%)`}</title>
                  </path>
                )
              )
            )}
          </svg>

          {/* Center Cutout Text */}
          <div className={styles.doughnutCenter}>
            <span className={styles.centerNum}>{total}</span>
            <span className={styles.centerLbl}>Total Students</span>
            {total > 0 && unmarked < total && (
              <span className={styles.centerBadge}>{rate}% Present</span>
            )}
            {total > 0 && unmarked === total && (
              <span
                className={styles.centerBadge}
                style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}
              >
                Unrecorded
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className={styles.legendList}>
          {slices.map((item) => (
            <div key={item.key} className={styles.legendItem}>
              <div className={styles.legendLeft}>
                <span className={styles.legendDot} style={{ background: item.color }} />
                <span>{item.label}</span>
              </div>
              <div className={styles.legendRight}>
                <span className={styles.legendCount}>{item.count}</span>
                <span className={styles.legendPercent}>({item.pct}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Textual Narrative Summary */}
      <div className={styles.textSummary}>
        {total === 0 ? (
          <span>No active students enrolled in this selection. Please verify class allocations.</span>
        ) : unmarked === total ? (
          <span>
            <strong>Roster Not Recorded:</strong> All {total} eligible students are currently unmarked
            for {formatDateReadable(selectedDate)}. Use the register below to mark and save today's
            attendance.
          </span>
        ) : (
          <span>
            <strong>Summary:</strong> Of {total} eligible students, <strong>{present}</strong> are
            present ({slices[0].pct}%), <strong>{absent}</strong> absent ({slices[1].pct}%),{' '}
            <strong>{late}</strong> late ({slices[2].pct}%), <strong>{halfDay}</strong> half day (
            {slices[3].pct}%), and <strong>{unmarked}</strong> unmarked ({slices[4].pct}%).
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Main Attendance Component ──────────────────────────────────────────────

const Attendance: React.FC = () => {
  const { user } = useAuth();
  const canMarkAttendance = useMemo(() => {
    const role = user?.role?.toLowerCase() || '';
    return role === 'super_admin' || role === 'principal' || role === 'teacher';
  }, [user]);

  // Selectors State
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());

  // Roster State
  const [roster, setRoster] = useState<AttendanceRecordItem[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Alerts & Messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Student History Modal State
  const [historyStudent, setHistoryStudent] = useState<AttendanceRecordItem | null>(null);
  const [historyRecords, setHistoryRecords] = useState<StudentHistoryRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Race-condition prevention ref
  const activeFetchIdRef = useRef<number>(0);

  // Selected Class and Section object for labels
  const currentClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  const availableSections = useMemo(() => {
    return currentClass?.sections || [];
  }, [currentClass]);

  const currentSectionName = useMemo(() => {
    if (selectedSectionId === 'all') return 'All Sections';
    const sec = availableSections.find((s) => s.id === selectedSectionId);
    return sec ? `Section ${sec.name}` : 'Selected Section';
  }, [selectedSectionId, availableSections]);

  // Check if there are unsaved local modifications
  const hasUnsavedChanges = useMemo(() => {
    return roster.some(
      (item) =>
        item.status !== item.originalStatus ||
        (item.remarks || '').trim() !== item.originalRemarks.trim()
    );
  }, [roster]);

  // Filtered roster by search term (name, roll no, admission no)
  const filteredRoster = useMemo(() => {
    if (!searchQuery.trim()) return roster;
    const q = searchQuery.toLowerCase().trim();
    return roster.filter(
      (item) =>
        item.student_name.toLowerCase().includes(q) ||
        item.admission_number.toLowerCase().includes(q) ||
        (item.roll_number && item.roll_number.toLowerCase().includes(q))
    );
  }, [roster, searchQuery]);

  // Metrics for the currently loaded roster
  const metrics = useMemo(() => {
    const total = roster.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    let halfDay = 0;
    let unmarked = 0;

    roster.forEach((item) => {
      if (item.status === 'present') present++;
      else if (item.status === 'absent') absent++;
      else if (item.status === 'late') late++;
      else if (item.status === 'half_day') halfDay++;
      else unmarked++;
    });

    const recorded = present + absent + late + halfDay;
    // Standard Attendance Rate = present / total eligible students
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    const completionRate = total > 0 ? Math.round((recorded / total) * 100) : 0;

    return { total, present, absent, late, halfDay, unmarked, recorded, rate, completionRate };
  }, [roster]);

  // ─── Initial Load: Academic Years & Classes ───────────────────────────────

  useEffect(() => {
    let isMounted = true;

    const fetchInitialData = async () => {
      try {
        const [yearsRes, classesRes] = await Promise.all([
          apiClient.get('/academic/academic-years'),
          apiClient.get('/academic/classes'),
        ]);

        if (!isMounted) return;

        // 1. Process Academic Years
        if (yearsRes.data.success && Array.isArray(yearsRes.data.data?.academic_years)) {
          const years: AcademicYear[] = yearsRes.data.data.academic_years;
          setAcademicYears(years);
          const currentYear = years.find((y) => y.is_current) || years[0];
          if (currentYear) {
            setSelectedYearId(currentYear.id);
          }
        }

        // 2. Process Classes
        if (classesRes.data.success && Array.isArray(classesRes.data.data?.classes)) {
          const clsList: ClassItem[] = classesRes.data.data.classes;
          setClasses(clsList);
          if (clsList.length > 0) {
            setSelectedClassId(clsList[0].id);
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(
          err.response?.data?.message || 'Failed to initialize academic data. Please refresh the page.'
        );
      }
    };

    fetchInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  // ─── Load Class Roster & Attendance ───────────────────────────────────────

  const loadRoster = useCallback(
    async (classId: string, date: string, sectionId: string) => {
      if (!classId || !date) {
        setRoster([]);
        return;
      }

      const fetchId = ++activeFetchIdRef.current;
      setIsLoadingRoster(true);
      setErrorMessage(null);

      try {
        let url = `/attendance/class/${classId}?date=${date}&type=daily`;
        if (sectionId && sectionId !== 'all') {
          url += `&section_id=${sectionId}`;
        }

        const res = await apiClient.get(url);

        // Discard stale responses if a newer request was dispatched
        if (fetchId !== activeFetchIdRef.current) return;

        if (res.data.success && Array.isArray(res.data.data?.attendance)) {
          const rawList = res.data.data.attendance;
          const mapped: AttendanceRecordItem[] = rawList.map((row: any) => ({
            id: row.id || null,
            student_id: row.student_id,
            admission_number: row.admission_number,
            roll_number: row.roll_number || null,
            current_section_id: row.current_section_id || null,
            section_name: row.section_name || null,
            student_name: row.student_name,
            status: row.status || null,
            remarks: row.remarks || '',
            originalStatus: row.status || null,
            originalRemarks: row.remarks || '',
          }));
          setRoster(mapped);
        } else {
          setRoster([]);
        }
      } catch (err: any) {
        if (fetchId !== activeFetchIdRef.current) return;
        setErrorMessage(
          err.response?.data?.message || 'Failed to fetch student attendance roster'
        );
        setRoster([]);
      } finally {
        if (fetchId === activeFetchIdRef.current) {
          setIsLoadingRoster(false);
        }
      }
    },
    []
  );

  // Trigger roster fetch whenever class, date, or section changes
  useEffect(() => {
    if (selectedClassId && selectedDate) {
      loadRoster(selectedClassId, selectedDate, selectedSectionId);
    }
  }, [selectedClassId, selectedDate, selectedSectionId, loadRoster]);

  // When class changes, reset section filter to 'all'
  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    setSelectedSectionId('all');
  };

  // ─── Status Modification Handlers ─────────────────────────────────────────

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    if (!canMarkAttendance || isSubmitting) return;

    setRoster((prev) =>
      prev.map((item) => {
        if (item.student_id !== studentId) return item;
        return {
          ...item,
          status,
        };
      })
    );
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    if (!canMarkAttendance || isSubmitting) return;

    setRoster((prev) =>
      prev.map((item) => {
        if (item.student_id !== studentId) return item;
        return { ...item, remarks };
      })
    );
  };

  // Quick Action: Mark all students as present
  const handleMarkAllPresent = () => {
    if (!canMarkAttendance || isSubmitting || roster.length === 0) return;

    setRoster((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'present',
      }))
    );
  };

  // Quick Action: Reset changes to original state
  const handleResetChanges = () => {
    if (isSubmitting) return;
    setRoster((prev) =>
      prev.map((item) => ({
        ...item,
        status: item.originalStatus,
        remarks: item.originalRemarks,
      }))
    );
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  // ─── Submit Attendance ────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!canMarkAttendance || isSubmitting) return;

    // Validation: Require academic year and class
    if (!selectedYearId || !selectedClassId || !selectedDate) {
      setErrorMessage('Please ensure Academic Year, Class, and Date are all selected.');
      return;
    }

    // Filter only records that have a status set
    const markedRecords = roster
      .filter((item) => item.status !== null)
      .map((item) => ({
        student_id: item.student_id,
        status: item.status as AttendanceStatus,
        remarks: item.remarks ? item.remarks.trim() : undefined,
      }));

    if (markedRecords.length === 0) {
      setErrorMessage('Please mark attendance for at least one student before saving.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = {
        class_id: selectedClassId,
        academic_year_id: selectedYearId,
        date: selectedDate,
        type: 'daily',
        records: markedRecords,
      };

      const res = await apiClient.post('/attendance', payload);

      if (res.data.success) {
        setSuccessMessage(
          `Attendance successfully saved for ${markedRecords.length} student(s) on ${formatDateReadable(
            selectedDate
          )}.`
        );

        // Refresh roster from server to guarantee true persistent state
        await loadRoster(selectedClassId, selectedDate, selectedSectionId);
      } else {
        setErrorMessage(res.data.message || 'Server encountered an issue saving attendance.');
      }
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message ||
          (err.response?.data?.data?.error
            ? `Server Error: ${err.response.data.data.error}`
            : 'Failed to save attendance. Please check network connection.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Student History Modal ────────────────────────────────────────────────

  const openStudentHistory = async (student: AttendanceRecordItem) => {
    setHistoryStudent(student);
    setHistoryRecords([]);
    setIsLoadingHistory(true);

    try {
      const res = await apiClient.get(`/attendance/student/${student.student_id}?type=daily`);
      if (res.data.success && Array.isArray(res.data.data?.attendance)) {
        setHistoryRecords(res.data.data.attendance);
      }
    } catch (err: any) {
      console.error('Failed to load history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const closeStudentHistory = () => {
    setHistoryStudent(null);
    setHistoryRecords([]);
  };

  // Mini metrics for history modal
  const historyStats = useMemo(() => {
    const total = historyRecords.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    let halfDay = 0;

    historyRecords.forEach((r) => {
      if (r.status === 'present') present++;
      else if (r.status === 'absent') absent++;
      else if (r.status === 'late') late++;
      else if (r.status === 'half_day') halfDay++;
    });

    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, halfDay, rate };
  }, [historyRecords]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Top Row: Header & Navigation Controls ── */}
      <div className={styles.headerRow}>
        <div className={styles.headerTitle}>
          <h2>
            <CalendarCheck size={28} color="#6366f1" />
            Student Attendance Dashboard
          </h2>
          <p>Real-time attendance register, cohort distribution analytics, and compliance logs.</p>
        </div>

        <div className={styles.headerActions}>
          {hasUnsavedChanges && (
            <span className={styles.unsavedBadge}>
              <AlertTriangle size={14} />
              Unsaved Changes
            </span>
          )}

          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => loadRoster(selectedClassId, selectedDate, selectedSectionId)}
            disabled={isLoadingRoster || isSubmitting}
            title="Refresh current roster"
          >
            <RotateCcw size={18} className={isLoadingRoster ? styles.spinner : ''} />
          </button>

          {canMarkAttendance && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleSubmit}
              disabled={isSubmitting || isLoadingRoster || roster.length === 0}
            >
              {isSubmitting ? (
                <>
                  <RotateCcw size={16} className={styles.spinner} />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Save Attendance
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Selection Filter Bar ── */}
      <div className={styles.filterCard}>
        <div className={styles.filterGrid}>
          {/* Academic Year */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="attendance-academic-year">
              <Calendar size={14} color="#6366f1" />
              Academic Year
            </label>
            <select
              id="attendance-academic-year"
              className={styles.select}
              value={selectedYearId}
              onChange={(e) => setSelectedYearId(e.target.value)}
              disabled={isLoadingRoster || isSubmitting}
            >
              {academicYears.length === 0 ? (
                <option value="">Loading years...</option>
              ) : (
                academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} {y.is_current ? '(Current Active)' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Class */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="attendance-class">
              <Layers size={14} color="#6366f1" />
              Class
            </label>
            <select
              id="attendance-class"
              className={styles.select}
              value={selectedClassId}
              onChange={(e) => handleClassChange(e.target.value)}
              disabled={isLoadingRoster || isSubmitting}
            >
              {classes.length === 0 ? (
                <option value="">No classes configured</option>
              ) : (
                classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.code ? `(${c.code})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Section */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="attendance-section">
              <Filter size={14} color="#6366f1" />
              Section
            </label>
            <select
              id="attendance-section"
              className={styles.select}
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              disabled={isLoadingRoster || isSubmitting}
            >
              <option value="all">All Sections</option>
              {availableSections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  Section {sec.name} {sec.capacity ? `(Cap: ${sec.capacity})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="attendance-date">
              <CalendarCheck size={14} color="#6366f1" />
              Attendance Date
            </label>
            <input
              id="attendance-date"
              type="date"
              className={styles.dateInput}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={isLoadingRoster || isSubmitting}
            />
          </div>
        </div>
      </div>

      {/* ── Banners & Notifications ── */}
      {!canMarkAttendance && (
        <div className={`${styles.banner} ${styles.bannerInfo}`}>
          <ShieldAlert size={20} />
          <div>
            <strong>Read-Only Mode:</strong> Your role ({user?.role || 'Guest'}) does not have
            authorization to modify attendance records. Attendance is displayed for inspection only.
          </div>
        </div>
      )}

      {successMessage && (
        <div className={`${styles.banner} ${styles.bannerSuccess}`}>
          <CheckCircle2 size={20} />
          <div style={{ flex: 1 }}>{successMessage}</div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setSuccessMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <AlertCircle size={20} />
          <div style={{ flex: 1 }}>{errorMessage}</div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setErrorMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Second Row: 5 Attendance KPI Cards ── */}
      <div className={styles.metricsGrid}>
        {/* Total Students */}
        <div
          className={styles.metricCard}
          style={{ '--card-accent': '#6366f1', '--card-icon-bg': '#eef2ff' } as any}
        >
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total Students</span>
            <div className={styles.metricIcon}>
              <Users size={16} />
            </div>
          </div>
          <span className={styles.metricValue}>{metrics.total}</span>
          <span className={styles.metricSubtext}>Eligible in selected scope</span>
        </div>

        {/* Present */}
        <div
          className={styles.metricCard}
          style={{ '--card-accent': '#10b981', '--card-icon-bg': '#ecfdf5' } as any}
        >
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Present</span>
            <div className={styles.metricIcon} style={{ color: '#059669' }}>
              <UserCheck size={16} />
            </div>
          </div>
          <span className={styles.metricValue} style={{ color: '#059669' }}>
            {metrics.present}
          </span>
          <span className={styles.metricSubtext}>
            {metrics.total > 0 ? `${Math.round((metrics.present / metrics.total) * 100)}% of cohort` : '0% of cohort'}
          </span>
        </div>

        {/* Absent */}
        <div
          className={styles.metricCard}
          style={{ '--card-accent': '#ef4444', '--card-icon-bg': '#fef2f2' } as any}
        >
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Absent</span>
            <div className={styles.metricIcon} style={{ color: '#dc2626' }}>
              <UserX size={16} />
            </div>
          </div>
          <span className={styles.metricValue} style={{ color: '#dc2626' }}>
            {metrics.absent}
          </span>
          <span className={styles.metricSubtext}>
            {metrics.total > 0 ? `${Math.round((metrics.absent / metrics.total) * 100)}% of cohort` : '0% of cohort'}
          </span>
        </div>

        {/* Late / Half Day */}
        <div
          className={styles.metricCard}
          style={{ '--card-accent': '#f59e0b', '--card-icon-bg': '#fffbeb' } as any}
        >
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Late & Half Day</span>
            <div className={styles.metricIcon} style={{ color: '#d97706' }}>
              <Clock size={16} />
            </div>
          </div>
          <span className={styles.metricValue} style={{ color: '#d97706' }}>
            {metrics.late + metrics.halfDay}
          </span>
          <span className={styles.metricSubtext}>
            {metrics.late} late · {metrics.halfDay} half-day
          </span>
        </div>

        {/* Attendance Rate */}
        <div
          className={styles.metricCard}
          style={{ '--card-accent': '#8b5cf6', '--card-icon-bg': '#f5f3ff' } as any}
        >
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Attendance Rate</span>
            <div className={styles.metricIcon} style={{ color: '#7c3aed' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <span className={styles.metricValue} style={{ color: '#7c3aed' }}>
            {metrics.rate}%
          </span>
          <span className={styles.metricSubtext}>Present / Total eligible students</span>
        </div>
      </div>

      {/* ── Third Row: Analytics Dashboard Grid ── */}
      <div className={styles.analyticsGrid}>
        {/* Column 1: Attendance Distribution (Doughnut Chart) */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.chartTitle}>
                <PieChart size={18} color="#6366f1" />
                Attendance Distribution
              </h3>
              <p className={styles.chartSubtitle}>
                Distribution breakdown for {formatDateReadable(selectedDate)}
              </p>
            </div>
            <span className={styles.chartScopeTag}>
              {currentClass?.name || 'Class'} · {currentSectionName}
            </span>
          </div>

          <AttendanceDoughnutChart
            total={metrics.total}
            present={metrics.present}
            absent={metrics.absent}
            late={metrics.late}
            halfDay={metrics.halfDay}
            unmarked={metrics.unmarked}
            rate={metrics.rate}
            selectedDate={selectedDate}
          />
        </div>

        {/* Column 2: Attendance Trends & Scope */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.chartTitle}>
                <TrendingUp size={18} color="#6366f1" />
                Attendance Trends & Scope
              </h3>
              <p className={styles.chartSubtitle}>Cohort marking completion and historical scope</p>
            </div>
            <span className={styles.chartScopeTag}>Single-Date Roster</span>
          </div>

          <div className={styles.trendsCardContent}>
            {/* Marking Completion Progress Section */}
            <div className={styles.progressSection}>
              <div className={styles.progressHeader}>
                <span>Daily Marking Progress</span>
                <span>
                  {metrics.recorded} of {metrics.total} Recorded ({metrics.completionRate}%)
                </span>
              </div>
              <div className={styles.progressBarContainer}>
                {metrics.total > 0 && (
                  <>
                    <div
                      className={styles.progressBarSegment}
                      style={{
                        width: `${(metrics.present / metrics.total) * 100}%`,
                        background: '#10b981',
                      }}
                      title={`Present: ${metrics.present}`}
                    />
                    <div
                      className={styles.progressBarSegment}
                      style={{
                        width: `${(metrics.absent / metrics.total) * 100}%`,
                        background: '#ef4444',
                      }}
                      title={`Absent: ${metrics.absent}`}
                    />
                    <div
                      className={styles.progressBarSegment}
                      style={{
                        width: `${(metrics.late / metrics.total) * 100}%`,
                        background: '#f59e0b',
                      }}
                      title={`Late: ${metrics.late}`}
                    />
                    <div
                      className={styles.progressBarSegment}
                      style={{
                        width: `${(metrics.halfDay / metrics.total) * 100}%`,
                        background: '#0284c7',
                      }}
                      title={`Half Day: ${metrics.halfDay}`}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Status Mini Grid */}
            <div className={styles.statusMiniGrid}>
              <div className={styles.statusMiniBox} style={{ borderLeft: '3px solid #10b981' }}>
                <span className={styles.statusMiniLabel}>Present Rate</span>
                <span className={styles.statusMiniVal} style={{ color: '#059669' }}>
                  {metrics.total > 0 ? Math.round((metrics.present / metrics.total) * 100) : 0}%
                </span>
              </div>
              <div className={styles.statusMiniBox} style={{ borderLeft: '3px solid #ef4444' }}>
                <span className={styles.statusMiniLabel}>Absent Rate</span>
                <span className={styles.statusMiniVal} style={{ color: '#dc2626' }}>
                  {metrics.total > 0 ? Math.round((metrics.absent / metrics.total) * 100) : 0}%
                </span>
              </div>
              <div className={styles.statusMiniBox} style={{ borderLeft: '3px solid #f59e0b' }}>
                <span className={styles.statusMiniLabel}>Late Arrival</span>
                <span className={styles.statusMiniVal} style={{ color: '#d97706' }}>
                  {metrics.late}
                </span>
              </div>
              <div className={styles.statusMiniBox} style={{ borderLeft: '3px solid #0284c7' }}>
                <span className={styles.statusMiniLabel}>Half Day</span>
                <span className={styles.statusMiniVal} style={{ color: '#0284c7' }}>
                  {metrics.halfDay}
                </span>
              </div>
            </div>

            {/* Real Data Scope & Transparent API Contract Callout */}
            <div className={styles.apiNoticeBox}>
              <Info size={20} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Class Historical Trends (Multi-Date API):</strong> The backend API currently
                operates on a verified single-date class roster model (
                <code>GET /attendance/class/:id?date=...</code>). A multi-date class trend
                aggregation endpoint (<code>GET /attendance/class/:id/trends</code>) is scheduled in
                the platform roadmap. Individual student longitudinal logs are fully supported and
                can be inspected via the <strong>Log</strong> action in the register below.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Final Section: Student Attendance Register ── */}
      <div className={styles.toolbarCard}>
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search roster by name, roll no, or admission no..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {canMarkAttendance && (
          <div className={styles.quickActions}>
            <button
              type="button"
              className={`${styles.quickBtn} ${styles.quickBtnPresent}`}
              onClick={handleMarkAllPresent}
              disabled={isSubmitting || isLoadingRoster || roster.length === 0}
            >
              <UserCheck size={14} />
              Mark All Present
            </button>

            {hasUnsavedChanges && (
              <button
                type="button"
                className={styles.quickBtn}
                onClick={handleResetChanges}
                disabled={isSubmitting}
              >
                <RotateCcw size={14} />
                Reset Changes
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Roster Table ── */}
      <div className={styles.tableContainer}>
        {isLoadingRoster ? (
          <div className={styles.stateContainer}>
            <RotateCcw size={32} className={styles.spinner} color="#6366f1" />
            <p className={styles.stateTitle}>Loading Attendance Roster...</p>
            <p className={styles.stateDesc}>Fetching eligible students and recorded attendance states.</p>
          </div>
        ) : roster.length === 0 ? (
          <div className={styles.stateContainer}>
            <div className={styles.stateIcon}>
              <Users size={24} />
            </div>
            <p className={styles.stateTitle}>No Active Students Found</p>
            <p className={styles.stateDesc}>
              There are no active students enrolled in this class and section. Please verify academic
              allocations or select another section.
            </p>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className={styles.stateContainer}>
            <div className={styles.stateIcon}>
              <Search size={24} />
            </div>
            <p className={styles.stateTitle}>No Matching Students</p>
            <p className={styles.stateDesc}>No students in this class match "{searchQuery}".</p>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Roll No</th>
                  <th style={{ width: '140px' }}>Admission No</th>
                  <th>Student Name</th>
                  <th style={{ width: '110px' }}>Section</th>
                  <th style={{ width: '310px' }}>Attendance Status</th>
                  <th style={{ width: '220px' }}>Remarks</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>History</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoster.map((student) => {
                  const isPresent = student.status === 'present';
                  const isAbsent = student.status === 'absent';
                  const isLate = student.status === 'late';
                  const isHalfDay = student.status === 'half_day';

                  return (
                    <tr key={student.student_id}>
                      {/* Roll No */}
                      <td>
                        <span className={styles.badge}>{student.roll_number || '—'}</span>
                      </td>

                      {/* Admission No */}
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                          {student.admission_number}
                        </span>
                      </td>

                      {/* Student Info */}
                      <td>
                        <div className={styles.studentCell}>
                          <div className={styles.avatar}>{getInitials(student.student_name)}</div>
                          <div className={styles.studentMeta}>
                            <span className={styles.studentName}>{student.student_name}</span>
                          </div>
                        </div>
                      </td>

                      {/* Section */}
                      <td>
                        <span className={styles.badge}>
                          {student.section_name ? `Sec ${student.section_name}` : 'Unassigned'}
                        </span>
                      </td>

                      {/* Status Selector */}
                      <td>
                        <div className={styles.statusButtonGroup}>
                          <button
                            type="button"
                            className={`${styles.statusBtn} ${styles.statusBtnPresent} ${
                              isPresent ? styles.active : ''
                            }`}
                            onClick={() => handleStatusChange(student.student_id, 'present')}
                            disabled={!canMarkAttendance || isSubmitting}
                          >
                            <Check size={13} />
                            Present
                          </button>

                          <button
                            type="button"
                            className={`${styles.statusBtn} ${styles.statusBtnAbsent} ${
                              isAbsent ? styles.active : ''
                            }`}
                            onClick={() => handleStatusChange(student.student_id, 'absent')}
                            disabled={!canMarkAttendance || isSubmitting}
                          >
                            <X size={13} />
                            Absent
                          </button>

                          <button
                            type="button"
                            className={`${styles.statusBtn} ${styles.statusBtnLate} ${
                              isLate ? styles.active : ''
                            }`}
                            onClick={() => handleStatusChange(student.student_id, 'late')}
                            disabled={!canMarkAttendance || isSubmitting}
                          >
                            <Clock size={13} />
                            Late
                          </button>

                          <button
                            type="button"
                            className={`${styles.statusBtn} ${styles.statusBtnHalfDay} ${
                              isHalfDay ? styles.active : ''
                            }`}
                            onClick={() => handleStatusChange(student.student_id, 'half_day')}
                            disabled={!canMarkAttendance || isSubmitting}
                          >
                            Half Day
                          </button>
                        </div>
                      </td>

                      {/* Remarks */}
                      <td>
                        <input
                          type="text"
                          className={styles.remarksInput}
                          placeholder={canMarkAttendance ? 'Optional remarks...' : 'No remarks'}
                          value={student.remarks || ''}
                          maxLength={255}
                          onChange={(e) => handleRemarksChange(student.student_id, e.target.value)}
                          disabled={!canMarkAttendance || isSubmitting}
                        />
                      </td>

                      {/* History Action */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => openStudentHistory(student)}
                          title={`View attendance history for ${student.student_name}`}
                        >
                          <History size={14} />
                          Log
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Student History Modal ── */}
      {historyStudent && (
        <div className={styles.modalBackdrop} onClick={closeStudentHistory}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3>{historyStudent.student_name} — Attendance Record</h3>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Admission: {historyStudent.admission_number} | Roll: {historyStudent.roll_number || '—'}
                </span>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={closeStudentHistory}
                title="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Mini Stats */}
              <div className={styles.historyStats}>
                <div className={styles.historyStatBox}>
                  <div className={styles.historyStatVal}>{historyStats.total}</div>
                  <div className={styles.historyStatLbl}>Total Days</div>
                </div>
                <div className={styles.historyStatBox}>
                  <div className={styles.historyStatVal} style={{ color: '#059669' }}>
                    {historyStats.present}
                  </div>
                  <div className={styles.historyStatLbl}>Present</div>
                </div>
                <div className={styles.historyStatBox}>
                  <div className={styles.historyStatVal} style={{ color: '#dc2626' }}>
                    {historyStats.absent}
                  </div>
                  <div className={styles.historyStatLbl}>Absent</div>
                </div>
                <div className={styles.historyStatBox}>
                  <div className={styles.historyStatVal} style={{ color: '#d97706' }}>
                    {historyStats.late}
                  </div>
                  <div className={styles.historyStatLbl}>Late</div>
                </div>
                <div className={styles.historyStatBox}>
                  <div className={styles.historyStatVal} style={{ color: '#7c3aed' }}>
                    {historyStats.rate}%
                  </div>
                  <div className={styles.historyStatLbl}>Attendance %</div>
                </div>
              </div>

              {/* Records List */}
              {isLoadingHistory ? (
                <div className={styles.stateContainer}>
                  <RotateCcw size={24} className={styles.spinner} color="#6366f1" />
                  <p>Fetching attendance history...</p>
                </div>
              ) : historyRecords.length === 0 ? (
                <div className={styles.stateContainer}>
                  <p className={styles.stateTitle}>No Attendance Records Found</p>
                  <p className={styles.stateDesc}>
                    There are no recorded daily attendance sessions for this student.
                  </p>
                </div>
              ) : (
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRecords.map((r, idx) => {
                      let pillClass = styles.statusPillPresent;
                      if (r.status === 'absent') pillClass = styles.statusPillAbsent;
                      else if (r.status === 'late') pillClass = styles.statusPillLate;
                      else if (r.status === 'half_day') pillClass = styles.statusPillHalfDay;

                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{r.date.substring(0, 10)}</td>
                          <td>
                            <span className={`${styles.statusPill} ${pillClass}`}>{r.status}</span>
                          </td>
                          <td style={{ color: r.remarks ? '#0f172a' : '#94a3b8' }}>
                            {r.remarks || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={closeStudentHistory}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
