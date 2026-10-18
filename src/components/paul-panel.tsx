"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PersonaAvatar } from "@/components/persona-avatar";
import { PERSONAS } from "@/lib/agents/personas";
import { describePage, PAUL_ELEMENT_LABELS, PAUL_OPEN_EVENT, type PaulElement } from "@/lib/paul-context";
import type { PaulReference } from "@/lib/paul-references";
import { DictationButton, ReadAloudButton } from "@/components/voice-controls";
import { ArrowUpIcon, CheckIcon, ChevronDownIcon, CollapseIcon, CopyIcon, ExpandIcon, StopIcon, WaveIcon } from "@/components/chat-icons";
import { appendDictation, spokenText } from "@/lib/voice";
import { dayKey, dayLabel, parseMessage, plainMessage, timeLabel, type Inline } from "@/lib/chat-format";
import { NDJSON_CONTENT_TYPE, splitStreamEvents, streamPreview } from "@/lib/chat-stream";
import { createVoiceConversation, supportsVoiceConversation, type VoicePhase } from "@/lib/speech";

type PanelState = { open: boolean; draft: string };
type ChatEntry = { id: string; role: string; content: string; createdAt: string; references?: PaulReference[]; pending?: boolean; stopped?: boolean };
type Reply = { content: string; references: PaulReference[] };

const subscribeNothing = () => () => undefined;
const SUGGESTIONS = ["Où en est mon plan d'action ?", "Que dois-je décider aujourd'hui ?", "Quelle est ma priorité cette semaine ?"];
const ICON_BUTTON = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100";
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

function renderInline(nodes: Inline[], references: Map<string, PaulReference>, prefix: string): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    if (node.type === "text") return node.text;
    if (node.type === "bold") return <strong key={key} className="font-semibold">{renderInline(node.children, references, key)}</strong>;
    if (node.type === "italic") return <em key={key}>{renderInline(node.children, references, key)}</em>;
    if (node.type === "code") return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em]">{node.text}</code>;
    const reference = references.get(node.marker);
    return reference
      ? <Link key={key} href={reference.href} className="font-medium text-indigo-700 underline underline-offset-2">{reference.label}</Link>
      : null;
  });
}

/** Réponse mise en forme (paragraphes, listes, gras, code) ; le curseur suit la fin du texte pendant la frappe. */
function MessageBody({ content, references = [], streaming = false }: { content: string; references?: PaulReference[]; streaming?: boolean }) {
  const byMarker = new Map(references.map((reference) => [reference.marker, reference]));
  const blocks = parseMessage(content);
  const caret = streaming ? <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-pulse rounded-sm bg-slate-700 motion-reduce:animate-none" /> : null;
  return (
    <div className="space-y-3 break-words text-base leading-7 text-slate-800">
      {blocks.map((block, index) => {
        const last = index === blocks.length - 1;
        const key = `block-${index}`;
        if (block.type === "code") {
          return <pre key={key} className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-sm leading-6 text-slate-100"><code>{block.text}</code>{last && caret}</pre>;
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={key} className={`space-y-1 pl-6 ${block.ordered ? "list-decimal" : "list-disc"}`}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1">{renderInline(item, byMarker, `${key}-${itemIndex}`)}{last && itemIndex === block.items.length - 1 && caret}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={key} className={block.type === "heading" ? "font-semibold text-slate-900" : "whitespace-pre-line"}>
            {renderInline(block.inline, byMarker, key)}{last && caret}
          </p>
        );
      })}
    </div>
  );
}

function TypingDots({ name }: { name: string }) {
  return (
    <div role="status" className="flex h-7 items-center gap-1">
      <span className="sr-only">{name} réfléchit…</span>
      {[0, 1, 2].map((dot) => (
        <span key={dot} aria-hidden="true" className="h-2 w-2 animate-bounce rounded-full bg-slate-400 motion-reduce:animate-none" style={{ animationDelay: `${dot * 150}ms` }} />
      ))}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible : rien à signaler de plus
    }
  }
  return (
    <>
      <button type="button" onClick={() => void copy()} aria-label={label} title={label} className={ICON_BUTTON}>
        {copied ? <CheckIcon className="h-[18px] w-[18px] text-emerald-600" /> : <CopyIcon className="h-[18px] w-[18px]" />}
      </button>
      <span role="status" className="sr-only">{copied ? "Réponse copiée" : ""}</span>
    </>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-600">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="capitalize">{dayLabel(iso)}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
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

export function PaulPanel({ inlineLauncher = false }: { inlineLauncher?: boolean }) {
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
  const [wide, setWide] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const voiceSupported = useSyncExternalStore(subscribeNothing, supportsVoiceConversation, () => false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
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
    field.style.height = `${Math.min(field.scrollHeight, 192)}px`;
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
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/co-ceo/message", {
        method: "POST",
        signal: controller.signal,
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
      // Arrêt voulu : le début de réponse reste affiché ; le serveur finit son tour et la réponse complète apparaîtra à la prochaine ouverture.
      if (sendError instanceof DOMException && sendError.name === "AbortError") {
        updatePending({ pending: false, stopped: true });
        return null;
      }
      setMessages((previous) => previous.filter((entry) => entry.id !== userId && entry.id !== pendingId));
      if (!readPanel().draft) writePanel({ draft: text });
      setError(sendError instanceof Error ? sendError.message : "Paul n'a pas pu répondre. Votre message est conservé : réessayez.");
      return null;
    } finally {
      abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
    }
  }

  useEffect(() => { submitRef.current = submit; });

  function send(event: React.FormEvent) {
    event.preventDefault();
    void submit(panel.draft.trim());
  }

  function scrollToBottom() {
    const log = logRef.current;
    if (!log) return;
    followRef.current = true;
    log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
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
          className={`fixed bottom-20 right-4 z-40 flex h-[min(40rem,calc(100dvh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl ${wide ? "sm:h-[calc(100dvh-7rem)] sm:w-[min(52rem,calc(100vw-2rem))]" : "sm:w-[28rem]"}`}
        >
          <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <PersonaAvatar agentKey="co_ceo" size={32} />
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold leading-5">{persona.name}</h2>
                <p className="truncate text-xs text-slate-600">{persona.role}</p>
              </div>
            </div>
            <div className="flex items-center">
              {voiceSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={voicePhase === "off" ? "Échange vocal" : "Arrêter l'échange vocal"}
                  title={voicePhase === "off" ? "Échange vocal" : "Arrêter l'échange vocal"}
                  className={`${ICON_BUTTON} ${voicePhase === "off" ? "" : "animate-pulse bg-red-100 text-red-700"}`}
                >
                  <WaveIcon />
                </button>
              )}
              <button type="button" onClick={() => setWide((current) => !current)} aria-label={wide ? "Réduire la fenêtre" : "Agrandir la fenêtre"} title={wide ? "Réduire la fenêtre" : "Agrandir la fenêtre"} className={`${ICON_BUTTON} hidden sm:inline-flex`}>
                {wide ? <CollapseIcon /> : <ExpandIcon />}
              </button>
              <button type="button" onClick={() => writePanel({ open: false })} aria-label="Replier" title="Replier" className={ICON_BUTTON}>
                <ChevronDownIcon />
              </button>
            </div>
          </header>
          <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">{persona.name} sait que vous êtes sur : {describePage(pathname, view)}. Il ne lit que les données de votre entreprise.</p>
          {element && (
            <p className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-indigo-50 px-3 py-1 text-xs text-indigo-900">
              <span className="min-w-0 break-words">À propos de : {PAUL_ELEMENT_LABELS[element.type].toLowerCase()} « {element.title} »</span>
              <button type="button" onClick={() => setElement(null)} className="min-h-11 underline">Retirer</button>
            </p>
          )}
          {(voicePhase !== "off" || voiceMessage) && (
            <p role="status" className="mx-3 mt-2 rounded-2xl bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900">{voicePhase !== "off" ? VOICE_STATUS[voicePhase] : voiceMessage}</p>
          )}
          <div className="relative min-h-0 flex-1">
            <div
              ref={logRef}
              onScroll={(event) => {
                const log = event.currentTarget;
                const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
                followRef.current = nearBottom;
                setAtBottom(nearBottom);
              }}
              role="log"
              aria-label="Conversation avec Paul"
              aria-busy={sending}
              className="h-full overflow-y-auto"
            >
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-4">
                {messages.length === 0 && (
                  <div className="my-auto flex flex-col items-center gap-4 py-4 text-center">
                    <PersonaAvatar agentKey="co_ceo" size={56} />
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">Comment puis-je vous aider ?</h3>
                      <p className="mt-1 text-sm text-slate-600">Posez une question sur votre plan, une production ou un prospect.</p>
                    </div>
                    <div className="flex w-full flex-col gap-2">
                      {[...(element ? [`Explique-moi « ${element.title} »`] : []), ...SUGGESTIONS].slice(0, 3).map((suggestion) => (
                        <button key={suggestion} type="button" disabled={sending} onClick={() => void submit(suggestion)} className="min-h-11 rounded-2xl border border-slate-200 px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((message, index) => (
                  <div key={message.id} className="flex flex-col gap-6">
                    {(index === 0 || dayKey(messages[index - 1].createdAt) !== dayKey(message.createdAt)) && <DaySeparator iso={message.createdAt} />}
                    {message.role === "user" ? (
                      <div className="flex flex-col items-end">
                        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-slate-100 px-4 py-2.5 text-base text-slate-900">
                          <span className="sr-only">Vous, {formatDate(message.createdAt)} : </span>{message.content}
                        </p>
                        <span className="mt-1 px-2 text-xs text-slate-600">{timeLabel(message.createdAt)}</span>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="mt-0.5 shrink-0"><PersonaAvatar agentKey="co_ceo" size={28} /></div>
                        <div className="min-w-0 flex-1">
                          <span className="sr-only">{persona.name}, {formatDate(message.createdAt)} : </span>
                          {message.pending && !message.content ? (
                            <TypingDots name={persona.name} />
                          ) : (
                            <MessageBody content={message.content} references={message.references} streaming={message.pending} />
                          )}
                          {message.stopped && <p className="mt-1 text-sm italic text-slate-600">Génération arrêtée.</p>}
                          {!message.pending && message.content && (
                            <div className="-ml-3 mt-1 flex items-center">
                              <CopyButton text={plainMessage(message.content, message.references)} label={`Copier la réponse de ${persona.name}`} />
                              <ReadAloudButton variant="icon" text={spokenText(message.content, message.references)} label={`Écouter la réponse de ${persona.name}`} />
                              <span className="px-2 text-xs text-slate-600">{timeLabel(message.createdAt)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {!atBottom && messages.length > 0 && (
              <button type="button" onClick={scrollToBottom} aria-label="Aller au dernier message" title="Aller au dernier message" className="absolute bottom-3 left-1/2 inline-flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-md hover:bg-slate-50">
                <ChevronDownIcon />
              </button>
            )}
          </div>
          {error && <p role="alert" className="mx-3 mb-2 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <form onSubmit={send} className="px-3 pb-2 pt-1">
            <div className="mx-auto flex w-full max-w-3xl flex-wrap items-end gap-1 rounded-3xl border border-slate-300 bg-white py-1 pl-4 pr-1 shadow-sm focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-600">
              <textarea
                ref={inputRef}
                aria-label={`Message à ${persona.name}`}
                placeholder={`Écrire à ${persona.name}…`}
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
                // Le focus est porté par le conteneur arrondi (anneau), pas par un contour carré dans le champ.
                style={{ outline: "none" }}
                className="max-h-48 min-h-11 min-w-0 flex-1 basis-0 resize-none bg-transparent py-2.5 text-base outline-none placeholder:text-slate-500"
              />
              <DictationButton variant="icon" label={`Dicter pour ${persona.name}`} onTranscript={(text) => writePanel({ draft: appendDictation(readPanel().draft, text, 4000) })} />
              {sending ? (
                <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Arrêter la génération" title="Arrêter la génération" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                  <StopIcon className="h-4 w-4" />
                </button>
              ) : (
                <button type="submit" disabled={!panel.draft.trim()} aria-label="Envoyer" title="Envoyer" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-500">
                  <ArrowUpIcon />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-center text-xs text-slate-600">{persona.name} peut se tromper : vérifiez avant de décider. Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne.</p>
          </form>
        </section>
      )}
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={panel.open}
        aria-controls={panelId}
        onClick={() => writePanel({ open: !panel.open })}
        className={`${inlineLauncher ? "inline-flex" : "fixed bottom-4 right-4 z-40 inline-flex shadow-lg"} min-h-11 shrink-0 items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white`}
      >
        <PersonaAvatar agentKey="co_ceo" size={24} />
        Parler à {persona.name}
      </button>
    </>
  );
}
