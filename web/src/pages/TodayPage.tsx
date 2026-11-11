import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, ErrorState, LoadingState, Notice, PageHeader } from '../components/UI';
import { getCourseModules, getCurrentCourse, startCourse } from '../repositories/courseRepository';
import { getLastAnsweredModuleId } from '../repositories/answerRepository';
import { getStudySummary } from '../repositories/studyRepository';
import { listWeakLabels } from '../repositories/knowledgeRepository';
import { generateCourse } from '../services/aiClient';
import { nextCourseNumber, saveGeneratedCourse } from '../services/courseImport';
import { coursePreset } from '../data/coursePlan';
import type { StudySummary } from '../repositories/studyRepository';
import type { Course, CourseModule } from '../types/domain';
import { moduleLabels, moduleOrder, moduleProgress } from '../utils/course';

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
        const preset = coursePreset(number);
        const { course: payload, provider } = await generateCourse({
          number,
          topic: preset.topic,
          level: preset.level,
          goal: preset.goal,
          focus: weak.slice(0, 3).join('、').slice(0, 80) || undefined
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
  const nextModule = modules.find(module => module.status === 'draft' || module.status === 'answered')
    ?? modules.find(module => module.status !== 'graded')
    ?? modules[0];
  const today = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
  const doneCount = progress.completed;
  const ringLength = 113;

  async function handleStart() {
    if (!course || starting) return;
    setStarting(true);
    try {
      await startCourse(course.id);
      const lastModuleId = await getLastAnsweredModuleId(course.id);
      const lastIndex = lastModuleId ? modules.findIndex(module => module.id === lastModuleId) : -1;
      const lastModule = lastIndex >= 0 ? modules[lastIndex] : undefined;
      // 回到最后学的那一节；如果它已完成，就往后找第一个还没完成的模块。
      const target = lastModule && lastModule.status !== 'graded'
        ? lastModule
        : modules.slice(lastIndex + 1).find(module => module.status !== 'graded')
          ?? modules.find(module => module.status !== 'graded')
          ?? modules[0];
      navigate(target ? `/course/${course.id}/module/${target.kind}` : `/course/${course.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法开始课程');
      setStarting(false);
    }
  }

  return (
    <div className="today-page">
      <header className="today-top">
        <div>
          <p className="today-date">{today}</p>
          <h1 className="today-title">{started ? '继续这一节' : '今天也读一点'}</h1>
        </div>
        <span className="today-chip">第 {course.number} 课</span>
      </header>

      <section className="today-hero">
        <p className="today-course-label">Today</p>
        <h2 className="today-course-title">{course.title}</h2>
        <p className="today-course-topic">{course.topic}</p>
        <div className="today-progress">
          <svg className="today-ring" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="18" className="track" />
            <circle
              cx="22"
              cy="22"
              r="18"
              className="value"
              strokeDasharray={ringLength}
              strokeDashoffset={ringLength - (ringLength * doneCount) / progress.total}
            />
          </svg>
          <div className="today-ring-text">
            <b>{doneCount} / {progress.total} 模块</b>
            <span>{nextModule ? `下一步：${moduleLabels[nextModule.kind]}` : '全部完成'}</span>
          </div>
        </div>
        <div className="today-chips">
          {modules.map(module => {
            const index = moduleOrder.indexOf(module.kind);
            const state = module.status === 'graded' ? ' done' : module.id === nextModule?.id ? ' now' : '';
            return (
              <span key={module.id} className={`today-tag tag-${index}${state}`}>
                {moduleLabels[module.kind]}
              </span>
            );
          })}
        </div>
        <div className="today-actions">
          <button type="button" className="primary-button" onClick={handleStart} disabled={starting}>
            {starting ? '正在打开…' : started ? '继续学习' : '开始学习'}
          </button>
          <button type="button" className="today-secondary" onClick={() => navigate(`/course/${course.id}`)}>
            查看课程内容
          </button>
        </div>
      </section>

      <div className="today-stats">
        <div><b>{summary.todaySeconds === 0 ? '0' : summary.todayMinutes < 1 ? '<1' : summary.todayMinutes}</b><span>今日分钟</span></div>
        <div><b>{summary.activeDays}</b><span>有效学习天</span></div>
        <div><b>{progress.completed}/{progress.total}</b><span>模块完成</span></div>
      </div>

      <section className="today-goal">
        <p className="today-goal-label">今天的目标</p>
        <p>{course.goal}</p>
      </section>

      {course.source === 'sample' && <Notice>这是一节示例课程，用于验证流程，不计入正式学习记录。</Notice>}
    </div>
  );
}
