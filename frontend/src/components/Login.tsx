import { KeyRound, Mail, Phone } from "lucide-react";
import { useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  onDemo: () => void;
};

type AuthMode = "sign-in" | "sign-up";

export function Login({ onDemo }: Props) {
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
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
      <section className="login-panel">
        <div>
          <p className="eyebrow">Java Chat</p>
          <h1>Messages, stories, voice, and AI in one place.</h1>
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
        <button className="primary-button" type="button" onClick={loginWithGoogle} disabled={busy}>
          <Mail size={18} />
          Continue with Google
        </button>
        <div className="auth-divider"><span>or use phone</span></div>
        <form className="phone-form" onSubmit={codeSent ? verifyPhoneCode : sendPhoneCode}>
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
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Please wait..." : codeSent ? "Verify & continue" : "Send code"}
          </button>
          {codeSent && (
            <button className="text-button" type="button" onClick={sendPhoneCode} disabled={busy}>
              Send code again
            </button>
          )}
        </form>
        <button className="secondary-button" type="button" onClick={onDemo} disabled={busy}>
          Explore demo
        </button>
        {status && <p className="status" role="status">{status}</p>}
      </section>
    </main>
  );
}
