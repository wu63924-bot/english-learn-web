import { useEffect, useState } from 'react';
import { getAutoSpeakWord, setAutoSpeakWord } from '../repositories/settingsRepository';
import { canSpeak, primeSpeech, speakWord } from '../utils/speech';

/**
 * 单词朗读：点击喇叭即时朗读，自动读开关会记住在设置里。
 * 浏览器首次加载语音列表较慢，这里提前预热一次。
 */
export function useWordSpeech(term: string | undefined) {
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void getAutoSpeakWord().then(value => {
      if (!alive) return;
      setAutoSpeak(value);
      setReady(true);
    });
    primeSpeech();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !autoSpeak || !term) return;
    speakWord(term);
  }, [ready, autoSpeak, term]);

  async function toggle() {
    const next = !autoSpeak;
    setAutoSpeak(next);
    await setAutoSpeakWord(next);
    if (next && term) speakWord(term);
  }

  return {
    autoSpeak,
    supported: canSpeak(),
    speak: () => {
      if (term) speakWord(term);
    },
    toggle: () => {
      void toggle();
    }
  };
}
