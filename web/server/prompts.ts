import type { DrillRequest, GenerateCourseRequest, GradeRequest, TutorRequest } from './provider.ts';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

const SYSTEM = '你是严谨的英语教学助手，服务对象是中文母语的成人学习者。只输出 JSON 对象，不要 Markdown 代码块，不要解释文字。';

const COURSE_SCHEMA = `{
  "title": "英文课程标题，3-60 字符",
  "topic": "课程主题，中文，不超过 40 字",
  "goal": "本节课学习目标，中文，一句话，不超过 80 字",
  "level": "CEFR 等级，如 A2、B1",
  "words": [
    { "term": "英文单词或短语", "phonetic": "国际音标，含斜杠", "meanings": ["词性与中文释义"], "example": "英文例句", "exampleTranslation": "中文译文" }
  ],
  "grammarSections": [{ "title": "要点标题", "body": "中文讲解 2-4 句；需要对比时接 Markdown 表格，如：\\n| 主语 | 正确表达 |\\n| --- | --- |\\n| I | I want to study. |" }],
  "grammarQuestions": [{ "kind": "choice", "prompt": "题干", "options": ["选项A","选项B","选项C","选项D"], "answerIndex": 0, "explanation": "中文解析", "knowledge": 0 }],
  "passage": "英文短文，120-180 词",
  "passageTranslation": "中文译文",
  "readingQuestions": [
    { "kind": "choice", "prompt": "英文题干", "options": ["A","B","C","D"], "answerIndex": 0, "explanation": "中文解析", "knowledge": 1 },
    { "kind": "translate", "prompt": "把这句话译成中文：……", "reference": "参考译文", "keyPoints": ["要点1","要点2"], "knowledge": 1 }
  ],
  "knowledgeLabels": ["本节知识点，中文短句"],
  "reviewQuestions": [{ "kind": "choice", "prompt": "题干", "options": ["A","B","C","D"], "answerIndex": 0, "explanation": "中文解析", "knowledge": 2 }]
}`;

export function courseMessages(request: GenerateCourseRequest): ChatMessage[] {
  const lines = [
    `请设计第 ${request.number} 节英语课，主题：${request.topic}。`,
    request.level ? `难度：${request.level}。` : '难度：A2-B1。',
    request.goal ? `学习目标：${request.goal}。` : '',
    request.focus ? `需要侧重：${request.focus}。` : '',
    '',
    '硬性要求：',
    '- words 恰好 20 个，不重复，音标用国际音标并带斜杠，例句难度与等级匹配；优先四级核心词；',
    '- grammarSections 2 段：每段用 2-4 句讲清一个规则，需要对比时用 Markdown 表格（例如 | 主语 | 正确表达 |），表格最多 3 列；',
    '- grammarQuestions 10 道单选题，每题 4 个选项，answerIndex 是正确选项下标（0-3）；',
    '- passage 120-180 词，配中文译文；readingQuestions 5 道，其中 4 道选择题和 1 道翻译题；',
    '- knowledgeLabels 3 条，reviewQuestions 5 道单选题，覆盖本节知识点；',
    '- 所有题目只有一个明确正确答案，解析说明原因，不要出现歧义或超出本课内容的题；',
    '- 每道题带 "knowledge" 字段：它是 knowledgeLabels 的下标（0 开始），表示这道题考哪个知识点；',
    '- 不要输出 id 字段，服务器会统一生成；',
    '- 所有字段扁平放在顶层，不要额外嵌套对象；',
    '- 必须输出完整且可解析的 JSON：每个 { 和 [ 都要有对应的 } 和 ]，不要在末尾截断。',
    '',
    '输出 JSON 结构：',
    COURSE_SCHEMA
  ];
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: lines.filter(Boolean).join('\n') }
  ];
}

export function gradeMessages(request: GradeRequest): ChatMessage[] {
  const points = request.keyPoints?.length ? `\n参考要点：${request.keyPoints.join('；')}` : '';
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        '请批改一道英语翻译题，判断学生译文与参考译文是否表达一致。',
        `题目：${request.prompt}`,
        `参考译文：${request.reference}${points}`,
        `学生译文：${request.answer}`,
        '',
        '判定标准：',
        '- correct：意思与参考译文一致或等价，允许不同的合理表达；',
        '- partial：覆盖主要意思，但有明显漏译或误译；',
        '- uncertain：语义模糊、无法可靠判断，或学生答案过短无法评估。',
        '只输出 JSON：{"status":"correct|partial|uncertain","feedback":"中文说明，不超过 120 字"}'
      ].join('\n')
    }
  ];
}

export function tutorMessages(request: TutorRequest): ChatMessage[] {
  const context = request.context ? `\n当前课程内容：${request.context}` : '';
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        `学生的问题：${request.question}${context}`,
        '',
        '用中文简明回答，控制在 200 字以内。围绕本课内容解释；不确定时直接说不确定，不要编造教材内容。',
        '只输出 JSON：{"answer":"回答内容"}'
      ].join('\n')
    }
  ];
}

export function drillMessages(request: DrillRequest): ChatMessage[] {
  const context = request.context ? `\n参考本课内容：${request.context}` : '';
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        `请针对知识点「${request.label}」出一道英语单选题。${context}`,
        '',
        '要求：',
        '- 4 个选项，只有一个明确正确答案，干扰项要合理；',
        '- 题干简短，难度 A2–B1，不考本知识点以外的内容；',
        '- 解析用中文说明原因；',
        '- 只输出 JSON：{"prompt":"题干","options":["A","B","C","D"],"answerIndex":0,"explanation":"中文解析"}'
      ].join('\n')
    }
  ];
}
