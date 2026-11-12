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
  "phrases": [{ "phrase": "enjoy reading", "meaning": "喜欢阅读" }],
  "grammarSections": [{
    "title": "要点标题，≤12 字",
    "body": "中文讲解 3-5 句、120-260 字：先给规则，再说明为什么，最后点出常见错误；正文里的英文例句后面用括号给中文",
    "examples": [{ "en": "I enjoy reading.", "zh": "我喜欢阅读。" }]
  }],
  "grammarQuestions": [{ "kind": "choice", "prompt": "题干", "options": ["选项A","选项B","选项C","选项D"], "answerIndex": 0, "explanation": "中文解析", "knowledge": 0 }],
  "passage": "英文短文，120-180 词",
  "passageTranslation": "中文译文",
  "passageGlossary": [
    { "term": "短文中未出现在 words 里的单词或短语", "phonetic": "/音标/", "meaning": "中文释义" }
  ],
  "readingQuestions": [
    { "kind": "choice", "prompt": "英文题干", "options": ["A","B","C","D"], "answerIndex": 0, "explanation": "中文解析", "knowledge": 1 }
  ],
  "knowledgeLabels": ["本节知识点，中文短句"],
  "reviewQuestions": [
    { "kind": "translate", "variant": "correct", "prompt": "改正这个句子：She wants to studying English.", "instruction": "改写为正确的英文句子：考查 want 后接 to do", "reference": "She wants to study English.", "explanation": "want 后接 to do", "knowledge": 0 },
    { "kind": "translate", "prompt": "把这句话译成中文：……", "instruction": "注意 decided 是过去式，wants 是一般现在时", "reference": "参考译文", "keyPoints": ["要点1"], "knowledge": 1 }
  ]
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
    '- phrases 恰好 5 条：从本课单词出发的常用搭配（如 enjoy reading / be good at doing），每条给英文和中文，不要与单词例句重复；',
    '- grammarSections 2 段：每段 3-5 句、120-260 字。先讲规则，再讲为什么，最后点出典型错误；正文中出现的每个英文例句必须在括号里给中文；需要对比时附 Markdown 表格（最多 3 列、2-4 行）；',
    '- 每段必须带 examples：2-4 条 { "en": 英文例句, "zh": 中文翻译 }，句子与正文对应，覆盖正面和反面用法；',
    '- grammarQuestions 恰好 5 道单选题，每题 4 个选项，answerIndex 是正确选项下标（0-3）；',
    '- passage 120-180 词，配中文译文；readingQuestions 恰好 5 道选择题（不要翻译题）；',
    '- passageGlossary 列出短文中所有超出本课 words、也不属于最基础 1000 词的单词或短语，8-15 个，优先名词、动词、形容词、副词；宁可多列，不要漏掉影响理解的词；每个给音标和中文释义；',
    '- knowledgeLabels 3-5 条；',
    '- reviewQuestions 恰好 10 道，顺序固定：前 3 道改错、接着 2 道英译汉、最后 5 道汉译英；',
    '- 改错题用 {"kind":"translate","variant":"correct","prompt":"改正这个句子：<错误句>","instruction":"改写为正确的英文句子：考查 <语法点>","reference":"<正确句>","explanation":"<错因>","knowledge":n}；',
    '- 英译汉/汉译英用 {"kind":"translate","prompt":"把这句话译成中文：<英文句>" 或 "把这句话译成英文：<中文句>","instruction":"<要求或注意点>","reference":"<参考译文>","keyPoints":["要点"],"knowledge":n}；',
    '- 每道开放题都必须带 instruction（不超过 80 字）：改错题写清考查点，汉译英写“要求：使用 …”且不提供单词提示，英译汉可提示时态或难点；没有要提示的可以省略该字段，但改错题和汉译英必须写；',
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
