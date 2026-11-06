import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/api";
import Cookies from "js-cookie";
import { validateEmail } from "./hooks/helpers";
import { removeLocalStorage, deleteCookie } from "../components/hooks/helpers";
import { Mail, Lock, ArrowRight, Sparkles } from "lucide-react";
import "./Login.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const navigate = useNavigate();

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
          removeLocalStorage();
          localStorage.removeItem("ql_userID");
          localStorage.setItem("ql_userID", response.user?.user_id || email);
          localStorage.setItem("ql_userEmail", response.user?.email || email);
          if (response.user?.name) localStorage.setItem("ql_userName", response.user.name);
          Cookies.set("authToken", response.token, { expires: 1, path: "/" });
          navigate("/querylab");
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
    [email, password, navigate]
  );

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
            disabled={loading}
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
