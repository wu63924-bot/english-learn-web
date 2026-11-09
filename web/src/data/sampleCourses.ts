import type {
  ChoiceQuestion,
  Course,
  CourseModule,
  KnowledgePoint,
  ModuleContentMap,
  ModuleKind
} from '../types/domain';

export interface SampleCourseBundle {
  course: Course;
  modules: CourseModule[];
  knowledge: KnowledgePoint[];
}

const createdAt = Date.UTC(2026, 0, 1);

function course(id: string, number: number, title: string, topic: string, goal: string, level: string): Course {
  return {
    id,
    number,
    title,
    topic,
    goal,
    level,
    source: 'sample',
    status: 'not_started',
    createdAt,
    updatedAt: createdAt
  };
}

function moduleOf<K extends ModuleKind>(
  courseId: string,
  kind: K,
  order: number,
  content: ModuleContentMap[K]
): CourseModule {
  return { id: `${courseId}-${kind}`, courseId, kind, order, status: 'todo', content };
}

function choice(
  id: string,
  prompt: string,
  options: string[],
  answerIndex: number,
  explanation: string,
  knowledgeIds?: string[]
): ChoiceQuestion {
  return {
    kind: 'choice',
    id,
    prompt,
    options: options.map((label, index) => ({ id: `${id}-${index}`, label })),
    answerId: `${id}-${answerIndex}`,
    explanation,
    ...(knowledgeIds ? { knowledgeIds } : {})
  };
}

function knowledge(id: string, label: string, kind: KnowledgePoint['kind'], stage: number): KnowledgePoint {
  return {
    id,
    label,
    kind,
    stage,
    status: 'unseen',
    correctStreak: 0,
    wrongStreak: 0,
    updatedAt: createdAt
  };
}

const course1 = course(
  'sample-1',
  1,
  'A Normal Tuesday',
  '日常作息与一般现在时',
  '用一般现在时说清一天的安排，并正确使用频率副词',
  'A2'
);

const course1Knowledge: KnowledgePoint[] = [
  knowledge('sample-k1', '一般现在时：第三人称单数', 'grammar', 1),
  knowledge('sample-k2', '频率副词的位置', 'grammar', 1),
  knowledge('sample-k3', '作息与通勤词汇', 'word', 1)
];

const course1Modules: CourseModule[] = [
  moduleOf('sample-1', 'word', 1, {
    words: [
      {
        id: 'sample-1-w1',
        term: 'routine',
        phonetic: '/ruːˈtiːn/',
        meanings: ['n. 日常惯例，常规'],
        example: 'My morning routine takes about forty minutes.',
        exampleTranslation: '我的晨间流程大约要四十分钟。'
      },
      {
        id: 'sample-1-w2',
        term: 'alarm',
        phonetic: '/əˈlɑːrm/',
        meanings: ['n. 闹钟', 'n. 警报'],
        example: 'I set two alarms, but I still wake up late.',
        exampleTranslation: '我设了两个闹钟，可还是起得晚。'
      },
      {
        id: 'sample-1-w3',
        term: 'commute',
        phonetic: '/kəˈmjuːt/',
        meanings: ['n. 通勤路程', 'v. 通勤'],
        example: 'My commute is only fifteen minutes by bike.',
        exampleTranslation: '我骑车通勤只要十五分钟。'
      },
      {
        id: 'sample-1-w4',
        term: 'errand',
        phonetic: '/ˈerənd/',
        meanings: ['n. 差事，跑腿的事'],
        example: 'I run errands on my way home.',
        exampleTranslation: '我在回家路上顺便把事情办了。'
      },
      {
        id: 'sample-1-w5',
        term: 'unwind',
        phonetic: '/ˌʌnˈwaɪnd/',
        meanings: ['v. 放松，松弛下来'],
        example: 'I unwind by listening to a podcast.',
        exampleTranslation: '我靠听播客放松。'
      }
    ]
  }),
  moduleOf('sample-1', 'grammar', 2, {
    sections: [
      {
        title: '一般现在时',
        body: '表示习惯、规律和事实。主语是第三人称单数（he / she / it / 单数名词）时，动词加 -s 或 -es。否定用 do not / does not 加动词原形，缩写为 don’t / doesn’t。'
      },
      {
        title: '频率副词的位置',
        body: 'always、usually、often、sometimes、never 表示频率。它们放在实义动词之前，放在 be 动词之后：I usually walk. / She is never late.'
      }
    ],
    questions: [
      choice('sample-1-g1', 'She ___ to work by bike.', ['go', 'goes', 'going', 'is go'], 1,
        '主语 she 是第三人称单数，一般现在时动词加 -es，用 goes。', ['sample-k1']),
      choice('sample-1-g2', 'He doesn’t ___ coffee.', ['likes', 'like', 'liking', 'liked'], 1,
        'doesn’t 后面必须用动词原形，所以是 like。', ['sample-k1']),
      choice('sample-1-g3', 'I ___ check my phone before breakfast.', ['always', 'am always', 'always am', 'check always'], 0,
        '频率副词放在实义动词 check 之前，用 always。', ['sample-k2']),
      choice('sample-1-g4', 'They ___ go to the gym on Sundays.', ['don’t', 'doesn’t', 'not', 'aren’t'], 0,
        '主语 they 是复数，否定用 don’t 加动词原形。', ['sample-k1'])
    ]
  }),
  moduleOf('sample-1', 'reading', 3, {
    passage: 'On weekdays, Lena wakes up at half past six. She never checks her phone before breakfast: first coffee, then a short walk. Her commute takes twenty minutes by bike. At lunch she usually eats with two colleagues, and after work she runs errands near the station. She is often tired by eight, but she unwinds with a podcast before bed. On Fridays she sometimes skips the walk and sleeps an extra half hour.',
    passageTranslation: '工作日里，莉娜六点半起床。她早饭前从不看手机：先喝咖啡，再走一小段路。她骑车通勤要二十分钟。午饭她通常和两位同事一起吃，下班后在车站附近办事。到八点她常常就累了，但睡前会听播客放松。周五她有时会省掉散步，多睡半小时。',
    questions: [
      choice('sample-1-r1', 'What does Lena do before breakfast?', ['Checks her phone', 'Takes a short walk', 'Runs errands', 'Listens to a podcast'], 1,
        '文中说先喝咖啡，再走一小段路，并且早饭前从不看手机。', ['sample-k3']),
      {
        kind: 'translate',
        id: 'sample-1-r2',
        prompt: '把这句话译成中文：Her commute takes twenty minutes by bike.',
        reference: '她骑车通勤要二十分钟。',
        keyPoints: ['commute 通勤', 'take + 时间 表示花费时间', 'by bike 骑车'],
        knowledgeIds: ['sample-k3']
      }
    ]
  }),
  moduleOf('sample-1', 'review', 4, {
    knowledgeIds: ['sample-k1', 'sample-k2', 'sample-k3'],
    questions: [
      choice('sample-1-v1', 'He ___ his email every morning.', ['check', 'checks', 'checking', 'checked'], 1,
        '主语 he 是第三人称单数，一般现在时用 checks。', ['sample-k1']),
      choice('sample-1-v2', 'We ___ watch TV in the morning.', ['don’t', 'doesn’t', 'aren’t', 'not'], 0,
        '主语 we 是复数，否定用 don’t 加动词原形。', ['sample-k1'])
    ]
  })
];

const course2 = course(
  'sample-2',
  2,
  'A Week That Ran Away',
  '过去时与忙碌的一周',
  '用一般过去时叙述过去一周发生的事，并正确使用 ago、last、after',
  'A2'
);

const course2Knowledge: KnowledgePoint[] = [
  knowledge('sample-k4', '一般过去时：规则动词', 'grammar', 2),
  knowledge('sample-k5', '过去时否定与疑问', 'grammar', 2),
  knowledge('sample-k6', '时间表达：ago、last、after', 'grammar', 2)
];

const course2Modules: CourseModule[] = [
  moduleOf('sample-2', 'word', 1, {
    words: [
      {
        id: 'sample-2-w1',
        term: 'deadline',
        phonetic: '/ˈdedlaɪn/',
        meanings: ['n. 截止期限'],
        example: 'The deadline was Friday, so we worked late.',
        exampleTranslation: '截止日期是周五，所以我们工作到很晚。'
      },
      {
        id: 'sample-2-w2',
        term: 'exhausted',
        phonetic: '/ɪɡˈzɔːstɪd/',
        meanings: ['adj. 筋疲力尽的'],
        example: 'I was exhausted after the trip.',
        exampleTranslation: '旅行结束后我筋疲力尽。'
      },
      {
        id: 'sample-2-w3',
        term: 'postpone',
        phonetic: '/poʊstˈpoʊn/',
        meanings: ['v. 推迟，延期'],
        example: 'We postponed the meeting until Monday.',
        exampleTranslation: '我们把会议推迟到周一。'
      },
      {
        id: 'sample-2-w4',
        term: 'catch up',
        phonetic: '/ˌkætʃ ˈʌp/',
        meanings: ['phr. 赶上，补上（落下的进度或睡眠）'],
        example: 'I stayed in on Saturday to catch up on sleep.',
        exampleTranslation: '周六我待在家里补觉。'
      },
      {
        id: 'sample-2-w5',
        term: 'spare',
        phonetic: '/sper/',
        meanings: ['adj. 空闲的', 'adj. 备用的'],
        example: 'I had no spare time last week.',
        exampleTranslation: '上周我没有空闲时间。'
      }
    ]
  }),
  moduleOf('sample-2', 'grammar', 2, {
    sections: [
      {
        title: '一般过去时',
        body: '叙述已经结束的过去动作。规则动词加 -ed（postpone → postponed）；不规则动词要单独记（write → wrote）。否定用 didn’t 加动词原形，疑问用 Did + 主语 + 动词原形。'
      },
      {
        title: '时间表达',
        body: 'ago 放在时间段之后：two years ago。last 直接修饰时间段：last week。after 是介词，后接名词：after the trip。'
      }
    ],
    questions: [
      choice('sample-2-g1', 'We ___ the meeting until Monday.', ['postpone', 'postponed', 'postponing', 'have postpone'], 1,
        '叙述过去发生的事，规则动词加 -ed，用 postponed。', ['sample-k4']),
      choice('sample-2-g2', 'I ___ go to the gym last week.', ['didn’t', 'don’t', 'wasn’t', 'not'], 0,
        '过去时的否定用 didn’t 加动词原形。', ['sample-k5']),
      choice('sample-2-g3', 'She ___ a lot of emails yesterday.', ['write', 'wrote', 'written', 'writing'], 1,
        'write 是不规则动词，过去式是 wrote。', ['sample-k4']),
      choice('sample-2-g4', '___ you finish the report yesterday?', ['Did', 'Do', 'Were', 'Have'], 0,
        '过去时的一般疑问句用 Did + 主语 + 动词原形。', ['sample-k5'])
    ]
  }),
  moduleOf('sample-2', 'reading', 3, {
    passage: 'Last week was brutal. On Monday the team got a new deadline: Friday. Tom postponed his dentist appointment and stayed late three nights. By Thursday he was exhausted, so he went to bed at nine. On Friday they sent the report at six in the evening and ordered pizza. Tom had no spare time on Saturday, but he still caught up on sleep on Sunday. “Next week,” he said, “I’ll start earlier.”',
    passageTranslation: '上周真是难熬。周一团队收到新的截止期限：周五。汤姆推迟了看牙的预约，连着三个晚上加班到很晚。到周四他已经筋疲力尽，所以九点就睡了。周五他们晚上六点发出报告，还点了披萨。汤姆周六依然没有空闲时间，不过周日还是补上了觉。他说：“下周我要早点开始。”',
    questions: [
      choice('sample-2-r1', 'Why did Tom postpone his dentist appointment?', ['He was ill.', 'He had a new deadline.', 'He was on a trip.', 'He forgot about it.'], 1,
        '文中说拿到新的周五截止期限后，他推迟了看牙预约。', ['sample-k4']),
      {
        kind: 'translate',
        id: 'sample-2-r2',
        prompt: '把这句话译成中文：By Thursday he was exhausted, so he went to bed at nine.',
        reference: '到周四他已经筋疲力尽，所以九点就上床睡了。',
        keyPoints: ['By Thursday 到周四为止', 'exhausted 筋疲力尽', 'go to bed 上床睡觉'],
        knowledgeIds: ['sample-k6']
      }
    ]
  }),
  moduleOf('sample-2', 'review', 4, {
    knowledgeIds: ['sample-k4', 'sample-k5', 'sample-k6'],
    questions: [
      choice('sample-2-v1', '___ they send the report on Friday?', ['Did', 'Do', 'Were', 'Have'], 0,
        '过去时疑问句用 Did + 主语 + 动词原形。', ['sample-k5']),
      choice('sample-2-v2', 'They moved here two years ___.', ['ago', 'before', 'since', 'last'], 0,
        '表示“多久以前”用 ago，放在时间段之后。', ['sample-k6'])
    ]
  })
];

export const sampleCourseBundles: SampleCourseBundle[] = [
  { course: course1, modules: course1Modules, knowledge: course1Knowledge },
  { course: course2, modules: course2Modules, knowledge: course2Knowledge }
];
