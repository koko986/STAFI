import { Mail, Phone } from "lucide-react";
import { useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  onDemo: () => void;
};

export function Login({ onDemo }: Props) {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");

  async function loginWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  }

  async function loginWithPhone() {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setStatus(error ? error.message : "Check your phone for the login code.");
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div>
          <p className="eyebrow">Java Chat</p>
          <h1>Messages, stories, voice, and AI in one place.</h1>
        </div>
        <button className="primary-button" onClick={loginWithGoogle}>
          <Mail size={18} />
          Continue with Gmail
        </button>
        <div className="phone-row">
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+959..." />
          <button onClick={loginWithPhone} aria-label="Send phone code">
            <Phone size={18} />
          </button>
        </div>
        <button className="secondary-button" onClick={onDemo}>
          Explore demo
        </button>
        {status && <p className="status">{status}</p>}
      </section>
    </main>
  );
}
