import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, Card, ErrorState, LoadingState, Notice } from '../components/UI';
import { getCourse, getCourseModules, startCourse } from '../repositories/courseRepository';
import type { Course, CourseModule } from '../types/domain';
import { moduleLabels, moduleStatusLabels } from '../utils/course';

export function CoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [course, setCourse] = useState<Course>();
  const [modules, setModules] = useState<CourseModule[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const found = courseId ? await getCourse(courseId) : undefined;
        const started = found && found.status === 'not_started' ? await startCourse(found.id) ?? found : found;
        const list = started ? await getCourseModules(started.id) : [];
        if (!active) return;
        setCourse(started);
        setModules(list);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : '读取课程失败');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  if (!course) {
    return (
      <>
        <div className="back-row">
          <button type="button" className="back-button" onClick={() => navigate('/')} aria-label="返回">‹</button>
        </div>
        <Card>
          <p className="muted">没有找到这节课。</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="back-row">
        <button type="button" className="back-button" onClick={() => navigate('/')} aria-label="返回">‹</button>
      </div>
      <header className="page-header">
        <p className="eyebrow">第 {course.number} 课</p>
        <h1 className="page-title">{course.title}</h1>
        <p className="page-subtitle">{course.topic}</p>
      </header>

      <section className="card">
        <div className="course-meta">
          <span className="course-number">学习目标</span>
          {course.source === 'sample' && <Badge>示例</Badge>}
        </div>
        <p className="course-goal">{course.goal}</p>
      </section>

      <Card title="本节模块">
        <ol className="module-list">
          {modules.map(module => (
            <li key={module.id} className="module-row">
              <Link className="module-link" to={`/course/${course.id}/module/${module.kind}`}>
                <span className="module-name">{module.order}. {moduleLabels[module.kind]}</span>
                <span className={`module-status status-${module.status}`}>{moduleStatusLabels[module.status]}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      {modules.length > 0 && modules.every(module => module.status === 'graded') ? (
        <Notice>这节课已完成，四个模块都可以随时回看。</Notice>
      ) : (
        <Notice>当前进度已保存，刷新后仍会回到这节课。</Notice>
      )}
    </>
  );
}
