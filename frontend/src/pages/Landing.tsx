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
  BookOpen, 
  Sparkles, 
  Award,
  X,
  Send,
  Calendar,
  MapPin,
  Check
} from 'lucide-react';
import styles from './Landing.module.css';

const CURRENT_YEAR = 2026;

const Landing: React.FC = () => {
  const [orbitKey, setOrbitKey] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [inquirySubmitted, setInquirySubmitted] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    studentName: '',
    grade: 'Grade 1',
    phone: '',
  });

  const handleReplay = () => {
    setOrbitKey(prev => prev + 1);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.studentName.trim() || !formData.phone.trim()) return;
    setInquirySubmitted(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    // Reset submission state after modal finishes closing
    setTimeout(() => {
      setInquirySubmitted(false);
      setFormData({ studentName: '', grade: 'Grade 1', phone: '' });
    }, 300);
  };

  const kpiCards = [
    {
      id: 0,
      icon: Users,
      number: '2,400+',
      label: 'Enrolled Scholars',
      sub: 'Nursery to Grade XII',
    },
    {
      id: 1,
      icon: Trophy,
      number: '99.4%',
      label: 'Board Distinction',
      sub: 'Academic Excellence',
    },
    {
      id: 2,
      icon: TrendingUp,
      number: '100%',
      label: 'Higher Placements',
      sub: 'Premier Universities',
    },
    {
      id: 3,
      icon: Award,
      number: '1:18',
      label: 'Teacher Ratio',
      sub: 'Personalized Care',
    },
  ];

  return (
    <div className={styles.pageWrapper}>
      {/* Subtle warm ivory ambient glow */}
      <div className={styles.ambientWarmth} />

      {/* Clean Minimalist Navbar */}
      <div className={styles.navbarContainer}>
        <header className={styles.navbar}>
          <Link to="/" className={styles.brand}>
            <div className={styles.brandLogo}>
              <GraduationCap size={20} />
            </div>
            <div>
              <div className={styles.brandName}>Saksham</div>
              <div className={styles.brandTagline}>School of Excellence</div>
            </div>
          </Link>

          <nav>
            <ul className={styles.navLinks}>
              <li><a href="#about" className={styles.navLink}>About</a></li>
              <li><a href="#academics" className={styles.navLink}>Academics</a></li>
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
              <LogIn size={14} />
              <span>Portal Sign In</span>
            </Link>
          </div>
        </header>
      </div>

      {/* Hero Intro Tag */}
      <div className={styles.heroIntro}>
        <div className={styles.heroBadge}>
          <span className={styles.pulseDot} />
          <span>Empowering Minds, Shaping Character</span>
        </div>

        {/* Live School Status Strip */}
        <div className={styles.schoolStatusBar}>
          <div className={styles.statusItem}>
            <span>Admissions Open for Session 2026–27</span>
          </div>
          <span className={styles.statusDot} />
          <div className={styles.statusItem}>
            <Calendar size={13} color="#78716C" />
            <span>Campus Walkthroughs: Mon–Sat</span>
          </div>
          <span className={styles.statusDot} />
          <div className={styles.statusItem}>
            <MapPin size={13} color="#78716C" />
            <span>CBSE Affiliation: 2130842</span>
          </div>
        </div>
      </div>

      {/* ========================================================
          AUTOMATIC REVOLVING & SETTLING HERO STAGE
          Cards revolve around Saksham container for 2 seconds,
          then dock into a single clean row behind it.
          Clicking the center badge smoothly replays the 2s sweep!
          ======================================================== */}
      <section className={styles.orbitStageContainer}>
        {/* Subtle Orbital Trajectory Ring & Living Breathing Aura */}
        <div className={styles.orbitalRing} />
        <div className={styles.breathingHalo} />

        {/* Central 'Saksham' Container */}
        <div className={styles.centerContainer}>
          <button 
            type="button" 
            onClick={handleReplay} 
            className={styles.replayLogoBtn}
            title="Click to replay the 2-second orbit animation"
          >
            <GraduationCap size={28} />
          </button>

          <h1 className={styles.centerName}>SAKSHAM</h1>
          <p className={styles.centerSub}>
            A premier institution fostering academic rigor, creativity, and holistic leadership.
          </p>

          <div className={styles.centerPill}>
            <CheckCircle2 size={13} color="#1E252B" />
            <span>CBSE Affiliated • Est. 2002</span>
          </div>

          <div className={styles.centerCtas}>
            <button 
              type="button" 
              onClick={() => setIsModalOpen(true)} 
              className={styles.primaryCta}
              style={{ border: 'none', cursor: 'pointer' }}
            >
              <span>Apply Online</span>
              <ArrowRight size={14} />
            </button>
            <Link to="/login" className={styles.secondaryCta}>
              <span>Portal Login</span>
            </Link>
          </div>
        </div>

        {/* 4 KPI Cards that revolve automatically for 2.0s and smoothly dock behind Saksham */}
        {kpiCards.map((card, index) => {
          const CardIcon = card.icon;
          const cardClass = `${styles.kpiCard} ${styles[`cardFlow${index}`]}`;

          return (
            <div 
              key={`${card.id}-${orbitKey}`} 
              className={cardClass}
            >
              <div className={styles.kpiIconWrap}>
                <CardIcon size={16} />
              </div>
              <div className={styles.kpiNumber}>{card.number}</div>
              <div className={styles.kpiLabel}>{card.label}</div>
              <div className={styles.kpiSub}>{card.sub}</div>
            </div>
          );
        })}
      </section>

      {/* Minimalist 3 Pillars Section (Clean, Airy, No Clutter) */}
      <section id="about" className={styles.pillarsSection}>
        <div className={styles.pillarsGrid}>
          <div className={styles.pillarCard}>
            <div className={styles.pillarIconBox}>
              <BookOpen size={20} />
            </div>
            <h3 className={styles.pillarTitle}>Academic Rigor</h3>
            <p className={styles.pillarDesc}>
              A comprehensive curriculum balancing foundational knowledge with inquiry-based experiential learning.
            </p>
          </div>

          <div className={styles.pillarCard}>
            <div className={styles.pillarIconBox}>
              <Sparkles size={20} />
            </div>
            <h3 className={styles.pillarTitle}>Holistic Growth</h3>
            <p className={styles.pillarDesc}>
              Nurturing character, performing arts, competitive athletics, and emotional intelligence in every student.
            </p>
          </div>

          <div className={styles.pillarCard}>
            <div className={styles.pillarIconBox}>
              <Trophy size={20} />
            </div>
            <h3 className={styles.pillarTitle}>Innovation & STEM</h3>
            <p className={styles.pillarDesc}>
              Modern science, robotics, and digital literacy labs preparing students for tomorrow's challenges.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Walkthrough / Inquiry Dialog Modal */}
      {isModalOpen && (
        <div 
          className={styles.inquiryModalOverlay}
          onClick={closeModal}
        >
          <div 
            className={styles.inquiryModal}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              type="button" 
              onClick={closeModal} 
              className={styles.modalCloseBtn}
              title="Close modal"
            >
              <X size={16} />
            </button>

            {!inquirySubmitted ? (
              <>
                <div className={styles.modalHeader}>
                  <div className={styles.modalBadge}>
                    <Sparkles size={13} color="#D97706" />
                    <span>Admissions Session 2026–27</span>
                  </div>
                  <h3 className={styles.modalTitle}>Request a Campus Tour</h3>
                  <p className={styles.modalSubtitle}>
                    Leave your details and our admissions coordinator will arrange a private walkthrough.
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
                    <Send size={14} />
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
                  Thank you, <strong>{formData.studentName}</strong>'s parent. Our admissions office has received your request and will contact you at <strong>{formData.phone}</strong> shortly.
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

      {/* Clean Minimalist Footer */}
      <footer className={styles.footer}>
        <ul className={styles.footerLinks}>
          <li>
            <button 
              type="button" 
              onClick={() => setIsModalOpen(true)}
              className={styles.footerLink}
              style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
            >
              Admissions Inquiry
            </button>
          </li>
          <li><Link to="/login" className={styles.footerLink}>Portal Access</Link></li>
          <li><a href="#about" className={styles.footerLink}>About Saksham</a></li>
        </ul>
        <p>© {CURRENT_YEAR} Saksham School. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Landing;
