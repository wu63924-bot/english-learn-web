import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSpeak, speakWord } from './speech';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('speech', () => {
  it('reports unavailable without a browser speech engine', () => {
    expect(canSpeak()).toBe(false);
    expect(speakWord('relative')).toBe(false);
  });

  it('speaks with an English voice and stops the previous utterance', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const voice = { lang: 'en-GB', name: 'Test Voice' };

    vi.stubGlobal('window', {
      speechSynthesis: {
        getVoices: () => [voice],
        speak,
        cancel,
        addEventListener: vi.fn()
      },
      SpeechSynthesisUtterance: class {
        text: string;
        lang = '';
        rate = 1;
        voice: unknown = null;
        constructor(text: string) {
          this.text = text;
        }
      }
    });

    expect(canSpeak()).toBe(true);
    expect(speakWord(' relative ')).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);

    const utterance = speak.mock.calls[0][0] as { text: string; lang: string; voice: unknown };
    expect(utterance.text).toBe('relative');
    expect(utterance.lang).toBe('en-GB');
    expect(utterance.voice).toBe(voice);
  });

  it('ignores empty text', () => {
    vi.stubGlobal('window', {
      speechSynthesis: { getVoices: () => [], speak: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn() },
      SpeechSynthesisUtterance: class {}
    });
    expect(speakWord('   ')).toBe(false);
  });
});
