export interface CoursePreset {
  topic: string;
  level: string;
  goal?: string;
}

const PRESETS: Record<number, CoursePreset> = {
  21: {
    topic: '第三周综合测试：复习情态动词、比较级、there be、并列句、when/if',
    level: 'A2-B1',
    goal: '检查第三周语法掌握情况，找出仍需巩固的点'
  },
  22: {
    topic: '动词不定式：want/need/hope/decide/plan/learn/practise/remember/forget/improve + 10个高频词',
    level: 'A2-B1',
    goal: '掌握 want/need/hope/decide/plan 等动词后接 to do 的结构'
  },
  23: {
    topic: '动名词：like/enjoy/finish/keep doing + 常见动词搭配',
    level: 'A2-B1',
    goal: '区分 to do 与 doing，掌握 like/enjoy/finish 等动词的固定搭配'
  },
  24: {
    topic: '现在完成时：have/has + 过去分词与常见时间状语',
    level: 'B1',
    goal: '理解现在完成时的使用场景，能与一般过去时区分'
  },
  25: {
    topic: '被动语态：be + 过去分词与常见时态',
    level: 'B1',
    goal: '掌握一般现在时和一般过去时的被动语态'
  },
  26: {
    topic: '定语从句：who/which/that 的基本用法',
    level: 'B1',
    goal: '能用定语从句修饰人和物，理解先行词与关系词'
  },
  27: {
    topic: '宾语从句：that/if/whether 与疑问词',
    level: 'B1',
    goal: '掌握宾语从句的语序和连接词'
  },
  28: {
    topic: '非谓语动词综合：to do / doing / done',
    level: 'B1',
    goal: '区分不定式、动名词和过去分词的基本作用'
  },
  29: {
    topic: '四级阅读基础：主旨、细节与同义替换',
    level: 'B1',
    goal: '练习四级阅读中的主旨题和细节题'
  },
  30: {
    topic: '四级写作基础：观点、结构与常用连接',
    level: 'B1',
    goal: '写出结构清晰的三段式短文'
  }
};

export function coursePreset(number: number): CoursePreset {
  return PRESETS[number] ?? {
    topic: `第 ${number} 课：综合复习与四级基础`,
    level: 'B1'
  };
}
