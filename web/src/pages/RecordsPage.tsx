import { Card, PageHeader } from '../components/UI';

export function RecordsPage() {
  return (
    <>
      <PageHeader eyebrow="记录" title="学习记录" subtitle="按日期查看已完成的课程" />
      <Card>
        <p className="muted">完成课程后，记录会按日期出现在这里。</p>
      </Card>
    </>
  );
}
