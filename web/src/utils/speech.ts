const WORD_LANG = 'en-GB';

let cachedVoices: SpeechSynthesisVoice[] = [];

function synthesis(): SpeechSynthesis | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  return window.speechSynthesis;
}

export function canSpeak(): boolean {
  return synthesis() !== undefined && typeof window.SpeechSynthesisUtterance === 'function';
}

function englishVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const target = WORD_LANG.toLowerCase();
  return list.find(voice => voice.lang.replace('_', '-').toLowerCase() === target)
    ?? list.find(voice => voice.lang.toLowerCase().startsWith('en-gb'))
    ?? list.find(voice => voice.lang.toLowerCase().startsWith('en'));
}

/**
 * 朗读一个单词。浏览器语音列表是异步加载的，第一次可能为空，
 * 这时交给系统默认英文语音，仍然是可用的。
 */
export function speakWord(text: string): boolean {
  const synth = synthesis();
  const term = text.trim();
  if (!synth || !term || typeof window.SpeechSynthesisUtterance !== 'function') return false;

  const voices = synth.getVoices();
  if (voices.length) cachedVoices = voices;
  const voice = englishVoice(cachedVoices);

  synth.cancel();
  const utterance = new window.SpeechSynthesisUtterance(term);
  utterance.lang = voice?.lang ?? WORD_LANG;
  utterance.rate = 0.9;
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}

/** 提前触发一次语音列表加载，减少第一次点击时的延迟。 */
export function primeSpeech(): void {
  const synth = synthesis();
  if (!synth) return;
  const list = synth.getVoices();
  if (list.length) {
    cachedVoices = list;
    return;
  }
  synth.addEventListener('voiceschanged', () => {
    const next = synth.getVoices();
    if (next.length) cachedVoices = next;
  }, { once: true });
}
