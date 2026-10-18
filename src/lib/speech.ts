import { dictationErrorMessage } from "@/lib/voice";

// La reconnaissance vocale n'est pas dans les types DOM standard.
type RecognitionResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
export type Recognition = {
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

export const SPEECH_LANG = "fr-FR";

export function recognitionConstructor(): RecognitionConstructor | null {
  const speech = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null;
}

export const supportsDictation = () => recognitionConstructor() !== null;
export const supportsReadAloud = () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
export const supportsVoiceConversation = () => supportsDictation() && supportsReadAloud();

export function finalTranscript(results: ArrayLike<RecognitionResult>): string {
  return Array.from(results).filter((result) => result.isFinal).map((result) => result[0].transcript).join(" ").trim();
}

export type VoicePhase = "off" | "listening" | "thinking" | "speaking";

/**
 * Échange vocal mains libres : écoute une phrase, la transmet, lit la réponse, puis réécoute.
 * Il ne démarre que sur action explicite, s'arrête sur demande, sur erreur de micro ou après deux silences.
 */
export function createVoiceConversation(deps: {
  ask: (text: string) => Promise<string | null>;
  onPhase: (phase: VoicePhase) => void;
  onMessage: (message: string | null) => void;
}) {
  const MAX_SILENCES = 2;
  let active = false;
  let silences = 0;
  let recognition: Recognition | null = null;

  function finish(message: string | null = null) {
    active = false;
    const current = recognition;
    recognition = null;
    current?.abort();
    window.speechSynthesis.cancel();
    deps.onPhase("off");
    deps.onMessage(message);
  }

  function speak(text: string) {
    if (!text.trim()) return listen();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LANG;
    const done = () => { if (active) listen(); };
    utterance.onend = done;
    utterance.onerror = done;
    deps.onPhase("speaking");
    window.speechSynthesis.speak(utterance);
  }

  function listen() {
    if (!active) return;
    const Recognizer = recognitionConstructor();
    if (!Recognizer) return finish(dictationErrorMessage("service-not-allowed"));
    const current = new Recognizer();
    current.lang = SPEECH_LANG;
    current.interimResults = false;
    current.continuous = false;
    current.maxAlternatives = 1;
    let heard = "";
    let failed = false;
    current.onresult = (event) => { heard = finalTranscript(event.results); };
    current.onerror = (event) => {
      // Le silence est géré à la fin de l'écoute ; l'arrêt volontaire n'est pas une erreur.
      if (event.error === "no-speech" || event.error === "aborted") return;
      failed = true;
      finish(dictationErrorMessage(event.error));
    };
    current.onend = async () => {
      if (recognition !== current || failed || !active) return;
      recognition = null;
      if (!heard) {
        silences += 1;
        return silences >= MAX_SILENCES ? finish("Échange vocal arrêté : je n'ai rien entendu.") : listen();
      }
      silences = 0;
      deps.onPhase("thinking");
      const reply = await deps.ask(heard);
      if (!active) return;
      if (reply === null) return finish();
      speak(reply);
    };
    recognition = current;
    deps.onPhase("listening");
    try {
      current.start();
    } catch {
      finish(dictationErrorMessage("unknown"));
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      silences = 0;
      deps.onMessage(null);
      listen();
    },
    stop() {
      if (active) finish();
    },
  };
}
