"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PersonaAvatar } from "@/components/persona-avatar";
import { Icon } from "@/components/icon";
import { PERSONAS } from "@/lib/agents/personas";
import { describePage, PAUL_ELEMENT_LABELS, PAUL_OPEN_EVENT, type PaulElement } from "@/lib/paul-context";
import type { PaulReference } from "@/lib/paul-references";
import { DictationButton, ReadAloudButton } from "@/components/voice-controls";
import { ArrowUpIcon, CheckIcon, ChevronDownIcon, CollapseIcon, CopyIcon, ExpandIcon, StopIcon, WaveIcon } from "@/components/chat-icons";
import { appendDictation, spokenText } from "@/lib/voice";
import { dayKey, dayLabel, parseMessage, plainMessage, timeLabel, type Inline } from "@/lib/chat-format";
import { NDJSON_CONTENT_TYPE, splitStreamEvents, streamPreview } from "@/lib/chat-stream";
import { createVoiceConversation, supportsVoiceConversation, type VoicePhase } from "@/lib/speech";
import { decidedText, launchesRun, type PendingActionView } from "@/lib/agents/pending-action-view";

type PanelState = { open: boolean; draft: string };
type ChatEntry = { id: string; role: string; content: string; createdAt: string; references?: PaulReference[]; actions?: PendingActionView[]; pending?: boolean; stopped?: boolean };
type Reply = { content: string; references: PaulReference[]; actions: PendingActionView[] };
type Decision = "confirm" | "cancel";

const subscribeNothing = () => () => undefined;
const SUGGESTIONS = ["Où en est mon plan d'action ?", "Que dois-je décider aujourd'hui ?", "Quelle est ma priorité cette semaine ?"];
const ICON_BUTTON = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100";
const VOICE_STATUS: Record<Exclude<VoicePhase, "off">, string> = {
  listening: "Échange vocal : je vous écoute… L'audio est traité par le service vocal de votre navigateur.",
  thinking: "Échange vocal : Paul réfléchit…",
  speaking: "Échange vocal : Paul vous répond à voix haute…",
};

const STORAGE_KEY = "paul-panel";
// Même seuil que la barre de navigation mobile (maquette.css) : en dessous, Paul occupe tout l'écran (story 5.4).
const PHONE_QUERY = "(max-width: 760px)";

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
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
    <div className="chat-message">
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

/** Carte de confirmation rendue depuis l'intention enregistrée, jamais depuis le texte de Paul. */
function PendingActionCard({ action, busy, error, onDecide }: { action: PendingActionView; busy: boolean; error: string | null; onDecide: (decision: Decision) => void }) {
  const decided = action.status !== "pending";
  // Une carte de lancement confirmée n'est un succès que si le lancement a eu lieu ; sans résultat connu, texte neutre.
  const succeeded = action.status === "confirmed" && (!launchesRun(action.type) || action.result?.ok === true);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const clickedRef = useRef(false);
  // Après « Lancer » ou « Plus tard », les boutons disparaissent : le focus passe au résultat affiché sur la carte.
  useEffect(() => {
    // Une révision annulée rend le focus au champ de saisie (comme objectif et profil) ; seul son résultat confirmé le prend.
    const keepsFocus = action.type === "launch_plan_item" || (action.type === "revise_proposal" && action.status === "confirmed");
    if (decided && clickedRef.current && keepsFocus) statusRef.current?.focus();
  }, [decided, action.type, action.status]);
  const click = (decision: Decision) => {
    clickedRef.current = true;
    onDecide(decision);
  };
  return (
    <div className={`mt-3 rounded-2xl border p-3 text-sm ${decided ? "border-slate-200 bg-slate-50 text-slate-700" : "border-emerald-200 bg-white text-slate-800"}`} aria-label="Proposition de Paul à confirmer" role="group">
      <p className="font-semibold text-slate-900">{action.title}</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5">
        {action.lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {decided ? (
        <p ref={statusRef} tabIndex={-1} role="status" className={`mt-3 flex items-center gap-1.5 ${succeeded ? "text-emerald-700" : "text-slate-600"}`}>
          {succeeded && <CheckIcon className="h-4 w-4 shrink-0" />}{decidedText(action.status, action.type, action.result)}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => click("confirm")} className="min-h-11 rounded-full bg-emerald-600 px-4 font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
            {action.confirmLabel}
          </button>
          <button type="button" disabled={busy} onClick={() => click("cancel")} className="min-h-11 px-1 text-slate-700 underline underline-offset-2 disabled:opacity-60">
            {action.cancelLabel}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-red-800">{error}</p>}
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
        else if (event.type === "done") result = { content: event.reply, references: event.references, actions: event.actions ?? [] };
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
  const [wide, setWide] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const voiceSupported = useSyncExternalStore(subscribeNothing, supportsVoiceConversation, () => false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // Saisie en cours sur téléphone : le panneau se compacte pour laisser la place au clavier.
  const [typing, setTyping] = useState(false);
  // Suivi en continu : une rotation fait passer d'un mode à l'autre, panneau ouvert.
  const isPhone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
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
    // Sur téléphone, le focus ouvrirait le clavier sur la moitié de l'écran avant toute lecture.
    if (panel.open) { if (!window.matchMedia(PHONE_QUERY).matches) inputRef.current?.focus(); }
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = panel.open;
  }, [panel.open]);

  // Sur téléphone : la page derrière ne défile plus, et le panneau suit la zone visible pour que le champ reste au-dessus du clavier.
  // iOS fait défiler la page quand le clavier s'ouvre, même sous overflow: hidden : le <body> est figé (position: fixed) et la
  // position de lecture rétablie à la fermeture.
  useEffect(() => {
    if (!panel.open || !isPhone) return;
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = { rootOverflow: root.style.overflow, rootOverscroll: root.style.overscrollBehavior, body: body.getAttribute("style") };
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    Object.assign(body.style, { position: "fixed", top: `-${scrollY}px`, left: "0", right: "0", width: "100%", overflow: "hidden" });
    const viewport = window.visualViewport;
    const node = panelRef.current;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!node) return;
        // Sans visualViewport (ancien navigateur), la hauteur CSS (100dvh) s'applique.
        if (!viewport) return;
        node.style.height = `${viewport.height}px`;
        node.style.top = `${viewport.offsetTop}px`;
        // Safari peut encore décaler la fenêtre : on la ramène, le panneau suit la zone visible.
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      });
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    node?.addEventListener("focusin", fit);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      node?.removeEventListener("focusin", fit);
      root.style.overflow = previous.rootOverflow;
      root.style.overscrollBehavior = previous.rootOverscroll;
      if (previous.body === null) body.removeAttribute("style"); else body.setAttribute("style", previous.body);
      window.scrollTo(0, scrollY);
      node?.style.removeProperty("height");
      node?.style.removeProperty("top");
    };
  }, [panel.open, isPhone]);

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
        reply = { content: data.reply, references: Array.isArray(data.references) ? data.references : [], actions: Array.isArray(data.actions) ? data.actions : [] };
      }
      updatePending({ content: reply.content, references: reply.references, actions: reply.actions, pending: false });
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

  // Clic sur une carte : « Confirmer » / « Lancer » exécute côté serveur ; « Corriger » annule et rend la main à la saisie, « Plus tard » annule seulement.
  async function decide(actionId: string, decision: Decision) {
    if (deciding) return;
    setDeciding(actionId);
    setActionErrors((previous) => {
      const rest = { ...previous };
      delete rest[actionId];
      return rest;
    });
    const replaceAction = (next: PendingActionView) => setMessages((previous) => previous.map((entry) => (
      entry.actions?.some((action) => action.id === next.id)
        ? { ...entry, actions: entry.actions.map((action) => (action.id === next.id ? next : action)) }
        : entry
    )));
    try {
      const response = await fetch(`/api/co-ceo/pending-actions/${encodeURIComponent(actionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json().catch(() => null);
      if (data?.action) replaceAction(data.action as PendingActionView);
      // Un refus qui renvoie la carte (expirée, remplacée…) se lit sur la carte elle-même.
      if (!response.ok && !data?.action) throw new Error(data?.error ?? "La décision n'a pas pu être enregistrée. Réessayez.");
      if (response.ok && decision === "confirm") router.refresh();
      if (decision === "cancel" && data?.action?.type !== "launch_plan_item") inputRef.current?.focus();
    } catch (decideError) {
      setActionErrors((previous) => ({ ...previous, [actionId]: decideError instanceof Error ? decideError.message : "La décision n'a pas pu être enregistrée. Réessayez." }));
    } finally {
      setDeciding(null);
    }
  }

  function sendDraft() {
    const text = panel.draft.trim();
    if (text && !sending) void submit(text);
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
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal={isPhone}
          aria-label={`Discussion avec ${persona.name}`}
          onKeyDown={(event) => { if (event.key === "Escape") writePanel({ open: false }); }}
          className={`paul-panel ${wide ? "wide" : ""} ${isPhone && typing ? "typing" : ""}`}
        >
          <header>
            <PersonaAvatar agentKey="co_ceo" size={32} />
            <div>
              <strong>{persona.name}</strong>
              <small>{persona.role}</small>
            </div>
            <div className="panel-controls">
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
              {/* Plein écran sur téléphone : « Agrandir » n'y a plus d'objet (story 5.4). */}
              {!isPhone && (
                <button type="button" onClick={() => setWide((current) => !current)} aria-label={wide ? "Réduire la fenêtre" : "Agrandir la fenêtre"} title={wide ? "Réduire la fenêtre" : "Agrandir la fenêtre"} className={ICON_BUTTON}>
                  {wide ? <CollapseIcon /> : <ExpandIcon />}
                </button>
              )}
              <button type="button" onClick={() => writePanel({ open: false })} aria-label="Replier" title="Replier" className={ICON_BUTTON}>
                <ChevronDownIcon />
              </button>
            </div>
          </header>
          <p className="chat-context">{persona.name} sait que vous êtes sur : {describePage(pathname, view)}. Il ne lit que les données de votre entreprise.</p>
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
              <div className="chat-messages">
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
                        <p className="chat-message user">
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
                          {message.actions?.map((action) => (
                            <PendingActionCard key={action.id} action={action} busy={deciding !== null} error={actionErrors[action.id] ?? null} onDecide={(decision) => void decide(action.id, decision)} />
                          ))}
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
          {/* Pas de <form> : Safari (iOS) affiche sa barre de remplissage (mots de passe, cartes, adresses) au-dessus du clavier
              pour les champs de formulaire, même en autocomplete="off". L'envoi passe par le bouton et la touche Entrée. */}
          <div className="chat-compose" role="group" aria-label={`Écrire à ${persona.name}`} onFocus={() => setTyping(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTyping(false); }}>
            <div className="chat-input">
              <textarea
                autoComplete="off"
                enterKeyHint={isPhone ? "enter" : "send"}
                ref={inputRef}
                aria-label={`Message à ${persona.name}`}
                placeholder={`Écrire à ${persona.name}…`}
                value={panel.draft}
                onChange={(event) => writePanel({ draft: event.target.value })}
                onKeyDown={(event) => {
                  // Sur téléphone, le clavier n'a pas de Maj : Entrée va à la ligne, le bouton envoie.
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !isPhone) {
                    event.preventDefault();
                    sendDraft();
                  }
                }}
                rows={1}
                maxLength={4000}
                // Le focus est porté par le conteneur arrondi (anneau), pas par un contour carré dans le champ.
                style={{ outline: "none" }}
                className="min-w-0 flex-1 basis-0"
              />
              <DictationButton variant="icon" label={`Dicter pour ${persona.name}`} onTranscript={(text) => writePanel({ draft: appendDictation(readPanel().draft, text, 4000) })} />
              {sending ? (
                <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Arrêter la génération" title="Arrêter la génération" className="icon-button primary">
                  <StopIcon className="h-4 w-4" />
                </button>
              ) : (
                <button type="button" onClick={sendDraft} disabled={!panel.draft.trim()} aria-label="Envoyer" title="Envoyer" className="icon-button primary">
                  <ArrowUpIcon />
                </button>
              )}
            </div>
            <small className="chat-disclaimer">{persona.name} peut se tromper : vérifiez avant de décider.{isPhone ? "" : " Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne."}</small>
          </div>
        </section>
      )}
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={panel.open}
        aria-controls={panelId}
        onClick={() => writePanel({ open: !panel.open })}
        className="paul-launch"
      >
        <PersonaAvatar agentKey="co_ceo" size={26} />
        <span>Échanger avec {persona.name}</span>
        <Icon name="message-circle" />
      </button>
    </>
  );
}
