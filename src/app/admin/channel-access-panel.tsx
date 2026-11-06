"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AccessOverview } from "@/lib/channel-access";

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

/** Ouverture des canaux tant que les fournisseurs n'ont pas approuvé l'application, et accès par entreprise (#301, #302). */
export function ChannelAccessPanel({ overview, companies }: { overview: AccessOverview; companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const restricted = overview.rollouts.filter((rollout) => rollout.enabled && !rollout.openToAll);
  const [companyId, setCompanyId] = useState("");
  const [channel, setChannel] = useState("");

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/channel-access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Enregistrement impossible.");
      return;
    }
    router.refresh();
  }

  return (
    <section aria-labelledby="channel-access-heading" className="setting-section">
      <h2 id="channel-access-heading">Accès aux canaux</h2>
      <p>Tant qu&apos;un fournisseur n&apos;a pas approuvé l&apos;application, réservez son canal aux entreprises déclarées comme testeurs chez lui, puis ouvrez-le à tous.</p>
      <ul className="channel-rollouts">
        {overview.rollouts.filter((rollout) => rollout.enabled).map((rollout) => (
          <li key={rollout.channel}>
            <strong>{rollout.label}</strong> · {rollout.openToAll ? "ouvert à tous" : "entreprises autorisées seulement"}
            <button type="button" disabled={busy} onClick={() => void save({ channel: rollout.channel, openToAll: !rollout.openToAll })}>
              {rollout.openToAll ? `Réserver ${rollout.label}` : `Ouvrir ${rollout.label} à tous`}
            </button>
          </li>
        ))}
      </ul>
      {restricted.length > 0 && (
        <form className="stack" onSubmit={(event) => { event.preventDefault(); void save({ channel, companyId, granted: true }); }}>
          <label className="field"><span>Entreprise</span>
            <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              <option value="">Choisir</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name || company.id}</option>)}
            </select>
          </label>
          <label className="field"><span>Canal réservé</span>
            <select value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="">Choisir</option>
              {restricted.map((rollout) => <option key={rollout.channel} value={rollout.channel}>{rollout.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={busy || !companyId || !channel}>Autoriser cette entreprise</button>
        </form>
      )}
      {overview.accesses.length === 0 ? <p className="muted">Aucune demande ni autorisation.</p> : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Entreprise</th><th>Canal</th><th>État</th><th>Depuis</th><th></th></tr></thead>
            <tbody>
              {overview.accesses.map((access) => (
                <tr key={`${access.companyId}-${access.channel}`}>
                  <td>{access.companyName}</td>
                  <td>{access.label}</td>
                  <td>{access.status === "granted" ? "Autorisée" : "Accès demandé"}</td>
                  <td>{access.at ? DATE.format(new Date(access.at)) : "—"}</td>
                  <td>
                    <button type="button" disabled={busy} aria-label={`${access.status === "granted" ? "Retirer" : "Autoriser"} ${access.companyName} sur ${access.label}`} onClick={() => void save({ channel: access.channel, companyId: access.companyId, granted: access.status !== "granted" })}>
                      {access.status === "granted" ? "Retirer" : "Autoriser"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p role="alert" className="warning">{error}</p>}
    </section>
  );
}
