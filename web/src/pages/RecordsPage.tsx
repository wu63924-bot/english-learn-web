import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Card, ErrorState, LoadingState, PageHeader } from '../components/UI';
import { listCourseRecords, deleteCourseRecord } from '../repositories/recordRepository';
import type { CourseRecord } from '../repositories/recordRepository';
import { listMistakes } from '../repositories/mistakeRepository';
import type { MistakeView } from '../repositories/mistakeRepository';
import { moduleLabels } from '../utils/course';

export function RecordsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<CourseRecord[]>([]);
  const [mistakes, setMistakes] = useState<MistakeView[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([listCourseRecords(), listMistakes()])
      .then(([courseRecords, mistakeViews]) => {
        if (!active) return;
        setRecords(courseRecords);
        setMistakes(mistakeViews);
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : '读取记录失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  async function handleDelete(courseId: string, title: string) {
    if (deleting) return;
    const confirmed = window.confirm(`删除“${title}”这条学习记录？\n\n会删除该课程的模块、作答、批改和错题；学习时长与知识点状态保留。`);
    if (!confirmed) return;
    setDeleting(courseId);
    try {
      await deleteCourseRecord(courseId);
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败');
      setDeleting(null);
    }
  }

  return (
    <>
      <PageHeader eyebrow="记录" title="学习记录" subtitle="按日期查看已开始的课程与错题" />

      <Card title="课程">
        {records.length === 0 ? (
          <p className="muted">还没有学习记录。完成一节课程后会出现在这里。</p>
        ) : (
          <ul className="record-list">
            {records.map(({ course, date, modulesCompleted, moduleTotal, objectiveAnswered, objectiveCorrect }) => (
              <li key={course.id}>
                <div className="record-row">
                  <Link className="record-item" to={`/course/${course.id}`}>
                    <span className="record-main">
                      <span className="record-title">
                        第 {course.number} 课 · {course.title}
                        {course.source === 'sample' && <Badge>示例</Badge>}
                      </span>
                      <span className="record-meta">
                        {date || '未记录日期'} · 模块 {modulesCompleted} / {moduleTotal} · 正确率{' '}
                        {objectiveAnswered > 0 ? `${Math.round(objectiveCorrect / objectiveAnswered * 100)}%` : '—'}
                      </span>
                    </span>
                    <span className={`module-status ${course.status === 'completed' ? 'status-graded' : 'status-draft'}`}>
                      {course.status === 'completed' ? '已完成' : '进行中'}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="ghost-button record-delete"
                    onClick={() => { void handleDelete(course.id, `第 ${course.number} 课 · ${course.title}`); }}
                    disabled={deleting !== null}
                  >
                    {deleting === course.id ? '删除中…' : '删除'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="错题">
        {mistakes.length === 0 ? (
          <p className="muted">还没有错题。答错的题会记录在这里。</p>
        ) : (
          <ul className="mistake-list">
            {mistakes.map(view => (
              <li key={view.mistake.id} className="mistake-item">
                <p className="mistake-prompt">{view.prompt}</p>
                <p className="mistake-answer">你的答案：{view.yourAnswer}</p>
                <p className="mistake-answer correct">正确答案：{view.correctAnswer}</p>
                <p className="explanation">{view.explanation}</p>
                <p className="mistake-source">
                  第 {view.courseNumber} 课 · {moduleLabels[view.moduleKind]}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
