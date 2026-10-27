import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  LifeBuoy,
  Activity,
  Plus,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  X,
  Loader2,
  Database,
  Cpu
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import styles from './Support.module.css';

interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  display_order: number;
}

interface SupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  requester_name: string;
  requester_email: string;
  requester_role: string;
  reply_count: number;
  last_reply_at?: string;
  created_at: string;
  resolved_at?: string;
}

interface TicketReply {
  id: string;
  user_id: string;
  message: string;
  sender_name: string;
  sender_role: string;
  created_at: string;
}

interface TicketDetail extends SupportTicket {
  replies: TicketReply[];
}

interface SystemStatusData {
  status: string;
  timestamp: string;
  database: { status: string; latencyMs: number };
  server: {
    uptime: string;
    nodeVersion: string;
    memoryUsage: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
  };
  services: { name: string; status: string }[];
}

const Support: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'faqs' | 'tickets' | 'status'>('faqs');
  const [, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // FAQs state
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [faqCategory, setFaqCategory] = useState<string>('all');
  const [faqSearch, setFaqSearch] = useState<string>('');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [showFaqModal, setShowFaqModal] = useState<boolean>(false);
  const [newFaq, setNewFaq] = useState({ category: 'general', question: '', answer: '', display_order: 0 });

  // Tickets state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showTicketModal, setShowTicketModal] = useState<boolean>(false);
  const [newTicket, setNewTicket] = useState({
    subject: '',
    category: 'general',
    priority: 'medium',
    description: ''
  });
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [replyMessage, setReplyMessage] = useState<string>('');
  const [replyLoading, setReplyLoading] = useState<boolean>(false);

  // System Status state
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);

  const isStaff = user?.role && ['super_admin', 'principal', 'office_staff'].includes(user.role);

  useEffect(() => {
    fetchFaqs();
    fetchTickets();
    fetchSystemStatus();
  }, [user]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchFaqs = async () => {
    try {
      const res = await apiClient.get('/support/faqs');
      if (res.data?.success) {
        setFaqs(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to load FAQs:', err);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/support/tickets');
      if (res.data?.success) {
        setTickets(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const res = await apiClient.get('/support/system-status');
      if (res.data?.success) {
        setSystemStatus(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to load system status:', err);
    }
  };

  const handleCreateFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/support/faqs', newFaq);
      if (res.data?.success) {
        showNotice('success', 'FAQ published successfully');
        setShowFaqModal(false);
        setNewFaq({ category: 'general', question: '', answer: '', display_order: 0 });
        fetchFaqs();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to publish FAQ');
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/support/tickets', newTicket);
      if (res.data?.success) {
        showNotice('success', `Ticket ${res.data.data.ticket_number} created successfully`);
        setShowTicketModal(false);
        setNewTicket({ subject: '', category: 'general', priority: 'medium', description: '' });
        fetchTickets();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to submit ticket');
    }
  };

  const handleOpenTicketDetails = async (ticketId: string) => {
    try {
      const res = await apiClient.get(`/support/tickets/${ticketId}`);
      if (res.data?.success) {
        setSelectedTicket(res.data.data);
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to fetch ticket conversation');
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;
    try {
      setReplyLoading(true);
      const res = await apiClient.post(`/support/tickets/${selectedTicket.id}/reply`, {
        message: replyMessage
      });
      if (res.data?.success) {
        setReplyMessage('');
        handleOpenTicketDetails(selectedTicket.id);
        fetchTickets();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to send reply');
    } finally {
      setReplyLoading(false);
    }
  };

  const handleUpdateTicketStatus = async (status: string) => {
    if (!selectedTicket) return;
    try {
      const res = await apiClient.patch(`/support/tickets/${selectedTicket.id}/status`, { status });
      if (res.data?.success) {
        showNotice('success', `Status updated to ${status}`);
        setSelectedTicket({ ...selectedTicket, status });
        fetchTickets();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to update status');
    }
  };

  // Filtered FAQs
  const filteredFaqs = faqs.filter((faq) => {
    const matchesCategory = faqCategory === 'all' || faq.category === faqCategory;
    const matchesSearch =
      faq.question.toLowerCase().includes(faqSearch.toLowerCase()) ||
      faq.answer.toLowerCase().includes(faqSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Filtered Tickets
  const filteredTickets = tickets.filter((ticket) => {
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || ticket.category === categoryFilter;
    return matchesStatus && matchesCategory;
  });

  // KPI calculations
  const totalTickets = tickets.length;
  const openTickets = tickets.filter((t) => t.status === 'open').length;
  const inProgressTickets = tickets.filter((t) => t.status === 'in_progress').length;
  const resolvedTickets = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Help & Support Desk</h1>
          <p>Instant answers, ticket management, and real-time system status.</p>
        </div>

        <div className={styles.headerActions}>
          {activeTab === 'faqs' && isStaff && (
            <button className={styles.btnSecondary} onClick={() => setShowFaqModal(true)}>
              <Plus size={16} /> New FAQ
            </button>
          )}
          <button className={styles.btnPrimary} onClick={() => setShowTicketModal(true)}>
            <Plus size={16} /> Submit Ticket
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {message && (
        <div
          className={`${styles.alertBox} ${
            message.type === 'success' ? styles.alertSuccess : styles.alertError
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabsBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'faqs' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('faqs')}
        >
          <HelpCircle size={18} /> Help Center & FAQs
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'tickets' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('tickets')}
        >
          <LifeBuoy size={18} /> Support Tickets ({tickets.length})
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'status' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('status')}
        >
          <Activity size={18} /> System Status
        </button>
      </div>

      {/* TAB 1: FAQs */}
      {activeTab === 'faqs' && (
        <div className={styles.faqSection}>
          {/* Filters & Search */}
          <div className={styles.faqFilterBar}>
            {['all', 'general', 'admissions', 'fees', 'attendance', 'academics', 'account'].map(
              (cat) => (
                <button
                  key={cat}
                  className={`${styles.categoryPill} ${faqCategory === cat ? styles.activePill : ''}`}
                  onClick={() => setFaqCategory(cat)}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              )
            )}
            <input
              type="text"
              placeholder="Search frequently asked questions..."
              className={styles.faqSearchInput}
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
            />
          </div>

          {/* Accordion FAQ list */}
          <div className={styles.faqList}>
            {filteredFaqs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                No FAQs match your search query.
              </div>
            ) : (
              filteredFaqs.map((faq) => {
                const isOpen = expandedFaqId === faq.id;
                return (
                  <div key={faq.id} className={styles.faqItem}>
                    <button
                      className={styles.faqQuestion}
                      onClick={() => setExpandedFaqId(isOpen ? null : faq.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span>{faq.question}</span>
                        <span className={styles.faqCategoryBadge}>{faq.category}</span>
                      </div>
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    {isOpen && <div className={styles.faqAnswer}>{faq.answer}</div>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SUPPORT TICKETS */}
      {activeTab === 'tickets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* KPI Summary Cards */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrapper} style={{ background: '#ede9fe', color: '#6d28d9' }}>
                <LifeBuoy size={24} />
              </div>
              <div className={styles.kpiInfo}>
                <h4>Total Tickets</h4>
                <div className={styles.kpiValue}>{totalTickets}</div>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrapper} style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                <Clock size={24} />
              </div>
              <div className={styles.kpiInfo}>
                <h4>Open</h4>
                <div className={styles.kpiValue}>{openTickets}</div>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrapper} style={{ background: '#fef3c7', color: '#b45309' }}>
                <AlertCircle size={24} />
              </div>
              <div className={styles.kpiInfo}>
                <h4>In Progress</h4>
                <div className={styles.kpiValue}>{inProgressTickets}</div>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrapper} style={{ background: '#dcfce7', color: '#15803d' }}>
                <CheckCircle2 size={24} />
              </div>
              <div className={styles.kpiInfo}>
                <h4>Resolved</h4>
                <div className={styles.kpiValue}>{resolvedTickets}</div>
              </div>
            </div>
          </div>

          {/* Tickets Table */}
          <div className={styles.ticketsCard}>
            <div className={styles.tableToolbar}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <select
                  className={styles.filterSelect}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>

                <select
                  className={styles.filterSelect}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  <option value="technical">Technical</option>
                  <option value="academic">Academic</option>
                  <option value="fees">Fees</option>
                  <option value="admissions">Admissions</option>
                  <option value="general">General</option>
                </select>
              </div>
              <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                Showing {filteredTickets.length} ticket(s)
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className={styles.ticketsTable}>
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Subject</th>
                    <th>Requester</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Replies</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        No support tickets found. Click "+ Submit Ticket" to request assistance.
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((t) => (
                      <tr
                        key={t.id}
                        className={styles.ticketRow}
                        onClick={() => handleOpenTicketDetails(t.id)}
                      >
                        <td className={styles.ticketNum}>{t.ticket_number}</td>
                        <td style={{ fontWeight: 600 }}>{t.subject}</td>
                        <td>
                          <div>{t.requester_name}</div>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {t.requester_role}
                          </span>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{t.category}</td>
                        <td>
                          <span className={`${styles.priorityBadge} ${styles['priority' + t.priority]}`}>
                            {t.priority}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles['status' + t.status]}`}>
                            {t.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <MessageSquare size={14} color="#64748b" />
                            <span>{t.reply_count}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {new Date(t.created_at).toLocaleDateString()}
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

      {/* TAB 3: SYSTEM STATUS */}
      {activeTab === 'status' && (
        <div className={styles.statusGrid}>
          {/* Operational Overview */}
          <div className={styles.statusCard}>
            <div className={styles.statusCardHeader}>
              <h3>Platform Health</h3>
              <span className={styles.serviceStatusBadge}>
                <CheckCircle2 size={14} /> Operational
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div><strong>Status:</strong> {systemStatus?.status || 'All Systems Operational'}</div>
              <div><strong>Uptime:</strong> {systemStatus?.server.uptime || 'Active'}</div>
              <div><strong>Node Engine:</strong> {systemStatus?.server.nodeVersion || 'v20.x'}</div>
              <div><strong>Last Checked:</strong> {systemStatus ? new Date(systemStatus.timestamp).toLocaleTimeString() : 'Now'}</div>
            </div>
          </div>

          {/* Database Health */}
          <div className={styles.statusCard}>
            <div className={styles.statusCardHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={18} color="#4f46e5" />
                <h3>Database Engine</h3>
              </div>
              <span className={styles.serviceStatusBadge}>Connected</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div><strong>Database:</strong> PostgreSQL with Connection Pool</div>
              <div><strong>Query Latency:</strong> {systemStatus?.database.latencyMs || 2} ms</div>
              <div><strong>Encryption:</strong> pgcrypto & UUID Extensions Active</div>
            </div>
          </div>

          {/* Memory Metrics */}
          <div className={styles.statusCard}>
            <div className={styles.statusCardHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Cpu size={18} color="#4f46e5" />
                <h3>Server Metrics</h3>
              </div>
              <span className={styles.serviceStatusBadge}>Optimal</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div><strong>Heap Used:</strong> {systemStatus?.server.memoryUsage.heapUsedMB || 45} MB</div>
              <div><strong>Heap Total:</strong> {systemStatus?.server.memoryUsage.heapTotalMB || 78} MB</div>
              <div><strong>RSS Memory:</strong> {systemStatus?.server.memoryUsage.rssMB || 112} MB</div>
            </div>
          </div>

          {/* Services List */}
          <div className={styles.statusCard} style={{ gridColumn: '1 / -1' }}>
            <div className={styles.statusCardHeader}>
              <h3>Core Subsystems Status</h3>
            </div>
            <div>
              {systemStatus?.services.map((srv, idx) => (
                <div key={idx} className={styles.serviceItem}>
                  <span>{srv.name}</span>
                  <span className={styles.serviceStatusBadge}>
                    <CheckCircle2 size={13} /> {srv.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SUBMIT SUPPORT TICKET */}
      {showTicketModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2>Submit Support Ticket</h2>
              <button className={styles.closeModalBtn} onClick={() => setShowTicketModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateTicket}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label>Subject *</label>
                  <input
                    type="text"
                    required
                    className={styles.formInput}
                    placeholder="Brief description of the issue"
                    value={newTicket.subject}
                    onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Category *</label>
                    <select
                      className={styles.formSelect}
                      value={newTicket.category}
                      onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                    >
                      <option value="general">General Inquiry</option>
                      <option value="technical">Technical Issue</option>
                      <option value="academic">Academic & Curriculum</option>
                      <option value="fees">Fee & Invoicing</option>
                      <option value="admissions">Admissions</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Priority</label>
                    <select
                      className={styles.formSelect}
                      value={newTicket.priority}
                      onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Detailed Description *</label>
                  <textarea
                    rows={4}
                    required
                    className={styles.formTextarea}
                    placeholder="Provide details, error messages, or steps to reproduce..."
                    value={newTicket.description}
                    onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowTicketModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE FAQ (Admin/Principal only) */}
      {showFaqModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2>Publish FAQ Article</h2>
              <button className={styles.closeModalBtn} onClick={() => setShowFaqModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateFaq}>
              <div className={styles.modalBody}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Category *</label>
                    <select
                      className={styles.formSelect}
                      value={newFaq.category}
                      onChange={(e) => setNewFaq({ ...newFaq, category: e.target.value })}
                    >
                      <option value="general">General</option>
                      <option value="admissions">Admissions</option>
                      <option value="fees">Fees</option>
                      <option value="attendance">Attendance</option>
                      <option value="academics">Academics</option>
                      <option value="account">Account</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Display Order</label>
                    <input
                      type="number"
                      className={styles.formInput}
                      value={newFaq.display_order}
                      onChange={(e) => setNewFaq({ ...newFaq, display_order: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Question *</label>
                  <input
                    type="text"
                    required
                    className={styles.formInput}
                    placeholder="e.g. How do I request a bonafide certificate?"
                    value={newFaq.question}
                    onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Answer *</label>
                  <textarea
                    rows={4}
                    required
                    className={styles.formTextarea}
                    placeholder="Provide the complete, clear answer..."
                    value={newFaq.answer}
                    onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowFaqModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Publish FAQ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL / DRAWER: TICKET DETAIL & CONVERSATION THREAD */}
      {selectedTicket && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard} style={{ maxWidth: '750px' }}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{selectedTicket.subject}</h2>
                <span className={styles.ticketNum}>{selectedTicket.ticket_number}</span>
              </div>
              <button className={styles.closeModalBtn} onClick={() => setSelectedTicket(null)}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Ticket Details & Status Controls */}
              <div className={styles.ticketDetailHeader}>
                <div className={styles.ticketMetaRow}>
                  <span><strong>Requester:</strong> {selectedTicket.requester_name} ({selectedTicket.requester_role})</span>
                  <span><strong>Category:</strong> {selectedTicket.category}</span>
                  <span><strong>Priority:</strong> {selectedTicket.priority}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <span><strong>Status:</strong></span>
                  <select
                    className={styles.filterSelect}
                    value={selectedTicket.status}
                    onChange={(e) => handleUpdateTicketStatus(e.target.value)}
                    disabled={!isStaff && selectedTicket.status === 'closed'}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div className={styles.ticketOriginalDesc}>
                  <strong>Description:</strong>
                  <p style={{ margin: '0.5rem 0 0 0' }}>{selectedTicket.description}</p>
                </div>
              </div>

              {/* Replies Thread */}
              <h4 style={{ margin: '0.5rem 0 0 0', color: '#1e293b' }}>
                Conversation ({selectedTicket.replies?.length || 0})
              </h4>
              <div className={styles.threadList}>
                {selectedTicket.replies && selectedTicket.replies.length > 0 ? (
                  selectedTicket.replies.map((reply) => (
                    <div key={reply.id} className={styles.replyBubble}>
                      <div className={styles.replyMeta}>
                        <span className={styles.replyAuthor}>
                          {reply.sender_name} ({reply.sender_role})
                        </span>
                        <span>{new Date(reply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div>{reply.message}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                    No replies yet. Send a message below to start the conversation.
                  </div>
                )}
              </div>

              {/* Reply Box */}
              {selectedTicket.status !== 'closed' ? (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <input
                    type="text"
                    className={styles.formInput}
                    style={{ flex: 1 }}
                    placeholder="Type a reply..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                  />
                  <button
                    className={styles.btnPrimary}
                    onClick={handleSendReply}
                    disabled={replyLoading || !replyMessage.trim()}
                  >
                    {replyLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              ) : (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  This ticket has been closed. Reopen or create a new ticket to continue.
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setSelectedTicket(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Support;
