import { ArrowLeft, ArrowRight, Eye, KeyRound, Mail, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useState } from "react";
import { supabase } from "../lib/supabase";

type AuthMode = "sign-in" | "sign-up";

export function Login() {
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function loginWithGoogle() {
    setBusy(true);
    setStatus("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: "select_account"
        }
      }
    });
    if (error) {
      setStatus(error.message);
      setBusy(false);
    }
  }

  function changeAuthMode(mode: AuthMode) {
    setAuthMode(mode);
    setStatus("");
  }

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setStatus("Enter your email and password.");
      return;
    }
    if (password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    setStatus("");
    const { error } = authMode === "sign-up"
      ? await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: window.location.origin }
      })
      : await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });
    setBusy(false);

    if (error) {
      setStatus(error.message);
      return;
    }
    if (authMode === "sign-up") {
      setStatus("Account created. Check your email if confirmation is required.");
    }
  }

  async function resetPassword() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setStatus("Enter your email address first.");
      return;
    }
    setBusy(true);
    setStatus("");
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: window.location.origin
    });
    setBusy(false);
    setStatus(error ? error.message : "Password reset link sent to your email.");
  }

  return (
    <main className="login-shell">
      {!showAuth ? (
        <section className="stafi-landing">
          <header className="stafi-auth-header">
            <span className="stafi-brand">
              <span className="stafi-logo-mark image-mark"><img src="/stafi-logo.jpg" alt="" /></span>
              <strong>STAFI</strong>
            </span>
            <button className="help-link" type="button">Help Center</button>
          </header>
          <div className="stafi-hero-copy">
            <p className="hero-pill">Intelligent human synergy</p>
            <h1>Your conversations, <span>Empowered</span> by your personal AI assistant.</h1>
            <p>Message your friends and groups while letting your personal AI assistant handle summaries, drafts, and research on the fly.</p>
          </div>
          <div className="landing-actions">
            <button className="primary-button" type="button" onClick={() => setShowAuth(true)}>
              Get Started <ArrowRight size={20} />
            </button>
            <button className="secondary-button" type="button" onClick={() => setShowAuth(true)}>
              Log In
            </button>
          </div>
          <section className="landing-feature-list" aria-label="Features">
            <article>
              <span><Zap size={20} /></span>
              <strong>Smart Summaries</strong>
              <p>Catch up on long group chats and lengthy message threads in seconds.</p>
            </article>
            <article>
              <span><ShieldCheck size={20} /></span>
              <strong>Secure & Private</strong>
              <p>Privacy-minded controls keep your personal conversations carefully protected.</p>
            </article>
            <article>
              <span><Sparkles size={20} /></span>
              <strong>AI Assistant</strong>
              <p>Draft replies, brainstorm ideas, and search the web right inside your chats.</p>
            </article>
          </section>
        </section>
      ) : (
      <section className="login-panel">
        <button className="auth-back" type="button" onClick={() => setShowAuth(false)} title="Back">
          <ArrowLeft size={24} />
        </button>
        <div className="login-brand-lockup">
          <span className="stafi-brand">
            <span className="stafi-logo-mark image-mark"><img src="/stafi-logo.jpg" alt="" /></span>
            <strong>STAFI</strong>
          </span>
          <h1>{authMode === "sign-up" ? "Create account" : "Welcome back"}</h1>
          <p>{authMode === "sign-up" ? "Create your STAFI account with email" : "Continue with email or Google"}</p>
        </div>
        <div className="auth-mode" aria-label="Authentication mode">
          <button
            className={authMode === "sign-in" ? "active" : ""}
            type="button"
            onClick={() => changeAuthMode("sign-in")}
          >
            Sign in
          </button>
          <button
            className={authMode === "sign-up" ? "active" : ""}
            type="button"
            onClick={() => changeAuthMode("sign-up")}
          >
            Sign up
          </button>
        </div>
        <form className="auth-form" onSubmit={submitCredentials}>
          <label className="auth-field">
            <span>Email address</span>
            <div className="auth-input">
              <Mail size={18} aria-hidden="true" />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email address"
                type="email"
                autoComplete="email"
                disabled={busy}
              />
            </div>
          </label>
          <label className="auth-field">
            <span>Password</span>
            <div className="auth-input">
              <KeyRound size={18} aria-hidden="true" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type={showPassword ? "text" : "password"}
                autoComplete={authMode === "sign-up" ? "new-password" : "current-password"}
                disabled={busy}
              />
              <button
                className="password-toggle"
                type="button"
                title={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
                disabled={busy}
              >
                <Eye size={18} aria-hidden="true" />
              </button>
            </div>
          </label>
          <button className="forgot-link" type="button" onClick={resetPassword} disabled={busy}>
            Forgot Password?
          </button>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Please wait..." : authMode === "sign-up" ? "Create Account" : "Sign In"} <ArrowRight size={19} />
          </button>
        </form>
        <div className="auth-divider connect-divider"><span>or connect with</span></div>
        <button className="google-button" type="button" onClick={loginWithGoogle} disabled={busy}>
          <Mail size={18} />
          Google
        </button>
        {status && <p className="status" role="status">{status}</p>}
        <p className="create-account-copy">
          {authMode === "sign-up" ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => changeAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up")}
          >
            {authMode === "sign-up" ? "Log In" : "Create Account"}
          </button>
        </p>
      </section>
      )}
    </main>
  );
}
