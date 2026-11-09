import { Card, PageHeader } from '../components/UI';

export function ReviewPage() {
  return (
    <>
      <PageHeader eyebrow="复习" title="到期复习" subtitle="按规则到期，并写明进入复习的原因" />
      <Card>
        <p className="muted">复习规则尚未接入，这里暂时为空。</p>
      </Card>
    </>
  );
}
