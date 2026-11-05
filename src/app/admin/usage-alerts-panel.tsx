"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_USAGE_ALERT_USD, MIN_USAGE_ALERT_USD, type UsageAlertThresholds } from "@/lib/usage-alert-rules";
import { CREDIT_ALERT_SCOPE } from "@/lib/llm-credit-rules";

type AlertView = { id: string; day: string; label: string; scope: string; thresholdUsd: number; costUsd: number };

function alertLine(alert: AlertView): string {
  if (alert.scope === CREDIT_ALERT_SCOPE) return `${alert.label} : ${alert.costUsd.toFixed(2)} $ restants pour un seuil de ${alert.thresholdUsd.toFixed(2)} $`;
  return `${alert.scope === "total" ? "Consommation totale" : alert.label} : ${alert.costUsd.toFixed(2)} $ pour un seuil de ${alert.thresholdUsd.toFixed(2)} $`;
}

/** Seuils d'alerte de consommation, alertes du jour et historique récent (story 7.3). */
export function UsageAlertsPanel({ thresholds, alerts, today }: { thresholds: UsageAlertThresholds; alerts: AlertView[]; today: string }) {
  const router = useRouter();
  const [company, setCompany] = useState(String(thresholds.companyDailyUsd));
  const [total, setTotal] = useState(String(thresholds.totalDailyUsd));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const todays = alerts.filter((alert) => alert.day === today);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/usage-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyDailyUsd: Number(company), totalDailyUsd: Number(total) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Impossible d'enregistrer les seuils.");
      setMessage("Seuils enregistrés.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d'enregistrer les seuils.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="usage-alerts-heading" className="setting-section">
      <h2 id="usage-alerts-heading">Alertes de consommation</h2>
      <p>
        Une alerte est enregistrée, et envoyée par e-mail aux administrateurs, quand le coût du jour (heure de Paris) d&apos;une entreprise
        ou le coût total atteint son seuil. Une seule alerte par seuil et par jour.
      </p>
      {todays.length > 0 && (
        <div role="alert" className="warning">
          <strong>Seuil franchi aujourd&apos;hui</strong>
          <ul>
            {todays.map((alert) => (
              <li key={alert.id}>{alertLine(alert)}</li>
            ))}
          </ul>
        </div>
      )}
      <form onSubmit={save} className="stack">
        <label className="field">
          Seuil par entreprise et par jour ($)
          <input aria-label="Seuil par entreprise et par jour en dollars" type="number" min={MIN_USAGE_ALERT_USD} max={MAX_USAGE_ALERT_USD} step="0.01" required value={company} onChange={(event) => setCompany(event.target.value)} />
        </label>
        <label className="field">
          Seuil total par jour ($)
          <input aria-label="Seuil total par jour en dollars" type="number" min={MIN_USAGE_ALERT_USD} max={MAX_USAGE_ALERT_USD} step="0.01" required value={total} onChange={(event) => setTotal(event.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer les seuils"}</button>
        {message && <p role="status" className="notice">{message}</p>}
        {error && <p role="alert" className="warning">{error}</p>}
      </form>
      {alerts.length > 0 && (
        <details>
          <summary>Dernières alertes ({alerts.length})</summary>
          <ul>
            {alerts.map((alert) => (
              <li key={alert.id}>{alert.day} · {alert.scope === "total" ? "Total" : alert.label} · {alert.costUsd.toFixed(2)} $ / {alert.thresholdUsd.toFixed(2)} $</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
