import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, RotateCcw, Eye, Edit3, ShieldAlert,
  Layers, X, AlertCircle, UserPlus, Users
} from 'lucide-react';
import styles from './Students.module.css';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

export interface StudentRecord {
  id: string;
  admission_number: string;
  admission_date: string;
  dob: string;
  gender: string;
  current_class_id: string | null;
  current_section_id: string | null;
  roll_number: string | null;
  blood_group: string | null;
  address: string | null;
  emergency_contact: string | null;
  status: 'active' | 'transferred' | 'graduated' | 'suspended';
  student_name: string;
  student_email: string;
  student_phone: string | null;
  student_avatar_url: string | null;
  class_name: string | null;
  class_code: string | null;
  section_name: string | null;
}

export interface StudentDetail extends StudentRecord {
  user_id: string;
  parent_user_id: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  user_active: boolean;
  created_at: string;
  updated_at: string;
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

const Students: React.FC = () => {
  const { user } = useAuth();

  // Role permissions based on backend studentRoutes.ts
  const userRole = user?.role || '';
  const canView = ['super_admin', 'principal', 'office_staff', 'teacher'].includes(userRole);
  const canEditPersonal = ['super_admin', 'principal', 'office_staff'].includes(userRole);
  const canChangeStatus = ['super_admin', 'principal'].includes(userRole);
  const canAssignSection = ['super_admin', 'principal', 'office_staff'].includes(userRole);

  // Directory state
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Active Modals state
  const [detailStudent, setDetailStudent] = useState<StudentDetail | null>(null);

  const [editStudent, setEditStudent] = useState<StudentRecord | null>(null);
  const [statusStudent, setStatusStudent] = useState<StudentRecord | null>(null);
  const [sectionStudent, setSectionStudent] = useState<StudentRecord | null>(null);

  // Modal Form States
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Personal Form fields
  const [editDob, setEditDob] = useState<string>('');
  const [editGender, setEditGender] = useState<'male' | 'female' | 'other'>('male');
  const [editRollNumber, setEditRollNumber] = useState<string>('');
  const [editBloodGroup, setEditBloodGroup] = useState<string>('');
  const [editAddress, setEditAddress] = useState<string>('');
  const [editEmergencyContact, setEditEmergencyContact] = useState<string>('');

  // Status Form fields
  const [newStatus, setNewStatus] = useState<'active' | 'transferred' | 'graduated' | 'suspended'>('active');
  const [statusRemarks, setStatusRemarks] = useState<string>('');

  // Assign Section Form fields
  const [assignClassId, setAssignClassId] = useState<string>('');
  const [assignSectionId, setAssignSectionId] = useState<string>('');
  const [assignRollNumber, setAssignRollNumber] = useState<string>('');

  // Available sections for the selected filter class
  const availableSections = useMemo(() => {
    if (!selectedClassId) return [];
    const cls = classes.find((c) => c.id === selectedClassId);
    return cls?.sections || [];
  }, [classes, selectedClassId]);

  // Available sections for the assign modal class
  const modalAvailableSections = useMemo(() => {
    if (!assignClassId) return [];
    const cls = classes.find((c) => c.id === assignClassId);
    return cls?.sections || [];
  }, [classes, assignClassId]);

  // Fetch classes on mount
  useEffect(() => {
    if (!canView) return;
    apiClient
      .get('/academic/classes')
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data?.classes)) {
          setClasses(res.data.data.classes);
        }
      })
      .catch((err) => {
        console.warn('Failed to load academic classes for filtering:', err.message);
      });
  }, [canView]);

  // Fetch students function
  const fetchStudents = async () => {
    if (!canView) return;
    setIsLoading(true);
    setApiError(null);

    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      if (search.trim()) params.append('search', search.trim());
      if (selectedClassId) params.append('class_id', selectedClassId);
      if (selectedSectionId) params.append('section_id', selectedSectionId);
      if (selectedStatus) params.append('status', selectedStatus);

      const res = await apiClient.get(`/students?${params.toString()}`);
      if (res.data?.success) {
        setStudents(res.data.data.students || []);
        const pagination = res.data.data.pagination;
        if (pagination) {
          setTotalStudents(pagination.total ?? 0);
          setTotalPages(pagination.total_pages ?? 1);
        }
      } else {
        setApiError(res.data?.message || 'Failed to fetch student directory.');
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        setApiError('Access restricted: You do not have permission to view the Student Directory.');
      } else {
        setApiError(err.response?.data?.message || 'Unable to connect to the server. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, limit, selectedClassId, selectedSectionId, selectedStatus]);

  // Handle Search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchStudents();
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearch('');
    setSelectedClassId('');
    setSelectedSectionId('');
    setSelectedStatus('');
    setPage(1);
  };

  // Open Details Modal
  const handleOpenDetail = async (student: StudentRecord) => {
    setDetailStudent(null);
    try {
      const res = await apiClient.get(`/students/${student.id}`);
      if (res.data?.success && res.data.data?.student) {
        setDetailStudent(res.data.data.student);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load student details.');
    }
  };

  // Open Edit Personal Modal
  const handleOpenEdit = (student: StudentRecord) => {
    setEditStudent(student);
    setModalError(null);
    setEditDob(student.dob ? student.dob.slice(0, 10) : '');
    setEditGender(
      ['male', 'female', 'other'].includes(student.gender?.toLowerCase())
        ? (student.gender.toLowerCase() as any)
        : 'male'
    );
    setEditRollNumber(student.roll_number || '');
    setEditBloodGroup(student.blood_group || '');
    setEditAddress(student.address || '');
    setEditEmergencyContact(student.emergency_contact || '');
  };

  // Submit Edit Personal Details
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudent) return;
    setModalSubmitting(true);
    setModalError(null);

    // Basic date validation
    if (editDob && !/^\d{4}-\d{2}-\d{2}$/.test(editDob)) {
      setModalError('Date of birth must be in YYYY-MM-DD format.');
      setModalSubmitting(false);
      return;
    }

    if (editEmergencyContact && editEmergencyContact.length < 10) {
      setModalError('Emergency contact must be at least 10 digits.');
      setModalSubmitting(false);
      return;
    }

    try {
      const res = await apiClient.put(`/students/${editStudent.id}`, {
        dob: editDob || undefined,
        gender: editGender,
        roll_number: editRollNumber.trim() || null,
        blood_group: editBloodGroup.trim() || null,
        address: editAddress.trim() || null,
        emergency_contact: editEmergencyContact.trim() || null,
      });

      if (res.data?.success) {
        setEditStudent(null);
        await fetchStudents();
      } else {
        setModalError(res.data?.message || 'Failed to update student profile.');
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Failed to update student details.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Open Status Modal
  const handleOpenStatus = (student: StudentRecord) => {
    setStatusStudent(student);
    setNewStatus(student.status);
    setStatusRemarks('');
    setModalError(null);
  };

  // Submit Status Change
  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusStudent) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiClient.patch(`/students/${statusStudent.id}/status`, {
        status: newStatus,
        remarks: statusRemarks.trim() || null,
      });

      if (res.data?.success) {
        setStatusStudent(null);
        await fetchStudents();
      } else {
        setModalError(res.data?.message || 'Failed to update student status.');
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Open Section Assignment Modal
  const handleOpenSection = (student: StudentRecord) => {
    setSectionStudent(student);
    setAssignClassId(student.current_class_id || '');
    setAssignSectionId(student.current_section_id || '');
    setAssignRollNumber(student.roll_number || '');
    setModalError(null);
  };

  // Submit Section Assignment
  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionStudent) return;
    if (!assignClassId) {
      setModalError('Target class is required.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiClient.patch(`/students/${sectionStudent.id}/section`, {
        class_id: assignClassId,
        section_id: assignSectionId || null,
        roll_number: assignRollNumber.trim() || null,
      });

      if (res.data?.success) {
        setSectionStudent(null);
        await fetchStudents();
      } else {
        setModalError(res.data?.message || 'Failed to reassign class / section.');
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Failed to assign class/section.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Format initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'ST';
  };

  // Status badge styling helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className={`${styles.statusBadge} ${styles.statusActive}`}>Active</span>;
      case 'transferred':
        return <span className={`${styles.statusBadge} ${styles.statusTransferred}`}>Transferred</span>;
      case 'graduated':
        return <span className={`${styles.statusBadge} ${styles.statusGraduated}`}>Graduated</span>;
      case 'suspended':
        return <span className={`${styles.statusBadge} ${styles.statusSuspended}`}>Suspended</span>;
      default:
        return <span className={styles.statusBadge}>{status}</span>;
    }
  };

  // Permission Denied View
  if (!canView) {
    return (
      <div className={styles.page}>
        <div className={styles.stateBox} style={{ background: '#ffffff', borderRadius: '18px' }}>
          <AlertCircle size={48} className={styles.stateIcon} style={{ color: '#ef4444' }} />
          <h3 className={styles.stateTitle}>Access Restricted</h3>
          <p className={styles.stateDesc}>
            Your role ({userRole}) does not have permission to view the Student Directory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerTitle}>
          <h2>Student Management</h2>
          <p>Browse active student files, personal demographics, and academic allocations.</p>
        </div>
        <Link to="/admissions" className={styles.admitBtn} title="Enroll new students through Admissions workflow">
          <UserPlus size={18} />
          <span>New Admission</span>
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className={styles.toolbarCard}>
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by name, email, admission #..."
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className={styles.filterGroup}>
          {/* Class Filter */}
          <select
            className={styles.selectInput}
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSelectedSectionId('');
              setPage(1);
            }}
          >
            <option value="">All Classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>

          {/* Section Filter (dependent on Class) */}
          <select
            className={styles.selectInput}
            value={selectedSectionId}
            disabled={!selectedClassId || availableSections.length === 0}
            onChange={(e) => {
              setSelectedSectionId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Sections</option>
            {availableSections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                Section {sec.name}
              </option>
            ))}
          </select>

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
            <option value="active">Active</option>
            <option value="transferred">Transferred</option>
            <option value="graduated">Graduated</option>
            <option value="suspended">Suspended</option>
          </select>

          {/* Reset Filters */}
          {(search || selectedClassId || selectedSectionId || selectedStatus) && (
            <button className={styles.clearFiltersBtn} onClick={handleResetFilters} title="Reset all filters">
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table Card */}
      <div className={styles.tableCard}>
        {apiError ? (
          <div className={styles.stateBox}>
            <AlertCircle size={42} style={{ color: '#ef4444' }} className={styles.stateIcon} />
            <h4 className={styles.stateTitle}>Unable to Load Directory</h4>
            <p className={styles.stateDesc}>{apiError}</p>
            <button className={styles.retryBtn} onClick={fetchStudents}>
              Try Again
            </button>
          </div>
        ) : isLoading ? (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Admission #</th>
                  <th>Class / Section</th>
                  <th>Roll #</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...Array(6)].map((_, i) => (
                  <tr key={i}>
                    <td><div className={styles.skeletonRow} style={{ width: '140px' }} /></td>
                    <td><div className={styles.skeletonRow} style={{ width: '100px' }} /></td>
                    <td><div className={styles.skeletonRow} style={{ width: '80px' }} /></td>
                    <td><div className={styles.skeletonRow} style={{ width: '50px' }} /></td>
                    <td><div className={styles.skeletonRow} style={{ width: '70px' }} /></td>
                    <td style={{ textAlign: 'right' }}><div className={styles.skeletonRow} style={{ width: '60px', marginLeft: 'auto' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : students.length === 0 ? (
          <div className={styles.stateBox}>
            <Users size={48} className={styles.stateIcon} />
            <h4 className={styles.stateTitle}>No Students Found</h4>
            <p className={styles.stateDesc}>
              {search || selectedClassId || selectedStatus
                ? 'Try adjusting your search criteria or resetting filters.'
                : 'No student files have been enrolled yet.'}
            </p>
            {(search || selectedClassId || selectedStatus) && (
              <button className={styles.clearFiltersBtn} onClick={handleResetFilters}>
                Clear Active Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Admission #</th>
                    <th>Class / Section</th>
                    <th>Roll #</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      {/* Name & Avatar */}
                      <td>
                        <div className={styles.studentCell}>
                          <div className={styles.avatar}>
                            {getInitials(student.student_name)}
                          </div>
                          <div className={styles.studentMeta}>
                            <span className={styles.studentName}>{student.student_name}</span>
                            <span className={styles.studentEmail}>{student.student_email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Admission Number */}
                      <td>
                        <span style={{ fontWeight: 600, color: '#475569' }}>
                          {student.admission_number}
                        </span>
                      </td>

                      {/* Class & Section */}
                      <td>
                        {student.class_name ? (
                          <span>
                            {student.class_name} {student.section_name ? `• ${student.section_name}` : ''}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Unassigned</span>
                        )}
                      </td>

                      {/* Roll Number */}
                      <td>
                        <span style={{ color: '#475569' }}>{student.roll_number || '—'}</span>
                      </td>

                      {/* Status */}
                      <td>{getStatusBadge(student.status)}</td>

                      {/* Actions */}
                      <td>
                        <div className={styles.actionsCell} style={{ justifyContent: 'flex-end' }}>
                          {/* View details */}
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                            title="View Full Profile"
                            onClick={() => handleOpenDetail(student)}
                          >
                            <Eye size={16} />
                          </button>

                          {/* Edit personal details */}
                          {canEditPersonal && (
                            <button
                              className={styles.actionBtn}
                              title="Edit Personal Information"
                              onClick={() => handleOpenEdit(student)}
                            >
                              <Edit3 size={16} />
                            </button>
                          )}

                          {/* Assign Class / Section */}
                          {canAssignSection && (
                            <button
                              className={styles.actionBtn}
                              title="Assign / Transition Class & Section"
                              onClick={() => handleOpenSection(student)}
                            >
                              <Layers size={16} />
                            </button>
                          )}

                          {/* Change Status */}
                          {canChangeStatus && (
                            <button
                              className={`${styles.actionBtn} ${styles.actionBtnWarn}`}
                              title="Change Student Status"
                              onClick={() => handleOpenStatus(student)}
                            >
                              <ShieldAlert size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className={styles.paginationBar}>
              <span>
                Showing {students.length} of {totalStudents} student{totalStudents === 1 ? '' : 's'}
              </span>
              <div className={styles.paginationControls}>
                <button
                  className={styles.pageBtn}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 4px' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  className={styles.pageBtn}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── MODAL: Student Details ── */}
      {detailStudent && (
        <div className={styles.modalOverlay} onClick={() => setDetailStudent(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3>{detailStudent.student_name}</h3>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Admission: {detailStudent.admission_number}
                </span>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setDetailStudent(null)}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Academic Enrollment */}
              <div className={styles.detailSection}>
                <span className={styles.detailSectionTitle}>Academic Enrollment</span>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Class:</span>
                  <span className={styles.detailVal}>{detailStudent.class_name || 'Not assigned'}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Section:</span>
                  <span className={styles.detailVal}>{detailStudent.section_name || 'Not assigned'}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Roll Number:</span>
                  <span className={styles.detailVal}>{detailStudent.roll_number || '—'}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Status:</span>
                  <span className={styles.detailVal}>{getStatusBadge(detailStudent.status)}</span>
                </div>
              </div>

              {/* Personal Demographics */}
              <div className={styles.detailSection}>
                <span className={styles.detailSectionTitle}>Personal Demographics</span>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Email:</span>
                  <span className={styles.detailVal}>{detailStudent.student_email}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Phone:</span>
                  <span className={styles.detailVal}>{detailStudent.student_phone || '—'}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Date of Birth:</span>
                  <span className={styles.detailVal}>
                    {detailStudent.dob ? detailStudent.dob.slice(0, 10) : '—'}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Gender:</span>
                  <span className={styles.detailVal} style={{ textTransform: 'capitalize' }}>
                    {detailStudent.gender || '—'}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Blood Group:</span>
                  <span className={styles.detailVal}>{detailStudent.blood_group || '—'}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Emergency Contact:</span>
                  <span className={styles.detailVal}>{detailStudent.emergency_contact || '—'}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Address:</span>
                  <span className={styles.detailVal}>{detailStudent.address || '—'}</span>
                </div>
              </div>

              {/* Guardian Information */}
              <div className={styles.detailSection}>
                <span className={styles.detailSectionTitle}>Guardian Information</span>
                {detailStudent.parent_name ? (
                  <>
                    <div className={styles.detailRow}>
                      <span className={styles.detailKey}>Parent / Guardian:</span>
                      <span className={styles.detailVal}>{detailStudent.parent_name}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailKey}>Contact Email:</span>
                      <span className={styles.detailVal}>{detailStudent.parent_email}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailKey}>Phone:</span>
                      <span className={styles.detailVal}>{detailStudent.parent_phone || '—'}</span>
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: '0.88rem', color: '#94a3b8' }}>
                    No linked parent profile found for this student.
                  </p>
                )}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDetailStudent(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Edit Personal Details ── */}
      {editStudent && (
        <div className={styles.modalOverlay} onClick={() => !modalSubmitting && setEditStudent(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEdit}>
              <div className={styles.modalHeader}>
                <div>
                  <h3>Edit Student Information</h3>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {editStudent.student_name} ({editStudent.admission_number})
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  disabled={modalSubmitting}
                  onClick={() => setEditStudent(null)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className={styles.modalBody}>
                {modalError && <div className={styles.alertError}>{modalError}</div>}

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Date of Birth (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={editDob}
                      onChange={(e) => setEditDob(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Gender</label>
                    <select
                      className={styles.formInput}
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value as any)}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Roll Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 101"
                      className={styles.formInput}
                      value={editRollNumber}
                      onChange={(e) => setEditRollNumber(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Blood Group</label>
                    <input
                      type="text"
                      placeholder="e.g. O+, B+, A-"
                      className={styles.formInput}
                      value={editBloodGroup}
                      onChange={(e) => setEditBloodGroup(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Emergency Contact (10+ digits)</label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    className={styles.formInput}
                    value={editEmergencyContact}
                    onChange={(e) => setEditEmergencyContact(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Home Address</label>
                  <textarea
                    rows={2}
                    placeholder="Residential address"
                    className={styles.formInput}
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  disabled={modalSubmitting}
                  onClick={() => setEditStudent(null)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn} disabled={modalSubmitting}>
                  {modalSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Change Student Status ── */}
      {statusStudent && (
        <div className={styles.modalOverlay} onClick={() => !modalSubmitting && setStatusStudent(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveStatus}>
              <div className={styles.modalHeader}>
                <div>
                  <h3>Change Student Status</h3>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {statusStudent.student_name} ({statusStudent.admission_number})
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  disabled={modalSubmitting}
                  onClick={() => setStatusStudent(null)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className={styles.modalBody}>
                {modalError && <div className={styles.alertError}>{modalError}</div>}

                <div className={styles.formGroup}>
                  <label>Enrollment Status</label>
                  <select
                    className={styles.formInput}
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                  >
                    <option value="active">Active</option>
                    <option value="transferred">Transferred</option>
                    <option value="graduated">Graduated</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Reason / Audit Remarks (Optional)</label>
                  <textarea
                    rows={3}
                    placeholder="Enter reason for status transition (recorded in audit log)..."
                    className={styles.formInput}
                    value={statusRemarks}
                    onChange={(e) => setStatusRemarks(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  disabled={modalSubmitting}
                  onClick={() => setStatusStudent(null)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn} disabled={modalSubmitting}>
                  {modalSubmitting ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Assign Class & Section ── */}
      {sectionStudent && (
        <div className={styles.modalOverlay} onClick={() => !modalSubmitting && setSectionStudent(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveSection}>
              <div className={styles.modalHeader}>
                <div>
                  <h3>Assign Class & Section</h3>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {sectionStudent.student_name} ({sectionStudent.admission_number})
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  disabled={modalSubmitting}
                  onClick={() => setSectionStudent(null)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className={styles.modalBody}>
                {modalError && <div className={styles.alertError}>{modalError}</div>}

                <div className={styles.formGroup}>
                  <label>Target Class *</label>
                  <select
                    className={styles.formInput}
                    required
                    value={assignClassId}
                    onChange={(e) => {
                      setAssignClassId(e.target.value);
                      setAssignSectionId('');
                    }}
                  >
                    <option value="">Select Class</option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Target Section (Optional)</label>
                  <select
                    className={styles.formInput}
                    value={assignSectionId}
                    disabled={!assignClassId || modalAvailableSections.length === 0}
                    onChange={(e) => setAssignSectionId(e.target.value)}
                  >
                    <option value="">Select Section</option>
                    {modalAvailableSections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        Section {sec.name} {sec.capacity ? `(Capacity: ${sec.capacity})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Roll Number in Section (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 101"
                    className={styles.formInput}
                    value={assignRollNumber}
                    onChange={(e) => setAssignRollNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  disabled={modalSubmitting}
                  onClick={() => setSectionStudent(null)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn} disabled={modalSubmitting}>
                  {modalSubmitting ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
