import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Calendar,
  Layers,
  BookOpen,
  UserCheck,
  Plus,
  RotateCcw,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldAlert,
  Building2,
  Users,
  Sparkles
} from 'lucide-react';
import styles from './Academics.module.css';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Section {
  id: string;
  name: string;
  capacity: number | null;
  room_number: string | null;
}

export interface AcademicClass {
  id: string;
  name: string;
  code: string | null;
  display_order: number;
  created_at?: string;
  updated_at?: string;
  sections: Section[];
}

export type SubjectType = 'core' | 'elective' | 'lab' | 'activity';

export interface Subject {
  id: string;
  name: string;
  code: string;
  type: SubjectType;
  created_at?: string;
  updated_at?: string;
}

export interface TeacherOption {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  employee_id?: string | null;
  specialization?: string | null;
}

export interface ClassSubjectAllocation {
  id: string;
  class_id: string;
  academic_year_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  subject_type: SubjectType;
  teacher_id: string | null;
  teacher_name: string | null;
  teacher_email: string | null;
}

type TabType = 'years' | 'classes' | 'subjects' | 'allocations';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDateDisplay = (dateStr?: string): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.substring(0, 10);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr.substring(0, 10);
  }
};

const formatClassDisplayName = (cls?: { name: string; code?: string | null }): string => {
  if (!cls) return '';
  if (!/\d{8,}/.test(cls.name)) {
    return cls.code ? `${cls.name} (${cls.code})` : cls.name;
  }
  if (cls.code) {
    return `Class ${cls.code}`;
  }
  return cls.name.replace(/(?:Test Class|Class|FEE-Class|EX-Class|HW-Class)[-\s]*(\d{4})\d+/, 'Class $1');
};

const formatAcademicYearDisplayName = (yr?: { name: string; is_current?: boolean }): string => {
  if (!yr) return '';
  let label = yr.name;
  if (/\d{8,}/.test(label)) {
    label = label.replace(/(?:FEE-AY-|AY-|Test AY\s*)(\d{4})\d+/, 'Session $1');
  }
  return yr.is_current ? `${label} (Active)` : label;
};

// ─── Component ──────────────────────────────────────────────────────────────

const Academics: React.FC = () => {
  const { user } = useAuth();
  const canManage = user?.role === 'super_admin' || user?.role === 'principal';

  // Navigation tab
  const [activeTab, setActiveTab] = useState<TabType>('years');

  // Core Data Lists
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);

  // Allocations selection state
  const [selectedAllocationYear, setSelectedAllocationYear] = useState<string>('');
  const [selectedAllocationClass, setSelectedAllocationClass] = useState<string>('');
  const [classAllocations, setClassAllocations] = useState<ClassSubjectAllocation[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState<boolean>(false);

  // Loading & Alerts
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);

  // Subject filtering
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<string>('all');

  // Class filtering
  const [classSearch, setClassSearch] = useState<string>('');

  // ── Modals State ──
  const [showYearModal, setShowYearModal] = useState<boolean>(false);
  const [showClassModal, setShowClassModal] = useState<boolean>(false);
  const [showSectionModal, setShowSectionModal] = useState<boolean>(false);
  const [showSubjectModal, setShowSubjectModal] = useState<boolean>(false);
  const [showAllocationModal, setShowAllocationModal] = useState<boolean>(false);
  const [confirmYearActiveModal, setConfirmYearActiveModal] = useState<AcademicYear | null>(null);

  // Submitting flags
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form States & Errors
  const [yearForm, setYearForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    is_current: false,
  });
  const [yearErrors, setYearErrors] = useState<{ [key: string]: string }>({});

  const [classForm, setClassForm] = useState({
    name: '',
    code: '',
    display_order: 0,
  });
  const [classErrors, setClassErrors] = useState<{ [key: string]: string }>({});

  const [sectionForm, setSectionForm] = useState({
    class_id: '',
    name: '',
    capacity: 40,
    room_number: '',
  });
  const [sectionErrors, setSectionErrors] = useState<{ [key: string]: string }>({});

  const [subjectForm, setSubjectForm] = useState({
    name: '',
    code: '',
    type: 'core' as SubjectType,
  });
  const [subjectErrors, setSubjectErrors] = useState<{ [key: string]: string }>({});

  const [allocationForm, setAllocationForm] = useState({
    class_id: '',
    academic_year_id: '',
    subject_id: '',
    teacher_id: '',
  });
  const [allocationErrors, setAllocationErrors] = useState<{ [key: string]: string }>({});

  // ── Auto-dismiss Success Alert ──
  useEffect(() => {
    if (apiSuccess) {
      const timer = setTimeout(() => setApiSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [apiSuccess]);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchCoreData = useCallback(async (isRefreshAction = false) => {
    if (isRefreshAction) {
      setIsRefreshing(true);
    } else {
      setLoadingInitial(true);
    }
    setApiError(null);

    try {
      const [yearsRes, classesRes, subjectsRes] = await Promise.all([
        apiClient.get('/academic/academic-years'),
        apiClient.get('/academic/classes'),
        apiClient.get('/academic/subjects'),
      ]);

      const fetchedYears: AcademicYear[] = yearsRes.data?.data?.academic_years || [];
      const fetchedClasses: AcademicClass[] = classesRes.data?.data?.classes || [];
      const fetchedSubjects: Subject[] = subjectsRes.data?.data?.subjects || [];

      setAcademicYears(fetchedYears);
      setClasses(fetchedClasses);
      setSubjects(fetchedSubjects);

      // Default allocations dropdowns if not set
      setSelectedAllocationYear((prev) => {
        if (prev && fetchedYears.some((y) => y.id === prev)) return prev;
        const currentYear = fetchedYears.find((y) => y.is_current);
        return currentYear ? currentYear.id : fetchedYears[0]?.id || '';
      });

      setSelectedAllocationClass((prev) => {
        if (prev && fetchedClasses.some((c) => c.id === prev)) return prev;
        return fetchedClasses[0]?.id || '';
      });

      // Optionally fetch teachers if user has permissions
      try {
        const teachersRes = await apiClient.get('/teachers?limit=200');
        if (teachersRes.data?.data?.teachers) {
          setTeachers(teachersRes.data.data.teachers);
        }
      } catch {
        // Teacher fetch optional or role restricted
      }
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to fetch academic records');
    } finally {
      setLoadingInitial(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCoreData();
  }, [fetchCoreData]);

  // ── Fetch Allocations for selected class and year ──────────────────────────

  const fetchAllocations = useCallback(async () => {
    if (!selectedAllocationClass || !selectedAllocationYear) {
      setClassAllocations([]);
      return;
    }
    setLoadingAllocations(true);
    try {
      const res = await apiClient.get(
        `/academic/classes/${selectedAllocationClass}/subjects?academic_year_id=${selectedAllocationYear}`
      );
      setClassAllocations(res.data?.data?.class_subjects || []);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to fetch class subject allocations');
    } finally {
      setLoadingAllocations(false);
    }
  }, [selectedAllocationClass, selectedAllocationYear]);

  useEffect(() => {
    if (activeTab === 'allocations' && selectedAllocationClass && selectedAllocationYear) {
      fetchAllocations();
    }
  }, [activeTab, selectedAllocationClass, selectedAllocationYear, fetchAllocations]);

  // ── Computed Metrics ───────────────────────────────────────────────────────

  const activeYear = useMemo(() => academicYears.find((y) => y.is_current), [academicYears]);

  const totalSectionsCount = useMemo(
    () => classes.reduce((acc, c) => acc + (c.sections ? c.sections.length : 0), 0),
    [classes]
  );

  const totalCapacitySum = useMemo(
    () =>
      classes.reduce((acc, c) => {
        const classCap = (c.sections || []).reduce((sAcc, s) => sAcc + (s.capacity || 0), 0);
        return acc + classCap;
      }, 0),
    [classes]
  );

  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
        s.code.toLowerCase().includes(subjectSearch.toLowerCase());
      const matchesType = subjectTypeFilter === 'all' || s.type === subjectTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [subjects, subjectSearch, subjectTypeFilter]);

  const filteredClasses = useMemo(() => {
    if (!classSearch.trim()) return classes;
    const term = classSearch.toLowerCase();
    return classes.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.code && c.code.toLowerCase().includes(term))
    );
  }, [classes, classSearch]);

  // ── Handlers: Academic Years ───────────────────────────────────────────────

  const handleOpenYearModal = () => {
    setYearForm({
      name: '',
      start_date: '',
      end_date: '',
      is_current: false,
    });
    setYearErrors({});
    setShowYearModal(true);
  };

  const handleCreateYearSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!yearForm.name.trim() || yearForm.name.trim().length < 2) {
      errors.name = 'Session name must be at least 2 characters';
    }
    if (!yearForm.start_date) {
      errors.start_date = 'Start date is required';
    }
    if (!yearForm.end_date) {
      errors.end_date = 'End date is required';
    }
    if (yearForm.start_date && yearForm.end_date && yearForm.end_date <= yearForm.start_date) {
      errors.end_date = 'End date must be strictly after the start date';
    }

    if (Object.keys(errors).length > 0) {
      setYearErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    try {
      const payload = {
        name: yearForm.name.trim(),
        start_date: yearForm.start_date, // YYYY-MM-DD
        end_date: yearForm.end_date,     // YYYY-MM-DD
        is_current: yearForm.is_current,
      };

      const res = await apiClient.post('/academic/academic-years', payload);
      setApiSuccess(res.data?.message || 'Academic year created successfully');
      setShowYearModal(false);
      await fetchCoreData(true);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to create academic year');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSetCurrentYear = async () => {
    if (!confirmYearActiveModal) return;
    setIsSubmitting(true);
    setApiError(null);

    try {
      const res = await apiClient.post(`/academic/academic-years/${confirmYearActiveModal.id}/set-current`);
      setApiSuccess(res.data?.message || `'${confirmYearActiveModal.name}' set as active session`);
      setConfirmYearActiveModal(null);
      await fetchCoreData(true);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to set active academic year');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Handlers: Classes ──────────────────────────────────────────────────────

  const handleOpenClassModal = () => {
    setClassForm({
      name: '',
      code: '',
      display_order: classes.length > 0 ? (classes[classes.length - 1].display_order || 0) + 1 : 1,
    });
    setClassErrors({});
    setShowClassModal(true);
  };

  const handleCreateClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!classForm.name.trim()) {
      errors.name = 'Class name is required (e.g. Class 10)';
    }

    if (Object.keys(errors).length > 0) {
      setClassErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    try {
      const payload = {
        name: classForm.name.trim(),
        code: classForm.code.trim() ? classForm.code.trim() : null,
        display_order: Number(classForm.display_order) || 0,
      };

      const res = await apiClient.post('/academic/classes', payload);
      setApiSuccess(res.data?.message || 'Class created successfully');
      setShowClassModal(false);
      await fetchCoreData(true);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to create class');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Handlers: Sections ─────────────────────────────────────────────────────

  const handleOpenSectionModal = (preselectedClassId?: string) => {
    const targetClassId = preselectedClassId || classes[0]?.id || '';
    setSectionForm({
      class_id: targetClassId,
      name: '',
      capacity: 40,
      room_number: '',
    });
    setSectionErrors({});
    setShowSectionModal(true);
  };

  const handleCreateSectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!sectionForm.class_id) {
      errors.class_id = 'Please select a parent class';
    }
    if (!sectionForm.name.trim()) {
      errors.name = 'Section name is required (e.g. Section A)';
    }
    if (sectionForm.capacity <= 0) {
      errors.capacity = 'Capacity must be a positive integer';
    }

    if (Object.keys(errors).length > 0) {
      setSectionErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    try {
      const payload = {
        class_id: sectionForm.class_id,
        name: sectionForm.name.trim(),
        capacity: Number(sectionForm.capacity) || 40,
        room_number: sectionForm.room_number.trim() ? sectionForm.room_number.trim() : null,
      };

      const res = await apiClient.post('/academic/sections', payload);
      setApiSuccess(res.data?.message || 'Section created successfully');
      setShowSectionModal(false);
      await fetchCoreData(true);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to create section');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Handlers: Subjects ─────────────────────────────────────────────────────

  const handleOpenSubjectModal = () => {
    setSubjectForm({
      name: '',
      code: '',
      type: 'core',
    });
    setSubjectErrors({});
    setShowSubjectModal(true);
  };

  const handleCreateSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!subjectForm.name.trim() || subjectForm.name.trim().length < 2) {
      errors.name = 'Subject name must be at least 2 characters';
    }
    if (!subjectForm.code.trim() || subjectForm.code.trim().length < 2) {
      errors.code = 'Subject code must be at least 2 characters (e.g. MATH-101)';
    }

    if (Object.keys(errors).length > 0) {
      setSubjectErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    try {
      const payload = {
        name: subjectForm.name.trim(),
        code: subjectForm.code.trim().toUpperCase(),
        type: subjectForm.type,
      };

      const res = await apiClient.post('/academic/subjects', payload);
      setApiSuccess(res.data?.message || 'Subject created successfully');
      setShowSubjectModal(false);
      await fetchCoreData(true);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to create subject');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Handlers: Allocations ──────────────────────────────────────────────────

  const handleOpenAllocationModal = (preselectedSubjectId?: string) => {
    setAllocationForm({
      class_id: selectedAllocationClass || classes[0]?.id || '',
      academic_year_id: selectedAllocationYear || activeYear?.id || academicYears[0]?.id || '',
      subject_id: preselectedSubjectId || subjects[0]?.id || '',
      teacher_id: '',
    });
    setAllocationErrors({});
    setShowAllocationModal(true);
  };

  const handleCreateAllocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!allocationForm.class_id) {
      errors.class_id = 'Please select a class';
    }
    if (!allocationForm.academic_year_id) {
      errors.academic_year_id = 'Please select an academic year';
    }
    if (!allocationForm.subject_id) {
      errors.subject_id = 'Please select a subject';
    }

    if (Object.keys(errors).length > 0) {
      setAllocationErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    try {
      const payload = {
        class_id: allocationForm.class_id,
        academic_year_id: allocationForm.academic_year_id,
        subject_id: allocationForm.subject_id,
        teacher_id: allocationForm.teacher_id.trim() ? allocationForm.teacher_id.trim() : null,
      };

      const res = await apiClient.post('/academic/class-subjects', payload);
      setApiSuccess(res.data?.message || 'Subject allocated to class successfully');
      setShowAllocationModal(false);

      // Make sure view is aligned with the allocated class and year
      setSelectedAllocationClass(allocationForm.class_id);
      setSelectedAllocationYear(allocationForm.academic_year_id);
      await fetchAllocations();
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to allocate subject to class');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerTitle}>
          <h2>Academic Structure</h2>
          <p>
            Configure school sessions, class grades, section subdivisions, curriculum subjects, and teacher allocations.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.refreshBtn}
            onClick={() => fetchCoreData(true)}
            disabled={isRefreshing}
            title="Refresh academic data"
          >
            <RotateCcw size={18} className={isRefreshing ? styles.spinning : ''} />
          </button>

          {canManage && activeTab === 'years' && (
            <button className={styles.primaryBtn} onClick={handleOpenYearModal}>
              <Plus size={16} />
              <span>New Academic Session</span>
            </button>
          )}

          {canManage && activeTab === 'classes' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={styles.secondaryBtn} onClick={() => handleOpenSectionModal()}>
                <Plus size={16} />
                <span>Add Section</span>
              </button>
              <button className={styles.primaryBtn} onClick={handleOpenClassModal}>
                <Plus size={16} />
                <span>New Class</span>
              </button>
            </div>
          )}

          {canManage && activeTab === 'subjects' && (
            <button className={styles.primaryBtn} onClick={handleOpenSubjectModal}>
              <Plus size={16} />
              <span>New Subject</span>
            </button>
          )}

          {canManage && activeTab === 'allocations' && (
            <button
              className={styles.primaryBtn}
              onClick={() => handleOpenAllocationModal()}
              disabled={classes.length === 0 || subjects.length === 0}
            >
              <Plus size={16} />
              <span>Allocate Subject</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Guard Notice Banner */}
      {!canManage && (
        <div className={styles.rbacNotice}>
          <ShieldAlert size={18} color="#6366f1" />
          <span>
            You are viewing in <strong>read-only mode</strong>. Only <strong>Super Admin</strong> or <strong>Principal</strong> roles can create or modify sessions, classes, subjects, and teacher allocations.
          </span>
        </div>
      )}

      {/* API Alerts */}
      {apiSuccess && (
        <div className={`${styles.alertBanner} ${styles.alertSuccess}`}>
          <div className={styles.alertContent}>
            <CheckCircle2 size={18} />
            <span>{apiSuccess}</span>
          </div>
          <button className={styles.alertCloseBtn} onClick={() => setApiSuccess(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {apiError && (
        <div className={`${styles.alertBanner} ${styles.alertError}`}>
          <div className={styles.alertContent}>
            <AlertCircle size={18} />
            <span>{apiError}</span>
          </div>
          <button className={styles.alertCloseBtn} onClick={() => setApiError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Stats Overview */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIconWrap} style={{ background: '#ecfdf5', color: '#059669' }}>
            <Calendar size={22} />
          </div>
          <div className={styles.statDetails}>
            <div className={styles.statNumber}>
              {activeYear ? activeYear.name : 'None'}
            </div>
            <div className={styles.statLabel}>Active Academic Session</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconWrap} style={{ background: '#ede9fe', color: '#6366f1' }}>
            <Building2 size={22} />
          </div>
          <div className={styles.statDetails}>
            <div className={styles.statNumber}>{classes.length}</div>
            <div className={styles.statLabel}>Configured Classes</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconWrap} style={{ background: '#fdf2f8', color: '#db2777' }}>
            <Layers size={22} />
          </div>
          <div className={styles.statDetails}>
            <div className={styles.statNumber}>{totalSectionsCount}</div>
            <div className={styles.statLabel}>Sections ({totalCapacitySum} seats)</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconWrap} style={{ background: '#fffbeb', color: '#d97706' }}>
            <BookOpen size={22} />
          </div>
          <div className={styles.statDetails}>
            <div className={styles.statNumber}>{subjects.length}</div>
            <div className={styles.statLabel}>Curriculum Subjects</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'years' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('years')}
        >
          <Calendar size={17} />
          <span>Academic Sessions</span>
          <span className={styles.tabBadge}>{academicYears.length}</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'classes' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('classes')}
        >
          <Building2 size={17} />
          <span>Classes & Sections</span>
          <span className={styles.tabBadge}>{classes.length}</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'subjects' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('subjects')}
        >
          <BookOpen size={17} />
          <span>Subjects Directory</span>
          <span className={styles.tabBadge}>{subjects.length}</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'allocations' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('allocations')}
        >
          <UserCheck size={17} />
          <span>Subject Allocation</span>
        </button>
      </div>

      {/* ── TAB 1: ACADEMIC YEARS ────────────────────────────────────────────── */}
      {activeTab === 'years' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleBlock}>
              <h3>School Academic Sessions</h3>
              <p>Academic years define admissions, promotions, grading terms, and fee cycles.</p>
            </div>
            {canManage && (
              <button className={styles.primaryBtn} onClick={handleOpenYearModal}>
                <Plus size={16} />
                <span>New Session</span>
              </button>
            )}
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Session Name</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Current Status</th>
                  <th>Registered</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingInitial ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px' }}>
                      <RotateCcw size={20} className={styles.spinning} style={{ margin: '0 auto', display: 'block' }} />
                      <span style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '8px', display: 'block' }}>
                        Loading academic sessions...
                      </span>
                    </td>
                  </tr>
                ) : academicYears.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>
                          <Calendar size={32} />
                        </div>
                        <div className={styles.emptyStateTitle}>No Academic Sessions Configured</div>
                        <div className={styles.emptyStateDesc}>
                          Get started by creating your first academic year session (e.g. 2026-2027).
                        </div>
                        {canManage && (
                          <button className={styles.primaryBtn} onClick={handleOpenYearModal}>
                            <Plus size={16} />
                            <span>Create First Session</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  academicYears.map((yr) => (
                    <tr key={yr.id}>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>
                        {formatAcademicYearDisplayName(yr)}
                      </td>
                      <td>{formatDateDisplay(yr.start_date)}</td>
                      <td>{formatDateDisplay(yr.end_date)}</td>
                      <td>
                        {yr.is_current ? (
                          <span className={styles.activeYearBadge}>
                            <span className={styles.pulsingDot} />
                            <span>Active Session</span>
                          </span>
                        ) : (
                          <span className={styles.inactiveYearBadge}>
                            <span>Inactive</span>
                          </span>
                        )}
                      </td>
                      <td style={{ color: '#64748b' }}>
                        {formatDateDisplay(yr.created_at)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {yr.is_current ? (
                          <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                            Current Default
                          </span>
                        ) : (
                          <button
                            className={`${styles.actionBtn} ${styles.setActiveBtn}`}
                            onClick={() => setConfirmYearActiveModal(yr)}
                            disabled={!canManage || isSubmitting}
                            title={canManage ? 'Set as active academic year' : 'Principal or Super Admin required'}
                          >
                            <CheckCircle2 size={14} />
                            <span>Set Active</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: CLASSES & SECTIONS ────────────────────────────────────────── */}
      {activeTab === 'classes' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleBlock}>
              <h3>Classes & Classroom Sections</h3>
              <p>Organize academic grades and subdivided classroom sections with designated capacities.</p>
            </div>

            <div className={styles.sectionControls}>
              <div className={styles.searchBox}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Filter classes..."
                  value={classSearch}
                  onChange={(e) => setClassSearch(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              {canManage && (
                <>
                  <button className={styles.secondaryBtn} onClick={() => handleOpenSectionModal()}>
                    <Plus size={16} />
                    <span>Add Section</span>
                  </button>
                  <button className={styles.primaryBtn} onClick={handleOpenClassModal}>
                    <Plus size={16} />
                    <span>New Class</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {loadingInitial ? (
            <div style={{ textAlign: 'center', padding: '48px' }}>
              <RotateCcw size={24} className={styles.spinning} style={{ margin: '0 auto', display: 'block' }} />
              <span style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '10px', display: 'block' }}>
                Loading classes and sections...
              </span>
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>
                <Building2 size={32} />
              </div>
              <div className={styles.emptyStateTitle}>
                {classSearch ? 'No matching classes found' : 'No Classes Configured Yet'}
              </div>
              <div className={styles.emptyStateDesc}>
                {classSearch
                  ? 'Try adjusting your search query.'
                  : 'Add school grades and classes to begin organizing sections and students.'}
              </div>
              {canManage && !classSearch && (
                <button className={styles.primaryBtn} onClick={handleOpenClassModal}>
                  <Plus size={16} />
                  <span>Create Class</span>
                </button>
              )}
            </div>
          ) : (
            <div className={styles.classesGrid}>
              {filteredClasses.map((cls) => {
                const totalCap = (cls.sections || []).reduce((acc, s) => acc + (s.capacity || 0), 0);
                return (
                  <div key={cls.id} className={styles.classCard}>
                    <div className={styles.classCardHeader}>
                      <div>
                        <div className={styles.classNameTitle}>
                          {formatClassDisplayName(cls)}
                          {cls.code && <span className={styles.classCodeBadge}>{cls.code}</span>}
                        </div>
                        <div className={styles.classCardMeta}>
                          <span>Display Order: {cls.display_order}</span>
                          <span>•</span>
                          <span>{cls.sections?.length || 0} Sections</span>
                          <span>•</span>
                          <span>{totalCap} Total Seats</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.sectionsListWrap}>
                      <div className={styles.sectionsListHeader}>
                        <span>Sections</span>
                        <span>Capacity & Room</span>
                      </div>

                      {cls.sections && cls.sections.length > 0 ? (
                        cls.sections.map((sec) => (
                          <div key={sec.id} className={styles.sectionItemRow}>
                            <span className={styles.sectionNameLabel}>
                              <Layers size={14} color="#6366f1" />
                              <span>{sec.name}</span>
                            </span>
                            <div className={styles.sectionMetaTags}>
                              <span className={styles.capacityPill}>
                                <Users size={12} />
                                <span>{sec.capacity || 40} seats</span>
                              </span>
                              {sec.room_number ? (
                                <span className={styles.roomPill}>
                                  <span>Room {sec.room_number}</span>
                                </span>
                              ) : (
                                <span className={styles.roomPill} style={{ color: '#94a3b8' }}>
                                  <span>No room</span>
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={styles.noSectionsText}>No sections added to this class yet.</div>
                      )}
                    </div>

                    {canManage && (
                      <button
                        className={styles.addSectionCardBtn}
                        onClick={() => handleOpenSectionModal(cls.id)}
                      >
                        <Plus size={14} />
                        <span>Add Section to {cls.name}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: SUBJECTS DIRECTORY ────────────────────────────────────────── */}
      {activeTab === 'subjects' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleBlock}>
              <h3>Subject Curriculum Directory</h3>
              <p>Define academic subjects across core, elective, laboratory, and activity categories.</p>
            </div>

            <div className={styles.sectionControls}>
              <div className={styles.searchBox}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search subject or code..."
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              <select
                className={styles.filterSelect}
                value={subjectTypeFilter}
                onChange={(e) => setSubjectTypeFilter(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="core">Core</option>
                <option value="elective">Elective</option>
                <option value="lab">Lab</option>
                <option value="activity">Activity</option>
              </select>

              {canManage && (
                <button className={styles.primaryBtn} onClick={handleOpenSubjectModal}>
                  <Plus size={16} />
                  <span>New Subject</span>
                </button>
              )}
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Subject Name</th>
                  <th>Code</th>
                  <th>Category / Type</th>
                  <th>Registered Date</th>
                </tr>
              </thead>
              <tbody>
                {loadingInitial ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '32px' }}>
                      <RotateCcw size={20} className={styles.spinning} style={{ margin: '0 auto', display: 'block' }} />
                      <span style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '8px', display: 'block' }}>
                        Loading subjects directory...
                      </span>
                    </td>
                  </tr>
                ) : filteredSubjects.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>
                          <BookOpen size={32} />
                        </div>
                        <div className={styles.emptyStateTitle}>
                          {subjectSearch || subjectTypeFilter !== 'all'
                            ? 'No subjects matched your filter'
                            : 'No Subjects Added Yet'}
                        </div>
                        <div className={styles.emptyStateDesc}>
                          {subjectSearch || subjectTypeFilter !== 'all'
                            ? 'Try clearing the search or category filter.'
                            : 'Create core subjects, electives, and labs to build the school curriculum.'}
                        </div>
                        {canManage && !subjectSearch && subjectTypeFilter === 'all' && (
                          <button className={styles.primaryBtn} onClick={handleOpenSubjectModal}>
                            <Plus size={16} />
                            <span>Add First Subject</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSubjects.map((sub) => {
                    let typeClass = styles.typeCore;
                    if (sub.type === 'elective') typeClass = styles.typeElective;
                    if (sub.type === 'lab') typeClass = styles.typeLab;
                    if (sub.type === 'activity') typeClass = styles.typeActivity;

                    return (
                      <tr key={sub.id}>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>{sub.name}</td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>
                            {sub.code}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.typeBadge} ${typeClass}`}>{sub.type}</span>
                        </td>
                        <td style={{ color: '#64748b' }}>{formatDateDisplay(sub.created_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: SUBJECT ALLOCATION ────────────────────────────────────────── */}
      {activeTab === 'allocations' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleBlock}>
              <h3>Subject & Teacher Allocation</h3>
              <p>Map curriculum subjects and assigned faculty to specific classes for an academic session.</p>
            </div>

            {canManage && (
              <button
                className={styles.primaryBtn}
                onClick={() => handleOpenAllocationModal()}
                disabled={classes.length === 0 || subjects.length === 0}
              >
                <Plus size={16} />
                <span>Allocate Subject</span>
              </button>
            )}
          </div>

          {/* Allocation Selectors Bar */}
          <div className={styles.allocationsBar}>
            <div className={styles.selectorGroup}>
              <span className={styles.selectorLabel}>Academic Session:</span>
              <select
                className={styles.filterSelect}
                value={selectedAllocationYear}
                onChange={(e) => setSelectedAllocationYear(e.target.value)}
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {formatAcademicYearDisplayName(y)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.selectorGroup}>
              <span className={styles.selectorLabel}>Target Class:</span>
              <select
                className={styles.filterSelect}
                value={selectedAllocationClass}
                onChange={(e) => setSelectedAllocationClass(e.target.value)}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatClassDisplayName(c)}
                  </option>
                ))}
              </select>
            </div>

            <button
              className={styles.refreshBtn}
              onClick={fetchAllocations}
              disabled={loadingAllocations}
              title="Refresh allocations for this class"
              style={{ width: '38px', height: '38px' }}
            >
              <RotateCcw size={16} className={loadingAllocations ? styles.spinning : ''} />
            </button>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Subject Code</th>
                  <th>Category</th>
                  <th>Assigned Teacher</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingAllocations ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px' }}>
                      <RotateCcw size={20} className={styles.spinning} style={{ margin: '0 auto', display: 'block' }} />
                      <span style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '8px', display: 'block' }}>
                        Loading class allocations...
                      </span>
                    </td>
                  </tr>
                ) : classAllocations.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>
                          <UserCheck size={32} />
                        </div>
                        <div className={styles.emptyStateTitle}>No Subject Allocations Found</div>
                        <div className={styles.emptyStateDesc}>
                          No subjects are mapped to this class for the selected academic session yet.
                        </div>
                        {canManage && (
                          <button
                            className={styles.primaryBtn}
                            onClick={() => handleOpenAllocationModal()}
                            disabled={classes.length === 0 || subjects.length === 0}
                          >
                            <Plus size={16} />
                            <span>Map First Subject</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  classAllocations.map((alloc) => {
                    let typeClass = styles.typeCore;
                    if (alloc.subject_type === 'elective') typeClass = styles.typeElective;
                    if (alloc.subject_type === 'lab') typeClass = styles.typeLab;
                    if (alloc.subject_type === 'activity') typeClass = styles.typeActivity;

                    return (
                      <tr key={alloc.id}>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>{alloc.subject_name}</td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>
                            {alloc.subject_code}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.typeBadge} ${typeClass}`}>
                            {alloc.subject_type}
                          </span>
                        </td>
                        <td>
                          {alloc.teacher_id && alloc.teacher_name ? (
                            <div className={styles.teacherAvatarWrap}>
                              <div className={styles.teacherAvatar}>
                                {alloc.teacher_name.charAt(0).toUpperCase()}
                              </div>
                              <div className={styles.teacherDetails}>
                                <span className={styles.teacherName}>{alloc.teacher_name}</span>
                                {alloc.teacher_email && (
                                  <span className={styles.teacherEmail}>{alloc.teacher_email}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className={styles.unassignedTeacherBadge}>
                              <span>No teacher assigned</span>
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {canManage && (
                            <button
                              className={`${styles.actionBtn} ${styles.setActiveBtn}`}
                              onClick={() => handleOpenAllocationModal(alloc.subject_id)}
                              title="Re-assign or update faculty allocation"
                            >
                              <span>Update Faculty</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE ACADEMIC YEAR ─────────────────────────────────────── */}
      {showYearModal && (
        <div className={styles.modalBackdrop} onClick={() => !isSubmitting && setShowYearModal(false)}>
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Create Academic Session</h3>
                <p>Register a new school academic year calendar.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowYearModal(false)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateYearSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Session Name</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2026-2027"
                    value={yearForm.name}
                    onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })}
                    className={`${styles.formInput} ${yearErrors.name ? styles.formInputError : ''}`}
                    disabled={isSubmitting}
                    autoFocus
                  />
                  {yearErrors.name && <span className={styles.fieldErrorText}>{yearErrors.name}</span>}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Start Date</span>
                      <span className={styles.requiredStar}>*</span>
                    </label>
                    <input
                      type="date"
                      value={yearForm.start_date}
                      onChange={(e) => setYearForm({ ...yearForm, start_date: e.target.value })}
                      className={`${styles.formInput} ${yearErrors.start_date ? styles.formInputError : ''}`}
                      disabled={isSubmitting}
                    />
                    {yearErrors.start_date && (
                      <span className={styles.fieldErrorText}>{yearErrors.start_date}</span>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>End Date</span>
                      <span className={styles.requiredStar}>*</span>
                    </label>
                    <input
                      type="date"
                      value={yearForm.end_date}
                      onChange={(e) => setYearForm({ ...yearForm, end_date: e.target.value })}
                      className={`${styles.formInput} ${yearErrors.end_date ? styles.formInputError : ''}`}
                      disabled={isSubmitting}
                    />
                    {yearErrors.end_date && (
                      <span className={styles.fieldErrorText}>{yearErrors.end_date}</span>
                    )}
                  </div>
                </div>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={yearForm.is_current}
                    onChange={(e) => setYearForm({ ...yearForm, is_current: e.target.checked })}
                    className={styles.checkboxInput}
                    disabled={isSubmitting}
                  />
                  <span>Designate as the active academic year immediately</span>
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowYearModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <RotateCcw size={16} className={styles.spinning} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Create Session</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRM SET ACTIVE YEAR ──────────────────────────────────── */}
      {confirmYearActiveModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !isSubmitting && setConfirmYearActiveModal(null)}
        >
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Confirm Active Session</h3>
                <p>Activate school-wide academic session calendar.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setConfirmYearActiveModal(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalWarningCallout}>
                <AlertCircle size={20} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Important System Impact:</strong>
                  <br />
                  Setting <strong>{confirmYearActiveModal.name}</strong> as the active session will make all other academic years inactive. New admissions, student registrations, fee structures, and attendance registers will default to this session.
                </div>
              </div>

              <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: '1.6' }}>
                <div><strong>Session:</strong> {confirmYearActiveModal.name}</div>
                <div><strong>Duration:</strong> {formatDateDisplay(confirmYearActiveModal.start_date)} to {formatDateDisplay(confirmYearActiveModal.end_date)}</div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setConfirmYearActiveModal(null)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleConfirmSetCurrentYear}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <RotateCcw size={16} className={styles.spinning} />
                    <span>Activating...</span>
                  </>
                ) : (
                  <span>Confirm & Set Active</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE CLASS ─────────────────────────────────────────────── */}
      {showClassModal && (
        <div className={styles.modalBackdrop} onClick={() => !isSubmitting && setShowClassModal(false)}>
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Create New Class</h3>
                <p>Add a grade or class level to the school structure.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowClassModal(false)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateClassSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Class Name</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Class 10 or Grade 1"
                    value={classForm.name}
                    onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                    className={`${styles.formInput} ${classErrors.name ? styles.formInputError : ''}`}
                    disabled={isSubmitting}
                    autoFocus
                  />
                  {classErrors.name && <span className={styles.fieldErrorText}>{classErrors.name}</span>}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Class Code</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CLS-10"
                      value={classForm.code}
                      onChange={(e) => setClassForm({ ...classForm, code: e.target.value })}
                      className={styles.formInput}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Display Order</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={classForm.display_order}
                      onChange={(e) => setClassForm({ ...classForm, display_order: Number(e.target.value) })}
                      className={styles.formInput}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowClassModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <RotateCcw size={16} className={styles.spinning} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Create Class</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE SECTION ───────────────────────────────────────────── */}
      {showSectionModal && (
        <div className={styles.modalBackdrop} onClick={() => !isSubmitting && setShowSectionModal(false)}>
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Add Classroom Section</h3>
                <p>Subdivide a grade into classrooms with capacity and room designations.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowSectionModal(false)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSectionSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Target Class</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <select
                    className={styles.formSelect}
                    value={sectionForm.class_id}
                    onChange={(e) => setSectionForm({ ...sectionForm, class_id: e.target.value })}
                    disabled={isSubmitting}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatClassDisplayName(c)}
                      </option>
                    ))}
                  </select>
                  {sectionErrors.class_id && (
                    <span className={styles.fieldErrorText}>{sectionErrors.class_id}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Section Name</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Section A or Blue"
                    value={sectionForm.name}
                    onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                    className={`${styles.formInput} ${sectionErrors.name ? styles.formInputError : ''}`}
                    disabled={isSubmitting}
                    autoFocus
                  />
                  {sectionErrors.name && (
                    <span className={styles.fieldErrorText}>{sectionErrors.name}</span>
                  )}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Student Capacity</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={sectionForm.capacity}
                      onChange={(e) => setSectionForm({ ...sectionForm, capacity: Number(e.target.value) })}
                      className={`${styles.formInput} ${sectionErrors.capacity ? styles.formInputError : ''}`}
                      disabled={isSubmitting}
                    />
                    {sectionErrors.capacity && (
                      <span className={styles.fieldErrorText}>{sectionErrors.capacity}</span>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Room Number</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 102 or Science Lab"
                      value={sectionForm.room_number}
                      onChange={(e) => setSectionForm({ ...sectionForm, room_number: e.target.value })}
                      className={styles.formInput}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowSectionModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <RotateCcw size={16} className={styles.spinning} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Add Section</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE SUBJECT ───────────────────────────────────────────── */}
      {showSubjectModal && (
        <div className={styles.modalBackdrop} onClick={() => !isSubmitting && setShowSubjectModal(false)}>
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Create New Subject</h3>
                <p>Register a course or subject in the curriculum directory.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowSubjectModal(false)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubjectSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Subject Name</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mathematics or Computer Science"
                    value={subjectForm.name}
                    onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                    className={`${styles.formInput} ${subjectErrors.name ? styles.formInputError : ''}`}
                    disabled={isSubmitting}
                    autoFocus
                  />
                  {subjectErrors.name && (
                    <span className={styles.fieldErrorText}>{subjectErrors.name}</span>
                  )}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Subject Code</span>
                      <span className={styles.requiredStar}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MATH-101"
                      value={subjectForm.code}
                      onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })}
                      className={`${styles.formInput} ${subjectErrors.code ? styles.formInputError : ''}`}
                      disabled={isSubmitting}
                    />
                    {subjectErrors.code && (
                      <span className={styles.fieldErrorText}>{subjectErrors.code}</span>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Category / Type</span>
                      <span className={styles.requiredStar}>*</span>
                    </label>
                    <select
                      className={styles.formSelect}
                      value={subjectForm.type}
                      onChange={(e) => setSubjectForm({ ...subjectForm, type: e.target.value as SubjectType })}
                      disabled={isSubmitting}
                    >
                      <option value="core">Core Subject</option>
                      <option value="elective">Elective</option>
                      <option value="lab">Laboratory</option>
                      <option value="activity">Activity / Extracurricular</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowSubjectModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <RotateCcw size={16} className={styles.spinning} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Create Subject</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ALLOCATE SUBJECT TO CLASS ────────────────────────────────── */}
      {showAllocationModal && (
        <div className={styles.modalBackdrop} onClick={() => !isSubmitting && setShowAllocationModal(false)}>
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Allocate Subject to Class</h3>
                <p>Assign a curriculum subject and optional teacher for a session.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowAllocationModal(false)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAllocationSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Academic Session</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <select
                    className={styles.formSelect}
                    value={allocationForm.academic_year_id}
                    onChange={(e) =>
                      setAllocationForm({ ...allocationForm, academic_year_id: e.target.value })
                    }
                    disabled={isSubmitting}
                  >
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {formatAcademicYearDisplayName(y)}
                      </option>
                    ))}
                  </select>
                  {allocationErrors.academic_year_id && (
                    <span className={styles.fieldErrorText}>
                      {allocationErrors.academic_year_id}
                    </span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Target Class</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <select
                    className={styles.formSelect}
                    value={allocationForm.class_id}
                    onChange={(e) => setAllocationForm({ ...allocationForm, class_id: e.target.value })}
                    disabled={isSubmitting}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatClassDisplayName(c)}
                      </option>
                    ))}
                  </select>
                  {allocationErrors.class_id && (
                    <span className={styles.fieldErrorText}>{allocationErrors.class_id}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Curriculum Subject</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <select
                    className={styles.formSelect}
                    value={allocationForm.subject_id}
                    onChange={(e) =>
                      setAllocationForm({ ...allocationForm, subject_id: e.target.value })
                    }
                    disabled={isSubmitting}
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) — {s.type}
                      </option>
                    ))}
                  </select>
                  {allocationErrors.subject_id && (
                    <span className={styles.fieldErrorText}>{allocationErrors.subject_id}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Assigned Teacher (Optional)</span>
                  </label>
                  <select
                    className={styles.formSelect}
                    value={allocationForm.teacher_id}
                    onChange={(e) =>
                      setAllocationForm({ ...allocationForm, teacher_id: e.target.value })
                    }
                    disabled={isSubmitting}
                  >
                    <option value="">— Unassigned (No teacher allocated yet) —</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.employee_id ? `[${t.employee_id}]` : ''} {t.specialization ? `(${t.specialization})` : ''} — {t.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.modalWarningCallout} style={{ background: '#f8fafc', borderColor: '#e2e8f0', color: '#475569' }}>
                  <Sparkles size={18} color="#6366f1" style={{ flexShrink: 0 }} />
                  <div>
                    If this subject is already allocated to this class for the selected session, submitting will safely update the assigned faculty member.
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowAllocationModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <RotateCcw size={16} className={styles.spinning} />
                      <span>Allocating...</span>
                    </>
                  ) : (
                    <span>Confirm Allocation</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Academics;
