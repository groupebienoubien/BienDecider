"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_CREDIT_USD } from "@/lib/llm-credit-rules";

export type CreditView = {
  balanceUsd: number;
  balanceAt: string;
  alertBelowUsd: number;
  remainingUsd: number;
  daysLeft: number | null;
  belowThreshold: boolean;
};

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

/** Crédit restant chez le fournisseur du modèle, estimé depuis le dernier solde saisi (story 8.2). */
export function LlmCreditPanel({ credit, todayUsd, monthUsd }: { credit: CreditView | null; todayUsd: number; monthUsd: number }) {
  const router = useRouter();
  const [balance, setBalance] = useState(credit ? String(credit.balanceUsd) : "");
  const [below, setBelow] = useState(String(credit?.alertBelowUsd ?? 5));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/llm-credit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balanceUsd: Number(balance), alertBelowUsd: Number(below) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Impossible d'enregistrer le solde.");
      setMessage("Solde enregistré.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d'enregistrer le solde.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="llm-credit-heading" className="setting-section">
      <h2 id="llm-credit-heading">Crédit du modèle</h2>
      <p>Le fournisseur n&apos;indique pas son solde : saisissez celui de sa console, le restant en est déduit avec la consommation mesurée depuis.</p>
      <dl>
        <dt>Dépense du jour</dt><dd>{todayUsd.toFixed(2)} $</dd>
        <dt>Dépense du mois</dt><dd>{monthUsd.toFixed(2)} $</dd>
        <dt>Crédit restant estimé</dt><dd>{credit ? `${credit.remainingUsd.toFixed(2)} $ (solde de ${credit.balanceUsd.toFixed(2)} $ saisi le ${DATE.format(new Date(credit.balanceAt))})` : "—"}</dd>
        <dt>Jours restants au rythme actuel</dt><dd>{credit && credit.daysLeft !== null ? `${Math.floor(credit.daysLeft)} jours` : "—"}</dd>
      </dl>
      {credit?.belowThreshold && <p role="alert" className="warning">Le crédit restant est sous le seuil de {credit.alertBelowUsd.toFixed(2)} $. Rechargez puis saisissez le nouveau solde.</p>}
      <form onSubmit={save} className="stack">
        <label className="field">
          Solde constaté chez le fournisseur ($)
          <input aria-label="Solde constaté chez le fournisseur en dollars" type="number" min={0} max={MAX_CREDIT_USD} step="0.01" required value={balance} onChange={(event) => setBalance(event.target.value)} />
        </label>
        <label className="field">
          Alerte sous ($)
          <input aria-label="Seuil d'alerte du crédit en dollars" type="number" min={0} max={MAX_CREDIT_USD} step="0.01" required value={below} onChange={(event) => setBelow(event.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer le solde"}</button>
        {message && <p role="status" className="notice">{message}</p>}
        {error && <p role="alert" className="warning">{error}</p>}
      </form>
    </section>
  );
}
