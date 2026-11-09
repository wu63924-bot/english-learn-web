import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageHeader } from '../components/UI';
import { backupCounts, createBackup, parseBackup, restoreBackup } from '../services/backupService';
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

      <Card title="AI">
        <p className="muted">未接入任何 AI 服务，也没有配置密钥。</p>
      </Card>

      <Card title="关于">
        <p className="muted">版本 0.1.0 · 本地学习版</p>
      </Card>
    </>
  );
}
