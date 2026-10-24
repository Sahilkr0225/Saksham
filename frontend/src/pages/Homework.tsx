import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  Search,
  Plus,
  RotateCcw,
  Edit3,
  Trash2,
  Archive,
  ArchiveRestore,
  UserCheck,
  FileText,
  X,
  Award,
  Layers,
  Check,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import styles from './Homework.module.css';

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

export interface SubjectItem {
  id: string;
  name: string;
  code?: string;
  type?: string;
}

export interface HomeworkItem {
  id: string;
  title: string;
  description?: string | null;
  class_id: string;
  class_name?: string;
  section_id?: string | null;
  section_name?: string | null;
  subject_id: string;
  subject_name?: string;
  academic_year_id: string;
  assigned_by?: string | null;
  teacher_name?: string | null;
  due_date: string;
  status: 'active' | 'archived';
  submission_count?: number;
  submitted_students_count?: number;
  graded_count?: number;
  total_students?: number;
  created_at: string;
}

export interface SubmissionItem {
  id: string;
  attempt_number: number;
  status: 'submitted' | 'late' | 'graded';
  remarks?: string | null;
  submitted_at: string;
  student_name: string;
  roll_number?: string | null;
  student_id: string;
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
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

const getDueStatusInfo = (dueDateStr: string, status: string) => {
  if (status === 'archived') {
    return { label: 'Archived', className: styles.statusArchived };
  }
  const today = getTodayString();
  if (dueDateStr === today) {
    return { label: 'Due Today', className: styles.dueToday };
  }
  if (dueDateStr < today) {
    return { label: 'Overdue', className: styles.dueOverdue };
  }
  // Days remaining
  const due = new Date(dueDateStr).getTime();
  const now = new Date(today).getTime();
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  return {
    label: diffDays === 1 ? 'Due Tomorrow' : `Due in ${diffDays} days`,
    className: styles.dueUpcoming,
  };
};

// ─── Component ──────────────────────────────────────────────────────────────

const Homework: React.FC = () => {
  const { user } = useAuth();
  const userRole = user?.role || '';

  // RBAC permissions
  const canCreate = ['super_admin', 'principal', 'teacher'].includes(userRole);
  const canEdit = ['super_admin', 'principal', 'teacher'].includes(userRole);
  const canDelete = ['super_admin', 'principal'].includes(userRole);
  const canGrade = ['super_admin', 'principal', 'teacher'].includes(userRole);

  // Metadata states
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);

  // Filter states
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('active');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const latestRequestIdRef = useRef<number>(0);

  // Debounce search query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Main list & loading states
  const [homeworkList, setHomeworkList] = useState<HomeworkItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    class_id: '',
    section_id: '',
    subject_id: '',
    academic_year_id: '',
    due_date: getTodayString(),
  });

  // Edit Modal state
  const [editItem, setEditItem] = useState<HomeworkItem | null>(null);
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    due_date: '',
    status: 'active' as 'active' | 'archived',
  });

  // Submissions & Grading Drawer state
  const [submissionsDrawerItem, setSubmissionsDrawerItem] = useState<HomeworkItem | null>(null);
  const [submissionsList, setSubmissionsList] = useState<SubmissionItem[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState<boolean>(false);
  const [gradingSubmittingId, setGradingSubmittingId] = useState<string | null>(null);
  const [gradingState, setGradingState] = useState<
    Record<string, { status: 'submitted' | 'late' | 'graded'; remarks: string }>
  >({});

  // Delete confirmation
  const [deleteItem, setDeleteItem] = useState<HomeworkItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState<boolean>(false);

  // Available sections for current class filter
  const currentClassSections = useMemo(() => {
    if (!selectedClass) return [];
    const found = classes.find((c) => c.id === selectedClass);
    return found?.sections || [];
  }, [classes, selectedClass]);

  // Available sections for create modal
  const createClassSections = useMemo(() => {
    if (!createForm.class_id) return [];
    const found = classes.find((c) => c.id === createForm.class_id);
    return found?.sections || [];
  }, [classes, createForm.class_id]);

  // ─── Fetch Metadata ────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [yearsRes, classesRes, subjectsRes] = await Promise.all([
          apiClient.get('/academic/academic-years'),
          apiClient.get('/academic/classes'),
          apiClient.get('/academic/subjects'),
        ]);

        if (yearsRes.data?.success && yearsRes.data?.data?.academic_years) {
          const yrs: AcademicYear[] = yearsRes.data.data.academic_years;
          setAcademicYears(yrs);
          const currentYear = yrs.find((y) => y.is_current) || yrs[0];
          if (currentYear) {
            setSelectedYear(currentYear.id);
            setCreateForm((prev) => ({ ...prev, academic_year_id: currentYear.id }));
          }
        }

        if (classesRes.data?.success && classesRes.data?.data?.classes) {
          setClasses(classesRes.data.data.classes);
        }

        if (subjectsRes.data?.success && subjectsRes.data?.data?.subjects) {
          setSubjects(subjectsRes.data.data.subjects);
        }
      } catch (err: any) {
        console.error('Failed to load homework metadata:', err);
        setApiError('Failed to load academic structure options');
      }
    };

    fetchMetadata();
  }, []);

  // ─── Fetch Homework Directory ──────────────────────────────────────────────

  const fetchHomework = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams();
      if (selectedYear) params.append('academic_year_id', selectedYear);
      if (selectedClass) params.append('class_id', selectedClass);
      if (selectedSection) params.append('section_id', selectedSection);
      if (selectedSubject) params.append('subject_id', selectedSubject);
      if (selectedStatus && selectedStatus !== 'all') params.append('status', selectedStatus);
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());

      const res = await apiClient.get(`/homework?${params.toString()}`);
      if (requestId === latestRequestIdRef.current && res.data?.success) {
        setHomeworkList(res.data.data.homework || []);
      }
    } catch (err: any) {
      if (requestId === latestRequestIdRef.current) {
        console.error('Error fetching homework list:', err);
        setApiError(err.response?.data?.message || 'Failed to load homework directory');
      }
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [selectedYear, selectedClass, selectedSection, selectedSubject, selectedStatus, debouncedSearch]);

  useEffect(() => {
    fetchHomework();
  }, [fetchHomework]);

  // ─── KPIs Calculation ──────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const total = homeworkList.length;
    const today = getTodayString();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const threeDaysStr = threeDaysLater.toISOString().split('T')[0];

    const dueSoon = homeworkList.filter(
      (h) => h.status === 'active' && h.due_date >= today && h.due_date <= threeDaysStr
    ).length;

    const totalSubmissions = homeworkList.reduce(
      (acc, h) => acc + (Number(h.submission_count) || 0),
      0
    );

    const pendingGrading = homeworkList.reduce((acc, h) => {
      const sub = Number(h.submission_count) || 0;
      const graded = Number(h.graded_count) || 0;
      return acc + Math.max(0, sub - graded);
    }, 0);

    return { total, dueSoon, totalSubmissions, pendingGrading };
  }, [homeworkList]);

  // ─── Reset Filters ─────────────────────────────────────────────────────────

  const handleResetFilters = () => {
    const currentYear = academicYears.find((y) => y.is_current) || academicYears[0];
    setSelectedYear(currentYear ? currentYear.id : '');
    setSelectedClass('');
    setSelectedSection('');
    setSelectedSubject('');
    setSelectedStatus('active');
    setSearchQuery('');
    setDebouncedSearch('');
  };

  // ─── Create Homework Handlers ──────────────────────────────────────────────

  const handleOpenCreate = () => {
    const currentYear = academicYears.find((y) => y.is_current) || academicYears[0];
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    const defaultDueDate = defaultDate.toISOString().split('T')[0];

    setCreateForm({
      title: '',
      description: '',
      class_id: classes[0]?.id || '',
      section_id: '',
      subject_id: subjects[0]?.id || '',
      academic_year_id: currentYear?.id || '',
      due_date: defaultDueDate,
    });
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setCreateError('Title is required');
      return;
    }
    if (!createForm.class_id) {
      setCreateError('Class is required');
      return;
    }
    if (!createForm.subject_id) {
      setCreateError('Subject is required');
      return;
    }
    if (!createForm.due_date) {
      setCreateError('Due date is required');
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const payload: any = {
        title: createForm.title.trim(),
        class_id: createForm.class_id,
        subject_id: createForm.subject_id,
        academic_year_id: createForm.academic_year_id,
        due_date: createForm.due_date,
      };
      if (createForm.description.trim()) {
        payload.description = createForm.description.trim();
      }
      if (createForm.section_id) {
        payload.section_id = createForm.section_id;
      }

      const res = await apiClient.post('/homework', payload);
      if (res.data?.success) {
        setIsCreateOpen(false);
        setSuccessMsg('Assignment created successfully!');
        fetchHomework();
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      console.error('Create homework failed:', err);
      setCreateError(err.response?.data?.message || 'Failed to create assignment');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // ─── Edit Homework Handlers ────────────────────────────────────────────────

  const handleOpenEdit = (hw: HomeworkItem) => {
    setEditItem(hw);
    setEditForm({
      title: hw.title,
      description: hw.description || '',
      due_date: hw.due_date.split('T')[0],
      status: hw.status,
    });
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    if (!editForm.title.trim()) {
      setEditError('Title cannot be empty');
      return;
    }
    if (!editForm.due_date) {
      setEditError('Due date is required');
      return;
    }

    setEditSubmitting(true);
    setEditError(null);

    try {
      const res = await apiClient.patch(`/homework/${editItem.id}`, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        due_date: editForm.due_date,
        status: editForm.status,
      });

      if (res.data?.success) {
        setEditItem(null);
        setSuccessMsg('Assignment updated successfully!');
        fetchHomework();
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      console.error('Update homework failed:', err);
      setEditError(err.response?.data?.message || 'Failed to update assignment');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ─── Archive / Restore Handler ─────────────────────────────────────────────

  const handleToggleArchive = async (hw: HomeworkItem) => {
    const newStatus = hw.status === 'active' ? 'archived' : 'active';
    try {
      const res = await apiClient.patch(`/homework/${hw.id}`, { status: newStatus });
      if (res.data?.success) {
        setSuccessMsg(
          `Assignment ${newStatus === 'archived' ? 'archived' : 'restored'} successfully!`
        );
        fetchHomework();
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setApiError(err.response?.data?.message || 'Status transition failed');
    }
  };

  // ─── Delete Homework Handler ───────────────────────────────────────────────

  const handleDeleteSubmit = async () => {
    if (!deleteItem) return;
    setDeleteSubmitting(true);
    try {
      const res = await apiClient.delete(`/homework/${deleteItem.id}`);
      if (res.data?.success) {
        setDeleteItem(null);
        setSuccessMsg('Assignment deleted successfully!');
        fetchHomework();
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setApiError(err.response?.data?.message || 'Delete operation failed');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ─── Submissions & Grading Drawer Handlers ─────────────────────────────────

  const handleOpenSubmissions = async (hw: HomeworkItem) => {
    setSubmissionsDrawerItem(hw);
    setSubmissionsLoading(true);
    try {
      const res = await apiClient.get(`/homework/${hw.id}/submissions`);
      if (res.data?.success) {
        const subs: SubmissionItem[] = res.data.data.submissions || [];
        setSubmissionsList(subs);

        // Pre-populate grading state
        const initialGrading: Record<
          string,
          { status: 'submitted' | 'late' | 'graded'; remarks: string }
        > = {};
        subs.forEach((s) => {
          initialGrading[s.id] = {
            status: s.status,
            remarks: s.remarks || '',
          };
        });
        setGradingState(initialGrading);
      }
    } catch (err: any) {
      console.error('Failed to load submissions:', err);
      setApiError('Failed to fetch student submissions');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleSaveGrade = async (submissionId: string) => {
    const data = gradingState[submissionId];
    if (!data) return;

    setGradingSubmittingId(submissionId);
    try {
      const res = await apiClient.patch(`/homework/submissions/${submissionId}`, {
        status: data.status,
        remarks: data.remarks.trim() || null,
      });

      if (res.data?.success) {
        setSubmissionsList((prev) =>
          prev.map((s) =>
            s.id === submissionId
              ? { ...s, status: data.status, remarks: data.remarks }
              : s
          )
        );
        fetchHomework();
      }
    } catch (err: any) {
      console.error('Grading update failed:', err);
      alert(err.response?.data?.message || 'Failed to update grade/remarks');
    } finally {
      setGradingSubmittingId(null);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.headerRow}>
        <div className={styles.headerTitle}>
          <div className={styles.titleWithBadge}>
            <h2>
              <BookOpen size={26} color="#6366f1" />
              Homework & Assignments
            </h2>
            <span className={styles.totalBadge}>{kpis.total} Total</span>
          </div>
          <p className={styles.headerSubtitle}>
            Create assignments, track submissions, and evaluate student work across cohorts
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.secondaryBtn}
            onClick={fetchHomework}
            title="Refresh directory"
          >
            <RotateCcw size={16} />
            Refresh
          </button>

          {canCreate && (
            <button className={styles.primaryBtn} onClick={handleOpenCreate}>
              <Plus size={18} />
              New Assignment
            </button>
          )}
        </div>
      </div>

      {/* ── Success / Error Notifications ── */}
      {successMsg && (
        <div className={`${styles.alertBanner} ${styles.alertSuccess}`}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {apiError && (
        <div className={`${styles.alertBanner} ${styles.alertError}`}>
          <AlertCircle size={18} />
          <span>{apiError}</span>
        </div>
      )}

      {/* ── KPI Summary Cards ── */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap} style={{ background: '#ede9fe', color: '#6366f1' }}>
            <BookOpen size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiValue}>{kpis.total}</span>
            <span className={styles.kpiLabel}>Total Assignments</span>
            <span className={styles.kpiSubtext}>In current view scope</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap} style={{ background: '#fef3c7', color: '#b45309' }}>
            <Clock size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiValue}>{kpis.dueSoon}</span>
            <span className={styles.kpiLabel}>Due Soon</span>
            <span className={styles.kpiSubtext}>Within next 3 days</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap} style={{ background: '#ecfdf5', color: '#059669' }}>
            <FileText size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiValue}>{kpis.totalSubmissions}</span>
            <span className={styles.kpiLabel}>Submissions Received</span>
            <span className={styles.kpiSubtext}>Across all attempts</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap} style={{ background: '#fdf2f8', color: '#db2777' }}>
            <Award size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiValue}>{kpis.pendingGrading}</span>
            <span className={styles.kpiLabel}>Pending Evaluation</span>
            <span className={styles.kpiSubtext}>Submissions awaiting grading</span>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className={styles.filterCard}>
        <div className={styles.filterRow}>
          {/* Academic Year */}
          <div className={styles.filterGroup}>
            <label htmlFor="filter-year" className={styles.filterLabel}>Academic Year</label>
            <select
              id="filter-year"
              className={styles.filterSelect}
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="">All Academic Years</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.is_current ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Class */}
          <div className={styles.filterGroup}>
            <label htmlFor="filter-class" className={styles.filterLabel}>Class</label>
            <select
              id="filter-class"
              className={styles.filterSelect}
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedSection('');
              }}
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Section */}
          <div className={styles.filterGroup}>
            <label htmlFor="filter-section" className={styles.filterLabel}>Section</label>
            <select
              id="filter-section"
              className={styles.filterSelect}
              value={selectedSection}
              disabled={!selectedClass}
              onChange={(e) => setSelectedSection(e.target.value)}
            >
              <option value="">All Sections</option>
              {currentClassSections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div className={styles.filterGroup}>
            <label htmlFor="filter-subject" className={styles.filterLabel}>Subject</label>
            <select
              id="filter-subject"
              className={styles.filterSelect}
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
            >
              <option value="">All Subjects</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className={styles.filterGroup}>
            <label htmlFor="filter-status" className={styles.filterLabel}>Status</label>
            <select
              id="filter-status"
              className={styles.filterSelect}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="active">Active Only</option>
              <option value="archived">Archived Only</option>
              <option value="all">All Statuses</option>
            </select>
          </div>

          {/* Search */}
          <div className={`${styles.filterGroup} ${styles.searchGroup}`}>
            <label htmlFor="filter-search" className={styles.filterLabel}>Search</label>
            <div className={styles.searchBox}>
              <Search size={16} className={styles.searchIcon} />
              <input
                id="filter-search"
                type="text"
                placeholder="Search by title, subject..."
                className={styles.filterInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Reset Filters */}
          <div className={styles.filterActions}>
            <button className={styles.resetBtn} onClick={handleResetFilters} title="Reset all filters">
              <Filter size={14} />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* ── Assignment Directory Cards ── */}
      {isLoading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading homework assignments...</span>
        </div>
      ) : apiError && homeworkList.length === 0 ? (
        <div className={styles.emptyState} style={{ borderColor: '#fca5a5', background: '#fff5f5' }}>
          <div className={styles.emptyIcon} style={{ background: '#fee2e2', color: '#dc2626' }}>
            <AlertCircle size={32} />
          </div>
          <h3 style={{ color: '#991b1b' }}>Unable to Load Assignments</h3>
          <p style={{ color: '#7f1d1d' }}>{apiError}</p>
          <button className={styles.primaryBtn} onClick={fetchHomework}>
            <RotateCcw size={16} />
            Retry
          </button>
        </div>
      ) : homeworkList.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <BookOpen size={32} />
          </div>
          <h3>No Assignments Found</h3>
          <p>
            No homework assignments match the selected filters. Change your filter criteria or
            create a new assignment.
          </p>
          {canCreate && (
            <button className={styles.primaryBtn} onClick={handleOpenCreate}>
              <Plus size={16} />
              Create Assignment
            </button>
          )}
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {homeworkList.map((hw) => {
            const dueInfo = getDueStatusInfo(hw.due_date.split('T')[0], hw.status);
            const totalStudents = Number(hw.total_students) || 0;
            const submittedCount = Number(hw.submitted_students_count) || 0;
            const percent =
              totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;

            return (
              <div
                key={hw.id}
                className={`${styles.assignmentCard} ${
                  hw.status === 'archived' ? styles.archived : ''
                }`}
              >
                {/* Card Top */}
                <div className={styles.cardTop}>
                  <span className={styles.subjectBadge}>
                    {hw.subject_name || 'Subject'}
                  </span>
                  <span className={`${styles.dueBadge} ${dueInfo.className}`}>
                    <Clock size={12} />
                    {dueInfo.label}
                  </span>
                </div>

                {/* Card Body */}
                <div className={styles.cardBody}>
                  <h4 className={styles.cardTitle}>{hw.title}</h4>
                  {hw.description && (
                    <p className={styles.cardDesc}>{hw.description}</p>
                  )}
                </div>

                {/* Card Meta */}
                <div className={styles.cardMeta}>
                  <div className={styles.metaItem}>
                    <Layers size={14} className={styles.metaIcon} />
                    <span>
                      {hw.class_name || 'Class'}{' '}
                      {hw.section_name ? `· Section ${hw.section_name}` : '· All Sections'}
                    </span>
                  </div>

                  <div className={styles.metaItem}>
                    <UserCheck size={14} className={styles.metaIcon} />
                    <span>Assigned by {hw.teacher_name || 'Teacher / Admin'}</span>
                  </div>

                  <div className={styles.metaItem}>
                    <Calendar size={14} className={styles.metaIcon} />
                    <span>Due: {formatDateReadable(hw.due_date.split('T')[0])}</span>
                  </div>
                </div>

                {/* Progress / Submission Statistics */}
                <div className={styles.progressSection}>
                  <div className={styles.progressLabelRow}>
                    <span>Submissions</span>
                    <span>
                      {submittedCount} / {totalStudents} students ({percent}%)
                    </span>
                  </div>
                  <div className={styles.progressBarTrack}>
                    <div
                      className={`${styles.progressBarFill} ${
                        percent === 100 ? styles.complete : ''
                      }`}
                      style={{ width: `${Math.min(100, percent)}%` }}
                    />
                  </div>
                </div>

                {/* Card Actions */}
                <div className={styles.cardActions}>
                  <button
                    className={styles.submissionsBtn}
                    onClick={() => handleOpenSubmissions(hw)}
                  >
                    <FileText size={15} />
                    Submissions ({hw.submission_count || 0})
                  </button>

                  {canEdit && (
                    <button
                      className={styles.iconBtn}
                      onClick={() => handleOpenEdit(hw)}
                      title="Edit Assignment"
                      aria-label={`Edit assignment ${hw.title}`}
                    >
                      <Edit3 size={15} />
                    </button>
                  )}

                  {canEdit && (
                    <button
                      className={styles.iconBtn}
                      onClick={() => handleToggleArchive(hw)}
                      title={hw.status === 'active' ? 'Archive Assignment' : 'Restore Assignment'}
                      aria-label={hw.status === 'active' ? `Archive assignment ${hw.title}` : `Restore assignment ${hw.title}`}
                    >
                      {hw.status === 'active' ? (
                        <Archive size={15} />
                      ) : (
                        <ArchiveRestore size={15} />
                      )}
                    </button>
                  )}

                  {canDelete && (
                    <button
                      className={`${styles.iconBtn} ${styles.danger}`}
                      onClick={() => setDeleteItem(hw)}
                      title="Delete Assignment"
                      aria-label={`Delete assignment ${hw.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Assignment Modal ── */}
      {isCreateOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>
                <BookOpen size={20} color="#6366f1" />
                Create New Assignment
              </h3>
              <button
                className={styles.closeBtn}
                onClick={() => setIsCreateOpen(false)}
                disabled={createSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className={styles.modalBody}>
                {createError && (
                  <div className={`${styles.alertBanner} ${styles.alertError}`}>
                    <AlertCircle size={16} />
                    <span>{createError}</span>
                  </div>
                )}

                <div className={styles.formField}>
                  <label htmlFor="create-title" className={styles.formLabel}>
                    Assignment Title <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="create-title"
                    type="text"
                    required
                    placeholder="e.g. Chapter 4 - Geometry Exercises"
                    className={styles.formInput}
                    value={createForm.title}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, title: e.target.value })
                    }
                  />
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formField}>
                    <label htmlFor="create-academic-year" className={styles.formLabel}>
                      Academic Year <span className={styles.required}>*</span>
                    </label>
                    <select
                      id="create-academic-year"
                      className={styles.formSelect}
                      value={createForm.academic_year_id}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          academic_year_id: e.target.value,
                        })
                      }
                    >
                      {academicYears.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name} {y.is_current ? '(Current)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formField}>
                    <label htmlFor="create-class" className={styles.formLabel}>
                      Class <span className={styles.required}>*</span>
                    </label>
                    <select
                      id="create-class"
                      className={styles.formSelect}
                      value={createForm.class_id}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          class_id: e.target.value,
                          section_id: '',
                        })
                      }
                    >
                      <option value="">Select Class</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formField}>
                    <label htmlFor="create-section" className={styles.formLabel}>Section (Optional)</label>
                    <select
                      id="create-section"
                      className={styles.formSelect}
                      value={createForm.section_id}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          section_id: e.target.value,
                        })
                      }
                    >
                      <option value="">All Sections</option>
                      {createClassSections.map((s) => (
                        <option key={s.id} value={s.id}>
                          Section {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formField}>
                    <label htmlFor="create-subject" className={styles.formLabel}>
                      Subject <span className={styles.required}>*</span>
                    </label>
                    <select
                      id="create-subject"
                      className={styles.formSelect}
                      value={createForm.subject_id}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          subject_id: e.target.value,
                        })
                      }
                    >
                      <option value="">Select Subject</option>
                      {subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={`${styles.formField} ${styles.full}`}>
                    <label htmlFor="create-due-date" className={styles.formLabel}>
                      Due Date <span className={styles.required}>*</span>
                    </label>
                    <input
                      id="create-due-date"
                      type="date"
                      required
                      min={getTodayString()}
                      className={styles.formInput}
                      value={createForm.due_date}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          due_date: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className={`${styles.formField} ${styles.full}`}>
                    <label htmlFor="create-description" className={styles.formLabel}>
                      Instructions / Description
                    </label>
                    <textarea
                      id="create-description"
                      placeholder="Enter detailed instructions, page references, submission guidelines..."
                      className={styles.formTextarea}
                      value={createForm.description}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={createSubmitting}
                >
                  {createSubmitting ? 'Creating...' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Assignment Modal ── */}
      {editItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>
                <Edit3 size={20} color="#6366f1" />
                Edit Assignment
              </h3>
              <button
                className={styles.closeBtn}
                onClick={() => setEditItem(null)}
                disabled={editSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className={styles.modalBody}>
                {editError && (
                  <div className={`${styles.alertBanner} ${styles.alertError}`}>
                    <AlertCircle size={16} />
                    <span>{editError}</span>
                  </div>
                )}

                <div className={styles.formField}>
                  <label htmlFor="edit-title" className={styles.formLabel}>
                    Assignment Title <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="edit-title"
                    type="text"
                    required
                    className={styles.formInput}
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm({ ...editForm, title: e.target.value })
                    }
                  />
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formField}>
                    <label htmlFor="edit-due-date" className={styles.formLabel}>
                      Due Date <span className={styles.required}>*</span>
                    </label>
                    <input
                      id="edit-due-date"
                      type="date"
                      required
                      className={styles.formInput}
                      value={editForm.due_date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, due_date: e.target.value })
                      }
                    />
                  </div>

                  <div className={styles.formField}>
                    <label htmlFor="edit-status" className={styles.formLabel}>Status</label>
                    <select
                      id="edit-status"
                      className={styles.formSelect}
                      value={editForm.status}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          status: e.target.value as 'active' | 'archived',
                        })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>

                  <div className={`${styles.formField} ${styles.full}`}>
                    <label htmlFor="edit-description" className={styles.formLabel}>Instructions / Description</label>
                    <textarea
                      id="edit-description"
                      className={styles.formTextarea}
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm({ ...editForm, description: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setEditItem(null)}
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={editSubmitting}
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Submissions & Grading Drawer ── */}
      {submissionsDrawerItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.drawerContent}>
            <div className={styles.modalHeader}>
              <h3>
                <FileText size={20} color="#6366f1" />
                Submissions & Evaluation
              </h3>
              <button
                className={styles.closeBtn}
                onClick={() => setSubmissionsDrawerItem(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.drawerInfoBanner}>
              <div>
                <strong>{submissionsDrawerItem.title}</strong> ·{' '}
                <span>{submissionsDrawerItem.subject_name}</span> (
                {submissionsDrawerItem.class_name}
                {submissionsDrawerItem.section_name
                  ? ` · Sec ${submissionsDrawerItem.section_name}`
                  : ' · All Sections'}
                )
              </div>
              <div>
                Due Date:{' '}
                <strong>
                  {formatDateReadable(
                    submissionsDrawerItem.due_date.split('T')[0]
                  )}
                </strong>
              </div>
            </div>

            <div className={styles.submissionsList}>
              {submissionsLoading ? (
                <div className={styles.loadingState}>
                  <div className={styles.spinner} />
                  <span>Loading student submissions...</span>
                </div>
              ) : submissionsList.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <UserCheck size={32} />
                  </div>
                  <h3>No Submissions Yet</h3>
                  <p>
                    Students have not submitted any responses for this assignment yet. Submissions
                    will appear here automatically as they are submitted.
                  </p>
                </div>
              ) : (
                submissionsList.map((sub) => {
                  const currentGrade = gradingState[sub.id] || {
                    status: sub.status,
                    remarks: sub.remarks || '',
                  };

                  return (
                    <div key={sub.id} className={styles.submissionRow}>
                      <div className={styles.submissionRowTop}>
                        <div className={styles.studentInfo}>
                          <div className={styles.studentAvatar}>
                            {sub.student_name ? sub.student_name.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <div>
                            <div className={styles.studentNameText}>{sub.student_name}</div>
                            <div className={styles.studentRollText}>
                              Roll: {sub.roll_number || 'N/A'} · Submitted:{' '}
                              {new Date(sub.submitted_at).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </div>
                          </div>
                        </div>

                        <div className={styles.submissionBadges}>
                          <span className={styles.attemptTag}>
                            Attempt {sub.attempt_number} of 2
                          </span>
                          <span
                            className={`${styles.statusPill} ${
                              styles[sub.status] || ''
                            }`}
                          >
                            {sub.status === 'graded' ? (
                              <CheckCircle2 size={12} />
                            ) : (
                              <Clock size={12} />
                            )}
                            {sub.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Student remark note */}
                      {sub.remarks && (
                        <div className={styles.studentRemarkBox}>
                          <strong>Student Note:</strong> &ldquo;{sub.remarks}&rdquo;
                        </div>
                      )}

                      {/* Teacher Grading & Feedback Form */}
                      {canGrade && (
                        <div className={styles.gradingForm}>
                          <div className={styles.gradingFormTop}>
                            <span className={styles.gradingLabel}>
                              <Award size={15} />
                              Teacher Evaluation & Remarks:
                            </span>

                            <select
                              className={styles.gradeStatusSelect}
                              value={currentGrade.status}
                              onChange={(e) =>
                                setGradingState({
                                  ...gradingState,
                                  [sub.id]: {
                                    ...currentGrade,
                                    status: e.target.value as any,
                                  },
                                })
                              }
                            >
                              <option value="graded">Mark Graded</option>
                              <option value="submitted">Submitted (Needs Revision)</option>
                              <option value="late">Late Submission</option>
                            </select>
                          </div>

                          <input
                            type="text"
                            placeholder="Enter qualitative feedback / evaluation remarks (e.g. 'Great work!', 'Needs correction on Q3')..."
                            className={styles.remarksInput}
                            value={currentGrade.remarks}
                            onChange={(e) =>
                              setGradingState({
                                ...gradingState,
                                [sub.id]: {
                                  ...currentGrade,
                                  remarks: e.target.value,
                                },
                              })
                            }
                          />

                          <button
                            className={styles.saveGradeBtn}
                            onClick={() => handleSaveGrade(sub.id)}
                            disabled={gradingSubmittingId === sub.id}
                          >
                            <Check size={14} />
                            {gradingSubmittingId === sub.id
                              ? 'Saving...'
                              : 'Update Evaluation'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.secondaryBtn}
                onClick={() => setSubmissionsDrawerItem(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: '440px' }}>
            <div className={styles.modalHeader}>
              <h3 style={{ color: '#b91c1c' }}>
                <Trash2 size={20} color="#b91c1c" />
                Confirm Deletion
              </h3>
              <button
                className={styles.closeBtn}
                onClick={() => setDeleteItem(null)}
                disabled={deleteSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ margin: 0, color: '#334155', lineHeight: 1.5 }}>
                Are you sure you want to permanently delete{' '}
                <strong>&ldquo;{deleteItem.title}&rdquo;</strong>?
              </p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                This action is non-reversible. All recorded student submissions for this assignment
                will also be removed.
              </p>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.secondaryBtn}
                onClick={() => setDeleteItem(null)}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                className={styles.primaryBtn}
                style={{ background: '#dc2626' }}
                onClick={handleDeleteSubmit}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Homework;
