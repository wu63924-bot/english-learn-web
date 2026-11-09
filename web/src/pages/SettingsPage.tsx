import { useNavigate } from 'react-router';
import { Card, PageHeader } from '../components/UI';

export function SettingsPage() {
  const navigate = useNavigate();
  return (
    <>
      <div className="back-row">
        <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="返回">‹</button>
      </div>
      <PageHeader title="设置" subtitle="数据、AI 用量与版本信息" />
      <Card title="数据">
        <p className="muted">备份与恢复将在数据层完成后接入。</p>
      </Card>
      <Card title="AI">
        <p className="muted">未接入任何 AI 服务，也没有配置密钥。</p>
      </Card>
      <Card title="关于">
        <p className="muted">版本 0.1.0 · 骨架阶段</p>
      </Card>
    </>
  );
}
