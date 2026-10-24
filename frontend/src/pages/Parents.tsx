import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Users,
  Search,
  Plus,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  UserCheck,
  GraduationCap,
  ShieldAlert,
  Link as LinkIcon,
  Unlink,
  UserX,
  Copy,
  Check,
  Lock,
  Edit3,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import styles from './Parents.module.css';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface ParentSummary {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
  linked_students_count?: number;
}

export interface GlobalParentCounts {
  total: number;
  active: number;
  inactive: number;
  parents_with_wards: number;
  parents_without_wards: number;
  total_linked_students: number;
  unlinked_students: number;
}

export interface LinkedChild {
  student_id: string;
  admission_number: string;
  roll_number?: string | null;
  status: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  class_name?: string | null;
  section_name?: string | null;
  dob?: string | null;
  blood_group?: string | null;
}

export interface ParentDetail extends ParentSummary {
  children?: LinkedChild[];
}

export interface StudentSearchItem {
  id: string;
  admission_number: string;
  student_name: string;
  student_email: string;
  class_name?: string | null;
  section_name?: string | null;
  status: string;
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

const Parents: React.FC = () => {
  const { user } = useAuth();

  // Role permissions strictly aligned with backend RBAC:
  // - Directory & view profile: super_admin, principal, office_staff (and parent for self)
  // - Link / Unlink student: super_admin, principal, office_staff
  // - Onboard parent & Edit parent: super_admin, principal
  // - Deactivate user: super_admin, principal
  // - Reactivate user: super_admin ONLY
  const isSuperAdmin = user?.role === 'super_admin';
  const isPrincipal = user?.role === 'principal';
  const isOfficeStaff = user?.role === 'office_staff';
  const isParentUser = user?.role === 'parent';

  const canManageParents = isSuperAdmin || isPrincipal || isOfficeStaff;
  const isSuperAdminOrPrincipal = isSuperAdmin || isPrincipal;
  const canDeactivate = isSuperAdmin || isPrincipal;
  const canReactivate = isSuperAdmin;

  // ── Directory State ──
  const [parents, setParents] = useState<ParentSummary[]>([]);
  const [counts, setCounts] = useState<GlobalParentCounts | null>(null);
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const searchRequestIdRef = useRef<number>(0);

  // Global alerts
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // ── Selected Parent & Drawer State ──
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedParentDetail, setSelectedParentDetail] = useState<ParentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // ── Onboard Parent Modal State ──
  const [showOnboardModal, setShowOnboardModal] = useState<boolean>(false);
  const [onboardForm, setOnboardForm] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [onboardErrors, setOnboardErrors] = useState<{ [key: string]: string }>({});
  const [isSubmittingOnboard, setIsSubmittingOnboard] = useState<boolean>(false);

  // ── Edit Parent Modal State ──
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
  });
  const [editErrors, setEditErrors] = useState<{ [key: string]: string }>({});
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // ── Link Student Modal State ──
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [studentSearchResults, setStudentSearchResults] = useState<StudentSearchItem[]>([]);
  const [isSearchingStudents, setIsSearchingStudents] = useState<boolean>(false);
  const [selectedStudentToLink, setSelectedStudentToLink] = useState<StudentSearchItem | null>(null);
  const [isSubmittingLink, setIsSubmittingLink] = useState<boolean>(false);

  // ── Unlink Student Confirmation Modal ──
  const [studentToUnlink, setStudentToUnlink] = useState<LinkedChild | null>(null);
  const [isSubmittingUnlink, setIsSubmittingUnlink] = useState<boolean>(false);

  // ── Status Toggle Confirmation Modal ──
  const [confirmStatusParent, setConfirmStatusParent] = useState<ParentSummary | null>(null);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);

  // ── One-Time Credential Reveal Modal ──
  const [revealedCredential, setRevealedCredential] = useState<{
    email: string;
    tempPassword: string;
    parentName: string;
  } | null>(null);
  const [hasCopiedPassword, setHasCopiedPassword] = useState<boolean>(false);

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

  // ── Fetch Parents Directory (Phase 1) ──────────────────────────────────────

  const fetchParents = useCallback(
    async (pageToFetch: number, searchToFetch: string, isRefreshAction = false) => {
      // If user is parent only, skip directory listing
      if (isParentUser && !canManageParents) {
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

        const res = await apiClient.get(`/parents?${queryParams.toString()}`);

        if (currentRequestId !== searchRequestIdRef.current) {
          return;
        }

        if (res.data?.success && res.data?.data) {
          setParents(res.data.data.parents || []);
          if (res.data.data.pagination) {
            setPagination(res.data.data.pagination);
          }
          if (res.data.data.counts) {
            setCounts(res.data.data.counts);
          }
        }
      } catch (err: any) {
        if (currentRequestId === searchRequestIdRef.current) {
          setListError(
            err.response?.data?.message || err.message || 'Failed to load parents directory'
          );
        }
      } finally {
        if (currentRequestId === searchRequestIdRef.current) {
          setLoadingList(false);
          setIsRefreshing(false);
        }
      }
    },
    [pagination.limit, isParentUser, canManageParents]
  );

  useEffect(() => {
    fetchParents(pagination.page, debouncedSearch);
  }, [fetchParents, pagination.page, debouncedSearch]);

  // If user is a parent, automatically select their own profile
  useEffect(() => {
    if (isParentUser && user?.id) {
      setSelectedParentId(user.id);
    }
  }, [isParentUser, user?.id]);

  // ── Fetch Single Parent Details & Children (Phase 2) ───────────────────────

  const fetchParentDetails = useCallback(
    async (parentId: string) => {
      setLoadingDetail(true);
      try {
        let parentData: ParentDetail | null = null;

        if (isParentUser && !canManageParents) {
          // Parent caller can use /parents/me/children or /parents/:id (own ID)
          const res = await apiClient.get('/parents/me/children');
          if (res.data?.success) {
            parentData = {
              id: parentId,
              name: user?.name || 'Parent Profile',
              email: user?.email || '',
              phone: user?.phone || null,
              is_active: (user as any)?.is_active ?? true,
              created_at: new Date().toISOString(),
              children: res.data.data || [],
            };
          }
        } else {
          const res = await apiClient.get(`/parents/${parentId}`);
          if (res.data?.success && res.data?.data) {
            parentData = res.data.data;
          }
        }

        setSelectedParentDetail(parentData);
      } catch (err: any) {
        setApiError(
          err.response?.data?.message || err.message || 'Failed to load parent profile details'
        );
      } finally {
        setLoadingDetail(false);
      }
    },
    [isParentUser, canManageParents, user]
  );

  useEffect(() => {
    if (selectedParentId) {
      fetchParentDetails(selectedParentId);
    } else {
      setSelectedParentDetail(null);
    }
  }, [selectedParentId, fetchParentDetails]);

  // ── Handlers: Search Students to Link ──────────────────────────────────────

  const handleSearchStudents = useCallback(async (query: string) => {
    if (!query.trim()) {
      setStudentSearchResults([]);
      return;
    }
    setIsSearchingStudents(true);
    try {
      const res = await apiClient.get(`/students?search=${encodeURIComponent(query.trim())}&limit=8`);
      if (res.data?.success && res.data?.data?.students) {
        setStudentSearchResults(res.data.data.students);
      } else {
        setStudentSearchResults([]);
      }
    } catch {
      setStudentSearchResults([]);
    } finally {
      setIsSearchingStudents(false);
    }
  }, []);

  // ── Handlers: Onboard Parent ───────────────────────────────────────────────

  const handleOpenOnboard = () => {
    setOnboardForm({
      name: '',
      email: '',
      phone: '',
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

    try {
      const payload = {
        name: onboardForm.name.trim(),
        email: onboardForm.email.toLowerCase().trim(),
        phone: onboardForm.phone.trim() ? onboardForm.phone.trim() : null,
        role: 'parent',
      };

      const res = await apiClient.post('/users', payload);
      const tempPassword = res.data?.data?.temporary_password;

      if (tempPassword) {
        setRevealedCredential({
          email: onboardForm.email.toLowerCase().trim(),
          tempPassword,
          parentName: onboardForm.name.trim(),
        });
        setHasCopiedPassword(false);
      }

      setShowOnboardModal(false);
      setApiSuccess(`Parent account created successfully for ${onboardForm.name.trim()}`);
      await fetchParents(1, '', true);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to create parent account');
    } finally {
      setIsSubmittingOnboard(false);
    }
  };

  // ── Handlers: Edit Parent Identity ─────────────────────────────────────────

  const handleOpenEdit = (parent: ParentDetail) => {
    setEditForm({
      name: parent.name || '',
      phone: parent.phone || '',
    });
    setEditErrors({});
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParentId) return;

    const errors: { [key: string]: string } = {};
    if (!editForm.name.trim() || editForm.name.trim().length < 2) {
      errors.name = 'Full name must be at least 2 characters';
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setIsSubmittingEdit(true);
    setApiError(null);

    try {
      const updates: { name: string; phone: string | null } = {
        name: editForm.name.trim(),
        phone: editForm.phone.trim() ? editForm.phone.trim() : null,
      };

      await apiClient.patch(`/users/${selectedParentId}`, updates);

      setApiSuccess('Parent details updated successfully');
      setShowEditModal(false);
      await fetchParentDetails(selectedParentId);
      await fetchParents(pagination.page, debouncedSearch, true);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to update parent details');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // ── Handlers: Link Student ─────────────────────────────────────────────────

  const handleOpenLinkModal = () => {
    setStudentSearchQuery('');
    setStudentSearchResults([]);
    setSelectedStudentToLink(null);
    setShowLinkModal(true);
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParentId || !selectedStudentToLink) return;

    setIsSubmittingLink(true);
    setApiError(null);

    try {
      await apiClient.post(`/parents/${selectedParentId}/link-student`, {
        student_id: selectedStudentToLink.id,
      });

      setApiSuccess(
        `Successfully linked student ${selectedStudentToLink.student_name} to this parent`
      );
      setShowLinkModal(false);
      setSelectedStudentToLink(null);
      await fetchParentDetails(selectedParentId);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to link student to parent');
    } finally {
      setIsSubmittingLink(false);
    }
  };

  // ── Handlers: Unlink Student ───────────────────────────────────────────────

  const handleUnlinkSubmit = async () => {
    if (!selectedParentId || !studentToUnlink) return;

    setIsSubmittingUnlink(true);
    setApiError(null);

    try {
      await apiClient.post(`/parents/${selectedParentId}/unlink-student`, {
        student_id: studentToUnlink.student_id,
      });

      setApiSuccess(
        `Student ${studentToUnlink.name} was successfully unlinked from this parent`
      );
      setStudentToUnlink(null);
      await fetchParentDetails(selectedParentId);
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || 'Failed to unlink student');
    } finally {
      setIsSubmittingUnlink(false);
    }
  };

  // ── Handlers: Status Toggle (Deactivate / Reactivate) ───────────────────────

  const handleStatusToggle = async () => {
    if (!confirmStatusParent) return;

    const isCurrentlyActive = confirmStatusParent.is_active;

    if (isCurrentlyActive && !canDeactivate) {
      setApiError('You do not have permission to deactivate parent accounts.');
      return;
    }
    if (!isCurrentlyActive && !canReactivate) {
      setApiError('Only Super Administrators are permitted to reactivate accounts.');
      return;
    }

    setIsSubmittingStatus(true);
    setApiError(null);

    const endpoint = isCurrentlyActive
      ? `/users/${confirmStatusParent.id}/deactivate`
      : `/users/${confirmStatusParent.id}/reactivate`;

    try {
      await apiClient.post(endpoint);
      setApiSuccess(
        `Parent ${confirmStatusParent.name} was successfully ${
          isCurrentlyActive ? 'deactivated' : 'reactivated'
        }`
      );
      setConfirmStatusParent(null);

      if (selectedParentId === confirmStatusParent.id) {
        await fetchParentDetails(selectedParentId);
      }
      await fetchParents(pagination.page, debouncedSearch, true);
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

  // ── Derived Statistics & Status Filtering ─────────────────────────────────

  const activeParentsCount = useMemo(
    () => parents.filter((p) => p.is_active).length,
    [parents]
  );

  const inactiveParentsCount = useMemo(
    () => parents.filter((p) => !p.is_active).length,
    [parents]
  );

  const displayedParents = useMemo(() => {
    if (statusFilter === 'active') return parents.filter((p) => p.is_active);
    if (statusFilter === 'inactive') return parents.filter((p) => !p.is_active);
    return parents;
  }, [parents, statusFilter]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerTitle}>
          <h2>Parent & Guardian Directory</h2>
          <p>
            Oversee registered parents, monitor ward linkages, and manage family account credentials.
          </p>
        </div>

        <div className={styles.headerActions}>
          {canManageParents && (
            <button
              className={styles.refreshBtn}
              onClick={() => fetchParents(pagination.page, debouncedSearch, true)}
              disabled={isRefreshing}
              title="Refresh parent directory"
            >
              <RotateCcw size={18} className={isRefreshing ? styles.spinning : ''} />
            </button>
          )}

          {isSuperAdminOrPrincipal && (
            <button className={styles.primaryBtn} onClick={handleOpenOnboard}>
              <Plus size={16} />
              <span>Onboard Parent</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Notice for Parent View */}
      {isParentUser && !canManageParents && (
        <div className={styles.rbacNotice}>
          <ShieldAlert size={18} color="#6366f1" />
          <span>
            You are viewing your personal parent profile and registered student wards. Contact school administration if you need to update contact information.
          </span>
        </div>
      )}

      {/* Alerts */}
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

      {/* KPI Stats Overview — Interactive Cards with Tactile Click Feedback */}
      {canManageParents && (
        <div className={styles.statsGrid}>
          <div
            className={`${styles.statCard} ${statusFilter === 'all' ? styles.statCardActive : ''}`}
            onClick={() => setStatusFilter('all')}
            title="Click to view all registered parents"
            role="button"
            tabIndex={0}
          >
            <div className={styles.statIconWrap} style={{ background: '#ede9fe', color: '#6366f1' }}>
              <Users size={22} />
            </div>
            <div className={styles.statDetails}>
              <div className={styles.statNumber}>{counts?.total ?? pagination.total}</div>
              <div className={styles.statLabel}>Registered Parents</div>
            </div>
          </div>

          <div
            className={`${styles.statCard} ${statusFilter === 'active' ? styles.statCardActive : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'active' ? 'all' : 'active'))}
            title="Click to filter active accounts"
            role="button"
            tabIndex={0}
          >
            <div className={styles.statIconWrap} style={{ background: '#ecfdf5', color: '#059669' }}>
              <CheckCircle2 size={22} />
            </div>
            <div className={styles.statDetails}>
              <div className={styles.statNumber}>{counts?.active ?? activeParentsCount}</div>
              <div className={styles.statLabel}>Active Accounts</div>
            </div>
          </div>

          <div
            className={`${styles.statCard} ${statusFilter === 'inactive' ? styles.statCardActive : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'inactive' ? 'all' : 'inactive'))}
            title="Click to filter inactive accounts"
            role="button"
            tabIndex={0}
          >
            <div className={styles.statIconWrap} style={{ background: '#fff1f2', color: '#e11d48' }}>
              <UserX size={22} />
            </div>
            <div className={styles.statDetails}>
              <div className={styles.statNumber}>{counts?.inactive ?? inactiveParentsCount}</div>
              <div className={styles.statLabel}>Inactive Accounts</div>
            </div>
          </div>

          <div
            className={styles.statCard}
            onClick={() => setStatusFilter('all')}
            title="Total students linked to parents across the school"
            role="button"
            tabIndex={0}
          >
            <div className={styles.statIconWrap} style={{ background: '#eff6ff', color: '#3b82f6' }}>
              <GraduationCap size={22} />
            </div>
            <div className={styles.statDetails}>
              <div className={styles.statNumber}>{counts?.total_linked_students ?? pagination.pages}</div>
              <div className={styles.statLabel}>{counts ? 'Linked Students' : 'Directory Pages'}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── PARENT DIRECTORY TABLE (Phase 1) ─────────────────────────────────── */}
      {canManageParents && (
        <div className={styles.card}>
          {/* Toolbar */}
          <div className={styles.toolbarCard}>
            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search parent by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: '#64748b' }}>
              <span>
                Showing {displayedParents.length} of {pagination.total} registered parents
              </span>
              {statusFilter !== 'all' && (
                <span
                  className={styles.activeFilterBadge}
                  onClick={() => setStatusFilter('all')}
                  title="Clear status filter"
                >
                  Filtered: {statusFilter.toUpperCase()} <X size={12} />
                </span>
              )}
            </div>
          </div>

          {/* Table */}
          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Parent / Guardian</th>
                  <th>Contact Phone</th>
                  <th>Linked Wards</th>
                  <th>Registered On</th>
                  <th>Account Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px' }}>
                      <RotateCcw size={22} className={styles.spinning} style={{ margin: '0 auto', display: 'block' }} />
                      <span style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '10px', display: 'block' }}>
                        Loading parent directory...
                      </span>
                    </td>
                  </tr>
                ) : listError ? (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        <AlertCircle size={32} color="#ef4444" style={{ marginBottom: '12px' }} />
                        <div className={styles.emptyTitle}>Unable to load parents</div>
                        <div className={styles.emptyDesc}>{listError}</div>
                        <button
                          className={styles.secondaryBtn}
                          style={{ marginTop: '14px' }}
                          onClick={() => fetchParents(pagination.page, debouncedSearch, true)}
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : displayedParents.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                          <Users size={32} />
                        </div>
                        <div className={styles.emptyTitle}>
                          {statusFilter !== 'all'
                            ? `No ${statusFilter} parents found`
                            : searchTerm
                            ? 'No parents match filter'
                            : 'No Parents Registered Yet'}
                        </div>
                        <div className={styles.emptyDesc}>
                          {statusFilter !== 'all'
                            ? `There are currently no parents matching the "${statusFilter}" status filter.`
                            : searchTerm
                            ? 'No parent account was found matching your search term.'
                            : 'Get started by onboarding parents into the Saksham school platform.'}
                        </div>
                        {statusFilter !== 'all' ? (
                          <button
                            className={styles.secondaryBtn}
                            style={{ marginTop: '14px' }}
                            onClick={() => setStatusFilter('all')}
                          >
                            Show All Parents
                          </button>
                        ) : isSuperAdminOrPrincipal && !searchTerm ? (
                          <button
                            className={styles.primaryBtn}
                            style={{ marginTop: '16px' }}
                            onClick={handleOpenOnboard}
                          >
                            <Plus size={16} />
                            <span>Onboard First Parent</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedParents.map((parent) => (
                    <tr
                      key={parent.id}
                      className={styles.clickableRow}
                      onClick={() => setSelectedParentId(parent.id)}
                    >
                      <td>
                        <div className={styles.parentAvatarWrap}>
                          <div className={styles.avatar}>
                            {parent.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className={styles.parentName}>{parent.name}</div>
                            <div className={styles.parentEmailSub}>{parent.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>{parent.phone || '—'}</td>
                      <td>
                        <span
                          className={`${styles.wardBadge} ${
                            (parent.linked_students_count ?? 0) > 0 ? styles.wardBadgePositive : ''
                          }`}
                        >
                          <GraduationCap size={13} />
                          <span>
                            {parent.linked_students_count ?? 0}{' '}
                            {(parent.linked_students_count ?? 0) === 1 ? 'Ward' : 'Wards'}
                          </span>
                        </span>
                      </td>
                      <td>{formatDateDisplay(parent.created_at)}</td>
                      <td>
                        {parent.is_active ? (
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
                          onClick={() => setSelectedParentId(parent.id)}
                        >
                          <span>View Profile & Wards</span>
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
                  ‹
                </button>
                <button
                  className={styles.pageNavBtn}
                  disabled={pagination.page >= pagination.pages || loadingList}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: Math.min(prev.pages, prev.page + 1) }))
                  }
                  title="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PARENT DETAILS DRAWER (Phase 2) ──────────────────────────────────── */}
      {selectedParentId && (
        <div className={styles.drawerBackdrop} onClick={() => !isParentUser && setSelectedParentId(null)}>
          <div className={styles.drawerPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitleWrap}>
                <div className={styles.drawerAvatar}>
                  {selectedParentDetail?.name?.charAt(0).toUpperCase() || 'P'}
                </div>
                <div>
                  <div className={styles.drawerName}>
                    {selectedParentDetail?.name || 'Parent Profile'}
                  </div>
                  <div className={styles.drawerMeta}>
                    {selectedParentDetail?.is_active ? (
                      <span className={styles.activeBadge}>
                        <span className={styles.activeDot} />
                        <span>Active Account</span>
                      </span>
                    ) : (
                      <span className={styles.inactiveBadge}>
                        <span>Deactivated</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!isParentUser && (
                <button
                  className={styles.drawerCloseBtn}
                  onClick={() => setSelectedParentId(null)}
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <div className={styles.drawerBody}>
              {loadingDetail ? (
                <div style={{ textAlign: 'center', padding: '48px' }}>
                  <RotateCcw size={24} className={styles.spinning} style={{ margin: '0 auto', display: 'block' }} />
                  <span style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '12px', display: 'block' }}>
                    Loading parent details and linked wards...
                  </span>
                </div>
              ) : selectedParentDetail ? (
                <>
                  {/* Contact Details */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionTitle}>
                      <UserCheck size={16} color="#6366f1" />
                      <span>Contact & Identification</span>
                    </div>

                    <div className={styles.infoGrid}>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Email</span>
                        <span className={styles.infoValue}>{selectedParentDetail.email}</span>
                      </div>

                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Phone</span>
                        <span className={styles.infoValue}>{selectedParentDetail.phone || '—'}</span>
                      </div>

                      <div className={styles.infoItem} style={{ gridColumn: 'span 2' }}>
                        <span className={styles.infoLabel}>Registered On</span>
                        <span className={styles.infoValue}>
                          {formatDateDisplay(selectedParentDetail.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Linked Wards / Children */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionHeader}>
                      <div className={styles.drawerSectionTitle}>
                        <GraduationCap size={16} color="#6366f1" />
                        <span>Linked Wards / Students ({selectedParentDetail.children?.length || 0})</span>
                      </div>

                      {canManageParents && (
                        <button
                          className={styles.secondaryBtn}
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={handleOpenLinkModal}
                        >
                          <LinkIcon size={14} />
                          <span>Link Student</span>
                        </button>
                      )}
                    </div>

                    {!selectedParentDetail.children || selectedParentDetail.children.length === 0 ? (
                      <div className={styles.emptyState} style={{ padding: '24px' }}>
                        <GraduationCap size={24} color="#cbd5e1" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
                          No Students Linked Yet
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                          This parent account has no enrolled students attached as wards.
                        </div>
                        {canManageParents && (
                          <button
                            className={styles.secondaryBtn}
                            style={{ marginTop: '12px', fontSize: '0.8rem' }}
                            onClick={handleOpenLinkModal}
                          >
                            <LinkIcon size={14} />
                            <span>Link First Student</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className={styles.childrenList}>
                        {selectedParentDetail.children.map((child) => (
                          <div key={child.student_id} className={styles.childCard}>
                            <div className={styles.childInfo}>
                              <div className={styles.childAvatar}>
                                {child.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className={styles.childName}>{child.name}</div>
                                <div className={styles.childSub}>
                                  {child.admission_number}
                                  {child.class_name ? ` • ${child.class_name}` : ''}
                                  {child.section_name ? ` (${child.section_name})` : ''}
                                  {child.roll_number ? ` • Roll: ${child.roll_number}` : ''}
                                </div>
                              </div>
                            </div>

                            {canManageParents && (
                              <button
                                className={styles.unlinkBtn}
                                onClick={() => setStudentToUnlink(child)}
                                title="Unlink ward"
                              >
                                <Unlink size={13} />
                                <span>Unlink</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Drawer Actions */}
            <div className={styles.drawerFooter}>
              <div>
                {selectedParentDetail && !isParentUser && (
                  <>
                    {selectedParentDetail.is_active && canDeactivate && (
                      <button
                        className={styles.secondaryBtn}
                        style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                        onClick={() => setConfirmStatusParent(selectedParentDetail)}
                      >
                        <UserX size={15} />
                        <span>Deactivate Account</span>
                      </button>
                    )}
                    {!selectedParentDetail.is_active && canReactivate && (
                      <button
                        className={styles.secondaryBtn}
                        style={{ color: '#059669', borderColor: '#a7f3d0' }}
                        onClick={() => setConfirmStatusParent(selectedParentDetail)}
                      >
                        <UserCheck size={15} />
                        <span>Reactivate Account</span>
                      </button>
                    )}
                    {!selectedParentDetail.is_active && !canReactivate && isPrincipal && (
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        Reactivation requires Super Admin
                      </span>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {isSuperAdminOrPrincipal && selectedParentDetail && (
                  <button
                    className={styles.primaryBtn}
                    onClick={() => handleOpenEdit(selectedParentDetail)}
                  >
                    <Edit3 size={15} />
                    <span>Edit Details</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ONBOARD PARENT MODAL ─────────────────────────────────────────────── */}
      {showOnboardModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !isSubmittingOnboard && setShowOnboardModal(false)}
        >
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Onboard Parent / Guardian</h3>
                <p>Register a parent account and generate initial login credentials.</p>
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
                    <span>Full Name</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Kumar Sharma"
                    value={onboardForm.name}
                    onChange={(e) => setOnboardForm({ ...onboardForm, name: e.target.value })}
                    className={`${styles.formInput} ${onboardErrors.name ? styles.formInputError : ''}`}
                    disabled={isSubmittingOnboard}
                    autoFocus
                  />
                  {onboardErrors.name && (
                    <span className={styles.fieldErrorText}>{onboardErrors.name}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Email Address</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="parent.guardian@example.com"
                    value={onboardForm.email}
                    onChange={(e) => setOnboardForm({ ...onboardForm, email: e.target.value })}
                    className={`${styles.formInput} ${onboardErrors.email ? styles.formInputError : ''}`}
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
                      <span>Creating Account...</span>
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

      {/* ── EDIT PARENT MODAL ────────────────────────────────────────────────── */}
      {showEditModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !isSubmittingEdit && setShowEditModal(false)}
        >
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Edit Parent Details</h3>
                <p>Update contact information for this parent account.</p>
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
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Full Name</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className={`${styles.formInput} ${editErrors.name ? styles.formInputError : ''}`}
                    disabled={isSubmittingEdit}
                  />
                  {editErrors.name && (
                    <span className={styles.fieldErrorText}>{editErrors.name}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Phone Number</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className={styles.formInput}
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
                    <span>Update Details</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── LINK STUDENT MODAL ──────────────────────────────────────────────── */}
      {showLinkModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !isSubmittingLink && setShowLinkModal(false)}
        >
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>Link Student Ward</h3>
                <p>Search and associate a student file to {selectedParentDetail?.name}.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowLinkModal(false)}
                disabled={isSubmittingLink}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleLinkSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Find Student</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <div className={styles.searchBox} style={{ width: '100%' }}>
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Type student name, admission no, or email..."
                      value={studentSearchQuery}
                      onChange={(e) => {
                        setStudentSearchQuery(e.target.value);
                        handleSearchStudents(e.target.value);
                      }}
                      className={styles.searchInput}
                      autoFocus
                    />
                  </div>
                </div>

                {/* Search Results */}
                {isSearchingStudents ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '0.85rem' }}>
                    Searching students...
                  </div>
                ) : studentSearchResults.length > 0 ? (
                  <div className={styles.studentSearchList}>
                    {studentSearchResults.map((st) => (
                      <div
                        key={st.id}
                        className={`${styles.studentSearchItem} ${
                          selectedStudentToLink?.id === st.id ? styles.studentSearchItemSelected : ''
                        }`}
                        onClick={() => setSelectedStudentToLink(st)}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem' }}>
                            {st.student_name}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                            {st.admission_number}
                            {st.class_name ? ` • ${st.class_name}` : ''}
                            {st.section_name ? ` (${st.section_name})` : ''}
                          </div>
                        </div>

                        {selectedStudentToLink?.id === st.id ? (
                          <CheckCircle2 size={18} color="#6366f1" />
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Select</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : studentSearchQuery.trim() ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '0.85rem' }}>
                    No students found matching "{studentSearchQuery}".
                  </div>
                ) : (
                  <div style={{ fontSize: '0.82rem', color: '#64748b', fontStyle: 'italic' }}>
                    Search above to find and select an enrolled student to link.
                  </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowLinkModal(false)}
                  disabled={isSubmittingLink}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmittingLink || !selectedStudentToLink}
                >
                  {isSubmittingLink ? (
                    <>
                      <RotateCcw size={16} className={styles.spinning} />
                      <span>Linking...</span>
                    </>
                  ) : (
                    <span>Confirm Link</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── UNLINK CONFIRMATION MODAL ────────────────────────────────────────── */}
      {studentToUnlink && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !isSubmittingUnlink && setStudentToUnlink(null)}
        >
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3 style={{ color: '#dc2626' }}>Unlink Student Ward</h3>
                <p>Remove parent-student association.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setStudentToUnlink(null)}
                disabled={isSubmittingUnlink}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: '1.6', margin: 0 }}>
                Are you sure you want to unlink <strong>{studentToUnlink.name}</strong> (Admission No: {studentToUnlink.admission_number}) from parent <strong>{selectedParentDetail?.name}</strong>?
              </p>
              <div
                className={styles.alertBanner}
                style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem' }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>
                  The student will no longer be attached to this parent profile. The student record itself will remain active and intact.
                </span>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setStudentToUnlink(null)}
                disabled={isSubmittingUnlink}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                style={{ background: '#dc2626' }}
                onClick={handleUnlinkSubmit}
                disabled={isSubmittingUnlink}
              >
                {isSubmittingUnlink ? (
                  <>
                    <RotateCcw size={16} className={styles.spinning} />
                    <span>Unlinking...</span>
                  </>
                ) : (
                  <span>Confirm Unlink</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ONE-TIME CREDENTIAL REVEAL MODAL ─────────────────────────────────── */}
      {revealedCredential && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3 style={{ color: '#166534' }}>Temporary Parent Credentials</h3>
                <p>One-time credential generation for parent portal access.</p>
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
                  <span>Account Credentials for {revealedCredential.parentName}</span>
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
                  ⚠️ <strong>Important Security Notice:</strong> This password is shown only once and cannot be recovered after this dialog is closed. Provide it securely to the parent. The system will prompt them to change their password upon first login.
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
      {confirmStatusParent && (
        <div
          className={styles.modalBackdrop}
          onClick={() => !isSubmittingStatus && setConfirmStatusParent(null)}
        >
          <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <h3>
                  {confirmStatusParent.is_active ? 'Deactivate Parent' : 'Reactivate Parent'}
                </h3>
                <p>Manage portal access and active login sessions.</p>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setConfirmStatusParent(null)}
                disabled={isSubmittingStatus}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: '1.6' }}>
                Are you sure you want to{' '}
                <strong>
                  {confirmStatusParent.is_active ? 'deactivate' : 'reactivate'}
                </strong>{' '}
                the account for <strong>{confirmStatusParent.name}</strong> ({confirmStatusParent.email})?
              </div>

              {confirmStatusParent.is_active && (
                <div
                  className={styles.alertBanner}
                  style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem' }}
                >
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span>
                    Deactivating this account will immediately revoke all active refresh tokens and prevent the parent from accessing the school portal.
                  </span>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setConfirmStatusParent(null)}
                disabled={isSubmittingStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                style={{
                  background: confirmStatusParent.is_active ? '#dc2626' : '#059669',
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
                    Confirm {confirmStatusParent.is_active ? 'Deactivation' : 'Reactivation'}
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

export default Parents;
