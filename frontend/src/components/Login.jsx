import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, guestLogin } from "../api/api";
import Cookies from "js-cookie";
import { validateEmail } from "./hooks/helpers";
import { removeLocalStorage } from "../components/hooks/helpers";
import { Mail, Lock, ArrowRight, Sparkles, UserRound } from "lucide-react";
import "./Login.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const navigate = useNavigate();

  // Shared session persistence for password and guest logins.
  // Guest tokens expire after 10 minutes, so the cookie is pinned to that expiry.
  const persistAuthSession = useCallback((response, fallbackEmail = "") => {
    removeLocalStorage();
    localStorage.setItem("ql_userID", response.user?.user_id || fallbackEmail);
    const emailValue = response.user?.email || fallbackEmail;
    if (emailValue) localStorage.setItem("ql_userEmail", emailValue);
    const nameValue = response.user?.name || response.user?.display_name;
    if (nameValue) localStorage.setItem("ql_userName", nameValue);

    const expiresInSeconds = Number(response.expires_in_seconds) || 0;
    if (response.user?.is_guest && expiresInSeconds > 0) {
      const expiresAt = Date.now() + expiresInSeconds * 1000;
      localStorage.setItem("ql_isGuest", "true");
      localStorage.setItem("ql_guestExpiresAt", String(expiresAt));
      Cookies.set("authToken", response.token, { expires: new Date(expiresAt), path: "/" });
    } else {
      localStorage.removeItem("ql_isGuest");
      localStorage.removeItem("ql_guestExpiresAt");
      Cookies.set("authToken", response.token, { expires: 1, path: "/" });
    }
    navigate("/querylab");
  }, [navigate]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setLoginError("");

      if (!validateEmail(email)) {
        setEmailError("Please enter a valid email address");
        return;
      } else {
        setEmailError("");
      }

      setLoading(true);

      try {
        const response = await login({ user_id: email, password });
        if (response?.token) {
          persistAuthSession(response, email);
        } else {
          navigate("/");
        }
      } catch (error) {
        console.error("Login failed:", error);
        setLoginError("Invalid credentials. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, password, navigate, persistAuthSession]
  );

  const handleGuestLogin = useCallback(async () => {
    setLoginError("");
    setGuestLoading(true);
    try {
      const response = await guestLogin();
      if (response?.token) {
        persistAuthSession(response);
      } else {
        setLoginError("Guest login failed. Please try again.");
      }
    } catch (error) {
      console.error("Guest login failed:", error);
      const detail = error?.response?.data?.detail;
      setLoginError(
        error?.response?.status === 429
          ? detail || "Guest session limit reached for this origin."
          : "Guest login is unavailable right now. Please try again."
      );
    } finally {
      setGuestLoading(false);
    }
  }, [persistAuthSession]);

  return (
    <div className="login-page">
      {/* Animated background elements */}
      <div className="login-bg-gradient"></div>
      <div className="login-bg-pattern"></div>
      
      {/* Floating orbs for visual interest */}
      <div className="login-orb login-orb-1"></div>
      <div className="login-orb login-orb-2"></div>
      <div className="login-orb login-orb-3"></div>

      <div className="login-container">
        {/* Logo with glow effect */}
        <div className="login-logo-wrapper">
          <div className="login-logo-glow"></div>
          <img src="/ql-logo.svg" alt="Query Labs Logo" className="login-logo" />
        </div>

        {/* Welcome Text */}
        <div className="login-header">
          <h1 className="login-title">
            Welcome to <span className="login-title-highlight">Query Labs</span>
          </h1>
          <p className="login-subtitle">
            <Sparkles className="inline-block w-4 h-4 mr-1 text-purple-400" />
            Your AI-powered business intelligence assistant
          </p>
        </div>

        {/* Login Error */}
        {loginError && (
          <div className="login-error">
            <div className="login-error-icon">!</div>
            {loginError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {/* Email Field */}
          <div className="login-field-group">
            <div className={`login-input-wrapper ${focusedField === 'email' ? 'focused' : ''} ${emailError ? 'error' : ''}`}>
              <Mail className={`login-input-icon ${focusedField === 'email' ? 'active' : ''}`} />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                }}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                required
                className="login-input"
              />
            </div>
            {emailError && (
              <p className="login-field-error">{emailError}</p>
            )}
          </div>

          {/* Password Field */}
          <div className="login-field-group">
            <div className={`login-input-wrapper ${focusedField === 'password' ? 'focused' : ''}`}>
              <Lock className={`login-input-icon ${focusedField === 'password' ? 'active' : ''}`} />
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                required
                className="login-input"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || guestLoading}
            className={`login-button ${loading ? 'loading' : ''}`}
          >
            {loading ? (
              <>
                <div className="login-spinner"></div>
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="login-button-icon" />
              </>
            )}
          </button>
        </form>

        {/* Guest access */}
        <div className="login-divider">
          <span>or</span>
        </div>
        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={guestLoading || loading}
          className={`login-guest-button ${guestLoading ? 'loading' : ''}`}
        >
          {guestLoading ? (
            <>
              <div className="login-spinner"></div>
              <span>Starting guest session...</span>
            </>
          ) : (
            <>
              <UserRound className="login-guest-icon" />
              <span>Continue as Guest</span>
            </>
          )}
        </button>
        <p className="login-guest-hint">10-minute access · 3 guest sessions per origin</p>

        {/* Forgot Password Link */}
        <div className="login-footer">
          <a href="/forgot-password" className="login-forgot-link">
            Forgot your password?
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;
