import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import styles from './Login.module.css';
import { useAuth } from '../context/AuthContext';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    <div className={styles.loginContainer}>
      {/* Dynamic Animated Mesh Gradient Background */}
      <div className={styles.auroraBackground}>
        <div className={styles.aurora1}></div>
        <div className={styles.aurora2}></div>
        <div className={styles.aurora3}></div>
      </div>
      
      {/* Premium Glassmorphic Card */}
      <div className={styles.loginCard}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoShape}></div>
          <h2>Saksham LMS</h2>
        </div>
        
        <p className={styles.subtitle}>Welcome back. Let's shape the future.</p>

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
              placeholder="Admin / Teacher Email" 
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
              <input type="checkbox" className={styles.checkbox} />
              <span>Remember me</span>
            </label>
            <a href="#" className={styles.forgotLink}>Forgot password?</a>
          </div>
          
          <button 
            type="submit" 
            className={`${styles.submitBtn} ${isSubmitting ? styles.loading : ''}`}
            disabled={isSubmitting}
          >
            <span className={styles.btnText}>
              {isSubmitting ? 'Authenticating...' : 'Secure Sign In'}
            </span>
            {!isSubmitting && <ArrowRight size={18} className={styles.btnIcon} />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
