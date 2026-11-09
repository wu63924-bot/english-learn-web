import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Card, ErrorState, LoadingState } from '../components/UI';
import { WordModule } from '../components/WordModule';
import { getCourse, getCourseModule, updateModuleStatus } from '../repositories/courseRepository';
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

  async function handleFinishWord() {
    if (!module || busy) return;
    setBusy(true);
    try {
      await updateModuleStatus(module.id, 'graded');
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
          onFinish={handleFinishWord}
        />
      )}

      {module.kind !== 'word' && (
        <Card>
          <p className="muted">{moduleLabels[module.kind]}界面将在下一步接入。</p>
          <button type="button" className="ghost-button" onClick={() => navigate(`/course/${course.id}`)}>回到课程</button>
        </Card>
      )}
    </>
  );
}
