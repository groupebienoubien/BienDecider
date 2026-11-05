"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signupAvailability, signupCapAlert } from "@/lib/signup-rules";

type Props = { open: boolean; dailyCap: number | null; todayCount: number };

export function SignupControlForm(initial: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [open, setOpen] = useState(initial.open);
  const [cap, setCap] = useState(initial.dailyCap === null ? "" : String(initial.dailyCap));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const control = { open: saved.open, dailyCap: saved.dailyCap };
  const availability = signupAvailability(control, saved.todayCount);
  const alert = signupCapAlert(control, saved.todayCount);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const trimmed = cap.trim();
      const response = await fetch("/api/admin/signup-control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open, dailyCap: trimmed === "" ? null : Number(trimmed) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Impossible d'enregistrer le réglage.");
      setSaved({ open: body.open, dailyCap: body.dailyCap, todayCount: body.todayCount });
      setMessage("Réglage enregistré.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d'enregistrer le réglage.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="signup-control-heading" className="setting-section">
      <h2 id="signup-control-heading">Inscriptions</h2>
      <p>
        Réglage global, appliqué tout de suite sans redéploiement. Les comptes existants se connectent toujours.
        Le plafond se compte par jour, de minuit à minuit (heure de Paris).
      </p>
      <p>
        <strong>
          {availability === "closed" ? "Fermées" : availability === "full" ? "Complètes aujourd'hui" : "Ouvertes"}
        </strong>
        {" · "}
        {saved.todayCount} inscription{saved.todayCount > 1 ? "s" : ""} aujourd&apos;hui
        {saved.dailyCap !== null ? ` sur ${saved.dailyCap}` : " (sans plafond)"}
      </p>
      {alert && saved.dailyCap !== null && (
        <p role="alert" className="warning">
          {saved.todayCount >= saved.dailyCap
            ? "Le plafond du jour est atteint : les nouvelles inscriptions sont refusées jusqu'à demain."
            : `Le plafond du jour est presque atteint (${saved.todayCount} sur ${saved.dailyCap}).`}
        </p>
      )}
      <form onSubmit={save} className="stack">
        <label className="field">
          <span>
            <input type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} /> Inscriptions ouvertes
          </span>
        </label>
        <label className="field">
          Plafond d&apos;inscriptions par jour (laisser vide : aucun plafond)
          <input
            aria-label="Plafond d'inscriptions par jour"
            type="number"
            min="1"
            max="10000"
            step="1"
            inputMode="numeric"
            value={cap}
            onChange={(event) => setCap(event.target.value)}
          />
        </label>
        <button className="btn primary" type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        {message && <p role="status" className="notice">{message}</p>}
        {error && <p role="alert" className="warning">{error}</p>}
      </form>
    </section>
  );
}
