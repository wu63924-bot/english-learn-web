import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Card, PageHeader } from '../components/UI';
import { backupCounts, createBackup, parseBackup, restoreBackup } from '../services/backupService';
import { generateCourse, getAiHealth, aiBaseUrl, AiError, type AiHealth } from '../services/aiClient';
import { nextCourseNumber, saveGeneratedCourse } from '../services/courseImport';
import { getTodayUsage } from '../repositories/aiUsageRepository';
import type { AiUsageSummary } from '../repositories/aiUsageRepository';
import { listWeakLabels } from '../repositories/knowledgeRepository';
import { pendingGradeCount, processPendingGrades } from '../services/aiQueue';
import {
  applyHistoryImport,
  getHistorySummary,
  HISTORY_WEAK_POINTS,
  parseHistoryImport,
  previewHistoryImport,
  type HistoryImportFile,
  type HistoryPreview
} from '../services/historyImport';
import type { BackupFile } from '../types/domain';
import { todayKey } from '../utils/date';
import { downloadJson } from '../utils/download';

export function SettingsPage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [busy, setBusy] = useState(false);

  const [health, setHealth] = useState<AiHealth | null>(null);
  const [usage, setUsage] = useState<AiUsageSummary>({ requests: 0, tokens: 0 });
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState('');
  const [aiError, setAiError] = useState('');

  const historyInput = useRef<HTMLInputElement>(null);
  const [historyData, setHistoryData] = useState<HistoryImportFile | null>(null);
  const [historyPreview, setHistoryPreview] = useState<HistoryPreview | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const [historySummary, setHistorySummary] = useState<{ days: number; studiedDays: number; importedAt?: number } | null>(null);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [historyText, setHistoryText] = useState('');
  const [weakLabels, setWeakLabels] = useState<string[]>([]);
  const [pendingGrades, setPendingGrades] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([getAiHealth(), getTodayUsage(), nextCourseNumber(), getHistorySummary(), listWeakLabels(), pendingGradeCount()]).then(([healthResult, usageResult, number, historyResult, weak, pending]) => {
      if (!active) return;
      setHealth(healthResult);
      setUsage(usageResult);
      setNextNumber(number);
      setHistorySummary(historyResult);
      setWeakLabels(weak);
      setPendingGrades(pending);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleExport() {
    setError('');
    setBusy(true);
    try {
      const backup = await createBackup();
      downloadJson(`english-learning-backup-${todayKey()}.json`, backup);
      setStatus('备份已导出到下载文件夹。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导出失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setStatus('');
    setPending(null);
    try {
      const backup = parseBackup(await file.text());
      setPending(backup);
      setStatus('文件校验通过，确认后才会替换本机数据。');
    } catch (reason) {
      setError(`导入失败：${reason instanceof Error ? reason.message : '文件无法识别'}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function confirmRestore() {
    if (!pending || busy) return;
    setBusy(true);
    setError('');
    try {
      const current = await createBackup();
      downloadJson(`english-learning-pre-restore-${todayKey()}.json`, current);
      await restoreBackup(pending);
      setStatus('恢复完成，正在重新加载…');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (reason) {
      setError(`恢复失败，本机数据未改变：${reason instanceof Error ? reason.message : '未知错误'}`);
      setBusy(false);
    }
  }

  async function handleGenerate() {
    if (!nextNumber || generating || !topic.trim()) return;
    setGenerating(true);
    setAiError('');
    setAiMessage('');
    try {
      const { course, provider } = await generateCourse({
        number: nextNumber,
        topic: topic.trim(),
        level: level.trim() || undefined,
        focus: weakLabels.length ? weakLabels.join('；') : undefined
      });
      const saved = await saveGeneratedCourse({ number: nextNumber, payload: course, provider });
      setGeneratedId(saved.course.id);
      setAiMessage(saved.existing
        ? `第 ${nextNumber} 课已存在，没有重复生成。`
        : `已生成第 ${nextNumber} 课《${saved.course.title}》${provider === 'mock' ? '（模拟内容）' : ''}，点击打开。`);
      setTopic('');
      const [nextHealth, nextUsage, number] = await Promise.all([getAiHealth(), getTodayUsage(), nextCourseNumber()]);
      setHealth(nextHealth);
      setUsage(nextUsage);
      setNextNumber(number);
      setWeakLabels(await listWeakLabels());
    } catch (reason) {
      setAiError(reason instanceof AiError ? reason.message : reason instanceof Error ? reason.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  }

  async function loadHistory(text: string) {
    setHistoryError('');
    setHistoryStatus('');
    setHistoryPreview(null);
    setHistoryData(null);
    try {
      const parsed = parseHistoryImport(text);
      setHistoryData(parsed);
      setHistoryPreview(await previewHistoryImport(parsed));
    } catch (reason) {
      setHistoryError(`历史文件无法识别：${reason instanceof Error ? reason.message : '格式不正确'}`);
    }
  }

  async function handleHistoryFile(file: File | undefined) {
    if (!file) return;
    try {
      await loadHistory(await file.text());
    } finally {
      if (historyInput.current) historyInput.current.value = '';
    }
  }

  async function confirmHistoryImport() {
    if (!historyData || importing) return;
    setImporting(true);
    setHistoryError('');
    try {
      const backup = await createBackup();
      downloadJson(`english-learning-pre-import-${todayKey()}.json`, backup);
      await applyHistoryImport(historyData, { markWeakpointsForReview: true });
      setHistoryStatus(
        `已导入 ${historyData.days.length} 天记录，${historyData.days.filter(day => day.choiceAnswers.length + day.englishAttempts.length + day.chineseAttempts.length > 0).length
        } 天有作答；写入 ${HISTORY_WEAK_POINTS.length} 个“需巩固”知识点。没有写入任何成绩或完成状态。`
      );
      setHistoryData(null);
      setHistoryPreview(null);
      setHistoryText('');
      setHistorySummary(await getHistorySummary());
      setNextNumber(await nextCourseNumber());
      setWeakLabels(await listWeakLabels());
    } catch (reason) {
      setHistoryError(`导入失败，本机数据未改变：${reason instanceof Error ? reason.message : '未知错误'}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleBridgeCourse() {
    if (bridgeBusy) return;
    setBridgeBusy(true);
    setBridgeError('');
    setAiMessage('');
    try {
      const number = await nextCourseNumber();
      const { course, provider } = await generateCourse({
        number,
        topic: '衔接复习：第三人称单数、过去时、there be、比较级、并列句',
        level: 'A2',
        goal: '用诊断题检查历史薄弱点，决定哪些需要进入复习',
        focus: HISTORY_WEAK_POINTS.map(point => point.label).join('；')
      });
      const saved = await saveGeneratedCourse({ number, payload: course, provider });
      setGeneratedId(saved.course.id);
      setAiMessage(`已生成衔接复习课（第 ${number} 课《${saved.course.title}》），点击打开。`);
      setNextNumber(await nextCourseNumber());
      setHealth(await getAiHealth());
      setWeakLabels(await listWeakLabels());
    } catch (reason) {
      setBridgeError(reason instanceof AiError ? reason.message : reason instanceof Error ? reason.message : '生成失败');
    } finally {
      setBridgeBusy(false);
    }
  }

  const counts = pending ? backupCounts(pending) : null;

  return (
    <>
      <div className="back-row">
        <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="返回">‹</button>
      </div>
      <PageHeader title="设置" subtitle="数据、AI 用量与版本信息" />

      <Card title="数据">
        <p className="muted">数据只保存在这台设备的浏览器里。换设备或清理浏览器前先导出备份。</p>
        <div className="button-row">
          <button type="button" className="ghost-button" onClick={() => { void handleExport(); }} disabled={busy}>
            导出备份
          </button>
          <button type="button" className="ghost-button" onClick={() => fileInput.current?.click()} disabled={busy}>
            导入备份
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden-input"
          aria-label="导入备份文件"
          onChange={event => { void handleFile(event.target.files?.[0]); }}
        />

        {pending && counts && (
          <div className="restore-panel">
            <p className="restore-title">待恢复的备份</p>
            <p className="muted">
              {counts.courses} 节课程 · {counts.answers} 条作答 · {counts.mistakes} 条错题 · {counts.studyDays} 天记录
            </p>
            <p className="notice">恢复会覆盖当前全部数据。确认前会自动下载一份当前数据的备份。</p>
            <div className="button-row">
              <button type="button" className="ghost-button" onClick={() => setPending(null)} disabled={busy}>取消</button>
              <button type="button" className="primary-button compact" onClick={() => { void confirmRestore(); }} disabled={busy}>
                {busy ? '正在恢复…' : '确认恢复'}
              </button>
            </div>
          </div>
        )}

        {status && <p className="status-text">{status}</p>}
        {error && <p className="error-text">{error}</p>}
      </Card>

      <Card title="历史导入">
        <p className="muted">导入从 ChatGPT 或课程材料整理出的学习历史。只写“学过／出现过”，不写成绩、错题或掌握状态。</p>
        {historySummary && historySummary.days > 0 && (
          <p className="ai-status">
            已导入 {historySummary.days} 天，其中 {historySummary.studiedDays} 天有作答
            {historySummary.importedAt ? ` · ${new Date(historySummary.importedAt).toLocaleDateString('zh-CN')}` : ''}
          </p>
        )}
        <div className="button-row">
          <button type="button" className="ghost-button" onClick={() => historyInput.current?.click()} disabled={importing}>
            选择历史文件
          </button>
          {historySummary?.importedAt && (
            <button type="button" className="ghost-button" onClick={() => { void handleBridgeCourse(); }} disabled={bridgeBusy}>
              {bridgeBusy ? '正在生成…' : '生成衔接复习课'}
            </button>
          )}
        </div>
        <input
          ref={historyInput}
          type="file"
          accept="application/json,.json"
          className="hidden-input"
          aria-label="导入历史文件"
          onChange={event => { void handleHistoryFile(event.target.files?.[0]); }}
        />

        <label className="form-field history-paste">
          <span>或粘贴 JSON（不方便选文件时）</span>
          <textarea
            className="answer-textarea"
            rows={3}
            value={historyText}
            onChange={event => setHistoryText(event.target.value)}
            aria-label="粘贴历史 JSON"
            placeholder='{"source":"ChatGPT 分享","days":[...]}'
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          className="ghost-button"
          onClick={() => { void loadHistory(historyText); }}
          disabled={!historyText.trim() || importing}
        >
          解析粘贴内容
        </button>

        {historyPreview && (
          <div className="restore-panel">
            <p className="restore-title">{historyPreview.title ?? historyPreview.source}</p>
            <p className="muted">
              {historyPreview.totalDays} 天 · 有作答 {historyPreview.studiedDays} 天 · 仅标记 {historyPreview.listedOnlyDays} 天 · 共 {historyPreview.answerCount} 条作答
            </p>
            <p className="muted">
              将写入 {historyPreview.newKnowledge} 个新知识点（已存在 {historyPreview.existingKnowledge} 个），其中 {historyPreview.weakPoints.length} 个标为“需巩固”。
            </p>
            <ul className="weak-list">
              {historyPreview.weakPoints.map(point => (
                <li key={point.label}>
                  <strong>{point.label}</strong>
                  <span>{point.evidence}</span>
                </li>
              ))}
            </ul>
            <p className="notice">不会写入分数、错题或完成状态；确认前会自动下载一份当前数据备份。</p>
            <div className="button-row">
              <button type="button" className="ghost-button" onClick={() => { setHistoryData(null); setHistoryPreview(null); }} disabled={importing}>
                取消
              </button>
              <button type="button" className="primary-button compact" onClick={() => { void confirmHistoryImport(); }} disabled={importing}>
                {importing ? '正在导入…' : '确认导入'}
              </button>
            </div>
          </div>
        )}

        {historyStatus && <p className="status-text">{historyStatus}</p>}
        {historyError && <p className="error-text">{historyError}</p>}
        {bridgeError && <p className="error-text">{bridgeError}</p>}
      </Card>

      <Card title="AI">
        <p className="ai-status">
          代理地址：{aiBaseUrl()}
          <br />
          {health
            ? `已连接 · ${health.provider === 'mock' ? '模拟模式（不花钱）' : '真实模型'} · 服务端今日调用 ${health.requests} / ${health.maxRequests}`
            : '未连接（先运行 npm run dev:api）'}
        </p>
        <p className="muted">本机今日记录：{usage.requests} 次调用 · {usage.tokens} tokens</p>
        {pendingGrades > 0 && (
          <p className="ai-status">
            待批改 {pendingGrades} 条（离线排队）。联网后会自动处理。
            <button
              type="button"
              className="ghost-button"
              style={{ marginLeft: 8, minHeight: 34, padding: '0 10px' }}
              onClick={() => { void processPendingGrades().then(async () => setPendingGrades(await pendingGradeCount())); }}
            >
              立即处理
            </button>
          </p>
        )}

        <div className="ai-form">
          <label className="form-field">
            <span>下一课编号</span>
            <input className="text-input" type="text" value={nextNumber ?? '—'} readOnly aria-label="下一课编号" />
          </label>
          <label className="form-field">
            <span>课程主题</span>
            <input
              className="text-input"
              type="text"
              value={topic}
              onChange={event => setTopic(event.target.value)}
              placeholder="例如：在咖啡店点单"
              aria-label="课程主题"
            />
          </label>
          <label className="form-field">
            <span>等级（可选）</span>
            <input
              className="text-input"
              type="text"
              value={level}
              onChange={event => setLevel(event.target.value)}
              placeholder="A2 / B1"
              aria-label="课程等级"
            />
          </label>
          <button type="button" className="primary-button" onClick={() => { void handleGenerate(); }} disabled={!topic.trim() || generating || nextNumber === null}>
            {generating ? '正在生成…' : '生成并保存这节课'}
          </button>
          {weakLabels.length > 0 && (
            <p className="notice">当前薄弱点会带入生成要求：{weakLabels.join('、')}</p>
          )}
        </div>
        {aiMessage && (
          <p className="status-text">
            {aiMessage} {generatedId && <Link to={`/course/${generatedId}`}>打开课程</Link>}
          </p>
        )}
        {aiError && <p className="error-text">{aiError}</p>}
        {health?.provider === 'mock' && <p className="notice">模拟模式生成的内容只用于验证流程，不能当真实学习材料。</p>}
      </Card>

      <Card title="关于">
        <p className="muted">版本 0.1.0 · 本地学习版</p>
      </Card>
    </>
  );
}
