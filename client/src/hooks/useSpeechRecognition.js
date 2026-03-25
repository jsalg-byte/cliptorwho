import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function useSpeechRecognition({ enabled, wakeWord = 'jarvis', onTrigger }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [flashTriggered, setFlashTriggered] = useState(false);
  const shouldListenRef = useRef(false);
  const recognitionRef = useRef(null);
  const lastTriggerRef = useRef(0);

  const supported = useMemo(() => {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const startListening = useCallback(() => {
    if (!supported || !recognitionRef.current) {
      return;
    }

    shouldListenRef.current = true;
    recognitionRef.current.start();
  }, [supported]);

  useEffect(() => {
    if (!supported) {
      return undefined;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onend = () => {
      setListening(false);
      if (shouldListenRef.current) {
        recognition.start();
      }
    };

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();

      if (!text) {
        return;
      }

      setTranscript(text);

      const phrase = `${wakeWord} clip that`.toLowerCase();
      const normalized = text.toLowerCase();
      const now = Date.now();

      if (normalized.includes(phrase) && now - lastTriggerRef.current > 3500) {
        lastTriggerRef.current = now;
        setFlashTriggered(true);
        onTrigger?.();
        setTimeout(() => setFlashTriggered(false), 900);
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      recognition.stop();
    };
  }, [supported, wakeWord, onTrigger]);

  useEffect(() => {
    if (!supported || !recognitionRef.current) {
      return;
    }

    if (enabled) {
      startListening();
    } else {
      stopListening();
    }
  }, [enabled, startListening, stopListening, supported]);

  return {
    listening,
    transcript,
    startListening,
    stopListening,
    supported,
    flashTriggered,
  };
}
