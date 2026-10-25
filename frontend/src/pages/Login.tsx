import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Eye, EyeOff, GraduationCap, ShieldCheck, Palette } from 'lucide-react';
import styles from './Login.module.css';
import { useAuth } from '../context/AuthContext';

export type LoginTheme = 'ivory' | 'navy' | 'slate';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Theme switcher state with localStorage persistence
  const [theme, setTheme] = useState<LoginTheme>(() => {
    const saved = localStorage.getItem('saksham_login_theme');
    return (saved === 'navy' || saved === 'slate' || saved === 'ivory') ? saved : 'ivory';
  });

  const handleThemeChange = (newTheme: LoginTheme) => {
    setTheme(newTheme);
    localStorage.setItem('saksham_login_theme', newTheme);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      if (err.response?.status === 401) {
        setErrorMessage(err.response.data?.message || 'Invalid email or password');
      } else if (err.response?.status === 403) {
        setErrorMessage(err.response.data?.message || 'Your account is deactivated. Please contact support.');
      } else if (!err.response) {
        setErrorMessage('Unable to connect to the server. Please check your network or try again.');
      } else {
        setErrorMessage(err.response.data?.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`${styles.loginContainer} ${styles[theme]}`}>
      {/* Dynamic Ambient Background Elements */}
      <div className={styles.ambientGlow} />
      <div className={styles.gridOverlay} />

      {/* Outer wrapper to hold theme previewer + login card */}
      <div className={styles.contentWrapper}>
        {/* Interactive 3-Theme Switcher Pill */}
        <div className={styles.themeSwitcherBar} aria-label="Theme selector">
          <div className={styles.themeBadge}>
            <Palette size={14} />
            <span>Theme:</span>
          </div>
          <div className={styles.themeButtonsGroup}>
            <button
              type="button"
              className={`${styles.themeBtn} ${theme === 'ivory' ? styles.themeBtnActive : ''}`}
              onClick={() => handleThemeChange('ivory')}
            >
              🏛️ <span>Warm Ivory</span>
            </button>
            <button
              type="button"
              className={`${styles.themeBtn} ${theme === 'navy' ? styles.themeBtnActive : ''}`}
              onClick={() => handleThemeChange('navy')}
            >
              🌌 <span>Deep Navy</span>
            </button>
            <button
              type="button"
              className={`${styles.themeBtn} ${theme === 'slate' ? styles.themeBtnActive : ''}`}
              onClick={() => handleThemeChange('slate')}
            >
              📐 <span>Slate Grid</span>
            </button>
          </div>
        </div>

        {/* Elevated Institutional Card */}
        <div className={styles.loginCard}>
          <div className={styles.topBar}>
            <Link to="/" className={styles.backLink}>
              ← Back to Website
            </Link>
            <div className={styles.securityPill}>
              <ShieldCheck size={12} />
              <span>256-bit SSL</span>
            </div>
          </div>

          <div className={styles.logoWrapper}>
            <div className={styles.logoShape}>
              <GraduationCap size={22} color="#FFFFFF" />
            </div>
            <div className={styles.brandInfo}>
              <h2 className={styles.brandTitle}>Saksham Portal</h2>
              <div className={styles.brandTagline}>School of Excellence</div>
            </div>
          </div>
          
          <p className={styles.subtitle}>Sign in with your institutional credentials to access your dashboard.</p>

          {errorMessage && (
            <div className={styles.errorMessage} role="alert">
              {errorMessage}
            </div>
          )}
          
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.inputGroup}>
              <div className={styles.iconWrapper}>
                <Mail size={18} />
              </div>
              <input 
                type="email" 
                placeholder="Institutional Email (e.g. admin@gmail.com)" 
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className={styles.inputGroup}>
              <div className={styles.iconWrapper}>
                <Lock size={18} />
              </div>
              <input 
                type={showPassword ? 'text' : 'password'} 
                placeholder="Password" 
                className={`${styles.input} ${styles.passwordInput}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            <div className={styles.optionsRow}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" className={styles.checkbox} defaultChecked />
                <span>Remember me</span>
              </label>
              <span className={styles.helpText}>Need help? Contact Admin</span>
            </div>
            
            <button 
              type="submit" 
              className={`${styles.submitBtn} ${isSubmitting ? styles.loading : ''}`}
              disabled={isSubmitting}
            >
              <span className={styles.btnText}>
                {isSubmitting ? 'Authenticating...' : 'Sign In to Portal'}
              </span>
              {!isSubmitting && <ArrowRight size={18} className={styles.btnIcon} />}
            </button>
          </form>

          <div className={styles.footerNote}>
            <span>CBSE Affiliation: 2130842 • Official LMS Portal</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

