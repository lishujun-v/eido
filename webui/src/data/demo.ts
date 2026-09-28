export const skills = [
  "AI 产品",
  "摩托车维修",
  "品牌设计",
  "短视频剪辑",
  "创业合伙人",
  "本地服务",
];

export const agents = [
  {
    name: "李骁空",
    slug: "li-xiaokong",
    city: "上海 · 静安区",
    occupation: "复古摩托车维修师",
    status: "在线",
    initials: "李",
    accent: "from-slate-900 to-teal-700",
    skills: ["摩托车维修", "复古改装", "发动机调校"],
    bio: "10 年复古摩托车维修与改装经验，专注日系老车。",
  },
  {
    name: "林一禾",
    slug: "lin-yihe",
    city: "上海 · 徐汇区",
    occupation: "品牌设计师",
    status: "在线",
    initials: "林",
    accent: "from-rose-200 to-sky-200",
    skills: ["品牌设计", "视觉识别", "包装设计"],
    bio: "帮助中小品牌建立清晰、有记忆点的视觉形象。",
  },
  {
    name: "陈默",
    slug: "chen-mo",
    city: "上海 · 浦东新区",
    occupation: "短视频内容导演",
    status: "在线",
    initials: "陈",
    accent: "from-zinc-800 to-blue-700",
    skills: ["短视频剪辑", "调色", "内容策划"],
    bio: "用镜头讲好故事，让内容更有价值和传播力。",
  },
];

export const featuredAgent = {
  ...agents[0],
  languages: ["中文", "简单英文"],
  serviceArea: "上海市区，可线上初步诊断，线下到店检查",
  communicationStyle: "直接、耐心，会先确认故障表现再给建议",
  personality: "偏技术派，喜欢老车，也愿意给新手解释维修逻辑",
  willingToHelp:
    "复古摩托车故障诊断、基础保养、化油器调试、点火系统排查、老车购买前检查。",
  lookingFor:
    "正在维护复古摩托车的车友、需要长期保养建议的车主，以及对老车文化感兴趣的人。",
  notAccepting: "不接违法改装，不承诺未检查车辆前的最终报价。",
  works: [
    "1978 本田 CB400 化油器重整",
    "雅马哈 SR400 点火系统排查",
    "川崎 W650 长途前整备",
  ],
};

export const messages = [
  {
    role: "visitor",
    text: "你好，我有一辆 1978 年的本田 CB400，最近启动困难，你能帮我看看吗？",
    time: "10:23",
  },
  {
    role: "agent",
    text: "当然可以。我擅长化油器和点火系统的故障排查。方便的话，发几张车的照片和现象描述，我先帮你分析可能的原因。",
    time: "10:24",
  },
  {
    role: "visitor",
    text: "好的，稍后发你。请问你周末有时间吗？",
    time: "10:25",
  },
  {
    role: "agent",
    text: "周三和周六上午有空，地点在静安区。你看哪个时间适合你？也可以让主人确认后继续。",
    time: "10:26",
  },
];

export const chatMessages = [
  {
    role: "system",
    text: "你正在与李骁空的数字代理沟通。Agent 会先了解需求，涉及联系方式、报价和线下时间时会转给主人确认。",
    time: "10:22",
  },
  ...messages,
  {
    role: "system",
    text: "已创建主人确认请求。李骁空确认后，对话会继续推进到具体时间和联系方式。",
    time: "10:27",
  },
];

export const handoffSummary = {
  status: "等待主人确认",
  reason: "访问者询问周末到店时间，涉及线下安排。",
  requestedAt: "10:27",
};
