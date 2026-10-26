"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentByline, PageHeading, Tag } from "@/components/mockup-ui";
import { Icon } from "@/components/icon";
import { ProductionPreview } from "@/components/production-preview";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { REVISION_INSTRUCTION_MAX } from "@/lib/agents/pending-action-view";
import { waitForAgentRun } from "@/lib/agent-runs-client";
import { proposalChannel } from "@/lib/proposal-channel";
import { STUDIO_AUTHOR_LABELS, STUDIO_LOCK_MESSAGES, STUDIO_QUICK_ACTIONS, type StudioState, type StudioVersion } from "@/lib/proposal-studio-shared";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof data?.error === "string" ? data.error : fallback;
}

/** Une ligne de la conversation : ce que le dirigeant a demandé, puis ce que l'agent a fait. */
function Thread({ state, agentName, onOpen, pending, selected }: {
  state: StudioState;
  agentName: string;
  onOpen: (version: number) => void;
  pending: string | null;
  selected: number;
}) {
  return (
    <>
      {state.versions.map((version) => (
        <div key={version.version} className="studio-turn">
          {version.instruction && version.source === "agent" && <p className="studio-bubble user">{version.instruction}</p>}
          {version.source === "restore" && <p className="studio-bubble system">{version.instruction ?? "Retour à une version précédente"} : la version {version.version} reprend son contenu.</p>}
          {version.source === "owner" && <p className="studio-bubble system">Vous avez modifié la production à la main : version {version.version}.</p>}
          {(version.source === "initial" || version.source === "agent") && (
            <div className="studio-bubble agent">
              <p>
                {version.source === "initial"
                  ? <>Voici ma proposition.{state.rationale ? <> {state.rationale}</> : null}</>
                  : version.note ?? `Voici la version ${version.version}.`}
              </p>
              <button type="button" className="text-link" aria-pressed={selected === version.version} onClick={() => onOpen(version.version)}>
                {selected === version.version ? `Version ${version.version} affichée` : `Voir la version ${version.version}`}
              </button>
            </div>
          )}
        </div>
      ))}
      {pending && (
        <div className="studio-turn">
          <p className="studio-bubble user">{pending}</p>
          <p className="studio-bubble agent" role="status">{agentName} prépare la nouvelle version…</p>
        </div>
      )}
    </>
  );
}

export function StudioClient({ initial, companyName, siteDestination }: { initial: StudioState; companyName: string; siteDestination: string | null }) {
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState(initial.proposal.version);
  const [compare, setCompare] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(initial.activeRunId);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);

  const { proposal } = state;
  const persona = PERSONAS[proposal.agent as Exclude<AgentKey, "co_ceo">];
  const agentName = persona?.name ?? "L’agent";
  const current = proposal.version;
  const viewed: StudioVersion = state.versions.find((version) => version.version === selected) ?? state.versions[state.versions.length - 1];
  const latest = state.versions[state.versions.length - 1];
  const working = runId !== null;
  const canWrite = state.locked === null && !working;
  const channel = proposalChannel(proposal.kind);

  const reload = useCallback(async () => {
    const response = await fetch(`/api/proposals/${proposal.id}/versions`);
    if (!response.ok) throw new Error(await readError(response, "Impossible de recharger le Studio. Rechargez la page."));
    const next = await response.json() as StudioState;
    setState(next);
    setSelected(next.proposal.version);
    setCompare(false);
    return next;
  }, [proposal.id]);

  // Suit la révision de l'agent (lancée ici ou reprise au rechargement), puis affiche la nouvelle version.
  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    (async () => {
      try {
        const finished = await waitForAgentRun(runId, () => undefined, controller.signal);
        if (controller.signal.aborted) return;
        if (!finished) setError(`${agentName} met plus de temps que prévu. Rechargez le Studio dans un instant.`);
        else if (finished.status === "failed") setError(finished.errorMessage ?? `${agentName} n’a pas pu préparer la version. Vous pouvez reformuler votre demande.`);
        else setNotice(`${agentName} a préparé une nouvelle version.`);
        await reload();
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Impossible de suivre la révision.");
      } finally {
        if (!controller.signal.aborted) { setRunId(null); setPending(null); }
      }
    })();
    return () => controller.abort();
  }, [runId, reload, agentName]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView?.({ block: "nearest" });
  }, [state.versions.length, pending]);

  async function send(instruction: string) {
    const text = instruction.trim();
    if (!text || !canWrite || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, expectedVersion: current }),
      });
      const data = await response.json().catch(() => null) as { runId?: string | null; error?: unknown } | null;
      if (!response.ok) {
        setError(typeof data?.error === "string" ? data.error : "La demande n’a pas pu être envoyée. Votre texte est conservé.");
        // Une autre révision ou une autre version existe déjà : on la rejoint plutôt que de laisser un Studio périmé.
        if (response.status === 409) await reload().catch(() => undefined);
        return;
      }
      setDraft("");
      setPending(text);
      setRunId(data?.runId ?? null);
      if (!data?.runId) await reload();
    } catch {
      setError("Connexion impossible. Votre texte est conservé, réessayez.");
    } finally {
      setSending(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: viewed.version, expectedVersion: current }),
      });
      if (!response.ok) {
        setError(await readError(response, "Le retour à cette version a échoué."));
        if (response.status === 409) await reload().catch(() => undefined);
        return;
      }
      const next = await reload();
      setNotice(`La version ${next.proposal.version} reprend le contenu de la version ${viewed.version}. Aucune version n’a été supprimée.`);
    } catch {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "validee", expectedVersion: current }),
      });
      if (!response.ok) {
        setError(await readError(response, "La validation a échoué."));
        if (response.status === 409) await reload().catch(() => undefined);
        return;
      }
      await reload();
      setNotice(`La version ${current} est validée. Rien n’est publié : la publication se confirme depuis vos décisions.`);
    } catch {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const onValidated = state.locked === "validated";
  const viewingOld = viewed.version !== latest.version;

  return (
    <div className="studio-page">
      <PageHeading
        kicker={`STUDIO · ${channel.toLocaleUpperCase("fr-FR")}`}
        title={proposal.title}
        description={<AgentByline agent={proposal.agent} size={24}>travaille avec vous sur cette production</AgentByline>}
        actions={<Link className="btn" href={`/dashboard?view=validation&proposal=${encodeURIComponent(proposal.id)}`}><Icon name="arrow-right" /> Retour aux décisions</Link>}
      />
      <div className="studio-layout">
        <section aria-label="Aperçu de la production" className="studio-preview">
          <div className="preview-label">
            <span>{channel} · version {viewed.version}{viewed.version === current ? " (actuelle)" : ""}</span>
            <span>{DATE_FORMAT.format(new Date(viewed.createdAt))}</span>
          </div>
          {compare && viewingOld ? (
            <div className="studio-compare">
              <div><p className="legend">Version {viewed.version}</p><ProductionPreview kind={proposal.kind} title={proposal.title} content={viewed.content} version={viewed.version} companyName={companyName} siteDestination={siteDestination} /></div>
              <div><p className="legend">Version {latest.version} (actuelle)</p><ProductionPreview kind={proposal.kind} title={proposal.title} content={latest.content} version={latest.version} companyName={companyName} siteDestination={siteDestination} /></div>
            </div>
          ) : (
            <ProductionPreview kind={proposal.kind} title={proposal.title} content={viewed.content} version={viewed.version} companyName={companyName} siteDestination={siteDestination} />
          )}
          {viewingOld && (
            <div className="studio-old">
              <p role="status">Vous consultez la version {viewed.version}, qui n’est plus la version actuelle.</p>
              <div className="studio-actions">
                <button type="button" onClick={() => setCompare((value) => !value)} aria-pressed={compare}><Icon name="eye" /> {compare ? "Ne plus comparer" : "Comparer avec l’actuelle"}</button>
                <button type="button" onClick={() => setSelected(latest.version)}>Revenir à la version actuelle</button>
                {state.locked === null && <button type="button" className="primary" onClick={() => void restore()} disabled={busy || working}><Icon name="undo-2" /> Reprendre cette version</button>}
              </div>
            </div>
          )}
          <nav aria-label="Versions" className="studio-versions">
            <ul>
              {[...state.versions].reverse().map((version) => (
                <li key={version.version}>
                  <button type="button" aria-pressed={viewed.version === version.version} aria-current={version.version === current ? "true" : undefined} onClick={() => { setSelected(version.version); setCompare(false); }}>
                    <strong>V{version.version}</strong>
                    <small>{STUDIO_AUTHOR_LABELS[version.source].replace("l’agent", agentName)}</small>
                    {version.version === current && <Tag color={onValidated ? "green" : "blue"}>{onValidated ? "Validée" : "Actuelle"}</Tag>}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <small className="legend">Les versions ne sont jamais écrasées. Les couleurs, la mise en page et le logo ne se règlent pas ici : {agentName} s’appuie sur le profil de {companyName}.</small>
        </section>

        <section aria-label={`Conversation avec ${agentName}`} className="studio-chat">
          <div className="studio-thread" role="log" aria-live="polite" aria-label="Conversation">
            <Thread state={state} agentName={agentName} onOpen={(version) => { setSelected(version); setCompare(false); }} pending={pending} selected={viewed.version} />
            <div ref={threadEnd} />
          </div>
          {error && <p role="alert" className="warning">{error}</p>}
          {notice && !error && <p role="status" className="version-line">{notice}</p>}
          {state.locked ? (
            <div className="studio-locked">
              <p role="status">{STUDIO_LOCK_MESSAGES[state.locked]}</p>
              {onValidated && <Link className="btn primary" href={`/dashboard?view=validation&proposal=${encodeURIComponent(proposal.id)}`}>Préparer la publication <Icon name="arrow-right" /></Link>}
            </div>
          ) : (
            <>
              <div className="studio-quick" role="group" aria-label="Demandes rapides">
                {STUDIO_QUICK_ACTIONS.map((action) => (
                  <button key={action.label} type="button" disabled={!canWrite || sending} onClick={() => void send(action.instruction)}>{action.label}</button>
                ))}
              </div>
              <form className="studio-compose" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
                <label className="field">Votre demande à {agentName}
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); }
                    }}
                    rows={3}
                    maxLength={REVISION_INSTRUCTION_MAX}
                    placeholder="Ex. : trop commercial, mets davantage en avant les économies"
                    disabled={!canWrite}
                  />
                </label>
                <div className="studio-actions">
                  <button type="submit" className="primary" disabled={!canWrite || sending || !draft.trim()}><Icon name="arrow-up" /> Envoyer</button>
                  {!viewingOld && <button type="button" className="primary" onClick={() => void validate()} disabled={busy || working || sending}><Icon name="check" /> Valider cette version</button>}
                </div>
                {viewingOld && <small className="legend">Seule la version actuelle peut être validée. Reprenez cette version pour la valider.</small>}
                <small className="legend">Valider ne publie rien : vous confirmez la publication ensuite, depuis vos décisions.</small>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
