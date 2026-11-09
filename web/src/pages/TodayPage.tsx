import { Card, Notice, PageHeader } from '../components/UI';

export function TodayPage() {
  return (
    <>
      <PageHeader eyebrow="今日" title="今天学一节" subtitle="首页只显示当前课程与进度" />
      <Card>
        <p className="muted">暂无课程。示例课程会在下一步加入。</p>
        <button type="button" className="primary-button" disabled>开始学习</button>
        <Notice>按钮在课程数据接入后启用。</Notice>
      </Card>
      <Card title="学习目标">
        <p className="muted">课程目标会显示在这里。</p>
      </Card>
    </>
  );
}
