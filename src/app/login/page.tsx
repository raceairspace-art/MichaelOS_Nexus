"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LockKeyhole, Sparkles } from "lucide-react";
import { preparePasskeyRequest, serializePublicKeyCredential } from "@/lib/webauthn-client";
import styles from "./login.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password || loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign-in failed.");
      window.location.replace(new URLSearchParams(window.location.search).get("next") || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally { setLoading(false); }
  }

  async function signInWithPasskey() {
    if (passkeyLoading) return;
    setPasskeyLoading(true); setError("");
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) throw new Error("This browser does not support passkeys.");
      const start = await fetch("/api/auth/passkey/options", { method: "POST" });
      const startData = await start.json();
      if (!start.ok) throw new Error(startData.error || "Passkey sign-in is not enabled yet.");
      const credential = await navigator.credentials.get({ publicKey: preparePasskeyRequest(startData.options) });
      if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey sign-in was cancelled.");
      const verify = await fetch("/api/auth/passkey/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_id: startData.challenge_id, credential: serializePublicKeyCredential(credential) }),
      });
      const verifyData = await verify.json();
      if (!verify.ok) throw new Error(verifyData.error || "Passkey sign-in failed.");
      window.location.replace(new URLSearchParams(window.location.search).get("next") || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey sign-in failed.");
    } finally { setPasskeyLoading(false); }
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <div className={styles.brand}><span><Sparkles size={19}/></span><div><strong>MichaelOS Nexus</strong><small>Private workspace</small></div></div>
      <div className={styles.heading}><LockKeyhole size={24}/><div><h1>Sign in</h1><p>Your Oliver research, saved decisions, and OpenAI-backed tools are protected behind this session.</p></div></div>
      <form onSubmit={signIn} className={styles.form}>
        <label><span>Email</span><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="MichaelOS account email"/></label>
        <label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password"/></label>
        <button className={styles.primary} disabled={loading||!email.trim()||!password}>{loading?"Signing in…":"Sign in"}</button>
      </form>
      <div className={styles.divider}><span>or</span></div>
      <button className={styles.passkey} disabled={passkeyLoading} onClick={()=>void signInWithPasskey()}><KeyRound size={17}/>{passkeyLoading?"Waiting for passkey…":"Use passkey / Windows Hello"}</button>
      <p className={styles.note}>Passkeys can use Windows Hello, your Windows PIN, biometrics, a phone, or a security key once passkeys are enabled for the final Nexus domain.</p>
      {error&&<div className={styles.error}>{error}</div>}
    </section>
  </main>;
}
