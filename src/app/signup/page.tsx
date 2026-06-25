"use client";

import React, { useState, useEffect, useRef, CSSProperties, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import EyesLogo from "@/components/common/EyesLogo";

const GRID = 28;

function GridCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef<{ x: number; y: number }>({ x: -999, y: -999 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    const onResize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    const onMove = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove);

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let r = 0; r * GRID < H + GRID; r++) {
        for (let c = 0; c * GRID < W + GRID; c++) {
          const x = c * GRID, y = r * GRID;
          const d = Math.hypot(x - mouse.current.x, y - mouse.current.y);
          const a = d < 200 ? 0.03 + 0.1 * (1 - d / 200) : 0.025;
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
        }
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}

interface OAuthButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function OAuthButton({ onClick, icon, label }: OAuthButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        padding: "14px 16px",
        background: hovered ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"}`,
        borderRadius: 12,
        color: hovered ? "#fff" : "#ccc",
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s ease",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        fontFamily: "'DM Sans', sans-serif",
        flex: 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

interface InputFieldProps {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: React.ReactNode;
  required?: boolean;
}

function InputField({ id, label, type, placeholder, value, onChange, icon, required = true }: InputFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ marginBottom: "16px", textAlign: "left" }}>
      <label htmlFor={id} style={{
        display: "block",
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.15em",
        color: focused ? "#E06A3B" : "#6b6b6b",
        textTransform: "uppercase",
        transition: "color 0.3s ease",
        fontFamily: "var(--font-sans)",
        marginBottom: "6px",
      }}>{label}</label>
      <div style={{ position: "relative" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}>
        <div style={{
          position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
          color: focused ? "#E06A3B" : "#555", transition: "color 0.3s ease", zIndex: 1,
          display: "flex", alignItems: "center",
        }}>{icon}</div>
        <input
          suppressHydrationWarning
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            background: focused
              ? "rgba(224,106,59,0.03)"
              : hovered ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)",
            border: `1px solid ${focused ? "rgba(224,106,59,0.4)" : hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
            borderRadius: "12px",
            color: "#fff",
            fontSize: "13.5px",
            padding: "11px 14px 11px 40px",
            outline: "none",
            boxSizing: "border-box",
            transition: "all 0.3s ease",
            boxShadow: focused ? "0 0 0 3px rgba(224,106,59,0.08), inset 0 1px 0 rgba(255,255,255,0.03)" : "none",
            caretColor: "#E06A3B",
          }}
        />
        {focused && (
          <div style={{
            position: "absolute",
            bottom: 0, left: "10%", right: "10%",
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(224,106,59,0.5), transparent)",
            borderRadius: "2px",
          }} />
        )}
      </div>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading, signup, loginWithGoogle, loginWithGithub } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [emailHover, setEmailHover] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [backHovered, setBackHovered] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && user) {
      router.push("/");
    }
  }, [user, isAuthLoading, router]);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Complete all identification fields to proceed.");
      return;
    }

    if (!email.includes("@")) {
      setError("Ensure the email address is valid.");
      return;
    }

    if (password.length < 8) {
      setError("For security, your password must exceed 8 characters.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signup(name, email, password);

      if (result.success) {
        router.push("/");
      } else {
        setError(result.message || "Identity creation failed. Please check your data.");
        setIsLoading(false);
      }
    } catch (err) {
      setError("Identity server connection failed. Try again in 30 seconds.");
      setIsLoading(false);
      console.error("Signup Failure:", err);
    }
  }, [name, email, password, signup, router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        position: "relative",
        overflow: "hidden",
        padding: "24px",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

      {/* Ambient orbs */}
      {[
        { width: 500, height: 500, top: "-20%", left: "-10%", background: "rgba(59,130,246,0.06)" },
        { width: 400, height: 400, bottom: "-15%", right: "-10%", background: "rgba(224,106,59,0.07)" },
      ].map((s, i) => (
        <div
          key={i}
          style={{
            position: "fixed",
            borderRadius: "50%",
            filter: "blur(90px)",
            pointerEvents: "none",
            ...s,
          }}
        />
      ))}

      <GridCanvas />

      {/* Main navigation (Go Back) */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0,
        padding: "16px 28px",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        zIndex: 10,
      }}>
        <Link
          href="/"
          onMouseEnter={() => setBackHovered(true)}
          onMouseLeave={() => setBackHovered(false)}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            color: backHovered ? "#fff" : "#555", textDecoration: "none", fontSize: "10px",
            fontFamily: "var(--font-sans)", letterSpacing: "0.12em",
            transition: "color 0.2s",
            fontWeight: 500,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          GO BACK
        </Link>
      </div>

      {/* Main content */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          width: "100%",
          maxWidth: 480,
          textAlign: "center",
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Logo row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
            color: "#fff",
          }}
        >
          <EyesLogo width={110} height={26} />
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 38px)",
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            marginBottom: 32,
          }}
        >
          Create your{" "}
          <em
            style={{
              fontStyle: "italic",
              fontFamily: "'DM Serif Display', serif",
              fontWeight: 400,
              color: "#E06A3B",
            }}
          >
            sanctum
          </em>
        </h1>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "10px",
            padding: "10px 12px",
            color: "#f87171",
            fontSize: "12px",
            textAlign: "center",
            marginBottom: "16px",
            fontFamily: "var(--font-sans)",
          }}>
            {error}
          </div>
        )}

        {!showEmailForm ? (
          <div>
            {/* OAuth buttons */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <OAuthButton
                onClick={() => loginWithGoogle()}
                label="Login with Google"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                }
              />
            </div>

            {/* Divider */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 20,
              }}
            >
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
              <span
                style={{
                  fontSize: 12,
                  color: "#444",
                  fontFamily: "var(--font-sans)",
                  letterSpacing: "0.08em",
                }}
              >
                OR
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            </div>

            {/* Continue with Email */}
            <button
              onMouseEnter={() => setEmailHover(true)}
              onMouseLeave={() => setEmailHover(false)}
              onClick={() => setShowEmailForm(true)}
              style={{
                width: "100%",
                padding: "15px",
                background: emailHover ? "#f0f0f0" : "#fff",
                border: "none",
                borderRadius: 12,
                color: "#111",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
                fontFamily: "'DM Sans', sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginBottom: 28,
                transform: emailHover ? "translateY(-1px)" : "translateY(0)",
                boxShadow: emailHover ? "0 8px 24px rgba(255,255,255,0.10)" : "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Continue with Email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Full Name Field */}
            <InputField
              id="name" label="Full Name" type="text"
              placeholder="John Doe"
              value={name} onChange={e => setName(e.target.value)}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
            />

            {/* Email Field */}
            <InputField
              id="email" label="Email" type="email"
              placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              }
            />

            {/* Password Field */}
            <div style={{ position: "relative" }}>
              <InputField
                id="password" label="Password" type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
              />
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "#444", padding: "4px",
                  display: "flex", alignItems: "center",
                  transition: "color 0.2s",
                  zIndex: 2,
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#E06A3B"}
                onMouseLeave={e => e.currentTarget.style.color = "#444"}
              >
                {showPw
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" /></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                }
              </button>
            </div>

            {/* Submit Button */}
            <button
              suppressHydrationWarning
              type="submit"
              disabled={isLoading}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
              style={{
                width: "100%",
                padding: "15px",
                background: btnHover ? "#f0f0f0" : "#fff",
                border: "none",
                borderRadius: 12,
                color: "#111",
                fontSize: 15,
                fontWeight: 600,
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.7 : 1,
                transition: "all 0.2s ease",
                fontFamily: "'DM Sans', sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginBottom: 28,
                transform: btnHover && !isLoading ? "translateY(-1px)" : "translateY(0)",
                boxShadow: btnHover && !isLoading ? "0 8px 24px rgba(255,255,255,0.10)" : "none",
              }}
            >
              {isLoading ? "Creating Account..." : "Create Account"}
              {!isLoading && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>

            {/* Back to Options Link */}
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false);
                  setError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#555",
                  fontSize: "12px",
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontFamily: "var(--font-sans)",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#E06A3B"}
                onMouseLeave={e => e.currentTarget.style.color = "#555"}
              >
                ← Back to options
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <p
            style={{
              fontSize: 13,
              color: "#444",
              fontFamily: "var(--font-sans)",
              margin: 0,
            }}
          >
            Already have an account?{" "}
            <Link
              href="/login"
              style={{
                color: "#666",
                textDecoration: "none",
                borderBottom: "1px solid rgba(255,255,255,0.12)",
                paddingBottom: 1,
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = "#E06A3B";
                (e.target as HTMLElement).style.borderBottomColor = "rgba(224,106,59,0.4)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = "#666";
                (e.target as HTMLElement).style.borderBottomColor = "rgba(255,255,255,0.12)";
              }}
            >
              Sign In
            </Link>
          </p>
        </div>

        {/* Bottom glow */}
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: "50%",
            transform: "translateX(-50%)",
            width: 300,
            height: 80,
            background: "radial-gradient(ellipse, rgba(224,106,59,0.10) 0%, transparent 70%)",
            filter: "blur(20px)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Bottom status bar */}
      <div style={{
        position: "fixed", bottom: "20px",
        display: "flex", alignItems: "center", gap: "6px",
        opacity: loaded ? 0.35 : 0,
        transition: "opacity 1.2s ease 0.5s",
        zIndex: 5,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} />
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "9px", color: "#555", letterSpacing: "0.1em" }}>SANCTUM SECURE</span>
      </div>
    </div>
  );
}
