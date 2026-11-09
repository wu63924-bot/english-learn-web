import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Card, ErrorState, LoadingState } from '../components/UI';
import { WordModule } from '../components/WordModule';
import { GrammarModule } from '../components/GrammarModule';
import { ReadingModule } from '../components/ReadingModule';
import { ReviewModule } from '../components/ReviewModule';
import { completeCourse, getCourse, getCourseModule, getCourseModules, updateModuleStatus } from '../repositories/courseRepository';
import { addCompletedCourse, addStudySeconds } from '../repositories/studyRepository';
import { useStudyTimer } from '../hooks/useStudyTimer';
import type { Course, CourseModule, ModuleKind } from '../types/domain';
import { isModuleKind, moduleLabels, moduleOrder } from '../utils/course';

export function ModulePage() {
  const { courseId, kind } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [course, setCourse] = useState<Course>();
  const [module, setModule] = useState<CourseModule>();
  const [busy, setBusy] = useState(false);
  const validKind: ModuleKind | undefined = isModuleKind(kind) ? kind : undefined;
  useStudyTimer(Boolean(module));

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!courseId || !validKind) {
          if (active) setLoading(false);
          return;
        }
        const found = await getCourse(courseId);
        const foundModule = await getCourseModule(courseId, validKind);
        if (!active) return;
        setCourse(found);
        setModule(foundModule);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : '读取模块失败');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId, validKind]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  if (!course || !module || !validKind) {
    return (
      <>
        <div className="back-row">
          <button type="button" className="back-button" onClick={() => navigate('/')} aria-label="返回">‹</button>
        </div>
        <Card><p className="muted">没有找到这个模块。</p></Card>
      </>
    );
  }

  const order = moduleOrder.indexOf(module.kind) + 1;

  async function completeModule() {
    if (!module || busy) return;
    setBusy(true);
    try {
      const wasGraded = module.status === 'graded';
      await updateModuleStatus(module.id, 'graded');
      if (!wasGraded) await addStudySeconds(0, 1);
      const modules = await getCourseModules(module.courseId);
      if (modules.every(item => item.status === 'graded')) {
        await completeCourse(module.courseId);
        await addCompletedCourse();
      }
      navigate(`/course/${module.courseId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存模块状态失败');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="back-row">
        <button type="button" className="back-button" onClick={() => navigate(`/course/${course.id}`)} aria-label="返回课程">‹</button>
        <span className="back-hint">第 {course.number} 课 · 模块 {order} / {moduleOrder.length}</span>
      </div>
      <header className="page-header">
        <p className="eyebrow">{course.title}</p>
        <h1 className="page-title">{moduleLabels[module.kind]}</h1>
      </header>

      {module.kind === 'word' && (
        <WordModule
          module={module as CourseModule<'word'>}
          alreadyDone={module.status === 'graded'}
          busy={busy}
          onFinish={completeModule}
        />
      )}

      {module.kind === 'grammar' && (
        <GrammarModule
          module={module as CourseModule<'grammar'>}
          onFinish={completeModule}
          finishing={busy}
        />
      )}

      {module.kind === 'reading' && (
        <ReadingModule
          module={module as CourseModule<'reading'>}
          onFinish={completeModule}
          finishing={busy}
        />
      )}

      {module.kind === 'review' && (
        <ReviewModule
          module={module as CourseModule<'review'>}
          onFinish={completeModule}
          finishing={busy}
        />
      )}
    </>
  );
}
