import { ArrowLeft, ArrowRight, Eye, KeyRound, Mail, Phone, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useState } from "react";
import { supabase } from "../lib/supabase";

type AuthMode = "sign-in" | "sign-up";

export function Login() {
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [showAuth, setShowAuth] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
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
    setCodeSent(false);
    setOtp("");
    setStatus("");
  }

  async function sendPhoneCode(event: React.FormEvent) {
    event.preventDefault();
    const normalizedPhone = phone.trim();

    if (!normalizedPhone.startsWith("+")) {
      setStatus("Enter your phone number with the country code, for example +959...");
      return;
    }

    setBusy(true);
    setStatus("");
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
      options: {
        shouldCreateUser: authMode === "sign-up"
      }
    });
    setBusy(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    setCodeSent(true);
    setStatus("Code sent. Enter the SMS code below.");
  }

  async function verifyPhoneCode(event: React.FormEvent) {
    event.preventDefault();

    if (!/^\d{6}$/.test(otp)) {
      setStatus("Enter the 6-digit code from the SMS.");
      return;
    }

    setBusy(true);
    setStatus("");
    const { error } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: otp,
      type: "sms"
    });
    setBusy(false);

    if (error) setStatus(error.message);
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
          <h1>Welcome back</h1>
          <p>Continue your journey with STAFI</p>
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
        <form className="phone-form" onSubmit={codeSent ? verifyPhoneCode : sendPhoneCode}>
          <label>
            Email address
            <div className="phone-input">
              <Mail size={18} aria-hidden="true" />
              <input placeholder="Email address" type="email" disabled={busy} />
            </div>
          </label>
          <div className="auth-divider"><span>or</span></div>
          <label>
            Phone number
            <div className="phone-input">
              <Phone size={18} aria-hidden="true" />
              <input
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  if (codeSent) {
                    setCodeSent(false);
                    setOtp("");
                  }
                }}
                placeholder="+959..."
                inputMode="tel"
                autoComplete="tel"
                disabled={busy}
              />
            </div>
          </label>
          <div className="auth-divider"><span>and</span></div>
          {codeSent && (
            <label>
              SMS code
              <div className="phone-input">
                <KeyRound size={18} aria-hidden="true" />
                <input
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={busy}
                />
              </div>
            </label>
          )}
          {!codeSent && (
            <label>
              Password
              <div className="phone-input">
                <KeyRound size={18} aria-hidden="true" />
                <input placeholder="Password" type="password" disabled />
                <Eye size={18} aria-hidden="true" />
              </div>
            </label>
          )}
          <button className="forgot-link" type="button" disabled>Forgot Password?</button>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Please wait..." : codeSent ? "Verify & continue" : "Sign In"} <ArrowRight size={19} />
          </button>
          {codeSent && (
            <button className="text-button" type="button" onClick={sendPhoneCode} disabled={busy}>
              Send code again
            </button>
          )}
        </form>
        <div className="auth-divider connect-divider"><span>or connect with</span></div>
        <button className="google-button" type="button" onClick={loginWithGoogle} disabled={busy}>
          <Mail size={18} />
          Google
        </button>
        {status && <p className="status" role="status">{status}</p>}
        <p className="create-account-copy">
          Don't have an account? <button type="button" onClick={() => changeAuthMode("sign-up")}>Create Account</button>
        </p>
      </section>
      )}
    </main>
  );
}
