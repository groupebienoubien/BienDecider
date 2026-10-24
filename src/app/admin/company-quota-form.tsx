"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Limits = {
  dailyAgentRunLimit: number;
  monthlyAgentRunLimit: number;
  dailyChatMessageLimit: number;
  monthlyChatMessageLimit: number;
  dailySpendLimitUsd: number;
  monthlySpendLimitUsd: number;
};

export function CompanyQuotaForm({
  companyId,
  limits,
  dailyRuns,
  monthlyRuns,
  dailyMessages,
  monthlyMessages,
  dailyCost,
  monthlyCost,
  reservedCost,
}: { companyId: string; limits: Limits; dailyRuns: number; monthlyRuns: number; dailyMessages: number; monthlyMessages: number; dailyCost: number; monthlyCost: number; reservedCost: number }) {
  const router = useRouter();
  const [values, setValues] = useState(limits);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/companies/${companyId}/limits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Impossible d'enregistrer les plafonds.");
      setMessage("Enregistré");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer les plafonds.");
    } finally {
      setSaving(false);
    }
  }

  function numberField(key: keyof Limits, label: string, step = "1") {
    return <label className="field">
      {label}
      <input aria-label={label} type="number" min="0" step={step} value={values[key]} onChange={(event) => setValues((previous) => ({ ...previous, [key]: Number(event.target.value) }))} />
    </label>;
  }

  return <form onSubmit={save} style={{ minWidth: 352 }}>
    <div className="settings-grid" style={{ gap: 8 }}>
      {numberField("dailyChatMessageLimit", "Messages à Paul/jour")}
      {numberField("monthlyChatMessageLimit", "Messages à Paul/mois")}
      {numberField("dailyAgentRunLimit", "Lancements/jour")}
      {numberField("monthlyAgentRunLimit", "Lancements/mois")}
      {numberField("dailySpendLimitUsd", "USD/jour", "0.01")}
      {numberField("monthlySpendLimitUsd", "USD/mois", "0.01")}
    </div>
    <small>Aujourd&apos;hui (heure de Paris) : {dailyMessages}/{limits.dailyChatMessageLimit} messages à Paul · {dailyRuns}/{limits.dailyAgentRunLimit} lancements · ${dailyCost.toFixed(2)} utilisés + ${reservedCost.toFixed(2)} réservés</small>
    <small>Ce mois-ci (heure de Paris) : {monthlyMessages}/{limits.monthlyChatMessageLimit} messages à Paul · {monthlyRuns}/{limits.monthlyAgentRunLimit} lancements · ${monthlyCost.toFixed(2)} utilisés + ${reservedCost.toFixed(2)} réservés</small>
    <div className="heading-actions">
      <button type="submit" disabled={saving} className="primary">{saving ? "…" : "Enregistrer"}</button>
      {message && <span role="status" className="tag green">{message}</span>}
      {error && <span role="alert" className="tag red">{error}</span>}
    </div>
  </form>;
}