import { useState } from 'react';
import { AiError, askTutor } from '../services/aiClient';

export function TutorPanel({ context }: { context: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask() {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try {
      setAnswer(await askTutor({ question: text, context }));
    } catch (reason) {
      setError(reason instanceof AiError ? reason.message : reason instanceof Error ? reason.message : '提问失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card tutor-card">
      <button type="button" className="tutor-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        {open ? '收起提问' : '问老师'}
      </button>
      {open && (
        <div className="tutor-body">
          <textarea
            className="answer-textarea"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            rows={3}
            placeholder="问一个和本课有关的问题"
            aria-label="向老师提问"
          />
          <div className="answer-row">
            <button type="button" className="ghost-button" onClick={() => { void ask(); }} disabled={!question.trim() || busy}>
              {busy ? '正在思考…' : '发送'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
          {answer && <div className="tutor-answer">{answer}</div>}
        </div>
      )}
    </section>
  );
}
