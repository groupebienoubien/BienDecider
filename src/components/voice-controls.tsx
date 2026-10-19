"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { dictationErrorMessage } from "@/lib/voice";
import { finalTranscript, recognitionConstructor, SPEECH_LANG, supportsDictation, supportsReadAloud, type Recognition } from "@/lib/speech";
import { MicIcon, SpeakerIcon, StopIcon } from "@/components/chat-icons";

const subscribeNothing = () => () => undefined;

/**
 * Dictée : le texte reconnu est transmis à l'appelant, qui décide où l'insérer.
 * Un clic démarre l'écoute, un second l'arrête ; rien n'est envoyé sans action de l'utilisateur.
 * Le bouton n'apparaît que si le navigateur propose la reconnaissance vocale.
 */
export function DictationButton({ onTranscript, label, variant = "text" }: { onTranscript: (text: string) => void; label: string; variant?: "text" | "icon" }) {
  const supported = useSyncExternalStore(subscribeNothing, supportsDictation, () => false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const callbackRef = useRef(onTranscript);

  useEffect(() => { callbackRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => () => recognitionRef.current?.abort(), []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognizer = recognitionConstructor();
    if (!Recognizer) return;
    const recognition = new Recognizer();
    recognition.lang = SPEECH_LANG;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const text = finalTranscript(event.results);
      if (text) callbackRef.current(text);
    };
    recognition.onerror = (event) => setMessage(dictationErrorMessage(event.error));
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setListening(false);
    };
    setMessage(null);
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setMessage(dictationErrorMessage("unknown"));
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={listening ? "Arrêter la dictée" : label}
          title={listening ? "Arrêter la dictée" : label}
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${listening ? "animate-pulse bg-red-100 text-red-700" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <MicIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={listening ? "Arrêter la dictée" : label}
          className={`min-h-11 self-end rounded-lg border px-3 py-2 text-sm ${listening ? "border-red-600 bg-red-50 text-red-800" : "border-slate-300 text-slate-700"}`}
        >
          <span aria-hidden="true">{listening ? "● " : ""}</span>{listening ? "Arrêter" : "Dicter"}
        </button>
      )}
      <span role="status" className="order-last basis-full px-2 text-xs text-slate-600 empty:hidden">
        {listening ? "Je vous écoute… L'audio est traité par le service vocal de votre navigateur." : message}
      </span>
    </>
  );
}

// Une seule lecture à la fois : le bouton qui parle est le seul à pouvoir l'interrompre en quittant l'écran.
let activeReader: string | null = null;

/** Lecture à voix haute d'un texte, uniquement à la demande, avec la voix du navigateur. */
export function ReadAloudButton({ text, label = "Écouter", variant = "link" }: { text: string; label?: string; variant?: "link" | "icon" }) {
  const supported = useSyncExternalStore(subscribeNothing, supportsReadAloud, () => false);
  const readerId = useId();
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => {
    if (activeReader === readerId) {
      activeReader = null;
      window.speechSynthesis.cancel();
    }
  }, [readerId]);

  if (!supported || !text.trim()) return null;

  function toggle() {
    const wasSpeaking = speaking;
    window.speechSynthesis.cancel();
    if (wasSpeaking) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LANG;
    const finished = () => {
      if (activeReader === readerId) activeReader = null;
      setSpeaking(false);
    };
    utterance.onend = finished;
    utterance.onerror = finished;
    activeReader = readerId;
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  if (variant === "icon") {
    const name = speaking ? "Arrêter la lecture" : label;
    return (
      <button type="button" onClick={toggle} aria-label={name} title={name} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
        {speaking ? <StopIcon className="h-4 w-4" /> : <SpeakerIcon className="h-[18px] w-[18px]" />}
      </button>
    );
  }

  return (
    <button type="button" onClick={toggle} className="text-link">
      {speaking ? "Arrêter la lecture" : label}
    </button>
  );
}
