import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Award,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Plus,
  Trash2,
  Printer,
  BookOpen,
  GraduationCap,
  FileCheck,
  X,
  FileSpreadsheet,
  TrendingUp,
  AlertTriangle,
  Send,
  Eye,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import styles from './Exams.module.css';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
}

export interface ClassItem {
  id: string;
  name: string;
  code?: string;
}

export interface SubjectItem {
  id: string;
  name: string;
  code?: string;
}

export interface ExamTerm {
  id: string;
  title: string;
  type: string;
  academic_year_id: string;
  academic_year_name?: string;
  class_id: string;
  class_name?: string;
  status: 'draft' | 'scheduled' | 'ongoing' | 'completed' | 'published';
  subject_count?: number;
  created_by_name?: string;
  created_at: string;
}

export interface ExamSubject {
  id: string;
  exam_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  exam_date: string;
  start_time?: string | null;
  end_time?: string | null;
  max_marks: number;
  pass_marks: number;
}

export interface StudentMarksRosterItem {
  student_id: string;
  admission_number: string;
  roll_number: string | null;
  student_name: string;
  section_name?: string | null;
  marks_obtained: number | null;
  is_absent: boolean;
  remarks?: string | null;
  graded_by?: string | null;
}

export interface ClassResultItem {
  student_id: string;
  student_name: string;
  roll_number: string | null;
  total_max_marks: number;
  total_obtained: number;
  percentage: number;
  grade: string;
  status: 'PASS' | 'FAIL';
}

export interface StudentReportCardData {
  exam: {
    id: string;
    title: string;
    type: string;
    class_name: string;
    academic_year_name: string;
    status: string;
  };
  student: {
    id: string;
    admission_number: string;
    roll_number: string | null;
    student_name: string;
  };
  summary: {
    total_max_marks: number;
    total_marks_obtained: number;
    overall_percentage: number;
    overall_grade: string;
    overall_status: 'PASS' | 'FAIL';
  };
  subjects: Array<{
    subject_name: string;
    subject_code: string;
    exam_date: string;
    max_marks: number;
    pass_marks: number;
    marks_obtained: number | null;
    is_absent: boolean;
    pass_status: boolean;
    grade: string;
    remarks: string | null;
  }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const calculateGrade = (percentage: number, isAbsent: boolean = false): string => {
  if (isAbsent) return 'F (ABSENT)';
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
};

const getGradeBadgeClass = (grade: string) => {
  if (grade.includes('A+')) return styles.gradeAPlus;
  if (grade.startsWith('A')) return styles.gradeA;
  if (grade.startsWith('B')) return styles.gradeB;
  if (grade.startsWith('C')) return styles.gradeC;
  if (grade.startsWith('D')) return styles.gradeD;
  return styles.gradeF;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'draft':
      return <span className={`${styles.badge} ${styles.statusDraft}`}>Draft</span>;
    case 'scheduled':
      return <span className={`${styles.badge} ${styles.statusScheduled}`}>Scheduled</span>;
    case 'ongoing':
      return <span className={`${styles.badge} ${styles.statusOngoing}`}>Ongoing</span>;
    case 'completed':
      return <span className={`${styles.badge} ${styles.statusCompleted}`}>Completed</span>;
    case 'published':
      return <span className={`${styles.badge} ${styles.statusPublished}`}>Published</span>;
    default:
      return <span className={styles.badge}>{status}</span>;
  }
};

const formatExamType = (type: string): string => {
  switch (type) {
    case 'unit_test': return 'Unit Test';
    case 'mid_term': return 'Mid Term';
    case 'quarterly': return 'Quarterly Exam';
    case 'half_yearly': return 'Half Yearly';
    case 'annual': return 'Annual Exam';
    case 'final': return 'Final Examination';
    case 'quiz': return 'Quiz';
    default: return type.replace(/_/g, ' ');
  }
};

// ─── Main Component ─────────────────────────────────────────────────────────

const Exams: React.FC = () => {
  const { user } = useAuth();
  const userRole = user?.role || '';
  const canManage = ['super_admin', 'principal', 'teacher'].includes(userRole);
  const isSuperAdminOrPrincipal = ['super_admin', 'principal'].includes(userRole);

  // Active Tab: 'terms' | 'marks' | 'broadsheet'
  const [activeTab, setActiveTab] = useState<'terms' | 'marks' | 'broadsheet'>('terms');

  // Metadata dropdown state
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);

  // Filter state for Tab 1
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Main exams list
  const [examsList, setExamsList] = useState<ExamTerm[]>([]);
  const [isLoadingExams, setIsLoadingExams] = useState<boolean>(true);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);

  // ─── Modal States ─────────────────────────────────────────────────────────
  // 1. Create Exam Modal
  const [isCreateExamOpen, setIsCreateExamOpen] = useState<boolean>(false);
  const [createExamSubmitting, setCreateExamSubmitting] = useState<boolean>(false);
  const [createExamError, setCreateExamError] = useState<string | null>(null);
  const [createExamForm, setCreateExamForm] = useState({
    title: '',
    type: 'mid_term',
    academic_year_id: '',
    class_id: '',
  });

  // 2. Exam Details & Subject Schedules Drawer/Modal
  const [selectedExamDetails, setSelectedExamDetails] = useState<ExamTerm | null>(null);
  const [examSubjectsList, setExamSubjectsList] = useState<ExamSubject[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);
  const [addSubjectSubmitting, setAddSubjectSubmitting] = useState<boolean>(false);
  const [addSubjectError, setAddSubjectError] = useState<string | null>(null);
  const [addSubjectForm, setAddSubjectForm] = useState({
    subject_id: '',
    exam_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '12:00',
    max_marks: 100,
    pass_marks: 40,
  });

  // 3. Status Transition Modal
  const [statusUpdateExam, setStatusUpdateExam] = useState<ExamTerm | null>(null);
  const [newStatusValue, setNewStatusValue] = useState<string>('');
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false);

  // ─── Marks Entry Desk State (Tab 2) ───────────────────────────────────────
  const [marksExamId, setMarksExamId] = useState<string>('');
  const [marksExamSubjects, setMarksExamSubjects] = useState<ExamSubject[]>([]);
  const [marksSubjectId, setMarksSubjectId] = useState<string>('');
  const [currentExamSubject, setCurrentExamSubject] = useState<any>(null);
  const [marksRoster, setMarksRoster] = useState<StudentMarksRosterItem[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState<boolean>(false);
  const [isSavingMarks, setIsSavingMarks] = useState<boolean>(false);
  const [marksSaveMessage, setMarksSaveMessage] = useState<string | null>(null);

  // ─── Broadsheet State (Tab 3) ─────────────────────────────────────────────
  const [broadsheetExamId, setBroadsheetExamId] = useState<string>('');
  const [broadsheetClassId, setBroadsheetClassId] = useState<string>('');
  const [broadsheetResults, setBroadsheetResults] = useState<ClassResultItem[]>([]);
  const [isLoadingBroadsheet, setIsLoadingBroadsheet] = useState<boolean>(false);

  // ─── Official Report Card Modal (Tab 4 / View) ────────────────────────────
  const [reportCardModalOpen, setReportCardModalOpen] = useState<boolean>(false);
  const [reportCardData, setReportCardData] = useState<StudentReportCardData | null>(null);
  const [isLoadingReportCard, setIsLoadingReportCard] = useState<boolean>(false);
  const [reportCardError, setReportCardError] = useState<string | null>(null);

  // ─── Load Initial Metadata ────────────────────────────────────────────────

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
            setCreateExamForm((prev) => ({ ...prev, academic_year_id: currentYear.id }));
          }
        }

        if (classesRes.data?.success && classesRes.data?.data?.classes) {
          const clsList: ClassItem[] = classesRes.data.data.classes;
          setClasses(clsList);
          if (clsList.length > 0) {
            setCreateExamForm((prev) => ({ ...prev, class_id: clsList[0].id }));
          }
        }

        if (subjectsRes.data?.success && subjectsRes.data?.data?.subjects) {
          const subList: SubjectItem[] = subjectsRes.data.data.subjects;
          setSubjects(subList);
          if (subList.length > 0) {
            setAddSubjectForm((prev) => ({ ...prev, subject_id: subList[0].id }));
          }
        }
      } catch (err: any) {
        console.error('Failed to load exams metadata:', err);
        setAlertError('Failed to load academic sessions, classes or subjects.');
      }
    };

    fetchMetadata();
  }, []);

  // ─── Fetch Exams List ─────────────────────────────────────────────────────

  const fetchExams = useCallback(async () => {
    setIsLoadingExams(true);
    setAlertError(null);
    try {
      const params = new URLSearchParams();
      if (selectedYear) params.append('academic_year_id', selectedYear);
      if (selectedClass) params.append('class_id', selectedClass);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);

      const res = await apiClient.get(`/exams?${params.toString()}`);
      if (res.data?.success && res.data?.data?.exams) {
        setExamsList(res.data.data.exams);
      }
    } catch (err: any) {
      console.error('Failed to fetch exams:', err);
      setAlertError(err.response?.data?.message || 'Failed to load exams list.');
    } finally {
      setIsLoadingExams(false);
    }
  }, [selectedYear, selectedClass, selectedStatus]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  // Filtered exams by search
  const filteredExams = useMemo(() => {
    if (!searchQuery.trim()) return examsList;
    const q = searchQuery.toLowerCase();
    return examsList.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.class_name && e.class_name.toLowerCase().includes(q)) ||
        (e.type && e.type.toLowerCase().includes(q))
    );
  }, [examsList, searchQuery]);

  // Overall KPI metrics
  const examMetrics = useMemo(() => {
    const total = examsList.length;
    const scheduled = examsList.filter((e) => e.status === 'scheduled').length;
    const ongoing = examsList.filter((e) => e.status === 'ongoing').length;
    const published = examsList.filter((e) => e.status === 'published').length;
    return { total, scheduled, ongoing, published };
  }, [examsList]);

  // ─── Create Exam Term Handler ─────────────────────────────────────────────

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createExamForm.title.trim() || !createExamForm.academic_year_id || !createExamForm.class_id) {
      setCreateExamError('Please complete all required fields.');
      return;
    }

    setCreateExamSubmitting(true);
    setCreateExamError(null);

    try {
      const res = await apiClient.post('/exams', {
        title: createExamForm.title.trim(),
        type: createExamForm.type,
        academic_year_id: createExamForm.academic_year_id,
        class_id: createExamForm.class_id,
      });

      if (res.data?.success) {
        setIsCreateExamOpen(false);
        setAlertSuccess(`Exam "${createExamForm.title}" created successfully as draft.`);
        setCreateExamForm((prev) => ({
          ...prev,
          title: '',
          type: 'mid_term',
        }));
        fetchExams();
      }
    } catch (err: any) {
      setCreateExamError(err.response?.data?.message || 'Failed to create exam.');
    } finally {
      setCreateExamSubmitting(false);
    }
  };

  // ─── Delete Draft Exam Handler ────────────────────────────────────────────

  const handleDeleteExam = async (examId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete draft exam "${title}"? This cannot be undone.`)) {
      return;
    }
    try {
      const res = await apiClient.delete(`/exams/${examId}`);
      if (res.data?.success) {
        setAlertSuccess('Exam deleted successfully.');
        fetchExams();
        if (selectedExamDetails?.id === examId) {
          setSelectedExamDetails(null);
        }
      }
    } catch (err: any) {
      setAlertError(err.response?.data?.message || 'Failed to delete exam.');
    }
  };

  // ─── View Exam Details & Subjects ─────────────────────────────────────────

  const handleViewExamDetails = async (exam: ExamTerm) => {
    setSelectedExamDetails(exam);
    setIsLoadingDetails(true);
    try {
      const res = await apiClient.get(`/exams/${exam.id}`);
      if (res.data?.success && res.data?.data) {
        setExamSubjectsList(res.data.data.subjects || []);
      }
    } catch (err: any) {
      setAlertError(err.response?.data?.message || 'Failed to fetch exam schedule.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // ─── Add Subject Schedule Handler ─────────────────────────────────────────

  const handleAddSubjectSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamDetails) return;
    if (!addSubjectForm.subject_id || !addSubjectForm.exam_date) {
      setAddSubjectError('Subject and Exam Date are required.');
      return;
    }

    setAddSubjectSubmitting(true);
    setAddSubjectError(null);

    try {
      const res = await apiClient.post('/exams/subjects', {
        exam_id: selectedExamDetails.id,
        subject_id: addSubjectForm.subject_id,
        exam_date: addSubjectForm.exam_date,
        start_time: addSubjectForm.start_time || null,
        end_time: addSubjectForm.end_time || null,
        max_marks: Number(addSubjectForm.max_marks) || 100,
        pass_marks: Number(addSubjectForm.pass_marks) || 40,
      });

      if (res.data?.success) {
        setIsScheduleModalOpen(false);
        setAlertSuccess('Subject schedule added successfully.');
        // Refresh details
        handleViewExamDetails(selectedExamDetails);
        fetchExams();
      }
    } catch (err: any) {
      setAddSubjectError(err.response?.data?.message || 'Failed to add subject schedule.');
    } finally {
      setAddSubjectSubmitting(false);
    }
  };

  // ─── Remove Subject Schedule Handler ──────────────────────────────────────

  const handleDeleteSubjectSchedule = async (subjectScheduleId: string, subjectName: string) => {
    if (!window.confirm(`Remove ${subjectName} from this exam schedule?`)) return;
    try {
      const res = await apiClient.delete(`/exams/subjects/${subjectScheduleId}`);
      if (res.data?.success) {
        setAlertSuccess(`Subject ${subjectName} schedule removed.`);
        if (selectedExamDetails) {
          handleViewExamDetails(selectedExamDetails);
        }
        fetchExams();
      }
    } catch (err: any) {
      setAlertError(err.response?.data?.message || 'Failed to remove subject.');
    }
  };

  // ─── Update Exam Status ───────────────────────────────────────────────────

  const handleUpdateStatusConfirm = async () => {
    if (!statusUpdateExam || !newStatusValue) return;
    setStatusUpdating(true);
    try {
      const res = await apiClient.patch(`/exams/${statusUpdateExam.id}/status`, {
        status: newStatusValue,
      });
      if (res.data?.success) {
        setAlertSuccess(`Exam "${statusUpdateExam.title}" is now ${newStatusValue.toUpperCase()}.`);
        setStatusUpdateExam(null);
        fetchExams();
        if (selectedExamDetails?.id === statusUpdateExam.id) {
          setSelectedExamDetails((prev) => (prev ? { ...prev, status: newStatusValue as any } : null));
        }
      }
    } catch (err: any) {
      setAlertError(err.response?.data?.message || 'Failed to update exam status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  // ─── TAB 2: Marks Entry Desk Functions ────────────────────────────────────

  // When marksExamId changes, load its subject schedules
  useEffect(() => {
    if (!marksExamId) {
      setMarksExamSubjects([]);
      setMarksSubjectId('');
      setMarksRoster([]);
      return;
    }
    const loadExamSubjects = async () => {
      try {
        const res = await apiClient.get(`/exams/${marksExamId}`);
        if (res.data?.success && res.data?.data?.subjects) {
          const subs: ExamSubject[] = res.data.data.subjects;
          setMarksExamSubjects(subs);
          if (subs.length > 0) {
            setMarksSubjectId(subs[0].id);
          } else {
            setMarksSubjectId('');
            setMarksRoster([]);
          }
        }
      } catch (err) {
        console.error('Failed to load subjects for marks entry:', err);
      }
    };
    loadExamSubjects();
  }, [marksExamId]);

  // When marksSubjectId changes, load the roster
  useEffect(() => {
    if (!marksSubjectId) {
      setMarksRoster([]);
      setCurrentExamSubject(null);
      return;
    }
    const loadRoster = async () => {
      setIsLoadingRoster(true);
      setMarksSaveMessage(null);
      try {
        const res = await apiClient.get(`/exams/subjects/${marksSubjectId}/marks`);
        if (res.data?.success && res.data?.data) {
          setCurrentExamSubject(res.data.data.exam_subject);
          setMarksRoster(res.data.data.students || []);
        }
      } catch (err: any) {
        console.error('Failed to load subject roster:', err);
        setAlertError(err.response?.data?.message || 'Failed to load student roster for marks.');
      } finally {
        setIsLoadingRoster(false);
      }
    };
    loadRoster();
  }, [marksSubjectId]);

  // Handle Marks change in row
  const handleMarksChange = (studentId: string, val: string) => {
    const num = val === '' ? null : Math.max(0, Math.min(Number(currentExamSubject?.max_marks || 100), Number(val)));
    setMarksRoster((prev) =>
      prev.map((s) => (s.student_id === studentId ? { ...s, marks_obtained: num } : s))
    );
  };

  // Handle Absent toggle
  const handleAbsentToggle = (studentId: string, isAbsent: boolean) => {
    setMarksRoster((prev) =>
      prev.map((s) =>
        s.student_id === studentId
          ? {
              ...s,
              is_absent: isAbsent,
              marks_obtained: isAbsent ? null : s.marks_obtained,
            }
          : s
      )
    );
  };

  // Handle Remarks change
  const handleRemarksChange = (studentId: string, remarks: string) => {
    setMarksRoster((prev) =>
      prev.map((s) => (s.student_id === studentId ? { ...s, remarks } : s))
    );
  };

  // Bulk Save Marks
  const handleSaveMarks = async () => {
    if (!marksSubjectId || marksRoster.length === 0) return;
    setIsSavingMarks(true);
    setMarksSaveMessage(null);
    try {
      const payload = {
        exam_subject_id: marksSubjectId,
        marks: marksRoster.map((s) => ({
          student_id: s.student_id,
          marks_obtained: s.is_absent ? null : s.marks_obtained,
          is_absent: s.is_absent,
          remarks: s.remarks || null,
        })),
      };

      const res = await apiClient.post('/exams/marks', payload);
      if (res.data?.success) {
        setMarksSaveMessage(`✅ Marks recorded successfully for ${marksRoster.length} students.`);
        // Clear message after 4s
        setTimeout(() => setMarksSaveMessage(null), 4000);
      }
    } catch (err: any) {
      setAlertError(err.response?.data?.message || 'Failed to save marks.');
    } finally {
      setIsSavingMarks(false);
    }
  };

  // ─── TAB 3: Broadsheet & Results ──────────────────────────────────────────

  const handleFetchBroadsheet = useCallback(async () => {
    if (!broadsheetExamId || !broadsheetClassId) return;
    setIsLoadingBroadsheet(true);
    try {
      const res = await apiClient.get(`/exams/${broadsheetExamId}/results/class/${broadsheetClassId}`);
      if (res.data?.success && res.data?.data?.results) {
        setBroadsheetResults(res.data.data.results);
      }
    } catch (err: any) {
      setAlertError(err.response?.data?.message || 'Failed to load class broadsheet.');
    } finally {
      setIsLoadingBroadsheet(false);
    }
  }, [broadsheetExamId, broadsheetClassId]);

  useEffect(() => {
    if (broadsheetExamId && broadsheetClassId) {
      handleFetchBroadsheet();
    }
  }, [broadsheetExamId, broadsheetClassId, handleFetchBroadsheet]);

  // Broadsheet aggregate statistics
  const broadsheetStats = useMemo(() => {
    if (broadsheetResults.length === 0) return { total: 0, passed: 0, failed: 0, avgPct: 0 };
    const total = broadsheetResults.length;
    const passed = broadsheetResults.filter((r) => r.status === 'PASS').length;
    const failed = total - passed;
    const totalPct = broadsheetResults.reduce((acc, curr) => acc + (Number(curr.percentage) || 0), 0);
    const avgPct = Number((totalPct / total).toFixed(1));
    return { total, passed, failed, avgPct };
  }, [broadsheetResults]);

  // ─── TAB 4: Fetch Official Report Card ────────────────────────────────────

  const handleViewReportCard = async (examId: string, studentId: string) => {
    setIsLoadingReportCard(true);
    setReportCardError(null);
    setReportCardModalOpen(true);
    try {
      const res = await apiClient.get(`/exams/${examId}/results/student/${studentId}`);
      if (res.data?.success && res.data?.data) {
        setReportCardData(res.data.data);
      }
    } catch (err: any) {
      setReportCardError(err.response?.data?.message || 'Unable to fetch official report card.');
    } finally {
      setIsLoadingReportCard(false);
    }
  };

  // Quick navigation to Marks entry from Exam Card
  const handleQuickJumpMarks = (exam: ExamTerm) => {
    setMarksExamId(exam.id);
    setActiveTab('marks');
  };

  // Quick navigation to Broadsheet from Exam Card
  const handleQuickJumpBroadsheet = (exam: ExamTerm) => {
    setBroadsheetExamId(exam.id);
    setBroadsheetClassId(exam.class_id);
    setActiveTab('broadsheet');
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* ── Page Header ── */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Exams & Results</h1>
          <p className={styles.subtitle}>
            Term examination schedules, subject marksheets, grade calculations, and institutional report cards
          </p>
        </div>

        <div className={styles.actionGroup}>
          {canManage && (
            <button
              className={styles.primaryBtn}
              onClick={() => setIsCreateExamOpen(true)}
            >
              <Plus size={18} />
              Create Exam Term
            </button>
          )}
        </div>
      </header>

      {/* ── Global Alerts ── */}
      {alertError && (
        <div className={styles.alertError}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={18} />
            <span>{alertError}</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setAlertError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {alertSuccess && (
        <div className={styles.alertSuccess}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={18} />
            <span>{alertSuccess}</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setAlertSuccess(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── High-Level KPI Summary Cards ── */}
      <section className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span>TOTAL EXAMS RECORDED</span>
            <div className={`${styles.metricIcon} ${styles.metricIconBlue}`}>
              <Award size={18} />
            </div>
          </div>
          <div className={styles.metricValue}>{examMetrics.total}</div>
          <span className={styles.metricSubtext}>Across all classes & terms</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span>SCHEDULED / UPCOMING</span>
            <div className={`${styles.metricIcon} ${styles.metricIconAmber}`}>
              <Calendar size={18} />
            </div>
          </div>
          <div className={styles.metricValue}>{examMetrics.scheduled}</div>
          <span className={styles.metricSubtext}>Timetable finalized</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span>ONGOING EXAMS</span>
            <div className={`${styles.metricIcon} ${styles.metricIconPurple}`}>
              <Clock size={18} />
            </div>
          </div>
          <div className={styles.metricValue}>{examMetrics.ongoing}</div>
          <span className={styles.metricSubtext}>Marks entry in progress</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span>RESULTS PUBLISHED</span>
            <div className={`${styles.metricIcon} ${styles.metricIconEmerald}`}>
              <FileCheck size={18} />
            </div>
          </div>
          <div className={styles.metricValue}>{examMetrics.published}</div>
          <span className={styles.metricSubtext}>Report cards visible to students</span>
        </div>
      </section>

      {/* ── Tabs Navigation ── */}
      <nav className={styles.tabNav}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'terms' ? styles.activeTabBtn : ''}`}
          onClick={() => setActiveTab('terms')}
        >
          <Award size={17} />
          Exam Terms & Schedules
          <span className={styles.tabBadge}>{examsList.length}</span>
        </button>

        {canManage && (
          <button
            className={`${styles.tabBtn} ${activeTab === 'marks' ? styles.activeTabBtn : ''}`}
            onClick={() => setActiveTab('marks')}
          >
            <BookOpen size={17} />
            Marks Entry Desk
          </button>
        )}

        <button
          className={`${styles.tabBtn} ${activeTab === 'broadsheet' ? styles.activeTabBtn : ''}`}
          onClick={() => setActiveTab('broadsheet')}
        >
          <FileSpreadsheet size={17} />
          Class Broadsheet & Analytics
        </button>
      </nav>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: EXAM TERMS & SCHEDULES ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'terms' && (
        <div>
          {/* Filters Bar */}
          <div className={styles.filterBar}>
            <div className={styles.filterGrid}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Academic Session</label>
                <select
                  className={styles.select}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                >
                  <option value="">All Academic Years</option>
                  {academicYears.map((ay) => (
                    <option key={ay.id} value={ay.id}>
                      {ay.name} {ay.is_current ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Class Filter</label>
                <select
                  className={styles.select}
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                >
                  <option value="">All Classes</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Status</label>
                <select
                  className={styles.select}
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="published">Published</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Search Term</label>
                <div className={styles.searchWrapper}>
                  <Search size={16} className={styles.searchIcon} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search by title or class..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Exams Grid */}
          {isLoadingExams ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner} />
              <span>Loading examination terms...</span>
            </div>
          ) : filteredExams.length === 0 ? (
            <div className={styles.emptyState}>
              <Award size={48} className={styles.emptyStateIcon} />
              <h3 className={styles.emptyStateTitle}>No Examination Terms Found</h3>
              <p className={styles.emptyStateText}>
                There are no exams matching your selected session and class filter.
              </p>
              {canManage && (
                <button
                  className={styles.primaryBtn}
                  onClick={() => setIsCreateExamOpen(true)}
                >
                  <Plus size={16} />
                  Create First Exam Term
                </button>
              )}
            </div>
          ) : (
            <div className={styles.examGrid}>
              {filteredExams.map((exam) => (
                <div key={exam.id} className={styles.examCard}>
                  <div className={styles.examCardHeader}>
                    <div>
                      <h3 className={styles.examCardTitle}>{exam.title}</h3>
                      <div className={styles.examMetaRow}>
                        <span className={styles.classBadge}>
                          Class: {exam.class_name || 'All'}
                        </span>
                        <span className={styles.yearBadge}>
                          {exam.academic_year_name || 'Session'}
                        </span>
                        <span className={styles.yearBadge}>
                          {formatExamType(exam.type)}
                        </span>
                      </div>
                    </div>
                    <div>{getStatusBadge(exam.status)}</div>
                  </div>

                  <div className={styles.examCardBody}>
                    <div className={styles.examInfoList}>
                      <div className={styles.examInfoItem}>
                        <BookOpen size={15} color="#64748b" />
                        <span>
                          <strong>{exam.subject_count || 0}</strong> Scheduled Subject(s)
                        </span>
                      </div>
                      <div className={styles.examInfoItem}>
                        <Clock size={15} color="#64748b" />
                        <span>Created: {new Date(exam.created_at).toLocaleDateString()}</span>
                      </div>
                      {exam.created_by_name && (
                        <div className={styles.examInfoItem}>
                          <GraduationCap size={15} color="#64748b" />
                          <span>By: {exam.created_by_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.examCardFooter}>
                    <button
                      className={styles.secondaryBtn}
                      onClick={() => handleViewExamDetails(exam)}
                    >
                      <Eye size={15} />
                      Schedule ({exam.subject_count || 0})
                    </button>

                    <div style={{ display: 'flex', gap: 6 }}>
                      {canManage && (
                        <button
                          className={styles.secondaryBtn}
                          onClick={() => handleQuickJumpMarks(exam)}
                          title="Enter student marks"
                        >
                          <BookOpen size={15} />
                          Marks
                        </button>
                      )}

                      <button
                        className={styles.secondaryBtn}
                        onClick={() => handleQuickJumpBroadsheet(exam)}
                        title="View broadsheet results"
                      >
                        <FileSpreadsheet size={15} />
                        Results
                      </button>

                      {isSuperAdminOrPrincipal && exam.status === 'draft' && (
                        <button
                          className={styles.dangerBtn}
                          onClick={() => handleDeleteExam(exam.id, exam.title)}
                          title="Delete draft exam"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: MARKS ENTRY DESK ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'marks' && (
        <div>
          {/* Selector Bar */}
          <div className={styles.filterBar}>
            <div className={styles.filterGrid}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>1. Select Exam Term</label>
                <select
                  className={styles.select}
                  value={marksExamId}
                  onChange={(e) => setMarksExamId(e.target.value)}
                >
                  <option value="">-- Choose Exam Term --</option>
                  {examsList.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({e.class_name} • {e.status.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>2. Select Subject Schedule</label>
                <select
                  className={styles.select}
                  value={marksSubjectId}
                  onChange={(e) => setMarksSubjectId(e.target.value)}
                  disabled={marksExamSubjects.length === 0}
                >
                  {marksExamSubjects.length === 0 ? (
                    <option value="">No subjects in exam</option>
                  ) : (
                    marksExamSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.subject_name} ({s.subject_code}) - Max: {s.max_marks} / Pass: {s.pass_marks}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Roster & Marks Entry Table */}
          {!marksSubjectId ? (
            <div className={styles.emptyState}>
              <BookOpen size={48} className={styles.emptyStateIcon} />
              <h3 className={styles.emptyStateTitle}>Choose an Exam & Subject</h3>
              <p className={styles.emptyStateText}>
                Select an examination term and a subject schedule above to open the student marks entry roster.
              </p>
            </div>
          ) : isLoadingRoster ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner} />
              <span>Loading student roster & marks...</span>
            </div>
          ) : (
            <div className={styles.tableCard}>
              <div className={styles.tableHeaderBar}>
                <div className={styles.tableTitleArea}>
                  <h2>
                    Marks Entry: {currentExamSubject?.subject_name} ({currentExamSubject?.subject_code})
                  </h2>
                  <p className={styles.tableSubtitle}>
                    Class: <strong>{currentExamSubject?.class_name}</strong> • Max Marks:{' '}
                    <strong>{currentExamSubject?.max_marks}</strong> • Pass Marks:{' '}
                    <strong>{currentExamSubject?.pass_marks}</strong>
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {marksSaveMessage && (
                    <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 600 }}>
                      {marksSaveMessage}
                    </span>
                  )}
                  <button
                    className={styles.successBtn}
                    onClick={handleSaveMarks}
                    disabled={isSavingMarks || marksRoster.length === 0}
                  >
                    <Send size={16} />
                    {isSavingMarks ? 'Saving...' : 'Save All Marks'}
                  </button>
                </div>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Roll No</th>
                      <th>Student Name</th>
                      <th>Adm No</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Absent</th>
                      <th style={{ width: '130px', textAlign: 'center' }}>
                        Marks (Max: {currentExamSubject?.max_marks})
                      </th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Percentage</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Grade</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marksRoster.map((student) => {
                      const max = Number(currentExamSubject?.max_marks || 100);
                      const marks = student.marks_obtained;
                      const isAbsent = Boolean(student.is_absent);
                      let pct = 0;
                      let grade = 'N/A';
                      if (isAbsent) {
                        grade = 'F (ABSENT)';
                      } else if (marks !== null && !isNaN(marks)) {
                        pct = Number(((marks / max) * 100).toFixed(1));
                        grade = calculateGrade(pct);
                      }

                      return (
                        <tr key={student.student_id}>
                          <td>
                            <strong>{student.roll_number || '—'}</strong>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                              {student.student_name}
                            </div>
                            {student.section_name && (
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Section: {student.section_name}
                              </div>
                            )}
                          </td>
                          <td>{student.admission_number}</td>
                          <td style={{ textAlign: 'center' }}>
                            <label className={styles.absentToggle}>
                              <input
                                type="checkbox"
                                className={styles.absentCheckbox}
                                checked={isAbsent}
                                onChange={(e) =>
                                  handleAbsentToggle(student.student_id, e.target.checked)
                                }
                              />
                              <span>Absent</span>
                            </label>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              max={max}
                              className={`${styles.marksInput} ${
                                isAbsent ? styles.marksInputDisabled : ''
                              }`}
                              placeholder={isAbsent ? 'ABS' : '0'}
                              disabled={isAbsent}
                              value={student.marks_obtained !== null ? student.marks_obtained : ''}
                              onChange={(e) =>
                                handleMarksChange(student.student_id, e.target.value)
                              }
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isAbsent ? (
                              <span style={{ color: '#dc2626', fontWeight: 600 }}>0%</span>
                            ) : marks !== null ? (
                              <span style={{ fontWeight: 600 }}>{pct}%</span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className={`${styles.gradeBadge} ${getGradeBadgeClass(grade)}`}
                            >
                              {grade}
                            </span>
                          </td>
                          <td>
                            <input
                              type="text"
                              className={styles.remarksInput}
                              placeholder="e.g. Good performance"
                              value={student.remarks || ''}
                              onChange={(e) =>
                                handleRemarksChange(student.student_id, e.target.value)
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: CLASS RESULTS BROADSHEET ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'broadsheet' && (
        <div>
          {/* Broadsheet Selectors */}
          <div className={styles.filterBar}>
            <div className={styles.filterGrid}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>1. Select Examination</label>
                <select
                  className={styles.select}
                  value={broadsheetExamId}
                  onChange={(e) => {
                    setBroadsheetExamId(e.target.value);
                    const selected = examsList.find((ex) => ex.id === e.target.value);
                    if (selected) setBroadsheetClassId(selected.class_id);
                  }}
                >
                  <option value="">-- Choose Exam Term --</option>
                  {examsList.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({e.class_name} • {e.status.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>2. Class</label>
                <select
                  className={styles.select}
                  value={broadsheetClassId}
                  onChange={(e) => setBroadsheetClassId(e.target.value)}
                >
                  <option value="">-- Choose Class --</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!broadsheetExamId || !broadsheetClassId ? (
            <div className={styles.emptyState}>
              <FileSpreadsheet size={48} className={styles.emptyStateIcon} />
              <h3 className={styles.emptyStateTitle}>Choose Exam & Class</h3>
              <p className={styles.emptyStateText}>
                Select an examination and its class to view the full student broadsheet, performance metrics, and official report cards.
              </p>
            </div>
          ) : isLoadingBroadsheet ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner} />
              <span>Calculating broadsheet metrics...</span>
            </div>
          ) : (
            <div>
              {/* Aggregate Broadsheet KPIs */}
              <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                  <div className={styles.metricHeader}>
                    <span>STUDENTS EVALUATED</span>
                    <div className={`${styles.metricIcon} ${styles.metricIconBlue}`}>
                      <GraduationCap size={18} />
                    </div>
                  </div>
                  <div className={styles.metricValue}>{broadsheetStats.total}</div>
                  <span className={styles.metricSubtext}>Enrolled in active roster</span>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricHeader}>
                    <span>PASSED STUDENTS</span>
                    <div className={`${styles.metricIcon} ${styles.metricIconEmerald}`}>
                      <CheckCircle2 size={18} />
                    </div>
                  </div>
                  <div className={styles.metricValue}>
                    {broadsheetStats.passed}{' '}
                    <span style={{ fontSize: '0.85rem', color: '#059669' }}>
                      (
                      {broadsheetStats.total > 0
                        ? Math.round((broadsheetStats.passed / broadsheetStats.total) * 100)
                        : 0}
                      %)
                    </span>
                  </div>
                  <span className={styles.metricSubtext}>Cleared all scheduled subjects</span>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricHeader}>
                    <span>FAILED / COMPARTMENT</span>
                    <div className={`${styles.metricIcon} ${styles.metricIconAmber}`}>
                      <AlertTriangle size={18} />
                    </div>
                  </div>
                  <div className={styles.metricValue}>
                    {broadsheetStats.failed}{' '}
                    <span style={{ fontSize: '0.85rem', color: '#dc2626' }}>
                      (
                      {broadsheetStats.total > 0
                        ? Math.round((broadsheetStats.failed / broadsheetStats.total) * 100)
                        : 0}
                      %)
                    </span>
                  </div>
                  <span className={styles.metricSubtext}>Below passing score in &ge;1 subject</span>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricHeader}>
                    <span>CLASS AVERAGE</span>
                    <div className={`${styles.metricIcon} ${styles.metricIconPurple}`}>
                      <TrendingUp size={18} />
                    </div>
                  </div>
                  <div className={styles.metricValue}>{broadsheetStats.avgPct}%</div>
                  <span className={styles.metricSubtext}>Institutional average percentage</span>
                </div>
              </div>

              {/* Broadsheet Table */}
              <div className={styles.tableCard}>
                <div className={styles.tableHeaderBar}>
                  <div className={styles.tableTitleArea}>
                    <h2>Class Examination Broadsheet</h2>
                    <p className={styles.tableSubtitle}>
                      Click "Official Report Card" on any student to preview and print their CBSE/State board report card.
                    </p>
                  </div>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: '70px' }}>Roll</th>
                        <th>Student Name</th>
                        <th>Total Obtained</th>
                        <th>Max Marks</th>
                        <th style={{ width: '140px' }}>Percentage</th>
                        <th style={{ width: '80px', textAlign: 'center' }}>Grade</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>Result</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {broadsheetResults.map((row) => (
                        <tr key={row.student_id}>
                          <td>
                            <strong>{row.roll_number || '—'}</strong>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              {row.student_name}
                            </span>
                          </td>
                          <td>
                            <strong>{row.total_obtained}</strong>
                          </td>
                          <td>{row.total_max_marks}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{row.percentage}%</div>
                            <div className={styles.progressBar}>
                              <div
                                className={
                                  row.status === 'PASS'
                                    ? styles.progressFillPass
                                    : styles.progressFillFail
                                }
                                style={{ width: `${Math.min(100, row.percentage)}%` }}
                              />
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className={`${styles.gradeBadge} ${getGradeBadgeClass(row.grade)}`}
                            >
                              {row.grade}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {row.status === 'PASS' ? (
                              <span className={styles.passTag}>
                                <CheckCircle2 size={13} />
                                PASS
                              </span>
                            ) : (
                              <span className={styles.failTag}>
                                <AlertTriangle size={13} />
                                FAIL
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className={styles.secondaryBtn}
                              onClick={() => handleViewReportCard(broadsheetExamId, row.student_id)}
                              style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                            >
                              <Printer size={14} />
                              Report Card
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 1: CREATE EXAM TERM ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {isCreateExamOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsCreateExamOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Create New Examination Term</h2>
              <button
                className={styles.closeBtn}
                onClick={() => setIsCreateExamOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateExam}>
              <div className={styles.modalBody}>
                {createExamError && (
                  <div className={styles.alertError} style={{ marginBottom: 16 }}>
                    {createExamError}
                  </div>
                )}

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Exam Term Title <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="e.g. Mid-Term Examination 2026-27"
                      value={createExamForm.title}
                      onChange={(e) =>
                        setCreateExamForm({ ...createExamForm, title: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className={styles.formGridTwoCol}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Exam Type <span className={styles.requiredAsterisk}>*</span>
                      </label>
                      <select
                        className={styles.select}
                        value={createExamForm.type}
                        onChange={(e) =>
                          setCreateExamForm({ ...createExamForm, type: e.target.value })
                        }
                      >
                        <option value="unit_test">Unit Test</option>
                        <option value="mid_term">Mid Term</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="half_yearly">Half Yearly</option>
                        <option value="annual">Annual Exam</option>
                        <option value="final">Final Exam</option>
                        <option value="quiz">Quiz</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Class <span className={styles.requiredAsterisk}>*</span>
                      </label>
                      <select
                        className={styles.select}
                        value={createExamForm.class_id}
                        onChange={(e) =>
                          setCreateExamForm({ ...createExamForm, class_id: e.target.value })
                        }
                        required
                      >
                        {classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Academic Session <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <select
                      className={styles.select}
                      value={createExamForm.academic_year_id}
                      onChange={(e) =>
                        setCreateExamForm({
                          ...createExamForm,
                          academic_year_id: e.target.value,
                        })
                      }
                      required
                    >
                      {academicYears.map((ay) => (
                        <option key={ay.id} value={ay.id}>
                          {ay.name} {ay.is_current ? '(Current)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsCreateExamOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={createExamSubmitting}
                >
                  {createExamSubmitting ? 'Creating...' : 'Create Exam Term'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 2: EXAM DETAILS & SUBJECT SCHEDULES ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {selectedExamDetails && (
        <div className={styles.modalOverlay} onClick={() => setSelectedExamDetails(null)}>
          <div
            className={`${styles.modal} ${styles.modalLarge}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2>{selectedExamDetails.title}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span className={styles.classBadge}>Class: {selectedExamDetails.class_name}</span>
                  <span className={styles.yearBadge}>{selectedExamDetails.academic_year_name}</span>
                  {getStatusBadge(selectedExamDetails.status)}
                </div>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setSelectedExamDetails(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Status Workflow Action Toolbar */}
              {isSuperAdminOrPrincipal && (
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '12px 16px',
                    borderRadius: 8,
                    marginBottom: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                    Status Transition:
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selectedExamDetails.status === 'draft' && (
                      <button
                        className={styles.secondaryBtn}
                        onClick={() => {
                          setStatusUpdateExam(selectedExamDetails);
                          setNewStatusValue('scheduled');
                        }}
                      >
                        Set Scheduled
                      </button>
                    )}
                    {selectedExamDetails.status === 'scheduled' && (
                      <button
                        className={styles.secondaryBtn}
                        onClick={() => {
                          setStatusUpdateExam(selectedExamDetails);
                          setNewStatusValue('ongoing');
                        }}
                      >
                        Start Ongoing
                      </button>
                    )}
                    {selectedExamDetails.status === 'ongoing' && (
                      <button
                        className={styles.secondaryBtn}
                        onClick={() => {
                          setStatusUpdateExam(selectedExamDetails);
                          setNewStatusValue('completed');
                        }}
                      >
                        Mark Completed
                      </button>
                    )}
                    {selectedExamDetails.status === 'completed' && (
                      <button
                        className={styles.successBtn}
                        onClick={() => {
                          setStatusUpdateExam(selectedExamDetails);
                          setNewStatusValue('published');
                        }}
                      >
                        <CheckCircle2 size={15} />
                        Publish Results
                      </button>
                    )}
                    {selectedExamDetails.status === 'published' && (
                      <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                        ✅ Published & Visible to Students
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Scheduled Exam Subjects ({examSubjectsList.length})
                </h3>
                {canManage && selectedExamDetails.status !== 'published' && (
                  <button
                    className={styles.primaryBtn}
                    onClick={() => setIsScheduleModalOpen(true)}
                    style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                  >
                    <Plus size={15} />
                    Add Subject Schedule
                  </button>
                )}
              </div>

              {isLoadingDetails ? (
                <div className={styles.loadingContainer}>
                  <div className={styles.spinner} />
                  <span>Loading schedule...</span>
                </div>
              ) : examSubjectsList.length === 0 ? (
                <div className={styles.emptyState} style={{ padding: '32px 16px' }}>
                  <BookOpen size={36} className={styles.emptyStateIcon} />
                  <h4 style={{ margin: '0 0 4px 0', color: '#1e293b' }}>No Subjects Scheduled Yet</h4>
                  <p style={{ margin: 0, fontSize: '0.8125rem' }}>
                    Add subject exam dates, times, and maximum marks to finalize the timetable.
                  </p>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Time Window</th>
                      <th>Max Marks</th>
                      <th>Pass Marks</th>
                      {canManage && selectedExamDetails.status !== 'published' && (
                        <th style={{ textAlign: 'right' }}>Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {examSubjectsList.map((sub) => (
                      <tr key={sub.id}>
                        <td>
                          <strong>{sub.subject_name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Code: {sub.subject_code}
                          </div>
                        </td>
                        <td>{new Date(sub.exam_date).toLocaleDateString()}</td>
                        <td>
                          {sub.start_time && sub.end_time
                            ? `${sub.start_time} - ${sub.end_time}`
                            : 'Standard'}
                        </td>
                        <td>
                          <strong>{sub.max_marks}</strong>
                        </td>
                        <td>{sub.pass_marks}</td>
                        {canManage && selectedExamDetails.status !== 'published' && (
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className={styles.dangerBtn}
                              onClick={() =>
                                handleDeleteSubjectSchedule(sub.id, sub.subject_name)
                              }
                              title="Delete subject schedule"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setSelectedExamDetails(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 3: ADD SUBJECT SCHEDULE MODAL ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {isScheduleModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsScheduleModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Add Subject Schedule</h2>
              <button
                className={styles.closeBtn}
                onClick={() => setIsScheduleModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubjectSchedule}>
              <div className={styles.modalBody}>
                {addSubjectError && (
                  <div className={styles.alertError} style={{ marginBottom: 16 }}>
                    {addSubjectError}
                  </div>
                )}

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Subject <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <select
                      className={styles.select}
                      value={addSubjectForm.subject_id}
                      onChange={(e) =>
                        setAddSubjectForm({ ...addSubjectForm, subject_id: e.target.value })
                      }
                      required
                    >
                      {subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} ({sub.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Exam Date <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input
                      type="date"
                      className={styles.input}
                      value={addSubjectForm.exam_date}
                      onChange={(e) =>
                        setAddSubjectForm({ ...addSubjectForm, exam_date: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className={styles.formGridTwoCol}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Start Time</label>
                      <input
                        type="time"
                        className={styles.input}
                        value={addSubjectForm.start_time}
                        onChange={(e) =>
                          setAddSubjectForm({ ...addSubjectForm, start_time: e.target.value })
                        }
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>End Time</label>
                      <input
                        type="time"
                        className={styles.input}
                        value={addSubjectForm.end_time}
                        onChange={(e) =>
                          setAddSubjectForm({ ...addSubjectForm, end_time: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className={styles.formGridTwoCol}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Max Marks</label>
                      <input
                        type="number"
                        min="10"
                        max="200"
                        className={styles.input}
                        value={addSubjectForm.max_marks}
                        onChange={(e) =>
                          setAddSubjectForm({
                            ...addSubjectForm,
                            max_marks: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Pass Marks</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        className={styles.input}
                        value={addSubjectForm.pass_marks}
                        onChange={(e) =>
                          setAddSubjectForm({
                            ...addSubjectForm,
                            pass_marks: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsScheduleModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={addSubjectSubmitting}
                >
                  {addSubjectSubmitting ? 'Adding...' : 'Add Subject Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 4: STATUS UPDATE CONFIRMATION ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {statusUpdateExam && (
        <div className={styles.modalOverlay} onClick={() => setStatusUpdateExam(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Confirm Status Transition</h2>
              <button
                className={styles.closeBtn}
                onClick={() => setStatusUpdateExam(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.9375rem', color: '#1e293b' }}>
                Are you sure you want to transition exam <strong>"{statusUpdateExam.title}"</strong> to{' '}
                <strong style={{ color: '#2563eb' }}>{newStatusValue.toUpperCase()}</strong>?
              </p>

              {newStatusValue === 'published' && (
                <div className={styles.alertSuccess} style={{ margin: 0 }}>
                  <AlertCircle size={18} />
                  <span>
                    Publishing results makes final report cards visible to all enrolled students and parents immediately.
                  </span>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setStatusUpdateExam(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={newStatusValue === 'published' ? styles.successBtn : styles.primaryBtn}
                onClick={handleUpdateStatusConfirm}
                disabled={statusUpdating}
              >
                {statusUpdating ? 'Updating...' : `Confirm: ${newStatusValue.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 5: OFFICIAL INSTITUTIONAL REPORT CARD (PRINTABLE) ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {reportCardModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setReportCardModalOpen(false)}>
          <div
            className={styles.reportCardModal}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header (Hidden on Print) */}
            <div className={`${styles.modalHeader} ${styles.noPrint}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={20} color="#2563eb" />
                <h2 style={{ fontSize: '1.1rem' }}>Official Institutional Report Card</h2>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className={styles.primaryBtn}
                  onClick={() => window.print()}
                  style={{ padding: '7px 14px', fontSize: '0.8125rem' }}
                >
                  <Printer size={15} />
                  Print Official Card
                </button>
                <button
                  className={styles.closeBtn}
                  onClick={() => setReportCardModalOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Canvas */}
            <div className={styles.reportCardScrollArea}>
              {isLoadingReportCard ? (
                <div className={styles.loadingContainer}>
                  <div className={styles.spinner} />
                  <span>Generating official student marksheet...</span>
                </div>
              ) : reportCardError ? (
                <div className={styles.alertError}>
                  <AlertCircle size={18} />
                  <span>{reportCardError}</span>
                </div>
              ) : reportCardData ? (
                <div className={styles.reportCardContainer}>
                  {/* Institutional Letterhead */}
                  <div className={styles.schoolLetterhead}>
                    <div className={styles.schoolEmblemArea}>
                      <GraduationCap size={32} color="#0f172a" />
                      <h1 className={styles.schoolName}>Saksham Model Senior Secondary School</h1>
                    </div>
                    <p className={styles.schoolAffiliation}>
                      (Affiliated to CBSE / State Board of Education • Institutional Code: SKM-2026-HQ)
                    </p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                      Sector 12, Vidya Vihar Academic Enclave • Contact: +91 98765 43210
                    </p>
                    <div className={styles.reportCardTitleBanner}>
                      Official Report Card — {reportCardData.exam.title}
                    </div>
                  </div>

                  {/* Student Credentials Grid */}
                  <div className={styles.studentInfoGrid}>
                    <div className={styles.studentInfoItem}>
                      <span className={styles.infoLabel}>Student Name:</span>
                      <span className={styles.infoValue}>{reportCardData.student.student_name}</span>
                    </div>
                    <div className={styles.studentInfoItem}>
                      <span className={styles.infoLabel}>Roll Number:</span>
                      <span className={styles.infoValue}>{reportCardData.student.roll_number || 'N/A'}</span>
                    </div>
                    <div className={styles.studentInfoItem}>
                      <span className={styles.infoLabel}>Admission No:</span>
                      <span className={styles.infoValue}>{reportCardData.student.admission_number}</span>
                    </div>
                    <div className={styles.studentInfoItem}>
                      <span className={styles.infoLabel}>Class / Standard:</span>
                      <span className={styles.infoValue}>{reportCardData.exam.class_name}</span>
                    </div>
                    <div className={styles.studentInfoItem}>
                      <span className={styles.infoLabel}>Academic Session:</span>
                      <span className={styles.infoValue}>{reportCardData.exam.academic_year_name}</span>
                    </div>
                    <div className={styles.studentInfoItem}>
                      <span className={styles.infoLabel}>Exam Term:</span>
                      <span className={styles.infoValue}>{formatExamType(reportCardData.exam.type)}</span>
                    </div>
                  </div>

                  {/* Subject Marksheet Table */}
                  <table className={styles.marksheetTable}>
                    <thead>
                      <tr>
                        <th style={{ width: '90px' }}>Subject Code</th>
                        <th>Subject Name</th>
                        <th style={{ width: '90px' }}>Max Marks</th>
                        <th style={{ width: '90px' }}>Pass Marks</th>
                        <th style={{ width: '110px' }}>Marks Obtained</th>
                        <th style={{ width: '80px' }}>Grade</th>
                        <th style={{ width: '90px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportCardData.subjects.map((sub, idx) => (
                        <tr key={idx}>
                          <td>{sub.subject_code}</td>
                          <td>
                            <strong>{sub.subject_name}</strong>
                          </td>
                          <td>{sub.max_marks}</td>
                          <td>{sub.pass_marks}</td>
                          <td>
                            <strong>{sub.is_absent ? 'ABSENT' : sub.marks_obtained ?? '—'}</strong>
                          </td>
                          <td>
                            <span className={`${styles.gradeBadge} ${getGradeBadgeClass(sub.grade)}`}>
                              {sub.grade}
                            </span>
                          </td>
                          <td>
                            {sub.is_absent ? (
                              <span style={{ color: '#dc2626', fontWeight: 700 }}>ABSENT</span>
                            ) : sub.pass_status ? (
                              <span style={{ color: '#059669', fontWeight: 700 }}>PASS</span>
                            ) : (
                              <span style={{ color: '#dc2626', fontWeight: 700 }}>FAIL</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className={styles.marksheetTotalRow}>
                        <td colSpan={2} style={{ textAlign: 'right', fontWeight: 800 }}>
                          GRAND TOTAL:
                        </td>
                        <td style={{ fontWeight: 800 }}>{reportCardData.summary.total_max_marks}</td>
                        <td>—</td>
                        <td style={{ fontWeight: 800, color: '#1e40af' }}>
                          {reportCardData.summary.total_marks_obtained}
                        </td>
                        <td>
                          <span
                            className={`${styles.gradeBadge} ${getGradeBadgeClass(
                              reportCardData.summary.overall_grade
                            )}`}
                          >
                            {reportCardData.summary.overall_grade}
                          </span>
                        </td>
                        <td>
                          {reportCardData.summary.overall_status === 'PASS' ? (
                            <span className={styles.passTag}>PASS</span>
                          ) : (
                            <span className={styles.failTag}>FAIL</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Summary Metric Cards */}
                  <div className={styles.summaryCardsGrid}>
                    <div className={styles.summaryCard}>
                      <div className={styles.summaryCardLabel}>Marks Secured</div>
                      <div className={styles.summaryCardValue}>
                        {reportCardData.summary.total_marks_obtained} /{' '}
                        {reportCardData.summary.total_max_marks}
                      </div>
                    </div>

                    <div className={styles.summaryCard}>
                      <div className={styles.summaryCardLabel}>Percentage</div>
                      <div className={styles.summaryCardValue}>
                        {reportCardData.summary.overall_percentage}%
                      </div>
                    </div>

                    <div className={styles.summaryCard}>
                      <div className={styles.summaryCardLabel}>Cumulative Grade</div>
                      <div
                        className={styles.summaryCardValue}
                        style={{ color: '#2563eb' }}
                      >
                        {reportCardData.summary.overall_grade}
                      </div>
                    </div>

                    <div className={styles.summaryCard}>
                      <div className={styles.summaryCardLabel}>Final Result</div>
                      <div
                        className={styles.summaryCardValue}
                        style={{
                          color:
                            reportCardData.summary.overall_status === 'PASS'
                              ? '#059669'
                              : '#dc2626',
                        }}
                      >
                        {reportCardData.summary.overall_status}
                      </div>
                    </div>
                  </div>

                  {/* Institutional Grading Scale Legend */}
                  <div className={styles.gradingScaleBox}>
                    <div className={styles.gradingScaleTitle}>Standard Evaluation Criteria:</div>
                    <div className={styles.scaleChipsRow}>
                      <span>
                        <strong>A+</strong>: 90% & Above (Outstanding)
                      </span>
                      <span>
                        <strong>A</strong>: 80% - 89% (Excellent)
                      </span>
                      <span>
                        <strong>B</strong>: 70% - 79% (Very Good)
                      </span>
                      <span>
                        <strong>C</strong>: 60% - 69% (Good)
                      </span>
                      <span>
                        <strong>D</strong>: 40% - 59% (Satisfactory Pass)
                      </span>
                      <span>
                        <strong>F</strong>: Below 40% (Needs Improvement)
                      </span>
                    </div>
                  </div>

                  {/* Signatures & Seal Area */}
                  <div className={styles.signaturesRow}>
                    <div className={styles.signatureLine}>Class Teacher's Signature</div>
                    <div className={styles.signatureLine}>Examination In-Charge</div>
                    <div className={styles.signatureLine}>Principal / School Seal</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Exams;
