import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard,
  Receipt,
  FileSpreadsheet,
  AlertTriangle,
  Search,
  CheckCircle2,
  Clock,
  X,
  Printer,
  RotateCcw,
  Plus,
  ShieldAlert,
  ArrowRight,
  DollarSign,
  Building,
  User,
  AlertCircle
} from 'lucide-react';
import styles from './Fees.module.css';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface StudentOption {
  id: string;
  student_name: string;
  admission_number: string;
  roll_number?: string | null;
  class_name?: string | null;
}

export interface StudentFeeSummary {
  student: {
    name: string;
    admission_number: string;
    roll_number: string;
    email?: string;
  };
  academic_year: string;
  academic_year_id?: string;
  fee_structure: string;
  fee_structure_id?: string;
  class_name: string;
  due_date: string;
  total_owed: number;
  total_paid: number;
  uncleared_cheques_amount?: number;
  advance_credit: number;
  balance_due: number;
  is_overdue: boolean;
  status: 'paid' | 'overdue' | 'pending';
  payments: PaymentRecord[];
}

export interface PaymentRecord {
  id: string;
  receipt_number: string;
  amount_paid: string | number;
  payment_mode: 'cash' | 'cheque' | 'bank_transfer';
  payment_date: string;
  cheque_number?: string | null;
  bank_name?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  status: 'completed' | 'reversed' | 'bounced';
  cheque_status?: 'received' | 'deposited' | 'cleared' | 'bounced' | null;
  cheque_cleared_at?: string | null;
  cheque_bounce_reason?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversed_by_name?: string | null;
  reversal_reason?: string | null;
  student_name?: string;
  admission_number?: string;
  roll_number?: string;
  class_name?: string;
  academic_year_name?: string;
  collected_by_name?: string;
  created_at: string;
}

export interface ReceiptDetail {
  id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: string;
  amount_paid: number;
  cheque_number?: string | null;
  bank_name?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  collected_by?: string | null;
  status: 'completed' | 'reversed' | 'bounced';
  is_void: boolean;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  cheque_status?: string | null;
  cheque_cleared_at?: string | null;
  cheque_bounce_reason?: string | null;
}

export interface ReceiptData {
  receipt: ReceiptDetail;
  student: {
    name: string;
    admission_number: string;
    roll_number: string;
    class: string;
    academic_year: string;
  };
  fee_breakdown: Array<{ name: string; amount: number; is_optional: boolean }>;
  financial_summary?: {
    total_fee_owed: number;
    cumulative_paid: number;
    advance_credit: number;
    balance_remaining: number;
    settlement_status: string;
  };
  fee_structure: string;
  due_date: string;
}

export interface FeeStructure {
  id: string;
  name: string;
  class_id: string;
  class_name: string;
  academic_year_id: string;
  academic_year_name: string;
  due_date: string;
  total_amount: number;
  description?: string;
  components?: Array<{ id: string; name: string; amount: number; is_optional: boolean }>;
}

export interface AnalyticsSummary {
  total_students_with_fees: number;
  total_fees_expected: number;
  total_collected: number;
  total_pending: number;
  overdue_count: number;
  total_overdue_amount: number;
  collection_rate_percent: number;
}

export interface DueRecord {
  student_id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  academic_year: string;
  total_owed: string | number;
  total_paid: string | number;
  advance_credit: string | number;
  balance_due: string | number;
  overdue_amount?: string | number;
  due_date: string;
  days_overdue?: number;
  is_overdue: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

const Fees: React.FC = () => {
  const { user } = useAuth();
  const userRole = user?.role || '';
  const isSuperOrPrincipal = ['super_admin', 'principal'].includes(userRole);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'desk' | 'ledger' | 'structures' | 'dues'>('desk');

  // Shared master data
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);

  // Tab 1: Cashier Collection Desk state
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [showStudentDropdown, setShowStudentDropdown] = useState<boolean>(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSummary, setStudentSummary] = useState<StudentFeeSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);

  // Payment Form state
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'cheque' | 'bank_transfer'>('cash');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submittingPayment, setSubmittingPayment] = useState<boolean>(false);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);
  const [paymentErrorMsg, setPaymentErrorMsg] = useState<string | null>(null);

  // Tab 2: Transaction Ledger state
  const [ledgerPayments, setLedgerPayments] = useState<PaymentRecord[]>([]);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(false);
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<string>('');
  const [ledgerModeFilter, setLedgerModeFilter] = useState<string>('');
  const [ledgerChequeFilter, setLedgerChequeFilter] = useState<string>('');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const [ledgerTotalPages, setLedgerTotalPages] = useState<number>(1);
  const [ledgerTotalRecords, setLedgerTotalRecords] = useState<number>(0);

  // Tab 3: Fee Structures state
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [loadingStructures, setLoadingStructures] = useState<boolean>(false);
  const [showCreateStructureModal, setShowCreateStructureModal] = useState<boolean>(false);
  const [newStructureName, setNewStructureName] = useState<string>('');
  const [newStructureClassId, setNewStructureClassId] = useState<string>('');
  const [newStructureDueDate, setNewStructureDueDate] = useState<string>('');
  const [newStructureDescription, setNewStructureDescription] = useState<string>('');
  const [newComponents, setNewComponents] = useState<Array<{ name: string; amount: number; is_optional: boolean }>>([
    { name: 'Tuition Fee', amount: 20000, is_optional: false },
    { name: 'Exam Fee', amount: 3000, is_optional: false },
  ]);
  const [submittingStructure, setSubmittingStructure] = useState<boolean>(false);

  // Assign Fee Modal state
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [assignStudentId, setAssignStudentId] = useState<string>('');
  const [assignStructureId, setAssignStructureId] = useState<string>('');
  const [submittingAssign, setSubmittingAssign] = useState<boolean>(false);

  // Tab 4: Dues & Analytics state
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [duesList, setDuesList] = useState<DueRecord[]>([]);
  const [loadingDues, setLoadingDues] = useState<boolean>(false);
  const [duesClassFilter, setDuesClassFilter] = useState<string>('');
  const [duesType, setDuesType] = useState<'pending' | 'overdue'>('pending');

  // Modals: Reversal, Cheque Status, Printable Receipt
  const [receiptModalData, setReceiptModalData] = useState<ReceiptData | null>(null);

  const [reversalTargetPayment, setReversalTargetPayment] = useState<PaymentRecord | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [submittingReversal, setSubmittingReversal] = useState<boolean>(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const [chequeTargetPayment, setChequeTargetPayment] = useState<PaymentRecord | null>(null);
  const [newChequeStatus, setNewChequeStatus] = useState<'deposited' | 'cleared' | 'bounced'>('deposited');
  const [chequeClearedDate, setChequeClearedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [chequeBounceReason, setChequeBounceReason] = useState<string>('');
  const [submittingChequeStatus, setSubmittingChequeStatus] = useState<boolean>(false);
  const [chequeStatusError, setChequeStatusError] = useState<string | null>(null);

  // ─── Initial Load ───────────────────────────────────────────────────────────

  useEffect(() => {
    // Load Academic Years
    apiClient.get('/academic/academic-years').then((res) => {
      const years = res.data?.data?.academic_years || [];
      setAcademicYears(years);
      const curr = years.find((y: AcademicYear) => y.is_current) || years[0];
      if (curr) setSelectedYearId(curr.id);
    }).catch(console.error);

    // Load Classes
    apiClient.get('/academic/classes').then((res) => {
      setClasses(res.data?.data?.classes || []);
    }).catch(console.error);

    // Load Students list for autocomplete
    apiClient.get('/students?limit=100').then((res) => {
      setStudents(res.data?.data?.students || []);
    }).catch(console.error);
  }, []);

  // ─── Load Student Summary (Cashier Desk) ────────────────────────────────────

  const fetchStudentSummary = useCallback(async (studentId: string) => {
    if (!studentId) {
      setStudentSummary(null);
      return;
    }
    setLoadingSummary(true);
    setPaymentErrorMsg(null);
    setPaymentSuccessMsg(null);
    try {
      const res = await apiClient.get(`/fees/student/${studentId}`, {
        params: { academic_year_id: selectedYearId || undefined }
      });
      if (res.data?.success) {
        setStudentSummary(res.data.data);
      } else {
        setStudentSummary(null);
      }
    } catch (err: any) {
      setStudentSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedYearId]);

  useEffect(() => {
    if (selectedStudentId) {
      fetchStudentSummary(selectedStudentId);
    }
  }, [selectedStudentId, fetchStudentSummary]);

  // ─── Load Transaction Ledger ───────────────────────────────────────────────

  const fetchLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const res = await apiClient.get('/fees/payments', {
        params: {
          academic_year_id: selectedYearId || undefined,
          status: ledgerStatusFilter || undefined,
          payment_mode: ledgerModeFilter || undefined,
          cheque_status: ledgerChequeFilter || undefined,
          search: ledgerSearch || undefined,
          page: ledgerPage,
          limit: 15,
        }
      });
      if (res.data?.success) {
        setLedgerPayments(res.data.data.payments || []);
        setLedgerTotalPages(res.data.data.total_pages || 1);
        setLedgerTotalRecords(res.data.data.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLedger(false);
    }
  }, [selectedYearId, ledgerStatusFilter, ledgerModeFilter, ledgerChequeFilter, ledgerSearch, ledgerPage]);

  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchLedger();
    }
  }, [activeTab, fetchLedger]);

  // ─── Load Fee Structures ───────────────────────────────────────────────────

  const fetchStructures = useCallback(async () => {
    setLoadingStructures(true);
    try {
      const res = await apiClient.get('/fees/structures', {
        params: { academic_year_id: selectedYearId || undefined }
      });
      if (res.data?.success) {
        setStructures(res.data.data.structures || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStructures(false);
    }
  }, [selectedYearId]);

  useEffect(() => {
    if (activeTab === 'structures') {
      fetchStructures();
    }
  }, [activeTab, fetchStructures]);

  // ─── Load Dues & Analytics ─────────────────────────────────────────────────

  const fetchDuesAndAnalytics = useCallback(async () => {
    setLoadingDues(true);
    try {
      const [analyticsRes, duesRes] = await Promise.all([
        apiClient.get('/fees/analytics/summary', { params: { academic_year_id: selectedYearId || undefined } }),
        apiClient.get(duesType === 'overdue' ? '/fees/dues/overdue' : '/fees/dues/pending', {
          params: { academic_year_id: selectedYearId || undefined, class_id: duesClassFilter || undefined }
        })
      ]);
      if (analyticsRes.data?.success) {
        setAnalytics(analyticsRes.data.data.summary);
      }
      if (duesRes.data?.success) {
        setDuesList(duesRes.data.data.students || duesRes.data.data.overdue_students || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDues(false);
    }
  }, [selectedYearId, duesType, duesClassFilter]);

  useEffect(() => {
    if (activeTab === 'dues') {
      fetchDuesAndAnalytics();
    }
  }, [activeTab, fetchDuesAndAnalytics]);

  // ─── Record Payment Handler ────────────────────────────────────────────────

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !amountPaid || parseFloat(amountPaid) <= 0) {
      setPaymentErrorMsg('Please select a student and enter a valid positive payment amount.');
      return;
    }

    const targetAcademicYearId = studentSummary?.academic_year_id || selectedYearId;
    if (!targetAcademicYearId) {
      setPaymentErrorMsg('Please ensure an academic year is selected before recording payment.');
      return;
    }

    setSubmittingPayment(true);
    setPaymentErrorMsg(null);
    setPaymentSuccessMsg(null);

    // Concurrency safe client idempotency key
    const idempotencyKey = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await apiClient.post(
        '/fees/payments',
        {
          student_id: selectedStudentId,
          academic_year_id: targetAcademicYearId,
          amount_paid: parseFloat(amountPaid),
          payment_mode: paymentMode,
          payment_date: paymentDate,
          cheque_number: paymentMode === 'cheque' ? chequeNumber : undefined,
          bank_name: paymentMode === 'cheque' ? bankName : undefined,
          reference_number: paymentMode === 'bank_transfer' ? referenceNumber : undefined,
          notes: notes || undefined,
          idempotency_key: idempotencyKey,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } }
      );

      if (res.data?.success) {
        const recordedPayment = res.data.data.payment;
        setPaymentSuccessMsg(`Payment of ₹${parseFloat(amountPaid).toLocaleString()} recorded successfully! Receipt: ${recordedPayment.receipt_number}`);
        // Reset form
        setAmountPaid('');
        setChequeNumber('');
        setBankName('');
        setReferenceNumber('');
        setNotes('');

        // Refresh student summary
        fetchStudentSummary(selectedStudentId);

        // Automatically open the printable receipt modal
        openReceiptModal(recordedPayment.id);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to record payment. Please review details.';
      const validationDetails = err.response?.data?.data?.errors
        ?.map((e: any) => `${e.field ? `${e.field}: ` : ''}${e.message}`)
        ?.join('; ');
      setPaymentErrorMsg(validationDetails ? `${msg} (${validationDetails})` : msg);
    } finally {
      setSubmittingPayment(false);
    }
  };

  // ─── Receipt Modal Handler ─────────────────────────────────────────────────

  const openReceiptModal = async (paymentId: string) => {
    try {
      const res = await apiClient.get(`/fees/receipts/${paymentId}`);
      if (res.data?.success) {
        setReceiptModalData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load receipt:', err);
    }
  };

  // ─── Reversal Handler ──────────────────────────────────────────────────────

  const handleExecuteReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalTargetPayment) return;
    if (!reversalReason || reversalReason.trim().length < 10) {
      setReversalError('Reversal reason is mandatory and must be at least 10 characters.');
      return;
    }

    setSubmittingReversal(true);
    setReversalError(null);
    try {
      const res = await apiClient.post(`/fees/payments/${reversalTargetPayment.id}/reverse`, {
        reason: reversalReason.trim(),
      });
      if (res.data?.success) {
        setReversalTargetPayment(null);
        setReversalReason('');
        // Refresh appropriate view
        if (activeTab === 'ledger') fetchLedger();
        if (selectedStudentId) fetchStudentSummary(selectedStudentId);
      }
    } catch (err: any) {
      setReversalError(err.response?.data?.message || 'Failed to reverse payment.');
    } finally {
      setSubmittingReversal(false);
    }
  };

  // ─── Cheque Status Update Handler ──────────────────────────────────────────

  const handleExecuteChequeStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chequeTargetPayment) return;
    if (newChequeStatus === 'bounced' && (!chequeBounceReason || chequeBounceReason.trim().length === 0)) {
      setChequeStatusError('Bounce reason is mandatory when marking a cheque as bounced.');
      return;
    }

    setSubmittingChequeStatus(true);
    setChequeStatusError(null);
    try {
      const res = await apiClient.patch(`/fees/payments/${chequeTargetPayment.id}/cheque-status`, {
        status: newChequeStatus,
        cleared_at: newChequeStatus === 'cleared' ? chequeClearedDate : undefined,
        bounce_reason: newChequeStatus === 'bounced' ? chequeBounceReason.trim() : undefined,
      });
      if (res.data?.success) {
        setChequeTargetPayment(null);
        setChequeBounceReason('');
        if (activeTab === 'ledger') fetchLedger();
        if (selectedStudentId) fetchStudentSummary(selectedStudentId);
      }
    } catch (err: any) {
      setChequeStatusError(err.response?.data?.message || 'Failed to update cheque status.');
    } finally {
      setSubmittingChequeStatus(false);
    }
  };

  // ─── Create Fee Structure Handler ──────────────────────────────────────────

  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStructureName || !newStructureClassId || !newStructureDueDate || newComponents.length === 0) {
      alert('Please fill all mandatory fields and at least one fee component.');
      return;
    }
    setSubmittingStructure(true);
    try {
      const res = await apiClient.post('/fees/structures', {
        name: newStructureName,
        class_id: newStructureClassId,
        academic_year_id: selectedYearId,
        due_date: newStructureDueDate,
        description: newStructureDescription,
        components: newComponents,
      });
      if (res.data?.success) {
        setShowCreateStructureModal(false);
        setNewStructureName('');
        setNewStructureDescription('');
        fetchStructures();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create fee structure');
    } finally {
      setSubmittingStructure(false);
    }
  };

  // ─── Assign Fee to Student Handler ─────────────────────────────────────────

  const handleAssignFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignStudentId || !assignStructureId) {
      alert('Please select both a student and a fee structure.');
      return;
    }
    setSubmittingAssign(true);
    try {
      const res = await apiClient.post('/fees/assign', {
        student_id: assignStudentId,
        fee_structure_id: assignStructureId,
        academic_year_id: selectedYearId,
      });
      if (res.data?.success) {
        alert('Fee structure assigned successfully!');
        setShowAssignModal(false);
        setAssignStudentId('');
        setAssignStructureId('');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to assign fee');
    } finally {
      setSubmittingAssign(false);
    }
  };

  // Filter students for search dropdown
  const filteredStudentOptions = useMemo(() => {
    if (!studentSearch.trim()) return students.slice(0, 10);
    const q = studentSearch.toLowerCase();
    return students.filter(s =>
      s.student_name.toLowerCase().includes(q) ||
      s.admission_number.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [students, studentSearch]);

  return (
    <div className={styles.container}>
      {/* ── Top Header ────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Fee Management & Financial Operations</h1>
          <p className={styles.subtitle}>
            Module 12 • Real-time collections desk, audit ledger, payment reversals, and cheque clearing
          </p>
        </div>

        {/* Academic Year Selector */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>Academic Year:</label>
          <select
            className={styles.formSelect}
            style={{ width: '160px' }}
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
          >
            {academicYears.map((ay) => (
              <option key={ay.id} value={ay.id}>
                {ay.name} {ay.is_current ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Navigation Tabs ───────────────────────────────────────── */}
      <div className={styles.tabNav}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'desk' ? styles.activeTabBtn : ''}`}
          onClick={() => setActiveTab('desk')}
        >
          <CreditCard size={18} />
          Cashier Collection Desk
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'ledger' ? styles.activeTabBtn : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          <Receipt size={18} />
          Transaction & Audit Ledger
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'structures' ? styles.activeTabBtn : ''}`}
          onClick={() => setActiveTab('structures')}
        >
          <FileSpreadsheet size={18} />
          Fee Structures & Cohorts
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'dues' ? styles.activeTabBtn : ''}`}
          onClick={() => setActiveTab('dues')}
        >
          <AlertTriangle size={18} />
          Dues & Defaulters Registry
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════
          TAB 1: CASHIER COLLECTION DESK
      ════════════════════════════════════════════════════════════ */}
      {activeTab === 'desk' && (
        <div className={styles.deskLayout}>
          {/* Left Column: Student Lookup & Ledger Snapshot */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              <User size={20} color="#2563eb" />
              Student Fee Account Lookup
            </h2>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Search Student (Name or Admission Number)</label>
              <div className={styles.searchBox}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Type student name or admission number..."
                  value={studentSearch}
                  onFocus={() => setShowStudentDropdown(true)}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setShowStudentDropdown(true);
                  }}
                />
              </div>

              {showStudentDropdown && studentSearch.trim() && (
                <div style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  marginTop: '6px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  background: '#ffffff'
                }}>
                  {filteredStudentOptions.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: '0.8125rem', color: '#94a3b8' }}>No students found.</div>
                  ) : (
                    filteredStudentOptions.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setSelectedStudentId(s.id);
                          setStudentSearch(`${s.student_name} (${s.admission_number})`);
                          setShowStudentDropdown(false);
                        }}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          borderBottom: '1px solid #f1f5f9',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{s.student_name}</span>
                        <span style={{ color: '#64748b' }}>Adm: {s.admission_number} | {s.class_name || 'N/A'}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {loadingSummary && (
              <div style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>Loading fee account snapshot...</div>
            )}

            {studentSummary && (
              <div className={styles.dueCard}>
                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{studentSummary.student.name}</div>
                  <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                    Admission: {studentSummary.student.admission_number} | Roll: {studentSummary.student.roll_number || 'N/A'} | Class: {studentSummary.class_name}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '2px' }}>
                    Structure: <strong>{studentSummary.fee_structure}</strong> (Due Date: {studentSummary.due_date})
                  </div>
                </div>

                <div className={styles.dueRow}>
                  <span className={styles.dueLabel}>Total Fee Owed:</span>
                  <span className={styles.dueVal}>₹{studentSummary.total_owed.toLocaleString()}</span>
                </div>
                <div className={styles.dueRow}>
                  <span className={styles.dueLabel}>Realized Collected:</span>
                  <span className={styles.dueVal} style={{ color: '#059669' }}>
                    ₹{studentSummary.total_paid.toLocaleString()}
                  </span>
                </div>
                {studentSummary.uncleared_cheques_amount ? (
                  <div className={styles.dueRow}>
                    <span className={styles.dueLabel}>Uncleared Cheques:</span>
                    <span className={styles.dueVal} style={{ color: '#d97706' }}>
                      ₹{studentSummary.uncleared_cheques_amount.toLocaleString()} (Pending)
                    </span>
                  </div>
                ) : null}
                <div className={styles.dueRow}>
                  <span className={styles.dueLabel}>Advance Credit Ledger:</span>
                  <span className={styles.advanceHighlight}>₹{studentSummary.advance_credit.toLocaleString()}</span>
                </div>
                <div className={styles.dueRow} style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '4px' }}>
                  <span className={styles.dueLabel} style={{ fontWeight: 700 }}>Active Balance Due:</span>
                  <span className={styles.dueHighlight}>₹{studentSummary.balance_due.toLocaleString()}</span>
                </div>

                {/* Recent Payments History for this student */}
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                    Recent Transactions
                  </div>
                  {studentSummary.payments.length === 0 ? (
                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>No payment records found.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {studentSummary.payments.slice(0, 4).map((p) => (
                        <div
                          key={p.id}
                          style={{
                            padding: '8px 10px',
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.8125rem'
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600 }}>{p.receipt_number}</span>
                            <span style={{ color: '#64748b', marginLeft: '6px' }}>({p.payment_mode})</span>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{p.payment_date}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: 700 }}>₹{parseFloat(p.amount_paid as string).toLocaleString()}</span>
                            <div>
                              <span className={`${styles.badge} ${
                                p.status === 'completed'
                                  ? (p.payment_mode === 'cheque' && p.cheque_status !== 'cleared' ? styles.badgeWarning : styles.badgeSuccess)
                                  : styles.badgeDanger
                              }`}>
                                {p.status === 'reversed' ? 'Reversed' : p.status === 'bounced' ? 'Bounced' : p.payment_mode === 'cheque' ? p.cheque_status : 'Completed'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Collect Payment Form */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              <CreditCard size={20} color="#059669" />
              Record New Fee Payment
            </h2>

            {paymentSuccessMsg && (
              <div style={{
                background: '#dcfce7',
                border: '1px solid #86efac',
                color: '#15803d',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '0.875rem'
              }}>
                <CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                {paymentSuccessMsg}
              </div>
            )}

            {paymentErrorMsg && (
              <div style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '0.875rem'
              }}>
                <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                {paymentErrorMsg}
              </div>
            )}

            <form onSubmit={handleRecordPayment}>
              {/* Payment Mode Selector */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Payment Method</label>
                <div className={styles.paymentModeSelector}>
                  <div
                    className={`${styles.modeOption} ${paymentMode === 'cash' ? styles.modeActive : ''}`}
                    onClick={() => setPaymentMode('cash')}
                  >
                    <DollarSign size={20} />
                    <span>Cash</span>
                  </div>
                  <div
                    className={`${styles.modeOption} ${paymentMode === 'cheque' ? styles.modeActive : ''}`}
                    onClick={() => setPaymentMode('cheque')}
                  >
                    <Building size={20} />
                    <span>Cheque</span>
                  </div>
                  <div
                    className={`${styles.modeOption} ${paymentMode === 'bank_transfer' ? styles.modeActive : ''}`}
                    onClick={() => setPaymentMode('bank_transfer')}
                  >
                    <CreditCard size={20} />
                    <span>Bank Transfer</span>
                  </div>
                </div>
              </div>

              {/* Amount & Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    className={styles.formInput}
                    placeholder="Enter amount"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Payment Date *</label>
                  <input
                    type="date"
                    className={styles.formInput}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Dynamic Cheque Fields */}
              {paymentMode === 'cheque' && (
                <div style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '8px',
                  padding: '14px',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1d4ed8', marginBottom: '8px' }}>
                    Cheque Lifecycle Details (Initial Status: Received)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className={styles.formLabel}>Cheque Number *</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="e.g. CHQ-004521"
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className={styles.formLabel}>Bank Name *</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="e.g. State Bank of India"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Dynamic Bank Transfer Field */}
              {paymentMode === 'bank_transfer' && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Reference / UTR Number *</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g. UTR12873491278"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Notes */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Receipt Remarks / Notes</label>
                <textarea
                  className={styles.formTextarea}
                  placeholder="Optional remarks (e.g. Term 1 installments, collected by cashier)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className={styles.btnPrimary}
                style={{ width: '100%', padding: '12px' }}
                disabled={submittingPayment || !selectedStudentId}
              >
                {submittingPayment ? 'Processing Transaction...' : 'Record Payment & Generate Official Receipt'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 2: TRANSACTION & AUDIT LEDGER
      ════════════════════════════════════════════════════════════ */}
      {activeTab === 'ledger' && (
        <div className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className={styles.cardTitle} style={{ margin: 0 }}>
              <Receipt size={20} color="#2563eb" />
              Transaction & Audit Ledger ({ledgerTotalRecords} records)
            </h2>
            <button className={styles.btnSecondary} onClick={fetchLedger}>
              <RotateCcw size={16} />
              Refresh
            </button>
          </div>

          {/* Filters Bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchBox}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search receipt #, student name, admission #..."
                value={ledgerSearch}
                onChange={(e) => {
                  setLedgerSearch(e.target.value);
                  setLedgerPage(1);
                }}
              />
            </div>

            <select
              className={styles.formSelect}
              style={{ width: '140px' }}
              value={ledgerStatusFilter}
              onChange={(e) => {
                setLedgerStatusFilter(e.target.value);
                setLedgerPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="reversed">Reversed</option>
              <option value="bounced">Bounced</option>
            </select>

            <select
              className={styles.formSelect}
              style={{ width: '140px' }}
              value={ledgerModeFilter}
              onChange={(e) => {
                setLedgerModeFilter(e.target.value);
                setLedgerPage(1);
              }}
            >
              <option value="">All Modes</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>

            <select
              className={styles.formSelect}
              style={{ width: '150px' }}
              value={ledgerChequeFilter}
              onChange={(e) => {
                setLedgerChequeFilter(e.target.value);
                setLedgerPage(1);
              }}
            >
              <option value="">Cheque Status</option>
              <option value="received">Received</option>
              <option value="deposited">Deposited</option>
              <option value="cleared">Cleared</option>
              <option value="bounced">Bounced</option>
            </select>
          </div>

          {/* Ledger Table */}
          <div className={`${styles.tableContainer} ${styles.tableContainerWithPagination}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Mode & Cheque</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Collected By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingLedger ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                      Loading ledger transactions...
                    </td>
                  </tr>
                ) : ledgerPayments.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                      No transactions matched the selected filters.
                    </td>
                  </tr>
                ) : (
                  ledgerPayments.map((p) => {
                    const isReversed = p.status === 'reversed';
                    return (
                      <tr key={p.id}>
                        <td className={styles.receiptCell}>
                          <span style={{ color: isReversed ? '#dc2626' : '#2563eb' }}>
                            {p.receipt_number}
                          </span>
                        </td>
                        <td className={styles.nowrapCell}>
                          {p.payment_date ? p.payment_date.slice(0, 10) : 'N/A'}
                        </td>
                        <td className={styles.studentCell}>
                          <div style={{ fontWeight: 600 }}>{p.student_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Adm: {p.admission_number}</div>
                        </td>
                        <td className={styles.classCell} title={p.class_name || 'N/A'}>
                          {p.class_name || 'N/A'}
                        </td>
                        <td className={styles.nowrapCell}>
                          <div style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                            {p.payment_mode.replace('_', ' ')}
                          </div>
                          {p.payment_mode === 'cheque' && (
                            <div style={{ marginTop: '3px' }}>
                              <span className={`${styles.badge} ${
                                p.cheque_status === 'cleared' ? styles.badgeSuccess :
                                p.cheque_status === 'bounced' ? styles.badgeDanger :
                                p.cheque_status === 'deposited' ? styles.badgeInfo : styles.badgeWarning
                              }`} style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                                {p.cheque_status || 'received'}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className={styles.nowrapCell}>
                          <span style={{
                            fontWeight: 700,
                            textDecoration: isReversed ? 'line-through' : 'none',
                            color: isReversed ? '#94a3b8' : '#0f172a'
                          }}>
                            ₹{parseFloat(p.amount_paid as string).toLocaleString()}
                          </span>
                        </td>
                        <td className={styles.nowrapCell}>
                          <span className={`${styles.badge} ${
                            p.status === 'completed'
                              ? (p.payment_mode === 'cheque' && p.cheque_status !== 'cleared' ? styles.badgeWarning : styles.badgeSuccess)
                              : styles.badgeDanger
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className={styles.nowrapCell} style={{ fontSize: '0.8125rem' }}>
                          {p.collected_by_name || 'System'}
                        </td>
                        <td className={styles.nowrapCell}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {/* View Receipt */}
                            <button
                              className={styles.btnSecondary}
                              style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                              onClick={() => openReceiptModal(p.id)}
                              title="View & Print Official Receipt"
                            >
                              <Printer size={14} />
                              Receipt
                            </button>

                            {/* Cheque Lifecycle Update */}
                            {p.payment_mode === 'cheque' && p.cheque_status !== 'cleared' && p.cheque_status !== 'bounced' && !isReversed && (
                              <button
                                className={styles.btnWarning}
                                style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setChequeTargetPayment(p);
                                  setNewChequeStatus('deposited');
                                }}
                                title="Update Cheque Clearance Status"
                              >
                                Cheque Status
                              </button>
                            )}

                            {/* Reverse Payment (Super Admin & Principal only) */}
                            {isSuperOrPrincipal && !isReversed && (
                              <button
                                className={styles.btnDanger}
                                style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setReversalTargetPayment(p);
                                  setReversalReason('');
                                  setReversalError(null);
                                }}
                                title="Reverse Payment"
                              >
                                Reverse
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className={styles.pagination}>
            <span>Page {ledgerPage} of {ledgerTotalPages}</span>
            <div className={styles.pageButtons}>
              <button
                className={styles.btnSecondary}
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                disabled={ledgerPage <= 1}
                onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className={styles.btnSecondary}
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                disabled={ledgerPage >= ledgerTotalPages}
                onClick={() => setLedgerPage(p => Math.min(ledgerTotalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 3: FEE STRUCTURES & COHORTS
      ════════════════════════════════════════════════════════════ */}
      {activeTab === 'structures' && (
        <div className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 className={styles.cardTitle} style={{ margin: 0 }}>
              <FileSpreadsheet size={20} color="#2563eb" />
              Fee Structures ({structures.length})
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={styles.btnSecondary} onClick={() => setShowAssignModal(true)}>
                <User size={16} />
                Assign Fee to Student
              </button>
              <button className={styles.btnPrimary} onClick={() => setShowCreateStructureModal(true)}>
                <Plus size={16} />
                Create Fee Structure
              </button>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Structure Name</th>
                  <th>Class</th>
                  <th>Academic Year</th>
                  <th>Due Date</th>
                  <th>Total Fee (₹)</th>
                  <th>Component Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {loadingStructures ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>Loading fee structures...</td>
                  </tr>
                ) : structures.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                      No fee structures configured for this academic year.
                    </td>
                  </tr>
                ) : (
                  structures.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td>{s.class_name}</td>
                      <td>{s.academic_year_name}</td>
                      <td>{s.due_date}</td>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>₹{parseFloat(s.total_amount as any).toLocaleString()}</td>
                      <td>
                        <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                          {s.description || 'Mandatory fee package'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 4: DUES & DEFAULTERS REGISTRY
      ════════════════════════════════════════════════════════════ */}
      {activeTab === 'dues' && (
        <div>
          {/* Analytics KPI Metrics */}
          {analytics && (
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span>Total Expected</span>
                  <DollarSign size={16} color="#64748b" />
                </div>
                <div className={styles.metricValue}>₹{analytics.total_fees_expected.toLocaleString()}</div>
                <div className={styles.metricSubtext}>Across {analytics.total_students_with_fees} enrolled students</div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span>Realized Collections</span>
                  <CheckCircle2 size={16} color="#059669" />
                </div>
                <div className={styles.metricValue} style={{ color: '#059669' }}>
                  ₹{analytics.total_collected.toLocaleString()}
                </div>
                <div className={styles.metricSubtext}>Cleared cash & bank funds</div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span>Pending Dues</span>
                  <Clock size={16} color="#d97706" />
                </div>
                <div className={styles.metricValue} style={{ color: '#d97706' }}>
                  ₹{analytics.total_pending.toLocaleString()}
                </div>
                <div className={styles.metricSubtext}>Collection Rate: {analytics.collection_rate_percent}%</div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span>Overdue Defaulters</span>
                  <AlertTriangle size={16} color="#dc2626" />
                </div>
                <div className={styles.metricValue} style={{ color: '#dc2626' }}>
                  {analytics.overdue_count} Students
                </div>
                <div className={styles.metricSubtext}>Overdue Amount: ₹{analytics.total_overdue_amount.toLocaleString()}</div>
              </div>
            </div>
          )}

          {/* Dues List Card */}
          <div className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className={`${styles.btnSecondary} ${duesType === 'pending' ? styles.btnPrimary : ''}`}
                  onClick={() => setDuesType('pending')}
                >
                  All Pending Dues
                </button>
                <button
                  className={`${styles.btnSecondary} ${duesType === 'overdue' ? styles.btnDanger : ''}`}
                  onClick={() => setDuesType('overdue')}
                >
                  Overdue Defaulters Only
                </button>
              </div>

              {/* Class Filter */}
              <select
                className={styles.formSelect}
                style={{ width: '180px' }}
                value={duesClassFilter}
                onChange={(e) => setDuesClassFilter(e.target.value)}
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Admission #</th>
                    <th>Class</th>
                    <th>Total Owed</th>
                    <th>Total Paid</th>
                    <th>Balance Due</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDues ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>Loading dues registry...</td>
                    </tr>
                  ) : duesList.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                        No pending or overdue fees found for this filter.
                      </td>
                    </tr>
                  ) : (
                    duesList.map((d) => (
                      <tr key={d.student_id}>
                        <td className={styles.studentCell} style={{ fontWeight: 600 }}>{d.student_name}</td>
                        <td className={styles.nowrapCell}>{d.admission_number}</td>
                        <td className={styles.classCell} title={d.class_name || 'N/A'}>{d.class_name || 'N/A'}</td>
                        <td className={styles.nowrapCell}>₹{parseFloat(d.total_owed as string).toLocaleString()}</td>
                        <td className={styles.nowrapCell} style={{ color: '#059669' }}>₹{parseFloat(d.total_paid as string).toLocaleString()}</td>
                        <td className={styles.nowrapCell} style={{ fontWeight: 700, color: '#dc2626' }}>
                          ₹{parseFloat((d.balance_due || d.overdue_amount) as string).toLocaleString()}
                        </td>
                        <td className={styles.nowrapCell}>{d.due_date ? d.due_date.slice(0, 10) : 'N/A'}</td>
                        <td className={styles.nowrapCell}>
                          <span className={`${styles.badge} ${d.is_overdue || d.days_overdue ? styles.badgeDanger : styles.badgeWarning}`}>
                            {d.is_overdue || d.days_overdue ? `${d.days_overdue || 0}d Overdue` : 'Pending'}
                          </span>
                        </td>
                        <td className={styles.nowrapCell}>
                          <button
                            className={styles.btnPrimary}
                            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setSelectedStudentId(d.student_id);
                              setStudentSearch(`${d.student_name} (${d.admission_number})`);
                              setActiveTab('desk');
                            }}
                          >
                            Collect Fee
                            <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          MODAL: OFFICIAL INSTITUTIONAL PRINTABLE RECEIPT
      ════════════════════════════════════════════════════════════ */}
      {receiptModalData && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: '680px' }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Official Fee Receipt</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className={styles.btnSecondary}
                  style={{ padding: '6px 12px' }}
                  onClick={() => window.print()}
                >
                  <Printer size={16} />
                  Print Receipt
                </button>
                <button className={styles.modalClose} onClick={() => setReceiptModalData(null)}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.receiptContainer}>
                {/* Diagonal VOID Watermark if payment is reversed */}
                {receiptModalData.receipt.is_void && (
                  <div className={styles.receiptWatermark}>VOID / REVERSED</div>
                )}

                {/* Header */}
                <div className={styles.receiptHeader}>
                  <div className={styles.schoolInfo}>
                    <h2>Saksham Public Academy</h2>
                    <p className={styles.schoolSubtext}>Affiliated to CBSE, New Delhi • School Code: 20491</p>
                    <p className={styles.schoolSubtext}>104 Knowledge Boulevard, Institutional Area</p>
                  </div>
                  <div className={styles.receiptMeta}>
                    <div className={styles.receiptNo}>{receiptModalData.receipt.receipt_number}</div>
                    <div>Date: {receiptModalData.receipt.payment_date?.slice(0, 10) || 'N/A'}</div>
                    <div>Cashier: {receiptModalData.receipt.collected_by || 'Finance Desk'}</div>
                  </div>
                </div>

                {/* Reversal Banner if reversed */}
                {receiptModalData.receipt.is_void && (
                  <div className={styles.reversalNotice}>
                    <div className={styles.reversalNoticeTitle}>TRANSACTION VOIDED & REVERSED</div>
                    <p className={styles.reversalNoticeText}>
                      Reversed by: {receiptModalData.receipt.reversed_by || 'Super Admin'} on {receiptModalData.receipt.reversed_at?.slice(0, 10)}
                    </p>
                    <p className={styles.reversalNoticeText}>
                      Reason: <em>"{receiptModalData.receipt.reversal_reason}"</em>
                    </p>
                  </div>
                )}

                {/* Cheque Dishonor Banner if bounced */}
                {receiptModalData.receipt.status === 'bounced' && (
                  <div className={styles.reversalNotice}>
                    <div className={styles.reversalNoticeTitle}>CHEQUE DISHONORED / BOUNCED</div>
                    <p className={styles.reversalNoticeText}>
                      Reason: {receiptModalData.receipt.cheque_bounce_reason || 'Insufficient Funds'}
                    </p>
                  </div>
                )}

                {/* Student Info Grid */}
                <div className={styles.receiptGrid}>
                  <div className={styles.receiptGridItem}>
                    <span>Student Name</span>
                    <span>{receiptModalData.student.name}</span>
                  </div>
                  <div className={styles.receiptGridItem}>
                    <span>Admission Number</span>
                    <span>{receiptModalData.student.admission_number}</span>
                  </div>
                  <div className={styles.receiptGridItem}>
                    <span>Class & Section</span>
                    <span>{receiptModalData.student.class}</span>
                  </div>
                  <div className={styles.receiptGridItem}>
                    <span>Academic Year</span>
                    <span>{receiptModalData.student.academic_year}</span>
                  </div>
                </div>

                {/* Payment Breakdown Table */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                    Fee Component Breakdown ({receiptModalData.fee_structure})
                  </div>
                  <table className={styles.receiptTable}>
                    <thead>
                      <tr>
                        <th>Particulars</th>
                        <th style={{ textAlign: 'right' }}>Structure Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptModalData.fee_breakdown.map((comp, idx) => (
                        <tr key={idx}>
                          <td>
                            <span style={{ fontWeight: 500 }}>{comp.name}</span>
                            {comp.is_optional && (
                              <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '6px' }}>(Optional)</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            ₹{parseFloat(comp.amount as any).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                        <td>Total Fee Structure Assessment</td>
                        <td style={{ textAlign: 'right', color: '#0f172a' }}>
                          ₹{receiptModalData.fee_breakdown.reduce((sum, c) => sum + parseFloat(c.amount as any), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Payment & Settlement Ledger Summary Box */}
                  <div className={styles.receiptSummaryBox}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Payment & Settlement Ledger
                    </div>
                    <div className={styles.receiptSummaryRow}>
                      <span style={{ color: '#475569' }}>
                        Amount Paid in this Transaction ({receiptModalData.receipt.payment_mode.replace('_', ' ').toUpperCase()}):
                      </span>
                      <span style={{ fontWeight: 700, color: '#059669', fontSize: '1.05rem' }}>
                        ₹{parseFloat(receiptModalData.receipt.amount_paid as any).toLocaleString()}
                      </span>
                    </div>
                    {receiptModalData.financial_summary && (
                      <>
                        <div className={styles.receiptSummaryRow}>
                          <span style={{ color: '#64748b' }}>Total Realized Paid to Date:</span>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>
                            ₹{receiptModalData.financial_summary.cumulative_paid.toLocaleString()}
                          </span>
                        </div>
                        {receiptModalData.financial_summary.advance_credit > 0 && (
                          <div className={styles.receiptSummaryRow}>
                            <span style={{ color: '#64748b' }}>Advance Credit Balance:</span>
                            <span style={{ fontWeight: 600, color: '#0284c7' }}>
                              ₹{receiptModalData.financial_summary.advance_credit.toLocaleString()}
                            </span>
                          </div>
                        )}
                        <div className={styles.receiptSummaryRowTotal}>
                          <span>Remaining Balance Due:</span>
                          <span style={{
                            color: receiptModalData.financial_summary.balance_remaining === 0 ? '#059669' : '#dc2626'
                          }}>
                            {receiptModalData.financial_summary.balance_remaining === 0 ? (
                              '₹0 (Fully Settled ✓)'
                            ) : (
                              `₹${receiptModalData.financial_summary.balance_remaining.toLocaleString()}`
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Cheque / Bank Details if applicable */}
                {receiptModalData.receipt.payment_mode === 'cheque' && (
                  <div style={{ fontSize: '0.8125rem', color: '#475569', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                    Cheque No: <strong>{receiptModalData.receipt.cheque_number}</strong> | Bank: <strong>{receiptModalData.receipt.bank_name}</strong> | Cheque Status: <strong>{receiptModalData.receipt.cheque_status?.toUpperCase()}</strong>
                  </div>
                )}

                {receiptModalData.receipt.payment_mode === 'bank_transfer' && (
                  <div style={{ fontSize: '0.8125rem', color: '#475569', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                    Bank Reference / UTR: <strong>{receiptModalData.receipt.reference_number}</strong>
                  </div>
                )}

                {/* Footer Signatures */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '40px',
                  paddingTop: '20px',
                  borderTop: '1px solid #cbd5e1',
                  fontSize: '0.75rem',
                  color: '#64748b'
                }}>
                  <div>This is a computer-generated institutional receipt.</div>
                  <div style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                    Authorized Signatory / Accounts Desk
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          MODAL: PAYMENT REVERSAL CONFIRMATION (Super Admin / Principal)
      ════════════════════════════════════════════════════════════ */}
      {reversalTargetPayment && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle} style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={20} color="#dc2626" />
                Authorize Payment Reversal
              </h3>
              <button className={styles.modalClose} onClick={() => setReversalTargetPayment(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleExecuteReversal}>
              <div className={styles.modalBody}>
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  padding: '14px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '0.875rem',
                  color: '#991b1b'
                }}>
                  <strong>Security & Financial Warning:</strong> Reversing this payment will restore
                  ₹{parseFloat(reversalTargetPayment.amount_paid as string).toLocaleString()} back to the student's active balance due and deduct any excess advance credit created. This operation is permanent and logged in the immutable audit trail.
                </div>

                <div style={{ marginBottom: '16px', fontSize: '0.875rem' }}>
                  <div><strong>Receipt:</strong> {reversalTargetPayment.receipt_number}</div>
                  <div><strong>Student:</strong> {reversalTargetPayment.student_name}</div>
                  <div><strong>Amount:</strong> ₹{parseFloat(reversalTargetPayment.amount_paid as string).toLocaleString()}</div>
                  <div><strong>Payment Mode:</strong> {reversalTargetPayment.payment_mode}</div>
                </div>

                {reversalError && (
                  <div style={{ color: '#dc2626', fontSize: '0.8125rem', marginBottom: '12px' }}>
                    {reversalError}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Reversal Reason (Minimum 10 characters) *</label>
                  <textarea
                    className={styles.formTextarea}
                    placeholder="Enter thorough audit justification for reversing this transaction..."
                    value={reversalReason}
                    onChange={(e) => setReversalReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setReversalTargetPayment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnDanger}
                  disabled={submittingReversal || reversalReason.trim().length < 10}
                >
                  {submittingReversal ? 'Reversing...' : 'Confirm & Reverse Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          MODAL: CHEQUE LIFECYCLE STATUS UPDATE
      ════════════════════════════════════════════════════════════ */}
      {chequeTargetPayment && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Update Cheque Lifecycle Status</h3>
              <button className={styles.modalClose} onClick={() => setChequeTargetPayment(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleExecuteChequeStatus}>
              <div className={styles.modalBody}>
                <div style={{ marginBottom: '16px', fontSize: '0.875rem' }}>
                  <div><strong>Receipt:</strong> {chequeTargetPayment.receipt_number}</div>
                  <div><strong>Cheque #:</strong> {chequeTargetPayment.cheque_number}</div>
                  <div><strong>Bank:</strong> {chequeTargetPayment.bank_name}</div>
                  <div><strong>Amount:</strong> ₹{parseFloat(chequeTargetPayment.amount_paid as string).toLocaleString()}</div>
                  <div><strong>Current Status:</strong> {chequeTargetPayment.cheque_status || 'received'}</div>
                </div>

                {chequeStatusError && (
                  <div style={{ color: '#dc2626', fontSize: '0.8125rem', marginBottom: '12px' }}>
                    {chequeStatusError}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>New Cheque Status *</label>
                  <select
                    className={styles.formSelect}
                    value={newChequeStatus}
                    onChange={(e) => setNewChequeStatus(e.target.value as any)}
                  >
                    <option value="deposited">Deposited in Bank (Pending Clearing)</option>
                    <option value="cleared">Cleared (Realize Funds into Revenue)</option>
                    <option value="bounced">Bounced / Dishonored</option>
                  </select>
                </div>

                {newChequeStatus === 'cleared' && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Cleared Date *</label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={chequeClearedDate}
                      onChange={(e) => setChequeClearedDate(e.target.value)}
                      required
                    />
                  </div>
                )}

                {newChequeStatus === 'bounced' && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Bounce Reason *</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Signature mismatch, insufficient funds, account frozen"
                      value={chequeBounceReason}
                      onChange={(e) => setChequeBounceReason(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setChequeTargetPayment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={newChequeStatus === 'bounced' ? styles.btnDanger : styles.btnPrimary}
                  disabled={submittingChequeStatus}
                >
                  {submittingChequeStatus ? 'Updating...' : 'Update Cheque Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          MODAL: CREATE FEE STRUCTURE
      ════════════════════════════════════════════════════════════ */}
      {showCreateStructureModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: '640px' }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Create New Fee Structure</h3>
              <button className={styles.modalClose} onClick={() => setShowCreateStructureModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateStructure}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Structure Name *</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g. Grade 10 Annual Comprehensive Fee"
                    value={newStructureName}
                    onChange={(e) => setNewStructureName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Target Class *</label>
                    <select
                      className={styles.formSelect}
                      value={newStructureClassId}
                      onChange={(e) => setNewStructureClassId(e.target.value)}
                      required
                    >
                      <option value="">Select Class</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Due Date *</label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={newStructureDueDate}
                      onChange={(e) => setNewStructureDueDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Description</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="Optional description"
                    value={newStructureDescription}
                    onChange={(e) => setNewStructureDescription(e.target.value)}
                  />
                </div>

                {/* Component Rows */}
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className={styles.formLabel} style={{ margin: 0 }}>Fee Components Breakdown *</label>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      onClick={() => setNewComponents([...newComponents, { name: '', amount: 0, is_optional: false }])}
                    >
                      <Plus size={14} /> Add Component
                    </button>
                  </div>

                  {newComponents.map((comp, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="Component name"
                        value={comp.name}
                        onChange={(e) => {
                          const updated = [...newComponents];
                          updated[idx].name = e.target.value;
                          setNewComponents(updated);
                        }}
                        style={{ flex: 2 }}
                        required
                      />
                      <input
                        type="number"
                        className={styles.formInput}
                        placeholder="Amount"
                        value={comp.amount || ''}
                        onChange={(e) => {
                          const updated = [...newComponents];
                          updated[idx].amount = parseFloat(e.target.value) || 0;
                          setNewComponents(updated);
                        }}
                        style={{ flex: 1 }}
                        required
                      />
                      <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={comp.is_optional}
                          onChange={(e) => {
                            const updated = [...newComponents];
                            updated[idx].is_optional = e.target.checked;
                            setNewComponents(updated);
                          }}
                        />
                        Optional
                      </label>
                      {newComponents.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewComponents(newComponents.filter((_, i) => i !== idx))}
                          style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer' }}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.875rem', marginTop: '8px' }}>
                    Total Structure Fee: ₹{newComponents.reduce((sum, c) => sum + (c.amount || 0), 0).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowCreateStructureModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={submittingStructure}>
                  {submittingStructure ? 'Saving...' : 'Create Structure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          MODAL: ASSIGN FEE TO STUDENT
      ════════════════════════════════════════════════════════════ */}
      {showAssignModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Assign Fee Structure to Student</h3>
              <button className={styles.modalClose} onClick={() => setShowAssignModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignFee}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Select Student *</label>
                  <select
                    className={styles.formSelect}
                    value={assignStudentId}
                    onChange={(e) => setAssignStudentId(e.target.value)}
                    required
                  >
                    <option value="">Choose student...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.student_name} (Adm: {s.admission_number})
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Select Fee Structure *</label>
                  <select
                    className={styles.formSelect}
                    value={assignStructureId}
                    onChange={(e) => setAssignStructureId(e.target.value)}
                    required
                  >
                    <option value="">Choose fee structure...</option>
                    {structures.map(st => (
                      <option key={st.id} value={st.id}>
                        {st.name} — ₹{parseFloat(st.total_amount as any).toLocaleString()} ({st.class_name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowAssignModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={submittingAssign}>
                  {submittingAssign ? 'Assigning...' : 'Assign Fee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Fees;
