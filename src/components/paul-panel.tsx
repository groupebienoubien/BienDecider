"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PersonaAvatar } from "@/components/persona-avatar";
import { PERSONAS } from "@/lib/agents/personas";
import { describePage, PAUL_ELEMENT_LABELS, PAUL_OPEN_EVENT, type PaulElement } from "@/lib/paul-context";
import type { PaulReference } from "@/lib/paul-references";
import { DictationButton, ReadAloudButton } from "@/components/voice-controls";
import { appendDictation, spokenText } from "@/lib/voice";

type PanelState = { open: boolean; draft: string };
type ChatEntry = { id: string; role: string; content: string; createdAt: string; references?: PaulReference[] };

const STORAGE_KEY = "paul-panel";
const CLOSED: PanelState = { open: false, draft: "" };
const listeners = new Set<() => void>();
let stored: PanelState | null = null;

// L'état ouvert/replié et le brouillon survivent à la navigation (sessionStorage), pas à la fermeture de l'onglet.
function readPanel(): PanelState {
  if (stored) return stored;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    stored = parsed && typeof parsed.open === "boolean" && typeof parsed.draft === "string" ? { open: parsed.open, draft: parsed.draft } : CLOSED;
  } catch {
    stored = CLOSED;
  }
  return stored;
}

function writePanel(next: Partial<PanelState>) {
  stored = { ...readPanel(), ...next };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* stockage indisponible : l'état reste en mémoire */ }
  listeners.forEach((notify) => notify());
}

function subscribePanel(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function renderLinkedMessage(content: string, references: PaulReference[] = []) {
  const byMarker = new Map(references.map((reference) => [reference.marker, reference]));
  return content.split(/(\[\[bd:(?:proposal|finding|lead):[A-Za-z0-9_-]{1,100}\]\])/g).map((part, index) => {
    const reference = byMarker.get(part);
    return reference
      ? <Link key={`${reference.marker}-${index}`} href={reference.href} className="font-medium text-indigo-700 underline underline-offset-2">{reference.label}</Link>
      : part;
  });
}

export function PaulPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const view = useSearchParams().get("view");
  const panel = useSyncExternalStore(subscribePanel, readPanel, () => CLOSED);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [element, setElement] = useState<PaulElement | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasOpen = useRef(false);
  const persona = PERSONAS.co_ceo;
  const panelId = "paul-panel";

  useEffect(() => {
    function onOpen(event: Event) {
      const target = (event as CustomEvent<PaulElement | null>).detail;
      if (target) setElement(target);
      writePanel({ open: true });
    }
    window.addEventListener(PAUL_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(PAUL_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!panel.open) return;
    const controller = new AbortController();
    fetch("/api/co-ceo/messages", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ChatEntry[] | null) => { if (data) setMessages(data); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [panel.open, pathname]);

  useEffect(() => {
    if (panel.open) inputRef.current?.focus();
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = panel.open;
  }, [panel.open]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = panel.draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/co-ceo/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          context: { path: pathname, ...(view ? { view } : {}), ...(element ? { element: { type: element.type, id: element.id } } : {}) },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Paul n'a pas pu répondre. Votre message est conservé : réessayez.");
      const now = new Date().toISOString();
      const references: PaulReference[] = Array.isArray(data.references) ? data.references : [];
      writePanel({ draft: "" });
      setMessages((previous) => [
        ...previous,
        { id: `local-${now}-u`, role: "user", content: text, createdAt: now },
        { id: `local-${now}-a`, role: "assistant", content: data.reply, references, createdAt: now },
      ]);
      router.refresh();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Paul n'a pas pu répondre. Votre message est conservé : réessayez.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {panel.open && (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-label={`Discussion avec ${persona.name}`}
          onKeyDown={(event) => { if (event.key === "Escape") writePanel({ open: false }); }}
          className="fixed bottom-20 right-4 z-40 flex max-h-[70vh] w-[calc(100vw-2rem)] flex-col rounded-lg border border-slate-300 bg-white shadow-xl sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <PersonaAvatar agentKey="co_ceo" size={28} />
              <h2 className="text-sm font-semibold">{persona.name}</h2>
            </div>
            <button type="button" onClick={() => writePanel({ open: false })} className="min-h-11 px-2 text-sm text-slate-700 underline">Replier</button>
          </div>
          <p className="px-3 pt-2 text-xs text-slate-600">{persona.name} sait que vous êtes sur : {describePage(pathname, view)}. Il ne lit que les données de votre entreprise.</p>
          {element && (
            <p className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-900">
              <span className="min-w-0 break-words">À propos de : {PAUL_ELEMENT_LABELS[element.type].toLowerCase()} « {element.title} »</span>
              <button type="button" onClick={() => setElement(null)} className="min-h-11 underline">Retirer</button>
            </p>
          )}
          <div role="log" aria-label="Conversation avec Paul" className="min-h-24 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 && <p className="text-sm text-slate-600">Aucun échange pour le moment. Posez une question sur votre plan, une production ou un prospect.</p>}
            {messages.map((message) => (
              <div key={message.id}>
                <p className={`whitespace-pre-wrap break-words text-sm ${message.role === "user" ? "text-indigo-900" : "text-slate-700"}`}>
                  <span className="block text-xs font-medium text-slate-600">{message.role === "user" ? "Vous" : persona.name} · {formatDate(message.createdAt)}</span>
                  {renderLinkedMessage(message.content, message.references)}
                </p>
                {message.role !== "user" && <ReadAloudButton text={spokenText(message.content, message.references)} label={`Écouter la réponse de ${persona.name}`} />}
              </div>
            ))}
            {sending && <p className="text-sm text-slate-600">{persona.name} réfléchit…</p>}
          </div>
          {error && <p role="alert" className="mx-3 mb-2 rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
          <form onSubmit={send} className="flex flex-wrap gap-2 border-t border-slate-200 p-3">
            <textarea
              ref={inputRef}
              aria-label={`Message à ${persona.name}`}
              placeholder={`Écrire à ${persona.name}…`}
              value={panel.draft}
              onChange={(event) => writePanel({ draft: event.target.value })}
              rows={2}
              maxLength={4000}
              className="min-w-0 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <DictationButton label={`Dicter un message à ${persona.name}`} onTranscript={(text) => writePanel({ draft: appendDictation(readPanel().draft, text, 4000) })} />
            <button type="submit" disabled={sending || !panel.draft.trim()} className="min-h-11 self-end rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">Envoyer</button>
          </form>
        </section>
      )}
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={panel.open}
        aria-controls={panelId}
        onClick={() => writePanel({ open: !panel.open })}
        className="fixed bottom-4 right-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
      >
        <PersonaAvatar agentKey="co_ceo" size={24} />
        Parler à {persona.name}
      </button>
    </>
  );
}
