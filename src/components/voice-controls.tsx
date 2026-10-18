"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { dictationErrorMessage } from "@/lib/voice";

// La reconnaissance vocale n'est pas dans les types DOM standard.
type RecognitionResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

const SPEECH_LANG = "fr-FR";
const subscribeNothing = () => () => undefined;

function recognitionConstructor(): RecognitionConstructor | null {
  const speech = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null;
}

const supportsDictation = () => recognitionConstructor() !== null;
const supportsReadAloud = () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/**
 * Dictée : le texte reconnu est transmis à l'appelant, qui décide où l'insérer.
 * Un clic démarre l'écoute, un second l'arrête ; rien n'est envoyé sans action de l'utilisateur.
 * Le bouton n'apparaît que si le navigateur propose la reconnaissance vocale.
 */
export function DictationButton({ onTranscript, label }: { onTranscript: (text: string) => void; label: string }) {
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
      const text = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0].transcript).join(" ");
      if (text.trim()) callbackRef.current(text);
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
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? "Arrêter la dictée" : label}
        className={`min-h-11 self-end rounded-lg border px-3 py-2 text-sm ${listening ? "border-red-600 bg-red-50 text-red-800" : "border-slate-300 text-slate-700"}`}
      >
        <span aria-hidden="true">{listening ? "● " : ""}</span>{listening ? "Arrêter" : "Dicter"}
      </button>
      <span role="status" className="order-last basis-full text-xs text-slate-600 empty:hidden">
        {listening ? "Je vous écoute… L'audio est traité par le service vocal de votre navigateur." : message}
      </span>
    </>
  );
}

// Une seule lecture à la fois : le bouton qui parle est le seul à pouvoir l'interrompre en quittant l'écran.
let activeReader: string | null = null;

/** Lecture à voix haute d'un texte, uniquement à la demande, avec la voix du navigateur. */
export function ReadAloudButton({ text, label = "Écouter" }: { text: string; label?: string }) {
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

  return (
    <button type="button" onClick={toggle} className="min-h-11 text-sm text-indigo-700 underline">
      {speaking ? "Arrêter la lecture" : label}
    </button>
  );
}
