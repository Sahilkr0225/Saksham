import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, RotateCcw, Plus, Eye, Edit3, CheckCircle,
  XCircle, Clock, AlertCircle, GraduationCap, UserCheck,
  ClipboardList, Copy, Check, Building2, MapPin,
  ShieldAlert, ChevronLeft, ChevronRight, X, ExternalLink, Users
} from 'lucide-react';
import styles from './Admissions.module.css';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

export interface AdmissionRecord {
  id: string;
  application_number: string;
  applicant_name: string;
  dob: string;
  gender: 'male' | 'female' | 'other';
  applied_class_id: string;
  academic_year_id: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  address: string | null;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'enrolled';
  remarks: string | null;
  created_at: string;
  updated_at: string;
  class_name: string;
  class_code?: string | null;
  academic_year_name: string;
}

export interface ClassOption {
  id: string;
  name: string;
  code: string | null;
  sections: Array<{
    id: string;
    name: string;
    capacity: number | null;
    room_number: string | null;
  }>;
}

export interface AcademicYearOption {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface EnrollmentSuccessData {
  student: {
    id: string;
    admission_number: string;
    user_id: string;
    status: string;
  };
  user_email: string;
  temporary_password: string | null;
  admission_number: string;
  parent_account?: {
    id: string;
    name: string;
    email: string;
    temporary_password: string | null;
    is_new_account: boolean;
  } | null;
}

const INDIAN_STATES_AND_UTS = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];

const formatClassDisplayName = (cls: { name: string; code?: string | null }): string => {
  if (!cls) return '';
  // If clean name like "Grade 10" or "Class 10" without long numeric timestamp
  if (!/\d{8,}/.test(cls.name)) {
    return cls.code ? `${cls.name} (${cls.code})` : cls.name;
  }
  // If test fixture with long numeric timestamp, prefer code
  if (cls.code) {
    return `Class ${cls.code}`;
  }
  return cls.name.replace(/(?:Test Class|Class|FEE-Class|EX-Class|HW-Class)[-\s]*(\d{4})\d+/, 'Class $1');
};

const formatAcademicYearDisplayName = (yr: { name: string; start_date?: string; end_date?: string; is_current?: boolean }): string => {
  if (!yr) return '';
  let period = '';
  if (yr.start_date && yr.end_date) {
    const startYr = new Date(yr.start_date).getFullYear();
    const endYr = new Date(yr.end_date).getFullYear();
    if (!isNaN(startYr) && !isNaN(endYr)) {
      period = startYr === endYr ? `${startYr}` : `${startYr}–${endYr}`;
    }
  }

  // If clean name without long timestamp (e.g. "2026-2027" or "AY 2026-27")
  if (!/\d{8,}/.test(yr.name)) {
    return `${yr.name}${yr.is_current ? ' ★ (Current Academic Year)' : ''}`;
  }

  // If test fixture timestamp like "FEE-AY-1788194464134" or "AY-1786473650404"
  if (period) {
    return `Academic Year ${period}${yr.is_current ? ' ★ (Current Year)' : ''}`;
  }
  return yr.name;
};

const Admissions: React.FC = () => {
  const { user } = useAuth();
  const userRole = user?.role || (user as any)?.role_name || '';

  // Role permissions based on backend admissionRoutes.ts
  const canView = ['super_admin', 'principal', 'office_staff'].includes(userRole);
  const canCreate = ['super_admin', 'principal', 'office_staff'].includes(userRole);
  const canUpdateStatus = ['super_admin', 'principal', 'office_staff'].includes(userRole);
  const canEnroll = ['super_admin', 'principal'].includes(userRole);

  // Directory State
  const [admissions, setAdmissions] = useState<AdmissionRecord[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Academic Dropdown Loading & Error State
  const [isLoadingDropdowns, setIsLoadingDropdowns] = useState<boolean>(false);
  const [, setDropdownError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [totalAdmissions, setTotalAdmissions] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Metric Status Counts (computed from server list query or local)
  const [statusCounts, setStatusCounts] = useState({
    total: 0,
    submitted: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    enrolled: 0,
  });

  // Modal Visibility States
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [detailAdmission, setDetailAdmission] = useState<AdmissionRecord | null>(null);
  const [statusAdmission, setStatusAdmission] = useState<AdmissionRecord | null>(null);
  const [enrollAdmission, setEnrollAdmission] = useState<AdmissionRecord | null>(null);
  const [credentialsData, setCredentialsData] = useState<EnrollmentSuccessData | null>(null);

  // Modal Submitting & Form Errors
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState<boolean>(false);
  const [copiedParentPassword, setCopiedParentPassword] = useState<boolean>(false);

  // Create Form Fields
  const [createForm, setCreateForm] = useState({
    applicant_name: '',
    dob: '',
    gender: 'male' as 'male' | 'female' | 'other',
    applied_class_id: '',
    academic_year_id: '',
    parent_name: '',
    parent_email: '',
    parent_phone: '',
    address: '',
    remarks: '',
  });

  // Selected Section in Create Form
  const [createSectionId, setCreateSectionId] = useState<string>('');

  // Structured Address Details State
  const [addressDetails, setAddressDetails] = useState({
    residential_street: '',
    residential_city: '',
    residential_state: 'Karnataka',
    residential_pincode: '',
    same_as_residential: true,
    permanent_street: '',
    permanent_city: '',
    permanent_state: 'Karnataka',
    permanent_pincode: '',
  });

  // Status Change Fields
  const [newStatus, setNewStatus] = useState<'submitted' | 'under_review' | 'approved' | 'rejected'>('under_review');
  const [statusRemarks, setStatusRemarks] = useState<string>('');

  // Enroll Form Fields
  const [enrollSectionId, setEnrollSectionId] = useState<string>('');
  const [enrollRollNumber, setEnrollRollNumber] = useState<string>('');
  const [enrollBloodGroup, setEnrollBloodGroup] = useState<string>('');
  const [enrollEmergencyContact, setEnrollEmergencyContact] = useState<string>('');

  // Robust Fetch for Classes and Academic Years
  const fetchAcademicDropdowns = useCallback(async () => {
    setIsLoadingDropdowns(true);
    setDropdownError(null);
    try {
      const [classRes, yearRes] = await Promise.all([
        apiClient.get('/academic/classes'),
        apiClient.get('/academic/academic-years'),
      ]);

      if (classRes.data?.success && Array.isArray(classRes.data.data?.classes)) {
        setClasses(classRes.data.data.classes);
      }
      if (yearRes.data?.success && Array.isArray(yearRes.data.data?.academic_years)) {
        setAcademicYears(yearRes.data.data.academic_years);
        // Auto-select current academic year in creation form if not yet selected
        const currentYear = yearRes.data.data.academic_years.find((y: AcademicYearOption) => y.is_current);
        if (currentYear) {
          setCreateForm((prev) => ({
            ...prev,
            academic_year_id: prev.academic_year_id || currentYear.id,
          }));
        }
      }
    } catch (err: any) {
      console.warn('Could not load academic dropdowns:', err.message);
      setDropdownError('Could not load academic classes or years from backend.');
    } finally {
      setIsLoadingDropdowns(false);
    }
  }, []);

  // Fetch academic dropdowns on initial mount
  useEffect(() => {
    fetchAcademicDropdowns();
  }, [fetchAcademicDropdowns]);

  // Fetch Summary Counts (by fetching unfiltered overview)
  const fetchStatusCounts = async () => {
    try {
      const res = await apiClient.get('/admissions?limit=100');
      if (res.data?.success && Array.isArray(res.data.data?.admissions)) {
        const all: AdmissionRecord[] = res.data.data.admissions;
        const counts = {
          total: res.data.data.pagination?.total ?? all.length,
          submitted: all.filter((a) => a.status === 'submitted').length,
          under_review: all.filter((a) => a.status === 'under_review').length,
          approved: all.filter((a) => a.status === 'approved').length,
          rejected: all.filter((a) => a.status === 'rejected').length,
          enrolled: all.filter((a) => a.status === 'enrolled').length,
        };
        setStatusCounts(counts);
      }
    } catch {
      // Non-blocking for summary counts
    }
  };

  // Fetch Admissions Function
  const fetchAdmissions = async () => {
    if (!canView) return;
    setIsLoading(true);
    setApiError(null);

    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      if (search.trim()) params.append('search', search.trim());
      if (selectedStatus) params.append('status', selectedStatus);
      if (selectedClassId) params.append('applied_class_id', selectedClassId);
      if (selectedYearId) params.append('academic_year_id', selectedYearId);

      const res = await apiClient.get(`/admissions?${params.toString()}`);
      if (res.data?.success) {
        setAdmissions(res.data.data.admissions || []);
        const pagination = res.data.data.pagination;
        if (pagination) {
          setTotalAdmissions(pagination.total ?? 0);
          setTotalPages(pagination.total_pages ?? 1);
        }
      } else {
        setApiError(res.data?.message || 'Failed to fetch admission applications.');
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        setApiError('Access restricted: You do not have permission to view Admission Applications.');
      } else {
        setApiError(err.response?.data?.message || 'Unable to connect to the server. Please try again.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAdmissions();
  }, [page, limit, selectedStatus, selectedClassId, selectedYearId]);

  useEffect(() => {
    fetchStatusCounts();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAdmissions();
    fetchStatusCounts();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAdmissions();
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedStatus('');
    setSelectedClassId('');
    setSelectedYearId('');
    setPage(1);
  };

  // Section options for the enroll modal (filtered by applied_class_id)
  const enrollClassSections = useMemo(() => {
    if (!enrollAdmission) return [];
    const cls = classes.find((c) => c.id === enrollAdmission.applied_class_id);
    return cls?.sections || [];
  }, [enrollAdmission, classes]);

  // Section options for the create application form
  const availableSectionsForCreate = useMemo(() => {
    if (!createForm.applied_class_id) return [];
    const cls = classes.find((c) => c.id === createForm.applied_class_id);
    return cls?.sections || [];
  }, [createForm.applied_class_id, classes]);

  // Open Create Modal handler
  const handleOpenCreateModal = () => {
    setModalError(null);
    if (classes.length === 0 || academicYears.length === 0) {
      fetchAcademicDropdowns();
    }
    setShowCreateModal(true);
  };

  // ─── HANDLERS FOR ACTIONS ───────────────────────────────────────────────────

  // 1. Submit New Application
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    // Validation matching backend validator
    if (!createForm.applicant_name.trim() || createForm.applicant_name.trim().length < 2) {
      setModalError('Applicant name must be at least 2 characters.');
      return;
    }
    if (!createForm.dob || !/^\d{4}-\d{2}-\d{2}$/.test(createForm.dob)) {
      setModalError('Date of birth is required and must be in YYYY-MM-DD format.');
      return;
    }
    const dobDate = new Date(createForm.dob);
    if (isNaN(dobDate.getTime()) || dobDate >= new Date()) {
      setModalError('Date of birth must be a valid date in the past.');
      return;
    }
    if (!createForm.applied_class_id) {
      setModalError('Please select a targeted class.');
      return;
    }
    if (!createForm.academic_year_id) {
      setModalError('Please select an academic year.');
      return;
    }
    if (!createForm.parent_name.trim() || createForm.parent_name.trim().length < 2) {
      setModalError('Parent/Guardian name must be at least 2 characters.');
      return;
    }
    if (!createForm.parent_email.trim() || !createForm.parent_email.includes('@')) {
      setModalError('Please provide a valid parent email address.');
      return;
    }
    if (!createForm.parent_phone.trim() || createForm.parent_phone.trim().length < 10) {
      setModalError('Parent phone number must be at least 10 digits.');
      return;
    }

    // Build structured address string
    const resParts = [
      addressDetails.residential_street.trim(),
      addressDetails.residential_city.trim(),
      addressDetails.residential_state.trim(),
      addressDetails.residential_pincode.trim() ? `PIN: ${addressDetails.residential_pincode.trim()}` : '',
    ].filter(Boolean).join(', ');

    let formattedAddress: string | null = null;
    if (resParts) {
      if (addressDetails.same_as_residential || !addressDetails.permanent_street.trim()) {
        formattedAddress = resParts;
      } else {
        const permParts = [
          addressDetails.permanent_street.trim(),
          addressDetails.permanent_city.trim(),
          addressDetails.permanent_state.trim(),
          addressDetails.permanent_pincode.trim() ? `PIN: ${addressDetails.permanent_pincode.trim()}` : '',
        ].filter(Boolean).join(', ');
        formattedAddress = `Residential: ${resParts} | Permanent: ${permParts}`;
      }
    }

    if (formattedAddress && formattedAddress.length > 500) {
      formattedAddress = formattedAddress.substring(0, 500);
    }

    // Append preferred section into remarks if chosen
    let combinedRemarks = createForm.remarks.trim();
    if (createSectionId) {
      const chosenSec = availableSectionsForCreate.find((s) => s.id === createSectionId);
      const secLabel = chosenSec?.name || createSectionId;
      combinedRemarks = combinedRemarks
        ? `[Preferred Section: ${secLabel}] ${combinedRemarks}`
        : `[Preferred Section: ${secLabel}]`;
    }
    if (combinedRemarks.length > 500) {
      combinedRemarks = combinedRemarks.substring(0, 500);
    }

    setModalSubmitting(true);
    try {
      const res = await apiClient.post('/admissions', {
        applicant_name: createForm.applicant_name.trim(),
        dob: createForm.dob,
        gender: createForm.gender,
        applied_class_id: createForm.applied_class_id,
        academic_year_id: createForm.academic_year_id,
        parent_name: createForm.parent_name.trim(),
        parent_email: createForm.parent_email.trim(),
        parent_phone: createForm.parent_phone.trim(),
        address: formattedAddress || null,
        remarks: combinedRemarks || null,
      });

      if (res.data?.success) {
        setShowCreateModal(false);
        // Reset form
        setCreateForm({
          applicant_name: '',
          dob: '',
          gender: 'male',
          applied_class_id: '',
          academic_year_id: academicYears.find((y) => y.is_current)?.id || '',
          parent_name: '',
          parent_email: '',
          parent_phone: '',
          address: '',
          remarks: '',
        });
        setCreateSectionId('');
        setAddressDetails({
          residential_street: '',
          residential_city: '',
          residential_state: 'Karnataka',
          residential_pincode: '',
          same_as_residential: true,
          permanent_street: '',
          permanent_city: '',
          permanent_state: 'Karnataka',
          permanent_pincode: '',
        });
        fetchAdmissions();
        fetchStatusCounts();
      } else {
        setModalError(res.data?.message || 'Failed to submit application.');
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Failed to submit application. Please check the inputs.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // 2. Open Detail View
  const handleOpenDetail = async (adm: AdmissionRecord) => {
    setDetailAdmission(adm);
    try {
      const res = await apiClient.get(`/admissions/${adm.id}`);
      if (res.data?.success && res.data.data?.admission) {
        setDetailAdmission(res.data.data.admission);
      }
    } catch {
      // Retain basic row data if detail fetch fails
    }
  };

  // 3. Open Status Change Modal
  const handleOpenStatusModal = (adm: AdmissionRecord) => {
    setStatusAdmission(adm);
    setNewStatus(adm.status === 'submitted' ? 'under_review' : 'approved');
    setStatusRemarks(adm.remarks || '');
    setModalError(null);
  };

  // Submit Status Change
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusAdmission) return;
    setModalError(null);
    setModalSubmitting(true);

    try {
      const res = await apiClient.patch(`/admissions/${statusAdmission.id}/status`, {
        status: newStatus,
        remarks: statusRemarks.trim() || null,
      });

      if (res.data?.success) {
        setStatusAdmission(null);
        if (detailAdmission?.id === statusAdmission.id) {
          setDetailAdmission({ ...detailAdmission, status: newStatus, remarks: statusRemarks });
        }
        fetchAdmissions();
        fetchStatusCounts();
      } else {
        setModalError(res.data?.message || 'Failed to update application status.');
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Quick Direct Status Transition from Details Modal
  const handleQuickStatusChange = async (targetStatus: 'under_review' | 'approved' | 'rejected') => {
    if (!detailAdmission) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiClient.patch(`/admissions/${detailAdmission.id}/status`, {
        status: targetStatus,
        remarks: `Status updated to ${targetStatus} via quick action`,
      });

      if (res.data?.success) {
        setDetailAdmission({ ...detailAdmission, status: targetStatus });
        fetchAdmissions();
        fetchStatusCounts();
      } else {
        setModalError(res.data?.message || 'Could not update status');
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Status transition rejected by server.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // 4. Open Enrollment Modal
  const handleOpenEnrollModal = (adm: AdmissionRecord) => {
    setEnrollAdmission(adm);

    // Auto-detect preferred section from remarks if present
    let initialSecId = '';
    const match = adm.remarks?.match(/\[Preferred Section:\s*([^\]]+)\]/i);
    if (match) {
      const prefName = match[1].trim().toLowerCase();
      const cls = classes.find((c) => c.id === adm.applied_class_id);
      const matched = cls?.sections?.find((s) => s.name.toLowerCase() === prefName);
      if (matched) initialSecId = matched.id;
    }

    setEnrollSectionId(initialSecId);
    setEnrollRollNumber('');
    setEnrollBloodGroup('');
    setEnrollEmergencyContact(adm.parent_phone || '');
    setModalError(null);
  };

  // Submit Enrollment
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollAdmission) return;
    setModalError(null);
    setModalSubmitting(true);

    try {
      const payload: any = {};
      if (enrollSectionId) payload.current_section_id = enrollSectionId;
      if (enrollRollNumber.trim()) payload.roll_number = enrollRollNumber.trim();
      if (enrollBloodGroup.trim()) payload.blood_group = enrollBloodGroup.trim();
      if (enrollEmergencyContact.trim()) payload.emergency_contact = enrollEmergencyContact.trim();

      const res = await apiClient.post(`/admissions/${enrollAdmission.id}/enroll`, payload);

      if (res.data?.success) {
        const enrolledData: EnrollmentSuccessData = res.data.data;
        setEnrollAdmission(null);
        if (detailAdmission?.id === enrollAdmission.id) {
          setDetailAdmission({ ...detailAdmission, status: 'enrolled' });
        }
        setCredentialsData(enrolledData);
        fetchAdmissions();
        fetchStatusCounts();
      } else {
        setModalError(res.data?.message || 'Enrollment failed.');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.message;
      if (status === 409) {
        setModalError(`Conflict: ${msg || 'Section capacity full or roll number already assigned'}`);
      } else if (status === 403) {
        setModalError('Permission denied: Only Super Admin and Principal can finalize student enrollment.');
      } else {
        setModalError(msg || 'Enrollment failed. Please check the section details.');
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  // Copy Temporary Password
  const handleCopyPassword = () => {
    if (credentialsData?.temporary_password) {
      navigator.clipboard.writeText(credentialsData.temporary_password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2500);
    }
  };

  // Copy Parent Temporary Password
  const handleCopyParentPassword = () => {
    if (credentialsData?.parent_account?.temporary_password) {
      navigator.clipboard.writeText(credentialsData.parent_account.temporary_password);
      setCopiedParentPassword(true);
      setTimeout(() => setCopiedParentPassword(false), 2500);
    }
  };

  // Status Badge Component
  const renderStatusBadge = (status: AdmissionRecord['status']) => {
    switch (status) {
      case 'submitted':
        return <span className={`${styles.statusBadge} ${styles.statusSubmitted}`}><Clock size={12} /> Submitted</span>;
      case 'under_review':
        return <span className={`${styles.statusBadge} ${styles.statusUnderReview}`}><Edit3 size={12} /> Under Review</span>;
      case 'approved':
        return <span className={`${styles.statusBadge} ${styles.statusApproved}`}><CheckCircle size={12} /> Approved</span>;
      case 'rejected':
        return <span className={`${styles.statusBadge} ${styles.statusRejected}`}><XCircle size={12} /> Rejected</span>;
      case 'enrolled':
        return <span className={`${styles.statusBadge} ${styles.statusEnrolled}`}><GraduationCap size={12} /> Enrolled</span>;
      default:
        return <span className={styles.statusBadge}>{status}</span>;
    }
  };

  if (!canView) {
    return (
      <div className={styles.page}>
        <div className={styles.alertBox} style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
          <ShieldAlert size={20} />
          <div>
            <strong>Access Restricted</strong>
            <p style={{ margin: '4px 0 0 0' }}>You do not have permission to access the Admission Applications portal.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ─── Top Header ─── */}
      <div className={styles.headerRow}>
        <div className={styles.headerTitle}>
          <h2>Admission Management</h2>
          <p>Review candidate applications, manage evaluations, and finalize active student enrollment.</p>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.refreshBtn}
            onClick={handleRefresh}
            title="Refresh application data"
          >
            <RotateCcw size={18} className={isRefreshing ? styles.spinning : ''} />
          </button>

          {canCreate && (
            <button
              className={styles.primaryBtn}
              onClick={handleOpenCreateModal}
            >
              <Plus size={18} />
              <span>New Application</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Metric Stats Bar ─── */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIconBox} style={{ background: '#e0e7ff', color: '#4338ca' }}>
            <ClipboardList size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statCount}>{statusCounts.total}</span>
            <span className={styles.statLabel}>Total Applications</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconBox} style={{ background: '#eef2ff', color: '#3730a3' }}>
            <Clock size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statCount}>{statusCounts.submitted}</span>
            <span className={styles.statLabel}>Submitted</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconBox} style={{ background: '#fef3c7', color: '#92400e' }}>
            <Edit3 size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statCount}>{statusCounts.under_review}</span>
            <span className={styles.statLabel}>Under Review</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconBox} style={{ background: '#d1fae5', color: '#065f46' }}>
            <CheckCircle size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statCount}>{statusCounts.approved}</span>
            <span className={styles.statLabel}>Approved</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconBox} style={{ background: '#ede9fe', color: '#5b21b6' }}>
            <GraduationCap size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statCount}>{statusCounts.enrolled}</span>
            <span className={styles.statLabel}>Enrolled Active</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconBox} style={{ background: '#ffe4e6', color: '#9f1239' }}>
            <XCircle size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statCount}>{statusCounts.rejected}</span>
            <span className={styles.statLabel}>Rejected</span>
          </div>
        </div>
      </div>

      {/* ─── Filter Toolbar ─── */}
      <div className={styles.toolbarCard}>
        <form onSubmit={handleSearchSubmit} className={styles.searchBox}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by candidate name, APP number, or parent email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className={styles.filterGroup}>
          {/* Status Filter */}
          <select
            className={styles.selectInput}
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="enrolled">Enrolled</option>
          </select>

          {/* Class Filter */}
          <select
            className={styles.selectInput}
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {formatClassDisplayName(cls)}
              </option>
            ))}
          </select>

          {/* Academic Year Filter */}
          <select
            className={styles.selectInput}
            value={selectedYearId}
            onChange={(e) => {
              setSelectedYearId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Academic Years</option>
            {academicYears.map((yr) => (
              <option key={yr.id} value={yr.id}>
                {formatAcademicYearDisplayName(yr)}
              </option>
            ))}
          </select>

          {(search || selectedStatus || selectedClassId || selectedYearId) && (
            <button
              type="button"
              className={styles.clearFiltersBtn}
              onClick={handleResetFilters}
              title="Reset all active filters"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Error Notification Banner ─── */}
      {apiError && (
        <div className={`${styles.alertBox} ${styles.alertBoxError}`}>
          <AlertCircle size={20} />
          <div>{apiError}</div>
        </div>
      )}

      {/* ─── Applications Table ─── */}
      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <RotateCcw size={32} className={styles.spinning} style={{ color: '#6366f1' }} />
            <p>Loading admission applications...</p>
          </div>
        ) : admissions.length === 0 ? (
          <div className={styles.emptyState}>
            <ClipboardList size={44} style={{ color: '#94a3b8' }} />
            <h4>No admission applications found</h4>
            <p>
              {search || selectedStatus || selectedClassId || selectedYearId
                ? 'Try broadening your search query or removing active status/class filters.'
                : 'No candidate applications have been submitted yet. Register an applicant to get started.'}
            </p>
            {canCreate && !search && !selectedStatus && (
              <button
                className={styles.primaryBtn}
                style={{ marginTop: '8px' }}
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={16} />
                <span>Submit First Application</span>
              </button>
            )}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Application #</th>
                  <th>Candidate</th>
                  <th>Target Class</th>
                  <th>Parent / Guardian</th>
                  <th>Status</th>
                  <th>Applied On</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admissions.map((adm) => (
                  <tr key={adm.id}>
                    <td>
                      <span className={styles.appNumberBadge}>{adm.application_number}</span>
                    </td>
                    <td>
                      <div className={styles.applicantCell}>
                        <span className={styles.applicantName}>{adm.applicant_name}</span>
                        <div className={styles.applicantMeta}>
                          <span className={styles.genderTag}>{adm.gender}</span>
                          <span>•</span>
                          <span>DOB: {new Date(adm.dob).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.classBadge}>
                        <Building2 size={14} style={{ color: '#6366f1' }} />
                        {formatClassDisplayName({ name: adm.class_name, code: adm.class_code })}
                      </span>
                      <span className={styles.yearSub}>
                        {formatAcademicYearDisplayName({ name: adm.academic_year_name })}
                      </span>
                    </td>
                    <td>
                      <div className={styles.parentCell}>
                        <span className={styles.parentName}>{adm.parent_name}</span>
                        <div className={styles.parentContact}>
                          <a href={`mailto:${adm.parent_email}`}>{adm.parent_email}</a>
                          <span>•</span>
                          <a href={`tel:${adm.parent_phone}`}>{adm.parent_phone}</a>
                        </div>
                      </div>
                    </td>
                    <td>{renderStatusBadge(adm.status)}</td>
                    <td style={{ color: '#64748b', fontSize: '0.82rem' }}>
                      {new Date(adm.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className={styles.actionBtns} style={{ justifyContent: 'flex-end' }}>
                        {/* View Details */}
                        <button
                          className={styles.iconBtn}
                          onClick={() => handleOpenDetail(adm)}
                          title="View Application Details"
                        >
                          <Eye size={16} />
                        </button>

                        {/* Status Change (only if not enrolled) */}
                        {canUpdateStatus && adm.status !== 'enrolled' && (
                          <button
                            className={styles.iconBtn}
                            onClick={() => handleOpenStatusModal(adm)}
                            title="Update Status / Remarks"
                          >
                            <Edit3 size={16} />
                          </button>
                        )}

                        {/* Enroll Student (approved status only, super_admin or principal) */}
                        {canEnroll && adm.status === 'approved' && (
                          <button
                            className={styles.enrollBtn}
                            onClick={() => handleOpenEnrollModal(adm)}
                            title="Enroll applicant as student"
                          >
                            <GraduationCap size={15} />
                            <span>Enroll</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Pagination Footer ─── */}
        {!isLoading && admissions.length > 0 && (
          <div className={styles.paginationRow}>
            <span>
              Showing {admissions.length} of {totalAdmissions} application{totalAdmissions !== 1 ? 's' : ''}
            </span>

            <div className={styles.pageControls}>
              <button
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={16} />
                <span>Prev</span>
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Page {page} of {totalPages}
              </span>
              <button
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL 1: CREATE APPLICATION ─── */}
      {showCreateModal && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.modalContentLarge}`}>
            <div className={styles.modalHeader}>
              <h3>Submit New Admission Application</h3>
              <button
                className={styles.closeModalBtn}
                onClick={() => setShowCreateModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className={styles.modalForm}>
              <div className={styles.modalBody}>
                {modalError && (
                  <div className={`${styles.alertBox} ${styles.alertBoxError}`}>
                    <AlertCircle size={18} />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Section A: Candidate Info */}
                <span className={styles.formSectionHeading}>1. Candidate Demographics</span>
                
                {classes.length === 0 && (
                  <div className={`${styles.alertBox} ${styles.alertBoxWarning}`}>
                    <AlertCircle size={18} />
                    <div style={{ flex: 1 }}>
                      <span>Classes list is empty or still loading from backend.</span>
                      <button
                        type="button"
                        className={styles.retryLinkBtn}
                        onClick={fetchAcademicDropdowns}
                        disabled={isLoadingDropdowns}
                      >
                        {isLoadingDropdowns ? 'Loading...' : 'Click to Reload Classes'}
                      </button>
                    </div>
                  </div>
                )}

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Applicant Full Name <span className={styles.requiredStar}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Aryan Sharma"
                      required
                      value={createForm.applicant_name}
                      onChange={(e) => setCreateForm({ ...createForm, applicant_name: e.target.value })}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Date of Birth <span className={styles.requiredStar}>*</span>
                    </label>
                    <input
                      type="date"
                      className={styles.formInput}
                      required
                      value={createForm.dob}
                      onChange={(e) => setCreateForm({ ...createForm, dob: e.target.value })}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Gender <span className={styles.requiredStar}>*</span>
                    </label>
                    <select
                      className={styles.formSelect}
                      value={createForm.gender}
                      onChange={(e) => setCreateForm({ ...createForm, gender: e.target.value as any })}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Target Grade / Class <span className={styles.requiredStar}>*</span>
                    </label>
                    <select
                      className={styles.formSelect}
                      required
                      value={createForm.applied_class_id}
                      onChange={(e) => {
                        setCreateForm({ ...createForm, applied_class_id: e.target.value });
                        setCreateSectionId('');
                      }}
                    >
                      <option value="">
                        {isLoadingDropdowns
                          ? 'Loading classes from server...'
                          : classes.length === 0
                          ? 'No classes found (check server connection)'
                          : 'Select Target Class'}
                      </option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {formatClassDisplayName(cls)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Target / Preferred Section
                    </label>
                    <select
                      className={styles.formSelect}
                      disabled={!createForm.applied_class_id || availableSectionsForCreate.length === 0}
                      value={createSectionId}
                      onChange={(e) => setCreateSectionId(e.target.value)}
                    >
                      {!createForm.applied_class_id ? (
                        <option value="">Select a class first</option>
                      ) : availableSectionsForCreate.length === 0 ? (
                        <option value="">No sections configured for this class</option>
                      ) : (
                        <>
                          <option value="">Select Preferred Section (Optional)</option>
                          {availableSectionsForCreate.map((sec) => (
                            <option key={sec.id} value={sec.id}>
                              {sec.name} {sec.capacity ? `(Capacity: ${sec.capacity})` : ''}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Academic Year <span className={styles.requiredStar}>*</span>
                    </label>
                    <select
                      className={styles.formSelect}
                      required
                      value={createForm.academic_year_id}
                      onChange={(e) => setCreateForm({ ...createForm, academic_year_id: e.target.value })}
                    >
                      <option value="">Select Academic Year</option>
                      {academicYears.map((yr) => (
                        <option key={yr.id} value={yr.id}>
                          {formatAcademicYearDisplayName(yr)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Section B: Parent / Guardian Info */}
                <span className={styles.formSectionHeading}>2. Parent / Guardian Details</span>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Parent / Guardian Name <span className={styles.requiredStar}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Rajesh Sharma"
                      required
                      value={createForm.parent_name}
                      onChange={(e) => setCreateForm({ ...createForm, parent_name: e.target.value })}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Parent Email Address <span className={styles.requiredStar}>*</span>
                    </label>
                    <input
                      type="email"
                      className={styles.formInput}
                      placeholder="e.g. rajesh.sharma@example.com"
                      required
                      value={createForm.parent_email}
                      onChange={(e) => setCreateForm({ ...createForm, parent_email: e.target.value })}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Parent Phone Number <span className={styles.requiredStar}>*</span>
                    </label>
                    <input
                      type="tel"
                      className={styles.formInput}
                      placeholder="e.g. 9876543210 (min 10 digits)"
                      required
                      value={createForm.parent_phone}
                      onChange={(e) => setCreateForm({ ...createForm, parent_phone: e.target.value })}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Staff Notes / Initial Remarks</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Sibling discount, sports quota, documentation status"
                      value={createForm.remarks}
                      onChange={(e) => setCreateForm({ ...createForm, remarks: e.target.value })}
                    />
                  </div>
                </div>

                {/* Section C: Structured Address Details */}
                <span className={styles.formSectionHeading}>3. Address Details</span>

                {/* Sub-block 1: Residential Address */}
                <div className={styles.addressSubHeading}>
                  <MapPin size={16} color="#6366f1" />
                  <span>Residential / Current Address</span>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroupFull}>
                    <label className={styles.formLabel}>
                      Street / Flat / House No., Landmark & Locality
                    </label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Flat 302, Palm Grove, 12th Main Road"
                      value={addressDetails.residential_street}
                      onChange={(e) =>
                        setAddressDetails({ ...addressDetails, residential_street: e.target.value })
                      }
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>City</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Bengaluru"
                      value={addressDetails.residential_city}
                      onChange={(e) =>
                        setAddressDetails({ ...addressDetails, residential_city: e.target.value })
                      }
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>State / UT</label>
                    <select
                      className={styles.formSelect}
                      value={addressDetails.residential_state}
                      onChange={(e) =>
                        setAddressDetails({ ...addressDetails, residential_state: e.target.value })
                      }
                    >
                      <option value="">Select State / UT</option>
                      {INDIAN_STATES_AND_UTS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>PIN / Postal Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      className={styles.formInput}
                      placeholder="e.g. 560034"
                      value={addressDetails.residential_pincode}
                      onChange={(e) =>
                        setAddressDetails({ ...addressDetails, residential_pincode: e.target.value.replace(/\D/g, '') })
                      }
                    />
                  </div>
                </div>

                {/* Sub-block 2: Permanent Address Toggle */}
                <label className={styles.checkboxWrapper} style={{ marginTop: '8px' }}>
                  <input
                    type="checkbox"
                    className={styles.checkboxInput}
                    checked={addressDetails.same_as_residential}
                    onChange={(e) =>
                      setAddressDetails({
                        ...addressDetails,
                        same_as_residential: e.target.checked,
                      })
                    }
                  />
                  <span className={styles.checkboxLabel}>
                    Permanent address is the same as residential address
                  </span>
                </label>

                {!addressDetails.same_as_residential && (
                  <>
                    <div className={styles.addressSubHeading} style={{ marginTop: '8px' }}>
                      <Building2 size={16} color="#475569" />
                      <span>Permanent Address</span>
                    </div>

                    <div className={styles.formGrid}>
                      <div className={styles.formGroupFull}>
                        <label className={styles.formLabel}>
                          Street / Village / House No., Landmark & Locality
                        </label>
                        <input
                          type="text"
                          className={styles.formInput}
                          placeholder="e.g. Main Road, Near Post Office"
                          value={addressDetails.permanent_street}
                          onChange={(e) =>
                            setAddressDetails({ ...addressDetails, permanent_street: e.target.value })
                          }
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>City</label>
                        <input
                          type="text"
                          className={styles.formInput}
                          placeholder="e.g. Patna"
                          value={addressDetails.permanent_city}
                          onChange={(e) =>
                            setAddressDetails({ ...addressDetails, permanent_city: e.target.value })
                          }
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>State / UT</label>
                        <select
                          className={styles.formSelect}
                          value={addressDetails.permanent_state}
                          onChange={(e) =>
                            setAddressDetails({ ...addressDetails, permanent_state: e.target.value })
                          }
                        >
                          <option value="">Select State / UT</option>
                          {INDIAN_STATES_AND_UTS.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>PIN / Postal Code</label>
                        <input
                          type="text"
                          maxLength={6}
                          className={styles.formInput}
                          placeholder="e.g. 800001"
                          value={addressDetails.permanent_pincode}
                          onChange={(e) =>
                            setAddressDetails({ ...addressDetails, permanent_pincode: e.target.value.replace(/\D/g, '') })
                          }
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Submitting...' : 'Register Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: APPLICATION DETAILS & STATUS FLOW ─── */}
      {detailAdmission && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.modalContentLarge}`}>
            <div className={styles.modalHeader}>
              <div>
                <h3>Application Details</h3>
                <span className={styles.appNumberBadge} style={{ marginTop: '4px' }}>
                  {detailAdmission.application_number}
                </span>
              </div>
              <button
                className={styles.closeModalBtn}
                onClick={() => setDetailAdmission(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {modalError && (
                <div className={`${styles.alertBox} ${styles.alertBoxError}`}>
                  <AlertCircle size={18} />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Status Header Bar */}
              <div className={styles.statusChangeBanner}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                    Current Status:
                  </span>
                  {renderStatusBadge(detailAdmission.status)}
                </div>

                {/* Quick Transition Actions */}
                {canUpdateStatus && detailAdmission.status !== 'enrolled' && (
                  <div className={styles.statusChangeBtns}>
                    {detailAdmission.status === 'submitted' && (
                      <button
                        className={`${styles.statusActionBtn} ${styles.btnUnderReview}`}
                        disabled={modalSubmitting}
                        onClick={() => handleQuickStatusChange('under_review')}
                      >
                        Mark Under Review
                      </button>
                    )}

                    {(detailAdmission.status === 'submitted' || detailAdmission.status === 'under_review') && (
                      <>
                        <button
                          className={`${styles.statusActionBtn} ${styles.btnApprove}`}
                          disabled={modalSubmitting}
                          onClick={() => handleQuickStatusChange('approved')}
                        >
                          Approve Candidate
                        </button>
                        <button
                          className={`${styles.statusActionBtn} ${styles.btnReject}`}
                          disabled={modalSubmitting}
                          onClick={() => handleQuickStatusChange('rejected')}
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {canEnroll && detailAdmission.status === 'approved' && (
                      <button
                        className={styles.enrollBtn}
                        onClick={() => {
                          const target = detailAdmission;
                          setDetailAdmission(null);
                          handleOpenEnrollModal(target);
                        }}
                      >
                        <GraduationCap size={15} />
                        <span>Enroll Now</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Candidate Info Grid */}
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Applicant Name</span>
                  <span className={styles.detailValue}>{detailAdmission.applicant_name}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Date of Birth</span>
                  <span className={styles.detailValue}>{new Date(detailAdmission.dob).toLocaleDateString()}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Gender</span>
                  <span className={styles.detailValue} style={{ textTransform: 'capitalize' }}>
                    {detailAdmission.gender}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Applied Class</span>
                  <span className={styles.detailValue}>
                    {formatClassDisplayName({ name: detailAdmission.class_name, code: detailAdmission.class_code })}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Academic Year</span>
                  <span className={styles.detailValue}>
                    {formatAcademicYearDisplayName({ name: detailAdmission.academic_year_name })}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Date Submitted</span>
                  <span className={styles.detailValue}>{new Date(detailAdmission.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Parent Info Grid */}
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Parent / Guardian</span>
                  <span className={styles.detailValue}>{detailAdmission.parent_name}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Contact Email</span>
                  <span className={styles.detailValueText}>
                    <a href={`mailto:${detailAdmission.parent_email}`} style={{ color: '#6366f1' }}>
                      {detailAdmission.parent_email}
                    </a>
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Contact Phone</span>
                  <span className={styles.detailValueText}>
                    <a href={`tel:${detailAdmission.parent_phone}`} style={{ color: '#6366f1' }}>
                      {detailAdmission.parent_phone}
                    </a>
                  </span>
                </div>

                <div className={styles.detailItem} style={{ gridColumn: 'span 2' }}>
                  <span className={styles.detailLabel}>Address Details</span>
                  {detailAdmission.address ? (
                    detailAdmission.address.includes('Residential:') ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        {detailAdmission.address.split(' | ').map((part, idx) => {
                          const isRes = part.startsWith('Residential:');
                          const text = part.replace(/^(Residential:|Permanent:)\s*/, '');
                          return (
                            <div key={idx} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <span className={`${styles.addressBadge} ${isRes ? styles.addressBadgeRes : styles.addressBadgePerm}`}>
                                {isRes ? 'Residential Address' : 'Permanent Address'}
                              </span>
                              <div style={{ fontSize: '0.88rem', color: '#1e293b', marginTop: '2px' }}>
                                {text}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className={styles.detailValueText}>{detailAdmission.address}</span>
                    )
                  ) : (
                    <span className={styles.detailValueText} style={{ color: '#94a3b8' }}>— None Provided —</span>
                  )}
                </div>
              </div>

              {/* Notes & Evaluation Remarks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span className={styles.detailLabel}>Evaluation Remarks / Staff Notes</span>
                <div
                  style={{
                    padding: '12px 14px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    fontSize: '0.88rem',
                    color: detailAdmission.remarks ? '#334155' : '#94a3b8',
                    fontStyle: detailAdmission.remarks ? 'normal' : 'italic',
                  }}
                >
                  {detailAdmission.remarks || 'No evaluation notes recorded for this applicant.'}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setDetailAdmission(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: STATUS CHANGE DIALOG ─── */}
      {statusAdmission && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.modalContentSmall}`}>
            <div className={styles.modalHeader}>
              <h3>Update Application Status</h3>
              <button
                className={styles.closeModalBtn}
                onClick={() => setStatusAdmission(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleStatusSubmit} className={styles.modalForm}>
              <div className={styles.modalBody}>
                {modalError && (
                  <div className={`${styles.alertBox} ${styles.alertBoxError}`}>
                    <AlertCircle size={18} />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Candidate</span>
                  <span className={styles.detailValue}>
                    {statusAdmission.applicant_name} ({statusAdmission.application_number})
                  </span>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Target Status</label>
                  <select
                    className={styles.formSelect}
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                  >
                    <option value="submitted">Submitted</option>
                    <option value="under_review">Under Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <span style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
                    Note: To enroll a candidate, approve the application first, then use the Enroll flow.
                  </span>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Evaluation Remarks / Reason</label>
                  <textarea
                    className={styles.formTextarea}
                    placeholder="Enter reason or document check notes..."
                    value={statusRemarks}
                    onChange={(e) => setStatusRemarks(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setStatusAdmission(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Updating...' : 'Save Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: ENROLL STUDENT DIALOG ─── */}
      {enrollAdmission && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.modalContentSmall}`}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GraduationCap size={22} style={{ color: '#10b981' }} />
                <h3>Enroll Candidate as Student</h3>
              </div>
              <button
                className={styles.closeModalBtn}
                onClick={() => setEnrollAdmission(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className={styles.modalForm}>
              <div className={styles.modalBody}>
                {modalError && (
                  <div className={`${styles.alertBox} ${styles.alertBoxError}`}>
                    <AlertCircle size={18} />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className={styles.alertBox} style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
                  <UserCheck size={18} />
                  <div>
                    Enrolling <strong>{enrollAdmission.applicant_name}</strong> into{' '}
                    <strong>{formatClassDisplayName({ name: enrollAdmission.class_name, code: enrollAdmission.class_code })}</strong>.
                  </div>
                </div>

                {/* Section Assignment */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Assign Classroom Section</label>
                  <select
                    className={styles.formSelect}
                    value={enrollSectionId}
                    onChange={(e) => setEnrollSectionId(e.target.value)}
                  >
                    <option value="">— Unassigned (Assign Later) —</option>
                    {enrollClassSections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        Section {sec.name} {sec.capacity ? `(Capacity: ${sec.capacity})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Roll Number */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Roll Number (Optional)</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g. 10A-01"
                    value={enrollRollNumber}
                    onChange={(e) => setEnrollRollNumber(e.target.value)}
                  />
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Roll number must be unique within the assigned section for active students.
                  </span>
                </div>

                {/* Blood Group */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Blood Group (Optional)</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g. O+, A+, B+"
                    value={enrollBloodGroup}
                    onChange={(e) => setEnrollBloodGroup(e.target.value)}
                  />
                </div>

                {/* Emergency Contact */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Emergency Contact Number</label>
                  <input
                    type="tel"
                    className={styles.formInput}
                    placeholder="e.g. 9876543210"
                    value={enrollEmergencyContact}
                    onChange={(e) => setEnrollEmergencyContact(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setEnrollAdmission(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  style={{ background: '#10b981' }}
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Enrolling...' : 'Confirm & Finalize Enrollment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: SECURE ONE-TIME CREDENTIALS DISPLAY (REQUIREMENT 5) ─── */}
      {credentialsData && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.modalContentSmall}`}>
            <div className={styles.modalHeader} style={{ background: '#ecfdf5', borderBottomColor: '#a7f3d0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={24} style={{ color: '#059669' }} />
                <h3 style={{ color: '#065f46' }}>Student Enrolled Successfully</h3>
              </div>
              <button
                className={styles.closeModalBtn}
                onClick={() => setCredentialsData(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={`${styles.alertBox} ${styles.alertBoxWarning}`}>
                <ShieldAlert size={20} />
                <div>
                  <strong>One-Time Temporary Credentials:</strong>
                  <p style={{ margin: '3px 0 0 0' }}>
                    Copy these credentials immediately. Temporary passwords will not be displayed again.
                  </p>
                </div>
              </div>

              {/* Student Credentials Card */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <GraduationCap size={18} style={{ color: '#4f46e5' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>Student Account</span>
                </div>
                <div className={styles.credentialsCard}>
                  <div className={styles.credRow}>
                    <span className={styles.credLabel}>Admission Number</span>
                    <span className={styles.credValue}>{credentialsData.admission_number}</span>
                  </div>

                  <div className={styles.credRow}>
                    <span className={styles.credLabel}>Login User Email</span>
                    <span className={styles.credValue}>{credentialsData.user_email}</span>
                  </div>

                  {credentialsData.temporary_password ? (
                    <div className={styles.credRow}>
                      <div>
                        <span className={styles.credLabel} style={{ display: 'block' }}>Temporary Password</span>
                        <span className={styles.credValue}>{credentialsData.temporary_password}</span>
                      </div>

                      <button
                        className={`${styles.copyBtn} ${copiedPassword ? styles.copyBtnSuccess : ''}`}
                        onClick={handleCopyPassword}
                        title="Copy temporary password"
                      >
                        {copiedPassword ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedPassword ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className={styles.credRow}>
                      <span className={styles.credLabel}>Login Account</span>
                      <span style={{ fontSize: '0.85rem', color: '#065f46' }}>
                        Existing user account linked. No temporary password needed.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Parent Credentials Card */}
              {credentialsData.parent_account && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={18} style={{ color: '#059669' }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>
                        Parent / Guardian Account (Auto-Linked)
                      </span>
                    </div>
                    {credentialsData.parent_account.is_new_account ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px' }}>
                        New Account Provisioned
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '12px' }}>
                        Existing Account Linked
                      </span>
                    )}
                  </div>

                  <div className={styles.credentialsCard} style={{ background: credentialsData.parent_account.is_new_account ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)' : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderColor: credentialsData.parent_account.is_new_account ? '#a7f3d0' : '#cbd5e1' }}>
                    <div className={styles.credRow}>
                      <span className={styles.credLabel}>Parent / Guardian Name</span>
                      <span className={styles.credValue} style={{ color: '#1e293b' }}>{credentialsData.parent_account.name}</span>
                    </div>

                    <div className={styles.credRow}>
                      <span className={styles.credLabel}>Parent Login Email</span>
                      <span className={styles.credValue}>{credentialsData.parent_account.email}</span>
                    </div>

                    {credentialsData.parent_account.is_new_account && credentialsData.parent_account.temporary_password ? (
                      <div className={styles.credRow}>
                        <div>
                          <span className={styles.credLabel} style={{ display: 'block' }}>Temporary Password</span>
                          <span className={styles.credValue}>{credentialsData.parent_account.temporary_password}</span>
                        </div>

                        <button
                          className={`${styles.copyBtn} ${copiedParentPassword ? styles.copyBtnSuccess : ''}`}
                          onClick={handleCopyParentPassword}
                          title="Copy parent temporary password"
                        >
                          {copiedParentPassword ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copiedParentPassword ? 'Copied!' : 'Copy'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className={styles.credRow}>
                        <span className={styles.credLabel}>Security Status</span>
                        <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                          Existing parent credentials preserved. Student ward linked to existing profile.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <Link
                to={`/students?search=${encodeURIComponent(credentialsData.admission_number)}`}
                className={styles.submitBtn}
                style={{ textDecoration: 'none', background: '#6366f1' }}
                onClick={() => setCredentialsData(null)}
              >
                <ExternalLink size={16} />
                <span>Go to Student Profile</span>
              </Link>
              {credentialsData.parent_account && (
                <Link
                  to={`/parents?search=${encodeURIComponent(credentialsData.parent_account.email)}`}
                  className={styles.submitBtn}
                  style={{ textDecoration: 'none', background: '#059669' }}
                  onClick={() => setCredentialsData(null)}
                >
                  <Users size={16} />
                  <span>View in Parent Directory</span>
                </Link>
              )}
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setCredentialsData(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admissions;
