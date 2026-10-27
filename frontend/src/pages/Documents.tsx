import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  Trash2,
  Search,
  Check,
  X,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import styles from './Documents.module.css';

interface DocumentRecord {
  id: string;
  entity_type: string;
  entity_id: string;
  document_type: string;
  title: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: 'pending' | 'verified' | 'rejected';
  verification_remarks?: string | null;
  verified_at?: string | null;
  created_at: string;
  uploader_name?: string;
  verifier_name?: string;
}

const Documents: React.FC = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadEntityType, setUploadEntityType] = useState<string>('student');
  const [uploadEntityId, setUploadEntityId] = useState<string>('');
  const [uploadDocType, setUploadDocType] = useState<string>('birth_certificate');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Verification modal state
  const [verifyModalDoc, setVerifyModalDoc] = useState<DocumentRecord | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<'verified' | 'rejected'>('verified');
  const [verifyRemarks, setVerifyRemarks] = useState<string>('');
  const [isSubmittingVerify, setIsSubmittingVerify] = useState<boolean>(false);

  const isStaffOrAdmin = ['super_admin', 'principal', 'office_staff'].includes(user?.role || '');

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (entityFilter !== 'all') params.entity_type = entityFilter;

      const res = await apiClient.get('/documents', { params });
      if (res.data?.success) {
        setDocuments(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [search, statusFilter, entityFilter]);

  // Counts
  const totalCount = documents.length;
  const verifiedCount = documents.filter((d) => d.status === 'verified').length;
  const pendingCount = documents.filter((d) => d.status === 'pending').length;
  const rejectedCount = documents.filter((d) => d.status === 'rejected').length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !uploadTitle) return;

    try {
      setIsUploading(true);

      // Convert file to Base64
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          await apiClient.post('/documents', {
            entity_type: uploadEntityType,
            entity_id: uploadEntityId.trim() || user?.id,
            document_type: uploadDocType,
            title: uploadTitle,
            file_name: selectedFile.name,
            file_data: base64Data,
            mime_type: selectedFile.type || 'application/octet-stream'
          });

          setIsUploadOpen(false);
          setSelectedFile(null);
          setUploadTitle('');
          setUploadEntityId('');
          fetchDocuments();
        } catch (uploadErr) {
          console.error('Upload failed:', uploadErr);
          alert('Failed to upload document. Please ensure file is under 10MB.');
        } finally {
          setIsUploading(false);
        }
      };
    } catch (err) {
      console.error('Failed to process file:', err);
      setIsUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentRecord) => {
    try {
      const res = await apiClient.get(`/documents/${doc.id}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.file_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Could not download file.');
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyModalDoc) return;

    try {
      setIsSubmittingVerify(true);
      await apiClient.patch(`/documents/${verifyModalDoc.id}/verify`, {
        status: verifyStatus,
        remarks: verifyRemarks
      });
      setVerifyModalDoc(null);
      setVerifyRemarks('');
      fetchDocuments();
    } catch (err) {
      console.error('Verification failed:', err);
      alert('Failed to update verification status.');
    } finally {
      setIsSubmittingVerify(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this document?')) return;
    try {
      await apiClient.delete(`/documents/${id}`);
      fetchDocuments();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete document.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Document Management</h1>
          <p className={styles.subtitle}>
            Upload, verify, and securely manage academic, student, and staff records
          </p>
        </div>
        <div className={styles.actionGroup}>
          <button className={styles.primaryBtn} onClick={() => setIsUploadOpen(true)}>
            <Upload size={18} />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: '#e0e7ff', color: '#4f46e5' }}>
            <FileText size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Documents</span>
            <span className={styles.kpiValue}>{totalCount}</span>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: '#dcfce7', color: '#16a34a' }}>
            <CheckCircle2 size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Verified</span>
            <span className={styles.kpiValue}>{verifiedCount}</span>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
            <Clock size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Pending Review</span>
            <span className={styles.kpiValue}>{pendingCount}</span>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: '#fee2e2', color: '#dc2626' }}>
            <AlertCircle size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Rejected</span>
            <span className={styles.kpiValue}>{rejectedCount}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by title or filename..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          className={styles.filterSelect}
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
        >
          <option value="all">All Entity Types</option>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admission">Admission</option>
          <option value="general">General</option>
        </select>
      </div>

      {/* Documents Table */}
      <div className={styles.tableContainer}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#6366f1' }}>
            <Loader2 size={32} className="animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <FileText size={32} />
            </div>
            <h3>No documents found</h3>
            <p>Upload a new certificate or mark sheet to get started.</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Entity Type</th>
                <th>Doc Type</th>
                <th>Size</th>
                <th>Status</th>
                <th>Uploaded By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <div className={styles.docTitleCell}>
                      <div className={styles.docIcon}>
                        <FileText size={18} />
                      </div>
                      <div>
                        <div className={styles.docTitle}>{doc.title}</div>
                        <div className={styles.docFileName}>{doc.file_name}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeType}`}>
                      {doc.entity_type}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeType}`}>
                      {doc.document_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{formatFileSize(doc.file_size)}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        doc.status === 'verified'
                          ? styles.badgeVerified
                          : doc.status === 'rejected'
                          ? styles.badgeRejected
                          : styles.badgePending
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td>{doc.uploader_name || 'System'}</td>
                  <td>
                    <div className={styles.actionsCell}>
                      <button
                        className={styles.iconActionBtn}
                        onClick={() => handleDownload(doc)}
                        title="Download file"
                      >
                        <Download size={16} />
                      </button>
                      {isStaffOrAdmin && doc.status === 'pending' && (
                        <>
                          <button
                            className={`${styles.iconActionBtn} ${styles.verifyBtn}`}
                            onClick={() => {
                              setVerifyModalDoc(doc);
                              setVerifyStatus('verified');
                            }}
                            title="Verify document"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            className={`${styles.iconActionBtn} ${styles.rejectBtn}`}
                            onClick={() => {
                              setVerifyModalDoc(doc);
                              setVerifyStatus('rejected');
                            }}
                            title="Reject document"
                          >
                            <X size={16} />
                          </button>
                        </>
                      )}
                      {(isStaffOrAdmin || doc.status === 'pending') && (
                        <button
                          className={styles.iconActionBtn}
                          onClick={() => handleDelete(doc.id)}
                          title="Delete document"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload Document Modal */}
      {isUploadOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsUploadOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Upload Document</h2>
              <button className={styles.closeModalBtn} onClick={() => setIsUploadOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Title *</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g. Birth Certificate"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Entity Type *</label>
                  <select
                    className={styles.formSelect}
                    value={uploadEntityType}
                    onChange={(e) => setUploadEntityType(e.target.value)}
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admission">Admission Application</option>
                    <option value="general">General</option>
                  </select>
                </div>

                {isStaffOrAdmin && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Target Entity UUID (Optional)</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="Leave blank to default to your user ID"
                      value={uploadEntityId}
                      onChange={(e) => setUploadEntityId(e.target.value)}
                    />
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Document Type *</label>
                  <select
                    className={styles.formSelect}
                    value={uploadDocType}
                    onChange={(e) => setUploadDocType(e.target.value)}
                  >
                    <option value="birth_certificate">Birth Certificate</option>
                    <option value="transfer_certificate">Transfer Certificate</option>
                    <option value="mark_sheet">Mark Sheet</option>
                    <option value="id_proof">ID Proof</option>
                    <option value="qualification">Degree / Qualification</option>
                    <option value="resume">Resume / CV</option>
                    <option value="other">Other Document</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>File *</label>
                  <div
                    className={styles.fileDropArea}
                    onClick={() => document.getElementById('docFileInput')?.click()}
                  >
                    <Upload size={24} style={{ color: '#6366f1', marginBottom: '8px' }} />
                    <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: '#334155' }}>
                      {selectedFile ? selectedFile.name : 'Click to browse file'}
                    </p>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      PDF, JPG, PNG up to 10MB
                    </span>
                    <input
                      id="docFileInput"
                      type="file"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsUploadOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isUploading || !selectedFile}
                >
                  {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verify / Reject Modal */}
      {verifyModalDoc && (
        <div className={styles.modalBackdrop} onClick={() => setVerifyModalDoc(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {verifyStatus === 'verified' ? 'Verify Document' : 'Reject Document'}
              </h2>
              <button className={styles.closeModalBtn} onClick={() => setVerifyModalDoc(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleVerifySubmit}>
              <div className={styles.modalBody}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
                  Document: <strong>{verifyModalDoc.title}</strong> ({verifyModalDoc.file_name})
                </p>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Action *</label>
                  <select
                    className={styles.formSelect}
                    value={verifyStatus}
                    onChange={(e) => setVerifyStatus(e.target.value as any)}
                  >
                    <option value="verified">Approve & Mark Verified</option>
                    <option value="rejected">Reject Document</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Verification Remarks {verifyStatus === 'rejected' && '*'}
                  </label>
                  <textarea
                    rows={3}
                    className={styles.formTextarea}
                    placeholder="Enter reason or verification notes..."
                    value={verifyRemarks}
                    onChange={(e) => setVerifyRemarks(e.target.value)}
                    required={verifyStatus === 'rejected'}
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setVerifyModalDoc(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  style={
                    verifyStatus === 'rejected'
                      ? { background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }
                      : undefined
                  }
                  disabled={isSubmittingVerify}
                >
                  {isSubmittingVerify ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  <span>{verifyStatus === 'verified' ? 'Confirm Verification' : 'Confirm Rejection'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
