import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  UserCheck,
  Search,
  RotateCcw,
  Plus,
  Edit3,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  GraduationCap,
  BookOpen,
  Lock,
  UserX
} from 'lucide-react';
import styles from './Teachers.module.css';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface TeacherSummary {
  id: string; // user_id
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  employee_id: string | null;
  specialization: string | null;
  qualification: string | null;
  joining_date: string | null;
}

export interface TeacherDetail extends TeacherSummary {
  address: string | null;
  emergency_contact: string | null;
}

export interface SubjectAssignment {
  mapping_id: string;
  class_name: string;
  class_code: string | null;
  subject_name: string;
  subject_code: string;
  subject_type: 'core' | 'elective' | 'lab' | 'activity';
  academic_year: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDateDisplay = (dateStr?: string | null): string => {
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

// ─── Component ──────────────────────────────────────────────────────────────

const Teachers: React.FC = () => {
  const { user } = useAuth();

  // Role permissions strictly aligned with backend RBAC:
  // - Directory & view profile: super_admin, principal, office_staff (and teacher for self)
  // - Extended profile update: super_admin, principal, office_staff
  // - Identity update (name/phone) & Onboard: super_admin, principal
  // - Deactivate user: super_admin, principal
  // - Reactivate user: super_admin ONLY
  const isSuperAdmin = user?.role === 'super_admin';
  const isPrincipal = user?.role === 'principal';
  const isOfficeStaff = user?.role === 'office_staff';
  const isTeacherUser = user?.role === 'teacher';

  const canManageTeachers = isSuperAdmin || isPrincipal || isOfficeStaff;
  const isSuperAdminOrPrincipal = isSuperAdmin || isPrincipal;
  const canDeactivate = isSuperAdmin || isPrincipal;
  const canReactivate = isSuperAdmin;

  // ── Directory State ──
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    pages: 1,
  });
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  // Search state with debouncing and stale-request protection
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const searchRequestIdRef = useRef<number>(0);

  // Global alerts
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // ── Selected Teacher & Drawer State ──
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [selectedTeacherDetail, setSelectedTeacherDetail] = useState<TeacherDetail | null>(null);
  const [teacherAssignments, setTeacherAssignments] = useState<SubjectAssignment[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // ── Edit Profile Modal State ──
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    employee_id: '',
    specialization: '',
    qualification: '',
    joining_date: '',
    address: '',
    emergency_contact: '',
  });
  const [editErrors, setEditErrors] = useState<{ [key: string]: string }>({});
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // ── Onboard Teacher Modal State ──
  const [showOnboardModal, setShowOnboardModal] = useState<boolean>(false);
  const [onboardForm, setOnboardForm] = useState({
    name: '',
    email: '',
    phone: '',
    employee_id: '',
    specialization: '',
    qualification: '',
    joining_date: '',
  });
  const [onboardErrors, setOnboardErrors] = useState<{ [key: string]: string }>({});
  const [isSubmittingOnboard, setIsSubmittingOnboard] = useState<boolean>(false);

  // ── One-Time Credential Reveal Modal ──
  const [revealedCredential, setRevealedCredential] = useState<{
    email: string;
    tempPassword: string;
    teacherName: string;
  } | null>(null);
  const [hasCopiedPassword, setHasCopiedPassword] = useState<boolean>(false);

  // ── Status Toggle Confirmation Modal ──
  const [confirmStatusTeacher, setConfirmStatusTeacher] = useState<TeacherSummary | null>(null);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);

  // Auto-dismiss success alert after 5s
  useEffect(() => {
    if (apiSuccess) {
      const timer = setTimeout(() => setApiSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [apiSuccess]);

  // Debounce search input by 350ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // ── Fetch Teachers List with Stale-Request Protection ───────────────────────

  const fetchTeachers = useCallback(
    async (pageToFetch: number, searchToFetch: string, isRefreshAction = false) => {
      // If user is a teacher only, they cannot list the directory
      if (isTeacherUser && !canManageTeachers) {
        setLoadingList(false);
        return;
      }

      const currentRequestId = ++searchRequestIdRef.current;
      if (isRefreshAction) {
        setIsRefreshing(true);
      } else {
        setLoadingList(true);
      }
      setListError(null);

      try {
        const queryParams = new URLSearchParams({
          page: pageToFetch.toString(),
          limit: pagination.limit.toString(),
        });
        if (searchToFetch) {
          queryParams.append('search', searchToFetch);
        }

        const res = await apiClient.get(`/teachers?${queryParams.toString()}`);

        // Discard stale responses if user typed newer search
        if (currentRequestId !== searchRequestIdRef.current) {
          return;
        }

        if (res.data?.success && res.data?.data) {
          setTeachers(res.data.data.teachers || []);
          if (res.data.data.pagination) {
            setPagination(res.data.data.pagination);
          }
        }
      } catch (err: any) {
        if (currentRequestId === searchRequestIdRef.current) {
          setListError(
            err.response?.data?.message || err.message || 'Failed to load teachers directory'
          );
        }
      } finally {
        if (currentRequestId === searchRequestIdRef.current) {
          setLoadingList(false);
          setIsRefreshing(false);
        }
      }
    },
    [pagination.limit, isTeacherUser, canManageTeachers]
  );

  useEffect(() => {
    fetchTeachers(pagination.page, debouncedSearch);
  }, [fetchTeachers, pagination.page, debouncedSearch]);

  // If the logged in user is a teacher, automatically select their own profile
  useEffect(() => {
    if (isTeacherUser && user?.id) {
      setSelectedTeacherId(user.id);
    }
  }, [isTeacherUser, user?.id]);

  // ── Fetch Single Teacher Detail & Subject Assignments ───────────────────────

  const fetchTeacherDetails = useCallback(async (teacherId: string) => {
    setLoadingDetail(true);
    try {
      // Fetch profile & assigned subjects in parallel
      const [profileRes, subjectsRes] = await Promise.all([
        apiClient.get(`/teachers/${teacherId}`),
        apiClient.get(`/teachers/${teacherId}/subjects`),
      ]);

      if (profileRes.data?.data?.teacher) {
        setSelectedTeacherDetail(profileRes.data.data.teacher);
      }
      if (subjectsRes.data?.data?.assignments) {
        setTeacherAssignments(subjectsRes.data.data.assignments);
      }
    } catch (err: any) {
      setApiError(
        err.response?.data?.message || err.message || 'Failed to fetch teacher profile details'
      );
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTeacherId) {
      fetchTeacherDetails(selectedTeacherId);
    } else {
      setSelectedTeacherDetail(null);
      setTeacherAssignments([]);
    }
  }, [selectedTeacherId, fetchTeacherDetails]);

  // ── Handlers: Edit Profile ─────────────────────────────────────────────────

  const handleOpenEdit = (teacher: TeacherDetail) => {
    setEditForm({
      name: teacher.name || '',
      phone: teacher.phone || '',
      employee_id: teacher.employee_id || '',
      specialization: teacher.specialization || '',
      qualification: teacher.qualification || '',
      joining_date: teacher.joining_date ? teacher.joining_date.substring(0, 10) : '',
      address: teacher.address || '',
      emergency_contact: teacher.emergency_contact || '',
    });
    setEditErrors({});
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacherId) return;

    const errors: { [key: string]: string } = {};

    if (editForm.employee_id && editForm.employee_id.length > 50) {
      errors.employee_id = 'Employee ID must not exceed 50 characters';
    }
    if (editForm.specialization && editForm.specialization.length > 100) {
      errors.specialization = 'Specialization must not exceed 100 characters';
    }
    if (editForm.qualification && editForm.qualification.length > 255) {
      errors.qualification = 'Qualification must not exceed 255 characters';
    }
    if (editForm.emergency_contact && editForm.emergency_contact.length > 20) {
      errors.emergency_contact = 'Emergency contact must not exceed 20 characters';
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setIsSubmittingEdit(true);
    setApiError(null);

    const teacherPayload = {
      employee_id: editForm.employee_id.trim() ? editForm.employee_id.trim() : null,
      specialization: editForm.specialization.trim() ? editForm.specialization.trim() : null,
      qualification: editForm.qualification.trim() ? editForm.qualification.trim() : null,
      joining_date: editForm.joining_date ? editForm.joining_date : null,
      address: editForm.address.trim() ? editForm.address.trim() : null,
      emergency_contact: editForm.emergency_contact.trim() ? editForm.emergency_contact.trim() : null,
    };

    let teacherProfileSaved = false;
    let teacherProfileError: string | null = null;
    let userIdentitySaved = false;
    let userIdentityAttempted = false;
    let userIdentityError: string | null = null;

    // Step 1: PUT /teachers/:id (Extended profile)
    try {
      await apiClient.put(`/teachers/${selectedTeacherId}`, teacherPayload);
      teacherProfileSaved = true;
    } catch (err: any) {
      teacherProfileError =
        err.response?.data?.message || err.message || 'Failed to update professional profile';
    }

    // Step 2: PATCH /users/:id (Identity: name, phone)
    if (isSuperAdminOrPrincipal) {
      const userUpdates: { name?: string; phone?: string | null } = {};
      if (editForm.name.trim() && editForm.name.trim() !== selectedTeacherDetail?.name) {
        userUpdates.name = editForm.name.trim();
      }
      if (editForm.phone !== (selectedTeacherDetail?.phone || '')) {
        userUpdates.phone = editForm.phone.trim() ? editForm.phone.trim() : null;
      }
      if (Object.keys(userUpdates).length > 0) {
        userIdentityAttempted = true;
        try {
          await apiClient.patch(`/users/${selectedTeacherId}`, userUpdates);
          userIdentitySaved = true;
        } catch (err: any) {
          userIdentityError =
            err.response?.data?.message || err.message || 'Failed to update teacher name/phone';
        }
      }
    }

    // Refresh state if any update succeeded
    if (teacherProfileSaved || userIdentitySaved) {
      await fetchTeacherDetails(selectedTeacherId);
      await fetchTeachers(pagination.page, debouncedSearch, true);
    }

    // Evaluate outcome without misleading the user
    if (teacherProfileSaved && (!userIdentityAttempted || userIdentitySaved)) {
      setApiSuccess('Teacher profile and identity details updated successfully.');
      setShowEditModal(false);
    } else if (teacherProfileSaved && userIdentityAttempted && !userIdentitySaved) {
      setApiError(
        `Professional profile was saved, but updating identity (name/phone) failed: ${userIdentityError}. Please review the identity fields.`
      );
    } else if (!teacherProfileSaved && userIdentitySaved) {
      setApiError(
        `Teacher name/phone was updated, but saving professional details failed: ${teacherProfileError}. Please review the profile fields.`
      );
    } else {
      const combinedError = [teacherProfileError, userIdentityError].filter(Boolean).join('; ');
      setApiError(combinedError || 'Failed to update teacher profile');
    }

    setIsSubmittingEdit(false);
  };

  // ── Handlers: Onboard Teacher ──────────────────────────────────────────────

  const handleOpenOnboard = () => {
    setOnboardForm({
      name: '',
      email: '',
      phone: '',
      employee_id: '',
      specialization: '',
      qualification: '',
      joining_date: new Date().toISOString().substring(0, 10),
    });
    setOnboardErrors({});
    setShowOnboardModal(true);
  };

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!onboardForm.name.trim() || onboardForm.name.trim().length < 2) {
      errors.name = 'Full name must be at least 2 characters';
    }
    if (!onboardForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(onboardForm.email.trim())) {
      errors.email = 'Please provide a valid email address';
    }

    if (Object.keys(errors).length > 0) {
      setOnboardErrors(errors);
      return;
    }

    setIsSubmittingOnboard(true);
    setApiError(null);

    let newUserId: string | null = null;
    let tempPassword: string | null = null;

    // Step 1: Create user identity via POST /api/v1/users (role = 'teacher')
    try {
      const userPayload = {
        name: onboardForm.name.trim(),
        email: onboardForm.email.toLowerCase().trim(),
        phone: onboardForm.phone.trim() ? onboardForm.phone.trim() : null,
        role: 'teacher',
      };

      const userRes = await apiClient.post('/users', userPayload);
      newUserId = userRes.data?.data?.user?.id;
      tempPassword = userRes.data?.data?.temporary_password;

      if (!newUserId) {
        throw new Error('User creation did not return a valid user ID');
      }
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to create teacher user account');
      setIsSubmittingOnboard(false);
      return;
    }

    // Always reveal credentials if temporary password was generated (never lose access)
    if (tempPassword) {
      setRevealedCredential({
        email: onboardForm.email.toLowerCase().trim(),
        tempPassword,
        teacherName: onboardForm.name.trim(),
      });
      setHasCopiedPassword(false);
    }

    // Step 2: Initialize extended profile attributes via PUT /teachers/:id
    const hasExtendedAttributes =
      onboardForm.employee_id.trim() ||
      onboardForm.specialization.trim() ||
      onboardForm.qualification.trim() ||
      onboardForm.joining_date;

    let profileInitError: string | null = null;
    if (hasExtendedAttributes && newUserId) {
      try {
        await apiClient.put(`/teachers/${newUserId}`, {
          employee_id: onboardForm.employee_id.trim() ? onboardForm.employee_id.trim() : null,
          specialization: onboardForm.specialization.trim() ? onboardForm.specialization.trim() : null,
          qualification: onboardForm.qualification.trim() ? onboardForm.qualification.trim() : null,
          joining_date: onboardForm.joining_date ? onboardForm.joining_date : null,
        });
      } catch (err: any) {
        profileInitError =
          err.response?.data?.message || err.message || 'Profile attributes failed to save';
      }
    }

    setShowOnboardModal(false);
    await fetchTeachers(1, '', true);

    if (profileInitError) {
      // Recoverable workflow: account is in directory, credentials are displayed, operator can complete profile via Edit
      setApiError(
        `Teacher user account created and credentials generated for ${onboardForm.name.trim()}, but initializing profile details failed (${profileInitError}). The account is safely registered in the directory—select the teacher and click "Edit Profile" to complete their details.`
      );
    } else {
      setApiSuccess(`Teacher account created and profile initialized successfully for ${onboardForm.name.trim()}`);
    }

    setIsSubmittingOnboard(false);
  };

  // ── Handlers: Status Toggle (Deactivate / Reactivate) ───────────────────────

  const handleStatusToggle = async () => {
    if (!confirmStatusTeacher) return;

    const isCurrentlyActive = confirmStatusTeacher.is_active;

    // Client-side permission guard aligning with backend RBAC
    if (isCurrentlyActive && !canDeactivate) {
      setApiError('You do not have permission to deactivate faculty accounts.');
      return;
    }
    if (!isCurrentlyActive && !canReactivate) {
      setApiError('Only Super Administrators are permitted to reactivate accounts.');
      return;
    }

    setIsSubmittingStatus(true);
    setApiError(null);

    const endpoint = isCurrentlyActive
      ? `/users/${confirmStatusTeacher.id}/deactivate`
      : `/users/${confirmStatusTeacher.id}/reactivate`;

    try {
      await apiClient.post(endpoint);
      setApiSuccess(
        `Teacher ${confirmStatusTeacher.name} was successfully ${
          isCurrentlyActive ? 'deactivated' : 'reactivated'
        }`
      );
      setConfirmStatusTeacher(null);

      // Refresh drawer details if this teacher is currently open
      if (selectedTeacherId === confirmStatusTeacher.id) {
        await fetchTeacherDetails(selectedTeacherId);
      }
      await fetchTeachers(pagination.page, debouncedSearch, true);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to update account status');
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  // ── Handlers: Clipboard Copy ───────────────────────────────────────────────

  const handleCopyPassword = () => {
    if (!revealedCredential?.tempPassword) return;
    navigator.clipboard.writeText(revealedCredential.tempPassword);
    setHasCopiedPassword(true);
    setTimeout(() => setHasCopiedPassword(false), 2500);
  };

  // ── Derived Statistics ─────────────────────────────────────────────────────

  const activeTeachersCount = useMemo(
    () => teachers.filter((t) => t.is_active).length,
    [teachers]
  );

  const specializedCount = useMemo(
    () => teachers.filter((t) => t.specialization && t.specialization.trim().length > 0).length,
    [teachers]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerTitle}>
          <h2>Faculty & Teacher Management</h2>
          <p>
            Oversee school teaching faculty, professional credentials, qualifications, and class-subject allocations.
          </p>
        </div>

        <div className={styles.headerActions}>
          {canManageTeachers && (
            <button
              className={styles.refreshBtn}
              onClick={() => fetchTeachers(pagination.page, debouncedSearch, true)}
              disabled={isRefreshing}
              title="Refresh teacher directory"
            >
              <RotateCcw size={18} className={isRefreshing ? styles.spinning : ''} />
            </button>
          )}

          {isSuperAdminOrPrincipal && (
            <button className={styles.primaryBtn} onClick={handleOpenOnboard}>
              <Plus size={16} />
              <span>Onboard Teacher</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Notice for Teacher View */}
      {isTeacherUser && !canManageTeachers && (
        <div className={styles.rbacNotice}>
          <ShieldAlert size={18} color="#6366f1" />
          <span>
            You are viewing your personal faculty record and course allocations. Contact a school administrator for profile modifications.
          </span>
        </div>
      )}

      {/* API Success / Error Banners */}
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

      {/* KPI Stats Overview (Accurately computed from directory query) */}
      {canManageTeachers && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIconWrap} style={{ background: '#ede9fe', color: '#6366f1' }}>
              <UserCheck size={22} />
            </div>
            <div className={styles.statDetails}>
              <div className={styles.statNumber}>{pagination.total}</div>
              <div className={styles.statLabel}>Registered Teachers</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrap} style={{ background: '#ecfdf5', color: '#059669' }}>
              <CheckCircle2 size={22} />
            </div>
            <div className={styles.statDetails}>
              <div className={styles.statNumber}>{activeTeachersCount}</div>
              <div className={styles.statLabel}>Active on Current Page</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrap} style={{ background: '#fffbeb', color: '#d97706' }}>
              <GraduationCap size={22} />
            </div>
            <div className={styles.statDetails}>
              <div className={styles.statNumber}>{specializedCount}</div>
              <div className={styles.statLabel}>Specializations Listed</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrap} style={{ background: '#fdf2f8', color: '#db2777' }}>
              <BookOpen size={22} />
            </div>
            <div className={styles.statDetails}>
              <div className={styles.statNumber}>{pagination.pages}</div>
              <div className={styles.statLabel}>Total Page Directories</div>
            </div>
          </div>
        </div>
      )}

      {/* ── TEACHER DIRECTORY TABLE ────────────────────────────────────────── */}
      {canManageTeachers && (
        <div className={styles.card}>
          {/* Toolbar */}
          <div className={styles.toolbarCard}>
            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search teacher by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Showing {teachers.length} of {pagination.total} faculty members
            </div>
          </div>

          {/* Table */}
          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Faculty Member</th>
                  <th>Employee ID</th>
                  <th>Phone</th>
                  <th>Specialization</th>
                  <th>Qualification</th>
                  <th>Joining Date</th>
                  <th>Account Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px' }}>
                      <RotateCcw size={22} className={styles.spinning} style={{ margin: '0 auto', display: 'block' }} />
                      <span style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '10px', display: 'block' }}>
                        Loading faculty directory...
                      </span>
                    </td>
                  </tr>
                ) : listError ? (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.emptyState}>
                        <AlertCircle size={32} color="#ef4444" style={{ marginBottom: '12px' }} />
                        <div className={styles.emptyTitle}>Unable to load teachers</div>
                        <div className={styles.emptyDesc}>{listError}</div>
                        <button
                          className={styles.secondaryBtn}
                          style={{ marginTop: '14px' }}
                          onClick={() => fetchTeachers(pagination.page, debouncedSearch, true)}
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : teachers.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                          <UserCheck size={32} />
                        </div>
                        <div className={styles.emptyTitle}>
                          {searchTerm ? 'No faculty found' : 'No Teachers Registered Yet'}
                        </div>
                        <div className={styles.emptyDesc}>
                          {searchTerm
                            ? 'No faculty member matches your search filter.'
                            : 'Get started by onboarding teachers into the Saksham school platform.'}
                        </div>
                        {isSuperAdminOrPrincipal && !searchTerm && (
                          <button
                            className={styles.primaryBtn}
                            style={{ marginTop: '16px' }}
                            onClick={handleOpenOnboard}
                          >
                            <Plus size={16} />
                            <span>Onboard First Teacher</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  teachers.map((teacher) => (
                    <tr
                      key={teacher.id}
                      className={styles.clickableRow}
                      onClick={() => setSelectedTeacherId(teacher.id)}
                    >
                      <td>
                        <div className={styles.teacherAvatarWrap}>
                          <div className={styles.avatar}>
                            {teacher.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className={styles.teacherName}>{teacher.name}</div>
                            <div className={styles.teacherEmailSub}>{teacher.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {teacher.employee_id ? (
                          <span className={styles.empBadge}>{teacher.employee_id}</span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td>{teacher.phone || '—'}</td>
                      <td>{teacher.specialization || '—'}</td>
                      <td>{teacher.qualification || '—'}</td>
                      <td>{formatDateDisplay(teacher.joining_date)}</td>
                      <td>
                        {teacher.is_active ? (
                          <span className={styles.activeBadge}>
                            <span className={styles.activeDot} />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className={styles.inactiveBadge}>
                            <span>Inactive</span>
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className={styles.rowActionBtn}
                          onClick={() => setSelectedTeacherId(teacher.id)}
                        >
                          <span>View Profile</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.pages > 1 && (
            <div className={styles.paginationBar}>
              <span>
                Page {pagination.page} of {pagination.pages}
              </span>
              <div className={styles.pageControls}>
                <button
                  className={styles.pageNavBtn}
                  disabled={pagination.page <= 1 || loadingList}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                  }
                  title="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className={styles.pageNavBtn}
                  disabled={pagination.page >= pagination.pages || loadingList}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  title="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TEACHER DETAILS DRAWER (Phase 2) ─────────────────────────────────── */}
      {selectedTeacherId && (
        <div className={styles.drawerBackdrop} onClick={() => setSelectedTeacherId(null)}>
          <div className={styles.drawerPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitleWrap}>
                <div className={styles.drawerAvatar}>
                  {selectedTeacherDetail?.name?.charAt(0).toUpperCase() || 'T'}
                </div>
                <div>
                  <div className={styles.drawerName}>
                    {selectedTeacherDetail?.name || 'Faculty Profile'}
                  </div>
                  <div className={styles.drawerMeta}>
                    {selectedTeacherDetail?.employee_id && (
                      <span className={styles.empBadge}>
                        ID: {selectedTeacherDetail.employee_id}
                      </span>
                    )}
                    {selectedTeacherDetail?.is_active ? (
                      <span className={styles.activeBadge}>
                        <span className={styles.activeDot} />
                        <span>Active Faculty</span>
                      </span>
                    ) : (
                      <span className={styles.inactiveBadge}>
                        <span>Deactivated</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                className={styles.drawerCloseBtn}
                onClick={() => setSelectedTeacherId(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              {loadingDetail ? (
                <div style={{ textAlign: 'center', padding: '48px' }}>
                  <RotateCcw size={24} className={styles.spinning} style={{ margin: '0 auto', display: 'block' }} />
                  <span style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '12px', display: 'block' }}>
                    Loading faculty profile & course assignments...
                  </span>
                </div>
              ) : selectedTeacherDetail ? (
                <>
                  {/* Bio & Contact Details */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionTitle}>
                      <UserCheck size={16} color="#6366f1" />
                      <span>Contact & Identification</span>
                    </div>

                    <div className={styles.infoGrid}>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Email</span>
                        <span className={styles.infoValue}>
                          {selectedTeacherDetail.email}
                        </span>
                      </div>

                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Phone</span>
                        <span className={styles.infoValue}>
                          {selectedTeacherDetail.phone || '—'}
                        </span>
                      </div>

                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Joining Date</span>
                        <span className={styles.infoValue}>
                          {formatDateDisplay(selectedTeacherDetail.joining_date)}
                        </span>
                      </div>

                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Emergency Contact</span>
                        <span className={styles.infoValue}>
                          {selectedTeacherDetail.emergency_contact || '—'}
                        </span>
                      </div>

                      <div className={styles.infoItem} style={{ gridColumn: 'span 2' }}>
                        <span className={styles.infoLabel}>Residential Address</span>
                        <span className={styles.infoValue}>
                          {selectedTeacherDetail.address || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Professional Qualifications */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionTitle}>
                      <GraduationCap size={16} color="#6366f1" />
                      <span>Academic & Pedagogical Background</span>
                    </div>

                    <div className={styles.infoGrid}>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Specialization</span>
                        <span className={styles.infoValue}>
                          {selectedTeacherDetail.specialization || 'Not specified'}
                        </span>
                      </div>

                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Highest Qualification</span>
                        <span className={styles.infoValue}>
                          {selectedTeacherDetail.qualification || 'Not specified'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Classes & Subjects (Live GET /teachers/:id/subjects) */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionTitle}>
                      <BookOpen size={16} color="#6366f1" />
                      <span>Assigned Classes & Curriculum Subjects</span>
                    </div>

                    {teacherAssignments.length === 0 ? (
                      <div className={styles.emptyState} style={{ padding: '24px' }}>
                        <BookOpen size={24} color="#cbd5e1" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
                          No Course Allocations Found
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                          This faculty member has not yet been assigned to any class subjects for active sessions.
                        </div>
                      </div>
                    ) : (
                      <table className={styles.assignmentsTable}>
                        <thead>
                          <tr>
                            <th>Class</th>
                            <th>Subject</th>
                            <th>Code</th>
                            <th>Category</th>
                            <th>Session</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teacherAssignments.map((a) => (
                            <tr key={a.mapping_id}>
                              <td style={{ fontWeight: 600 }}>{a.class_name}</td>
                              <td>{a.subject_name}</td>
                              <td style={{ fontFamily: 'monospace' }}>{a.subject_code}</td>
                              <td>
                                <span className={styles.subjectBadge}>
                                  {a.subject_type}
                                </span>
                              </td>
                              <td style={{ color: '#64748b' }}>{a.academic_year}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Drawer Actions */}
            <div className={styles.drawerFooter}>
              <div>
                {selectedTeacherDetail && (
                  <>
                    {selectedTeacherDetail.is_active && canDeactivate && (
                      <button
                        className={styles.secondaryBtn}
                        style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                        onClick={() => setConfirmStatusTeacher(selectedTeacherDetail)}
                      >
                        <UserX size={15} />
                        <span>Deactivate Account</span>
                      </button>
                    )}
                    {!selectedTeacherDetail.is_active && canReactivate && (
                      <button
                        className={styles.secondaryBtn}
                        style={{ color: '#059669', borderColor: '#a7f3d0' }}
                        onClick={() => setConfirmStatusTeacher(selectedTeacherDetail)}
                      >
                        <UserCheck size={15} />
                        <span>Reactivate Account</span>
                      </button>
                    )}
                    {!selectedTeacherDetail.is_active && !canReactivate && isPrincipal && (
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        Reactivation requires Super Admin
                      </span>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {canManageTeachers && selectedTeacherDetail && (
                  <button
                    className={styles.primaryBtn}
                    onClick={() => handleOpenEdit(selectedTeacherDetail)}
                  >
                    <Edit3 size={15} />
                    <span>Edit Profile</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT PROFILE MODAL (Phase 3) ─────────────────────────────────────── */}
      {showEditModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !isSubmittingEdit && setShowEditModal(false)}
        >
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Edit Faculty Profile</h3>
                <p>Update employment, credentials, and contact details.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowEditModal(false)}
                disabled={isSubmittingEdit}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className={styles.modalBody}>
                {isSuperAdminOrPrincipal && (
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        <span>Full Name</span>
                        <span className={styles.requiredStar}>*</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className={styles.formInput}
                        disabled={isSubmittingEdit}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        <span>Phone Number</span>
                      </label>
                      <input
                        type="text"
                        placeholder="+91 98765 43210"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className={styles.formInput}
                        disabled={isSubmittingEdit}
                      />
                    </div>
                  </div>
                )}

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Employee ID</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. EMP-2026-14"
                      value={editForm.employee_id}
                      onChange={(e) => setEditForm({ ...editForm, employee_id: e.target.value })}
                      className={`${styles.formInput} ${
                        editErrors.employee_id ? styles.formInputError : ''
                      }`}
                      disabled={isSubmittingEdit}
                    />
                    {editErrors.employee_id && (
                      <span className={styles.fieldErrorText}>{editErrors.employee_id}</span>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Joining Date</span>
                    </label>
                    <input
                      type="date"
                      value={editForm.joining_date}
                      onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })}
                      className={styles.formInput}
                      disabled={isSubmittingEdit}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Specialization</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Physics, Robotics"
                      value={editForm.specialization}
                      onChange={(e) =>
                        setEditForm({ ...editForm, specialization: e.target.value })
                      }
                      className={`${styles.formInput} ${
                        editErrors.specialization ? styles.formInputError : ''
                      }`}
                      disabled={isSubmittingEdit}
                    />
                    {editErrors.specialization && (
                      <span className={styles.fieldErrorText}>{editErrors.specialization}</span>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Highest Qualification</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. M.Sc., B.Ed."
                      value={editForm.qualification}
                      onChange={(e) =>
                        setEditForm({ ...editForm, qualification: e.target.value })
                      }
                      className={`${styles.formInput} ${
                        editErrors.qualification ? styles.formInputError : ''
                      }`}
                      disabled={isSubmittingEdit}
                    />
                    {editErrors.qualification && (
                      <span className={styles.fieldErrorText}>{editErrors.qualification}</span>
                    )}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Emergency Contact</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Spouse / Relative contact number"
                    value={editForm.emergency_contact}
                    onChange={(e) =>
                      setEditForm({ ...editForm, emergency_contact: e.target.value })
                    }
                    className={`${styles.formInput} ${
                      editErrors.emergency_contact ? styles.formInputError : ''
                    }`}
                    disabled={isSubmittingEdit}
                  />
                  {editErrors.emergency_contact && (
                    <span className={styles.fieldErrorText}>{editErrors.emergency_contact}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Residential Address</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Street, City, State, Postal code"
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className={styles.formTextarea}
                    disabled={isSubmittingEdit}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowEditModal(false)}
                  disabled={isSubmittingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmittingEdit}
                >
                  {isSubmittingEdit ? (
                    <>
                      <RotateCcw size={16} className={styles.spinning} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Update Profile</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ONBOARD TEACHER MODAL (Phase 4) ──────────────────────────────────── */}
      {showOnboardModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !isSubmittingOnboard && setShowOnboardModal(false)}
        >
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Onboard Faculty Member</h3>
                <p>Create a teacher account and generate login credentials.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowOnboardModal(false)}
                disabled={isSubmittingOnboard}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleOnboardSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Teacher Full Name</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Ramesh Sharma"
                    value={onboardForm.name}
                    onChange={(e) => setOnboardForm({ ...onboardForm, name: e.target.value })}
                    className={`${styles.formInput} ${
                      onboardErrors.name ? styles.formInputError : ''
                    }`}
                    disabled={isSubmittingOnboard}
                    autoFocus
                  />
                  {onboardErrors.name && (
                    <span className={styles.fieldErrorText}>{onboardErrors.name}</span>
                  )}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>School Email Address</span>
                      <span className={styles.requiredStar}>*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="teacher@saksham.edu.in"
                      value={onboardForm.email}
                      onChange={(e) => setOnboardForm({ ...onboardForm, email: e.target.value })}
                      className={`${styles.formInput} ${
                        onboardErrors.email ? styles.formInputError : ''
                      }`}
                      disabled={isSubmittingOnboard}
                    />
                    {onboardErrors.email && (
                      <span className={styles.fieldErrorText}>{onboardErrors.email}</span>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Phone Number</span>
                    </label>
                    <input
                      type="text"
                      placeholder="+91 98765 43210"
                      value={onboardForm.phone}
                      onChange={(e) => setOnboardForm({ ...onboardForm, phone: e.target.value })}
                      className={styles.formInput}
                      disabled={isSubmittingOnboard}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Employee ID</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. FAC-2026-08"
                      value={onboardForm.employee_id}
                      onChange={(e) =>
                        setOnboardForm({ ...onboardForm, employee_id: e.target.value })
                      }
                      className={styles.formInput}
                      disabled={isSubmittingOnboard}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Joining Date</span>
                    </label>
                    <input
                      type="date"
                      value={onboardForm.joining_date}
                      onChange={(e) =>
                        setOnboardForm({ ...onboardForm, joining_date: e.target.value })
                      }
                      className={styles.formInput}
                      disabled={isSubmittingOnboard}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Specialization</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mathematics"
                      value={onboardForm.specialization}
                      onChange={(e) =>
                        setOnboardForm({ ...onboardForm, specialization: e.target.value })
                      }
                      className={styles.formInput}
                      disabled={isSubmittingOnboard}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      <span>Qualification</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. M.Sc., B.Ed."
                      value={onboardForm.qualification}
                      onChange={(e) =>
                        setOnboardForm({ ...onboardForm, qualification: e.target.value })
                      }
                      className={styles.formInput}
                      disabled={isSubmittingOnboard}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowOnboardModal(false)}
                  disabled={isSubmittingOnboard}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmittingOnboard}
                >
                  {isSubmittingOnboard ? (
                    <>
                      <RotateCcw size={16} className={styles.spinning} />
                      <span>Onboarding...</span>
                    </>
                  ) : (
                    <span>Create & Generate Credentials</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ONE-TIME CREDENTIAL REVEAL MODAL ─────────────────────────────────── */}
      {revealedCredential && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3 style={{ color: '#166534' }}>Temporary Faculty Credentials</h3>
                <p>One-time credential generation for new faculty account.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setRevealedCredential(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.credentialCallout}>
                <div className={styles.credentialCalloutHeader}>
                  <Lock size={18} />
                  <span>Account Credentials for {revealedCredential.teacherName}</span>
                </div>

                <div className={styles.credentialField}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                      LOGIN EMAIL
                    </div>
                    <div className={styles.credentialValue}>{revealedCredential.email}</div>
                  </div>
                </div>

                <div className={styles.credentialField}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                      TEMPORARY PASSWORD
                    </div>
                    <div className={styles.credentialValue}>
                      {revealedCredential.tempPassword}
                    </div>
                  </div>

                  <button className={styles.copyBtn} onClick={handleCopyPassword}>
                    {hasCopiedPassword ? (
                      <>
                        <Check size={14} color="#166534" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <div className={styles.credentialWarning}>
                  ⚠️ <strong>Important Security Notice:</strong> This password is shown only once and cannot be recovered after this dialog is closed. Provide it securely to the teacher. The system will prompt them to change their password upon first login.
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.primaryBtn}
                onClick={() => setRevealedCredential(null)}
              >
                <span>Done & Close</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STATUS CONFIRMATION MODAL ────────────────────────────────────────── */}
      {confirmStatusTeacher && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !isSubmittingStatus && setConfirmStatusTeacher(null)}
        >
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>
                  {confirmStatusTeacher.is_active ? 'Deactivate Faculty' : 'Reactivate Faculty'}
                </h3>
                <p>Manage account access and active sessions.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setConfirmStatusTeacher(null)}
                disabled={isSubmittingStatus}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: '1.6' }}>
                Are you sure you want to{' '}
                <strong>
                  {confirmStatusTeacher.is_active ? 'deactivate' : 'reactivate'}
                </strong>{' '}
                the account for <strong>{confirmStatusTeacher.name}</strong> ({confirmStatusTeacher.email})?
              </div>

              {confirmStatusTeacher.is_active && (
                <div
                  className={styles.alertBanner}
                  style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem' }}
                >
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span>
                    Deactivating this account will immediately revoke all active refresh tokens and prevent the teacher from logging in.
                  </span>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setConfirmStatusTeacher(null)}
                disabled={isSubmittingStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                style={{
                  background: confirmStatusTeacher.is_active ? '#dc2626' : '#059669',
                }}
                onClick={handleStatusToggle}
                disabled={isSubmittingStatus}
              >
                {isSubmittingStatus ? (
                  <>
                    <RotateCcw size={16} className={styles.spinning} />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>
                    Confirm {confirmStatusTeacher.is_active ? 'Deactivation' : 'Reactivation'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Teachers;
