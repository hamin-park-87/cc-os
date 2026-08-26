"use client";
import { useEffect } from "react";

export function Modal({ title, onClose, children, footer, width = 560 }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(8,14,13,.62)", backdropFilter: "blur(4px)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card modal-card" style={{ width: `min(${width}px,100%)`, maxHeight: "92dvh", overflow: "auto", padding: 24, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16 }}>{title}</h3>
          <button className="iconbtn" style={{ marginLeft: "auto" }} onClick={onClose}>✕</button>
        </div>
        {children}
        {footer && <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}

export const inp: React.CSSProperties = {
  fontFamily: "var(--body)", fontSize: 13.5, padding: "9px 11px", borderRadius: 9,
  border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--ink)", width: "100%",
};
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{label}</label>{children}</div>);
}
