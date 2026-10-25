import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  GraduationCap, 
  ArrowRight, 
  LogIn, 
  Users, 
  Trophy, 
  TrendingUp, 
  CheckCircle2, 
  Award,
  X,
  Send,
  Calendar,
  MapPin,
  Check,
  ShieldCheck,
  UserCheck,
  FileText,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import styles from './Landing.module.css';

const CURRENT_YEAR = 2026;

const Landing: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [inquirySubmitted, setInquirySubmitted] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    studentName: '',
    grade: 'Grade 1',
    phone: '',
  });

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.studentName.trim() || !formData.phone.trim()) return;
    setInquirySubmitted(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setInquirySubmitted(false);
      setFormData({ studentName: '', grade: 'Grade 1', phone: '' });
    }, 300);
  };

  const portals = [
    {
      id: 'student-portal',
      title: 'Student & Guardian Portal',
      subtitle: 'Real-time academic performance, attendance records, digital homework, and fee receipts.',
      badge: 'Live Portal',
      badgeColor: 'blue',
      icon: GraduationCap,
      features: ['Daily Attendance Tracking', 'Report Cards & Exam Marks', 'Digital Homework Submissions', 'Online Fee Receipts & Ledger'],
      linkText: 'Enter Student Portal',
    },
    {
      id: 'faculty-portal',
      title: 'Faculty & Teacher Portal',
      subtitle: 'Comprehensive classroom management, digital rosters, homework grading, and marks entry.',
      badge: 'Faculty Access',
      badgeColor: 'purple',
      icon: UserCheck,
      features: ['Section-Wise Attendance Rosters', 'Assignment & Homework Creation', 'Exam Marks & Gradebook Entry', 'Direct Parent Notifications'],
      linkText: 'Enter Faculty Portal',
    },
    {
      id: 'admin-portal',
      title: 'Administration & Leadership',
      subtitle: 'Centralized school governance, student admissions, fee structures, and audit security.',
      badge: 'Governance',
      badgeColor: 'emerald',
      icon: ShieldCheck,
      features: ['End-to-End Admissions Workflow', 'Comprehensive Fee Structures', 'Staff & User Management', 'System Security & Audit Trail'],
      linkText: 'Enter Admin Portal',
    },
  ];

  const kpis = [
    {
      icon: Users,
      number: '2,400+',
      label: 'Enrolled Scholars',
      sub: 'Nursery to Grade XII',
    },
    {
      icon: Trophy,
      number: '99.4%',
      label: 'Board Distinction',
      sub: 'CBSE Academic Excellence',
    },
    {
      icon: TrendingUp,
      number: '100%',
      label: 'Higher Placements',
      sub: 'Premier Universities',
    },
    {
      icon: Award,
      number: '1:18',
      label: 'Faculty Ratio',
      sub: 'Personalized Care & Mentorship',
    },
  ];

  const notices = [
    {
      tag: 'Academic',
      tagColor: 'blue',
      date: 'Oct 24, 2026',
      title: 'Mid-Term Examination Schedule & Evaluation Framework',
      desc: 'Detailed examination timetables and subject-wise assessment weightages for Grades IX through XII have been published.',
    },
    {
      tag: 'Admissions',
      tagColor: 'amber',
      date: 'Oct 22, 2026',
      title: 'Admissions Open for Academic Session 2026–27',
      desc: 'Online registration and campus walkthrough schedules for Nursery, Primary, and Secondary grades are now active.',
    },
    {
      tag: 'Events',
      tagColor: 'emerald',
      date: 'Oct 20, 2026',
      title: 'Annual Inter-School Science & Innovation Conclave',
      desc: 'Scholars from Grades VI–XII are invited to register prototypes and research papers for the regional STEM fair.',
    },
  ];

  return (
    <div className={styles.pageWrapper}>
      {/* Background Ambient Glow */}
      <div className={styles.ambientWarmth} />

      {/* Navigation Header */}
      <div className={styles.navbarContainer}>
        <header className={styles.navbar}>
          <Link to="/" className={styles.brand}>
            <div className={styles.brandLogo}>
              <GraduationCap size={22} />
            </div>
            <div className={styles.brandInfo}>
              <div className={styles.brandName}>Saksham</div>
              <div className={styles.brandTagline}>School of Excellence</div>
            </div>
          </Link>

          <nav className={styles.desktopNav}>
            <ul className={styles.navLinks}>
              <li><a href="#portals" className={styles.navLink}>Portals</a></li>
              <li><a href="#benchmarks" className={styles.navLink}>Benchmarks</a></li>
              <li><a href="#notices" className={styles.navLink}>Notices</a></li>
              <li>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(true)}
                  className={styles.navLink}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
                >
                  Admissions
                </button>
              </li>
            </ul>
          </nav>

          <div className={styles.navActions}>
            <button 
              type="button" 
              onClick={() => setIsModalOpen(true)} 
              className={styles.applyNavBtn}
            >
              <span>Admissions 2026–27</span>
            </button>
            <Link to="/login" className={styles.portalBtn}>
              <LogIn size={15} />
              <span>Portal Sign In</span>
            </Link>
          </div>
        </header>
      </div>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroContainer}>
          <div className={styles.heroBadge}>
            <span className={styles.pulseDot} />
            <span>CBSE Affiliated (2130842) • Session 2026–27 Open</span>
          </div>

          <h1 className={styles.heroTitle}>
            Unified Digital Platform for Academic & Institutional Excellence
          </h1>

          <p className={styles.heroSubtitle}>
            Saksham empowers students, guardians, educators, and administrators with transparent academic tracking, seamless attendance, verified fee ledgers, and real-time school governance.
          </p>

          <div className={styles.heroCtas}>
            <Link to="/login" className={styles.heroPrimaryBtn}>
              <span>Access Your Portal</span>
              <ArrowRight size={16} />
            </Link>
            <button 
              type="button" 
              onClick={() => setIsModalOpen(true)} 
              className={styles.heroSecondaryBtn}
            >
              <span>Apply Online</span>
            </button>
          </div>

          {/* Quick Institutional Info Strip */}
          <div className={styles.statusStrip}>
            <div className={styles.statusItem}>
              <CheckCircle2 size={15} color="#10b981" />
              <span>CBSE Affiliated • Est. 2002</span>
            </div>
            <div className={styles.statusDivider} />
            <div className={styles.statusItem}>
              <Calendar size={15} color="#6366f1" />
              <span>Campus Walkthroughs: Mon–Sat</span>
            </div>
            <div className={styles.statusDivider} />
            <div className={styles.statusItem}>
              <MapPin size={15} color="#f59e0b" />
              <span>Full Academic ERP Suite</span>
            </div>
          </div>
        </div>
      </section>

      {/* Role-Based Digital Portal Gateways (Parakh Standard) */}
      <section id="portals" className={styles.sectionWrapper}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionPre}>Institutional Gateways</div>
          <h2 className={styles.sectionTitle}>Select Your Role to Continue</h2>
          <p className={styles.sectionDesc}>
            Dedicated portal access designed specifically for students, parents, teachers, and school leadership.
          </p>
        </div>

        <div className={styles.portalsGrid}>
          {portals.map((portal) => {
            const IconComponent = portal.icon;
            return (
              <div key={portal.id} className={styles.portalCard}>
                <div className={styles.portalCardHeader}>
                  <div className={`${styles.portalIconBox} ${styles[`icon_${portal.badgeColor}`]}`}>
                    <IconComponent size={24} />
                  </div>
                  <span className={`${styles.portalBadge} ${styles[`badge_${portal.badgeColor}`]}`}>
                    {portal.badge}
                  </span>
                </div>

                <h3 className={styles.portalCardTitle}>{portal.title}</h3>
                <p className={styles.portalCardSubtitle}>{portal.subtitle}</p>

                <ul className={styles.featureList}>
                  {portal.features.map((feat, idx) => (
                    <li key={idx} className={styles.featureItem}>
                      <Check size={14} className={styles.checkIcon} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <Link to="/login" className={styles.portalCardBtn}>
                  <span>{portal.linkText}</span>
                  <ChevronRight size={16} />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Key Institutional Metrics (Responsive 2x2 on Mobile, 4 on Desktop) */}
      <section id="benchmarks" className={styles.metricsSection}>
        <div className={styles.metricsContainer}>
          <div className={styles.sectionHeader} style={{ marginBottom: '32px' }}>
            <div className={styles.sectionPre}>Proven Track Record</div>
            <h2 className={styles.sectionTitle}>Institutional Benchmarks</h2>
          </div>

          <div className={styles.kpiGrid}>
            {kpis.map((kpi, idx) => {
              const Icon = kpi.icon;
              return (
                <div key={idx} className={styles.kpiCard}>
                  <div className={styles.kpiIconWrap}>
                    <Icon size={20} />
                  </div>
                  <div className={styles.kpiNumber}>{kpi.number}</div>
                  <div className={styles.kpiLabel}>{kpi.label}</div>
                  <div className={styles.kpiSub}>{kpi.sub}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Live Academic Notices & Circulars (Parakh Standard) */}
      <section id="notices" className={styles.sectionWrapper}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionPre}>Official Announcements</div>
          <h2 className={styles.sectionTitle}>Academic Circulars & Notices</h2>
          <p className={styles.sectionDesc}>
            Stay updated with real-time institutional communications, term dates, and exam schedules.
          </p>
        </div>

        <div className={styles.noticesGrid}>
          {notices.map((notice, idx) => (
            <div key={idx} className={styles.noticeCard}>
              <div className={styles.noticeTopRow}>
                <span className={`${styles.noticeTag} ${styles[`tag_${notice.tagColor}`]}`}>
                  {notice.tag}
                </span>
                <span className={styles.noticeDate}>{notice.date}</span>
              </div>
              <h3 className={styles.noticeTitle}>{notice.title}</h3>
              <p className={styles.noticeDesc}>{notice.desc}</p>
              <div className={styles.noticeFooter}>
                <Link to="/login" className={styles.noticeLink}>
                  <FileText size={14} />
                  <span>View Details via Portal</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Inquiry / Walkthrough Modal */}
      {isModalOpen && (
        <div className={styles.inquiryModalOverlay} onClick={closeModal}>
          <div 
            className={styles.inquiryModal} 
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              type="button" 
              onClick={closeModal} 
              className={styles.modalCloseBtn}
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>

            {!inquirySubmitted ? (
              <>
                <div className={styles.modalHeader}>
                  <div className={styles.modalBadge}>
                    <Sparkles size={12} color="#6366f1" />
                    <span>Session 2026–27</span>
                  </div>
                  <h3 className={styles.modalTitle}>Admissions Inquiry</h3>
                  <p className={styles.modalSubtitle}>
                    Complete this brief request and our admissions counselors will contact you within 24 hours.
                  </p>
                </div>

                <form onSubmit={handleFormSubmit} className={styles.modalForm}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Student Full Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Aarav Sharma"
                      value={formData.studentName}
                      onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Target Grade</label>
                    <select 
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                      className={styles.formInput}
                    >
                      <option value="Nursery">Nursery / Kindergarten</option>
                      <option value="Grade 1">Grade 1 - 5 (Primary)</option>
                      <option value="Grade 6">Grade 6 - 8 (Middle School)</option>
                      <option value="Grade 9">Grade 9 - 10 (Secondary)</option>
                      <option value="Grade 11">Grade 11 - 12 (Senior Secondary)</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Parent Contact Number</label>
                    <input 
                      type="tel" 
                      required
                      placeholder="+91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={styles.formInput}
                    />
                  </div>

                  <button type="submit" className={styles.submitInquiryBtn}>
                    <span>Submit Inquiry</span>
                    <Send size={15} />
                  </button>
                </form>
              </>
            ) : (
              <div className={styles.inquirySuccessBox}>
                <div className={styles.successIconWrap}>
                  <Check size={28} />
                </div>
                <h3 className={styles.modalTitle} style={{ fontSize: '1.35rem' }}>Inquiry Received!</h3>
                <p className={styles.modalSubtitle} style={{ marginTop: '8px' }}>
                  Thank you. Our admissions counselors have logged your request for <strong>{formData.studentName}</strong> and will reach out at <strong>{formData.phone}</strong> shortly.
                </p>
                <button 
                  type="button" 
                  onClick={closeModal} 
                  className={styles.submitInquiryBtn}
                  style={{ marginTop: '24px' }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Institutional Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContainer}>
          <div className={styles.footerBrandCol}>
            <div className={styles.brand}>
              <div className={styles.brandLogo}>
                <GraduationCap size={20} />
              </div>
              <div>
                <div className={styles.brandName}>Saksham</div>
                <div className={styles.brandTagline}>School of Excellence</div>
              </div>
            </div>
            <p className={styles.footerDesc}>
              CBSE Affiliated Senior Secondary Institution (Affiliation No: 2130842, School Code: 70412). Committed to holistic education, moral character, and digital academic administration.
            </p>
          </div>

          <div className={styles.footerLinksCol}>
            <h4 className={styles.footerHeading}>Quick Navigation</h4>
            <ul className={styles.footerList}>
              <li><Link to="/login" className={styles.footerLink}>Portal Sign In</Link></li>
              <li>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(true)}
                  className={styles.footerLinkBtn}
                >
                  Admissions 2026–27
                </button>
              </li>
              <li><a href="#portals" className={styles.footerLink}>Institutional Gateways</a></li>
              <li><a href="#notices" className={styles.footerLink}>Academic Circulars</a></li>
            </ul>
          </div>

          <div className={styles.footerInfoCol}>
            <h4 className={styles.footerHeading}>Campus & Timings</h4>
            <p className={styles.footerInfoText}>
              <strong>Walkthroughs:</strong> Monday – Saturday<br />
              09:00 AM – 04:00 PM IST
            </p>
            <p className={styles.footerInfoText} style={{ marginTop: '10px' }}>
              <strong>Direct Helpdesk:</strong> +91 (011) 2874-9000<br />
              <strong>Official Email:</strong> admissions@saksham.edu.in
            </p>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>© {CURRENT_YEAR} Saksham School of Excellence. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
