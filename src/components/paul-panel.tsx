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
import { NDJSON_CONTENT_TYPE, splitStreamEvents, streamPreview } from "@/lib/chat-stream";
import { createVoiceConversation, supportsVoiceConversation, type VoicePhase } from "@/lib/speech";

type PanelState = { open: boolean; draft: string };
type ChatEntry = { id: string; role: string; content: string; createdAt: string; references?: PaulReference[]; pending?: boolean };
type Reply = { content: string; references: PaulReference[] };

const subscribeNothing = () => () => undefined;
const VOICE_STATUS: Record<Exclude<VoicePhase, "off">, string> = {
  listening: "Échange vocal : je vous écoute… L'audio est traité par le service vocal de votre navigateur.",
  thinking: "Échange vocal : Paul réfléchit…",
  speaking: "Échange vocal : Paul vous répond à voix haute…",
};

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

/** Lit la réponse en flux : le texte s'affiche au fur et à mesure, la réponse finale (liens résolus) fait foi. */
async function readReplyStream(body: ReadableStream<Uint8Array>, onLive: (text: string) => void): Promise<Reply> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let live = "";
  let result: Reply | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const parsed = splitStreamEvents(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.type === "reset") { live = ""; onLive(""); }
        else if (event.type === "delta") { live += event.text; onLive(streamPreview(live)); }
        else if (event.type === "done") result = { content: event.reply, references: event.references };
        else throw new Error(event.error);
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (!result) throw new Error("La réponse de Paul a été interrompue. Votre message est conservé : réessayez.");
  return result;
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
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("off");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const voiceSupported = useSyncExternalStore(subscribeNothing, supportsVoiceConversation, () => false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const sendingRef = useRef(false);
  const submitRef = useRef<(text: string) => Promise<string | null>>(async () => null);
  const conversationRef = useRef<ReturnType<typeof createVoiceConversation> | null>(null);
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
      .then((data: ChatEntry[] | null) => { if (data && !sendingRef.current) setMessages(data); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [panel.open, pathname]);

  useEffect(() => {
    if (panel.open) inputRef.current?.focus();
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = panel.open;
  }, [panel.open]);

  // Le journal suit les nouveaux messages tant que l'utilisateur n'est pas remonté lire plus haut.
  useEffect(() => {
    const log = logRef.current;
    if (log && followRef.current) log.scrollTop = log.scrollHeight;
  }, [messages, panel.open]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  }, [panel.draft, panel.open]);

  useEffect(() => {
    const conversation = createVoiceConversation({
      ask: (text) => submitRef.current(text),
      onPhase: setVoicePhase,
      onMessage: setVoiceMessage,
    });
    conversationRef.current = conversation;
    return () => conversation.stop();
  }, []);

  useEffect(() => {
    if (!panel.open) conversationRef.current?.stop();
  }, [panel.open]);

  // Retourne le texte à lire à voix haute, ou null si l'échange a échoué.
  async function submit(text: string): Promise<string | null> {
    if (!text || sendingRef.current) return null;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    followRef.current = true;
    const now = new Date().toISOString();
    const userId = `local-${now}-u`;
    const pendingId = `local-${now}-a`;
    // Le message part tout de suite dans la conversation et la réponse s'y compose en direct.
    writePanel({ draft: "" });
    setMessages((previous) => [
      ...previous,
      { id: userId, role: "user", content: text, createdAt: now },
      { id: pendingId, role: "assistant", content: "", createdAt: now, pending: true },
    ]);
    const updatePending = (patch: Partial<ChatEntry>) => setMessages((previous) => previous.map((entry) => (entry.id === pendingId ? { ...entry, ...patch } : entry)));
    try {
      const response = await fetch("/api/co-ceo/message", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: `${NDJSON_CONTENT_TYPE}, application/json` },
        body: JSON.stringify({
          message: text,
          context: { path: pathname, ...(view ? { view } : {}), ...(element ? { element: { type: element.type, id: element.id } } : {}) },
        }),
      });
      let reply: Reply;
      if (response.ok && response.body && response.headers.get("content-type")?.includes(NDJSON_CONTENT_TYPE)) {
        reply = await readReplyStream(response.body, (live) => updatePending({ content: live }));
      } else {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Paul n'a pas pu répondre. Votre message est conservé : réessayez.");
        reply = { content: data.reply, references: Array.isArray(data.references) ? data.references : [] };
      }
      updatePending({ content: reply.content, references: reply.references, pending: false });
      router.refresh();
      return spokenText(reply.content, reply.references);
    } catch (sendError) {
      setMessages((previous) => previous.filter((entry) => entry.id !== userId && entry.id !== pendingId));
      if (!readPanel().draft) writePanel({ draft: text });
      setError(sendError instanceof Error ? sendError.message : "Paul n'a pas pu répondre. Votre message est conservé : réessayez.");
      return null;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  useEffect(() => { submitRef.current = submit; });

  function send(event: React.FormEvent) {
    event.preventDefault();
    void submit(panel.draft.trim());
  }

  function toggleVoice() {
    if (voicePhase === "off") conversationRef.current?.start();
    else conversationRef.current?.stop();
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
            <div className="flex items-center">
              {voiceSupported && (
                <button type="button" onClick={toggleVoice} className={`min-h-11 px-2 text-sm underline ${voicePhase === "off" ? "text-indigo-700" : "text-red-700"}`}>
                  {voicePhase === "off" ? "Échange vocal" : "Arrêter l'échange vocal"}
                </button>
              )}
              <button type="button" onClick={() => writePanel({ open: false })} className="min-h-11 px-2 text-sm text-slate-700 underline">Replier</button>
            </div>
          </div>
          <p className="px-3 pt-2 text-xs text-slate-600">{persona.name} sait que vous êtes sur : {describePage(pathname, view)}. Il ne lit que les données de votre entreprise.</p>
          {element && (
            <p className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-900">
              <span className="min-w-0 break-words">À propos de : {PAUL_ELEMENT_LABELS[element.type].toLowerCase()} « {element.title} »</span>
              <button type="button" onClick={() => setElement(null)} className="min-h-11 underline">Retirer</button>
            </p>
          )}
          {(voicePhase !== "off" || voiceMessage) && (
            <p role="status" className="mx-3 mt-2 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-900">{voicePhase !== "off" ? VOICE_STATUS[voicePhase] : voiceMessage}</p>
          )}
          <div
            ref={logRef}
            onScroll={(event) => { const log = event.currentTarget; followRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 80; }}
            role="log"
            aria-label="Conversation avec Paul"
            aria-busy={sending}
            className="min-h-24 flex-1 space-y-3 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 && <p className="text-sm text-slate-600">Aucun échange pour le moment. Posez une question sur votre plan, une production ou un prospect.</p>}
            {messages.map((message) => (
              <div key={message.id}>
                <p className={`whitespace-pre-wrap break-words text-sm ${message.role === "user" ? "text-indigo-900" : "text-slate-700"}`}>
                  <span className="block text-xs font-medium text-slate-600">{message.role === "user" ? "Vous" : persona.name} · {formatDate(message.createdAt)}</span>
                  {message.pending
                    ? (message.content || <span className="animate-pulse text-slate-500">{persona.name} réfléchit…</span>)
                    : renderLinkedMessage(message.content, message.references)}
                </p>
                {message.role !== "user" && !message.pending && <ReadAloudButton text={spokenText(message.content, message.references)} label={`Écouter la réponse de ${persona.name}`} />}
              </div>
            ))}
          </div>
          {error && <p role="alert" className="mx-3 mb-2 rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
          <form onSubmit={send} className="flex flex-wrap gap-2 border-t border-slate-200 p-3">
            <textarea
              ref={inputRef}
              aria-label={`Message à ${persona.name}`}
              placeholder={`Écrire à ${persona.name}… (Entrée pour envoyer)`}
              value={panel.draft}
              onChange={(event) => writePanel({ draft: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              maxLength={4000}
              className="min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <DictationButton label={`Dicter pour ${persona.name}`} onTranscript={(text) => writePanel({ draft: appendDictation(readPanel().draft, text, 4000) })} />
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
