export function speakGerman(text, rate = 1.0) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
    return;
  }
  window.speechSynthesis.cancel();
  const cleanText = text.replace(/[*#|`_]/g, ' ').replace(/\s+/g, ' ').trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'de-DE';
  utterance.rate = rate;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find((v) => v.lang === 'de-DE' && /anna|helena|martin|google|siri|premium/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('de'));
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
