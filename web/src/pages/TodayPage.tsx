import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge, Card, ErrorState, LoadingState, Notice, PageHeader } from '../components/UI';
import { getCourseModules, getCurrentCourse, startCourse } from '../repositories/courseRepository';
import { getStudySummary } from '../repositories/studyRepository';
import { listWeakLabels } from '../repositories/knowledgeRepository';
import { generateCourse } from '../services/aiClient';
import { nextCourseNumber, saveGeneratedCourse } from '../services/courseImport';
import type { StudySummary } from '../repositories/studyRepository';
import type { Course, CourseModule } from '../types/domain';
import { moduleLabels, moduleProgress, moduleStatusLabels } from '../utils/course';

export function TodayPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [course, setCourse] = useState<Course>();
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [summary, setSummary] = useState<StudySummary>({ todaySeconds: 0, todayMinutes: 0, activeDays: 0 });
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await getCurrentCourse();
        const [list, study] = await Promise.all([
          current ? getCourseModules(current.id) : Promise.resolve([]),
          getStudySummary()
        ]);
        if (!active) return;
        setCourse(current);
        setModules(list);
        setSummary(study);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : '读取课程失败');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  if (!course) {
    async function handleGenerateNext() {
      if (generating) return;
      setGenerating(true);
      setGenerateError('');
      try {
        const weak = await listWeakLabels();
        const number = await nextCourseNumber();
        const focus = weak.slice(0, 3).join('、').slice(0, 80);
        const { course: payload, provider } = await generateCourse({
          number,
          topic: focus ? `继续学习：${focus}` : '继续学习：综合复习',
          level: 'A2-B1'
        });
        const saved = await saveGeneratedCourse({ number, payload, provider });
        navigate(`/course/${saved.course.id}`);
      } catch (reason) {
        setGenerateError(reason instanceof Error ? reason.message : '生成失败');
        setGenerating(false);
      }
    }

    return (
      <>
        <PageHeader eyebrow="今日" title="今天学一节" subtitle="首页只显示当前课程与进度" />
        <Card>
          <p className="muted">全部课程已完成。可以按当前薄弱点生成下一课。</p>
          <button type="button" className="primary-button" onClick={() => { void handleGenerateNext(); }} disabled={generating}>
            {generating ? '正在生成…' : '生成下一课'}
          </button>
          {generateError && <p className="error-text">{generateError}</p>}
        </Card>
      </>
    );
  }

  const progress = moduleProgress(modules);
  const started = course.status !== 'not_started';

  async function handleStart() {
    if (!course || starting) return;
    setStarting(true);
    try {
      await startCourse(course.id);
      const nextModule = modules.find(module => module.status !== 'graded') ?? modules[0];
      navigate(nextModule ? `/course/${course.id}/module/${nextModule.kind}` : `/course/${course.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法开始课程');
      setStarting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="今日"
        title={started ? '继续这一节' : '今天学一节'}
        subtitle="首页只显示当前课程与进度"
      />
      <section className="card course-card">
        <div className="course-meta">
          <span className="course-number">第 {course.number} 课</span>
          {course.source === 'sample' && <Badge>示例</Badge>}
        </div>
        <h2 className="course-title">{course.title}</h2>
        <p className="course-topic">{course.topic}</p>
        <p className="course-goal">目标：{course.goal}</p>
        <p className="course-stats">
          今日已学 {summary.todaySeconds === 0 ? '0 分钟' : summary.todayMinutes < 1 ? '不到 1 分钟' : `${summary.todayMinutes} 分钟`}
          {' · '}有效学习 {summary.activeDays} 天
        </p>
      </section>

      <Card title="模块进度">
        <ul className="module-list">
          {modules.map(module => (
            <li key={module.id} className="module-row">
              <span className="module-name">{moduleLabels[module.kind]}</span>
              <span className={`module-status status-${module.status}`}>{moduleStatusLabels[module.status]}</span>
            </li>
          ))}
        </ul>
        <p className="progress-text">已完成 {progress.completed} / {progress.total} 个模块</p>
      </Card>

      <button type="button" className="primary-button" onClick={handleStart} disabled={starting}>
        {starting ? '正在打开…' : started ? '继续学习' : '开始学习'}
      </button>
      {course.source === 'sample' && <Notice>这是一节示例课程，用于验证流程，不计入正式学习记录。</Notice>}
    </>
  );
}
