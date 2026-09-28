let eduCount = 0, workCount = 0, projCount = 0, skillCount = 0;
let photoDataURL = null;
let saveTimer = null;

const DRAFT_KEY = 'resume-builder:draft:v5';
const AI_IMPORT_SETTINGS_KEY = 'resume-builder:ai-import-settings:v1';
const pendingEidoRequests = new Map();
function callEido(capability, payload) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    pendingEidoRequests.set(requestId, { resolve, reject });
    window.parent.postMessage({ type: 'eido:project-request', requestId, capability, payload }, '*');
  });
}
function publishProjectContext() {
  const data = collectResumeData();
  window.parent.postMessage({
    type: 'eido:project-context',
    context: {
      kind: 'resume',
      title: data.personal?.name ? `${data.personal.name}的简历` : '简历编辑器',
      content: JSON.stringify(data, null, 2).slice(0, 120000),
      metadata: { format: 'resume-builder-v5' }
    }
  }, '*');
}
window.addEventListener('message', event => {
  if (event.source !== window.parent) return;
  if (event.data?.type === 'eido:project-context-request') { publishProjectContext(); return; }
  if (event.data?.type !== 'eido:project-response') return;
  const task = pendingEidoRequests.get(event.data.requestId);
  if (!task) return;
  pendingEidoRequests.delete(event.data.requestId);
  if (event.data.ok) task.resolve(event.data.result);
  else task.reject(new Error(event.data.error || 'SiinX 项目存储调用失败'));
});
const projectStorage = {
  async get(key) { return (await callEido('project.storage', { action: 'get', key })).value; },
  async set(key, value) { await callEido('project.storage', { action: 'set', key, value }); },
  async remove(key) { await callEido('project.storage', { action: 'remove', key }); }
};
let smartImportSettings = { endpoint: '/api/parse-resume', apiKey: '', model: '' };
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAMMOTH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

let pendingSmartImportFile = null;

const resumeImportSchema = {
  personal: {
    name: '',
    title: '',
    phone: '',
    email: '',
    website: '',
    expectedCity: '',
    expectedSalary: '',
    availability: '',
    jobStatus: '',
    projectShowcase: '',
    summary: ''
  },
  education: [{ school: '', date: '', major: '', degree: '', desc: '' }],
  work: [{ company: '', date: '', title: '', desc: '' }],
  projects: [{ name: '', company: '', date: '', role: '', desc: '' }],
  skills: ['']
};

const sampleResume = {
  personal: {
    name: '林亦辰',
    title: '高级前端工程师 / React 技术负责人',
    phone: '138-0000-0000',
    email: 'lin.yichen@example.com',
    website: 'https://github.com/linyichen',
    expectedCity: '上海 / 杭州',
    expectedSalary: '35k-50k',
    availability: '一个月内',
    jobStatus: '在职看机会',
    projectShowcase: 'https://github.com/linyichen/llm-projects',
    summary: '6 年前端开发经验，长期负责复杂业务系统、数据产品和组件体系建设。\n擅长 React、TypeScript、工程化、性能优化与跨团队协作，能够从需求拆解、技术方案、交互落地到上线监控完整推进项目。\n曾主导低代码报表平台、企业级数据看板和设计系统建设，重视可维护性、用户体验和业务交付效率。'
  },
  education: [
    {
      school: '华东理工大学',
      date: '2015.09 - 2019.06',
      major: '软件工程',
      degree: '本科',
      desc: 'GPA 3.7/4.0，主修数据结构、操作系统、计算机网络、数据库系统与 Web 工程；毕业设计获得校级优秀毕业设计。'
    }
  ],
  work: [
    {
      company: '星河科技有限公司',
      date: '2022.07 - 至今',
      title: '高级前端工程师 / 前端小组负责人',
      desc: '负责企业级数据分析平台前端架构设计，带领 4 人小组完成指标看板、权限中心、报表配置和告警订阅等核心模块。\n沉淀表格、筛选器、图表容器、权限指令等通用能力，推动业务页面交付周期缩短约 35%。\n通过代码分割、数据缓存、虚拟滚动和渲染链路优化，将核心页面首屏耗时从 3.8s 降至 1.9s。'
    },
    {
      company: '知微网络科技',
      date: '2019.07 - 2022.06',
      title: '前端工程师',
      desc: '参与 CRM 系统、营销活动平台和移动端 H5 页面开发，负责客户线索、销售跟进、活动配置等业务模块。\n维护内部组件库与埋点方案，完善发布流程和异常监控，减少重复开发并提升线上问题定位效率。'
    }
  ],
  projects: [
    {
      name: '低代码报表搭建平台',
      company: '星河科技有限公司',
      date: '2023.03 - 2024.01',
      role: '前端负责人',
      desc: '设计拖拽编排、字段映射和图表配置流程，支持业务团队自助搭建报表。\n抽象配置 Schema 与渲染层协议，让新增图表类型的开发周期缩短约 50%。'
    },
    {
      name: '企业级设计系统与组件库',
      company: '星河科技有限公司',
      date: '2022.09 - 2023.05',
      role: '核心开发者',
      desc: '基于 React、TypeScript 和 Storybook 建设统一组件库，覆盖表单、弹窗、表格、导航、反馈等 40+ 个常用组件。\n制定组件 API 规范、主题变量和文档示例，支撑多个业务线统一视觉和交互体验。'
    },
    {
      name: '销售数据实时看板',
      company: '知微网络科技',
      date: '2021.04 - 2021.12',
      role: '前端开发',
      desc: '实现多维筛选、趋势分析、区域排行和大屏展示能力，接入 ECharts 与 WebSocket 实时数据流。\n优化大数据量图表渲染和筛选响应速度，帮助运营团队更快定位销售转化问题。'
    }
  ],
  skills: ['React', 'TypeScript', 'Vite', 'Node.js', 'ECharts', 'Tailwind CSS', '前端工程化', '性能优化', '组件库设计', '低代码平台', '用户体验', '团队协作'],
  template: '雾青双栏'
};

function handlePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    photoDataURL = e.target.result;
    handleInput();
  };
  reader.readAsDataURL(file);
}

function handleInput() {
  updatePreview();
  scheduleSave();
}

function activateTemplate(name) {
  Templates.activate(name);
  scheduleSave();
}

function addEducation(data = {}) {
  eduCount++;
  addRepeatable('educationList', buildEducationHtml(eduCount, data));
}

function addWork(data = {}) {
  workCount++;
  const workId = `work_${workCount}`;
  document.getElementById('workList').insertAdjacentHTML('beforeend', buildWorkHtml(workCount, data));
  (data.projects || []).forEach(project => addWorkProject(workId, project, false));
  updateRepeatLabels('workList');
  handleInput();
}

function addWorkProject(workId, data = {}, shouldUpdate = true) {
  projCount++;
  const list = document.querySelector(`#${workId} .work-project-list`);
  if (!list) return;
  list.insertAdjacentHTML('beforeend', buildProjectHtml(projCount, data));
  updateRepeatLabels(list.id);
  if (shouldUpdate) handleInput();
}

function addProject(data = {}) {
  let workItem = document.querySelector('#workList > .repeatable:last-child');
  if (!workItem) {
    addWork();
    workItem = document.querySelector('#workList > .repeatable:last-child');
  }
  if (workItem) addWorkProject(workItem.id, data);
}

function addSkill(value = '') {
  skillCount++;
  addRepeatable('skillList', buildSkillHtml(skillCount, value));
}

function addRepeatable(listId, html) {
  document.getElementById(listId).insertAdjacentHTML('beforeend', html);
  updateRepeatLabels(listId);
  handleInput();
}

function buildEducationHtml(id, data) {
  return `
    <div class="repeatable" id="edu_${id}" data-title="教育经历">
      ${repeatHeader('教育经历', `edu_${id}`)}
      <div class="repeat-body form-grid">
        ${field('学校', 'edu-school', data.school, '北京大学')}
        ${field('时间', 'edu-date', data.date, '2018.09 - 2022.06')}
        ${field('专业', 'edu-major', data.major, '计算机科学与技术')}
        ${field('学位', 'edu-degree', data.degree, '本科')}
        ${textareaField('描述', 'edu-desc', data.desc, '主修课程、获奖情况等...', 2)}
      </div>
    </div>`;
}

function buildWorkHtml(id, data) {
  const workId = `work_${id}`;
  return `
    <div class="repeatable" id="${workId}" data-title="工作经历">
      ${repeatHeader('工作经历', workId)}
      <div class="repeat-body form-grid">
        ${field('公司', 'work-company', data.company, '某某科技有限公司')}
        ${field('时间', 'work-date', data.date, '2022.07 - 至今')}
        ${field('职位', 'work-title', data.title, '前端开发工程师')}
        ${textareaField('工作描述', 'work-desc', data.desc, '负责的工作内容、业绩等...', 3)}
        <div class="nested-projects full-width">
          <div class="nested-title">当前公司项目</div>
          <div class="work-project-list" id="${workId}_projects"></div>
          <button type="button" class="add-btn nested-add-btn" onclick="addWorkProject('${workId}')">+ 添加项目经历</button>
        </div>
      </div>
    </div>`;
}

function buildProjectHtml(id, data) {
  return `
    <div class="repeatable" id="proj_${id}" data-title="项目经历">
      ${repeatHeader('项目经历', `proj_${id}`)}
      <div class="repeat-body form-grid">
        ${field('项目名称', 'proj-name', data.name, '在线简历制作工具')}
        ${field('时间', 'proj-date', data.date, '2024.01 - 2024.03')}
        ${field('你的角色', 'proj-role', data.role, '独立开发')}
        ${textareaField('项目描述', 'proj-desc', data.desc, '项目简介、技术栈、你的贡献等...', 3)}
      </div>
    </div>`;
}

function buildSkillHtml(id, value) {
  return `
    <div class="repeatable compact" id="skill_${id}" data-title="技能">
      ${repeatHeader('技能', `skill_${id}`)}
      <div class="repeat-body form-group">
        <label>技能名称</label>
        <input type="text" class="skill-name" value="${escapeAttr(value)}" oninput="handleInput()" placeholder="JavaScript">
      </div>
    </div>`;
}

function repeatHeader(title, id) {
  return `
    <div class="repeat-header">
      <button type="button" class="collapse-btn" onclick="toggleItem('${id}')" aria-label="折叠或展开">⌄</button>
      <span>${title}</span>
      <div class="item-actions">
        <button type="button" class="icon-btn" onclick="moveItem('${id}', -1)" title="上移">↑</button>
        <button type="button" class="icon-btn" onclick="moveItem('${id}', 1)" title="下移">↓</button>
        <button type="button" class="remove-btn" onclick="removeItem('${id}')" title="删除">&times;</button>
      </div>
    </div>`;
}

function field(label, className, value = '', placeholder = '') {
  return `
    <div class="form-group">
      <label>${label}</label>
      <input type="text" class="${className}" value="${escapeAttr(value)}" oninput="handleInput()" placeholder="${escapeAttr(placeholder)}">
    </div>`;
}

function textareaField(label, className, value = '', placeholder = '', rows = 3) {
  return `
    <div class="form-group full-width">
      <label>${label}</label>
      <textarea class="${className}" rows="${rows}" oninput="handleInput()" placeholder="${escapeAttr(placeholder)}">${escapeHtml(value || '')}</textarea>
    </div>`;
}

function removeItem(id) {
  const item = document.getElementById(id);
  if (!item) return;
  const list = item.parentElement;
  item.remove();
  updateRepeatLabels(list.id);
  handleInput();
}

function moveItem(id, direction) {
  const item = document.getElementById(id);
  if (!item) return;
  if (direction < 0 && item.previousElementSibling) {
    item.parentElement.insertBefore(item, item.previousElementSibling);
  }
  if (direction > 0 && item.nextElementSibling) {
    item.parentElement.insertBefore(item.nextElementSibling, item);
  }
  updateRepeatLabels(item.parentElement.id);
  handleInput();
}

function toggleItem(id) {
  const item = document.getElementById(id);
  if (!item) return;
  item.classList.toggle('collapsed');
}

function updateRepeatLabels(listId) {
  document.querySelectorAll(`#${listId} > .repeatable`).forEach((item, index) => {
    const title = item.dataset.title || '项目';
    const label = item.querySelector('.repeat-header span');
    if (label) label.textContent = `${title} #${index + 1}`;
  });
}

function collectResumeData() {
  return {
    personal: {
      name: getValue('name'),
      title: getValue('title'),
      phone: getValue('phone'),
      email: getValue('email'),
      website: getValue('website'),
      expectedCity: getValue('expectedCity'),
      expectedSalary: getValue('expectedSalary'),
      availability: getValue('availability'),
      jobStatus: getValue('jobStatus'),
      projectShowcase: getValue('projectShowcase'),
      summary: getValue('summary'),
      photo: photoDataURL
    },
    education: collectItems('#educationList > .repeatable', item => ({
      school: valueOf(item, '.edu-school'),
      date: valueOf(item, '.edu-date'),
      major: valueOf(item, '.edu-major'),
      degree: valueOf(item, '.edu-degree'),
      desc: valueOf(item, '.edu-desc')
    })),
    work: collectItems('#workList > .repeatable', item => ({
      company: valueOf(item, '.work-company'),
      date: valueOf(item, '.work-date'),
      title: valueOf(item, '.work-title'),
      desc: valueOf(item, '.work-desc')
    })),
    projects: collectWorkProjects(),
    skills: collectItems('#skillList .repeatable', item => valueOf(item, '.skill-name')).filter(Boolean),
    template: Templates.getActive()
  };
}

function collectItems(selector, mapper) {
  return Array.from(document.querySelectorAll(selector)).map(mapper);
}

function collectWorkProjects() {
  return collectItems('#workList > .repeatable', workItem => {
    const company = valueOf(workItem, '.work-company');
    return collectItems(`#${workItem.id}_projects > .repeatable`, project => projectDataFromItem(project, company));
  }).flat();
}

function projectDataFromItem(item, company = '') {
  return {
    name: valueOf(item, '.proj-name'),
    company,
    date: valueOf(item, '.proj-date'),
    role: valueOf(item, '.proj-role'),
    desc: valueOf(item, '.proj-desc')
  };
}

function attachProjectsToWork(workItems, projects) {
  const normalizedWork = workItems.map(work => ({ ...work, projects: [...(work.projects || [])] }));
  const usedProjects = new Set();

  projects.forEach((project, index) => {
    const projectCompany = normalizeCompanyName(project.company);
    const matchedWork = normalizedWork.find(work => {
      return projectCompany && normalizeCompanyName(work.company) === projectCompany;
    });
    if (!matchedWork) return;
    matchedWork.projects.push(project);
    usedProjects.add(index);
  });

  const unmatchedProjects = projects.filter((_, index) => !usedProjects.has(index));
  unmatchedProjects.forEach(project => {
    const projectCompany = project.company || '';
    const existingWork = normalizedWork.find(work => normalizeCompanyName(work.company) === normalizeCompanyName(projectCompany));
    if (existingWork) {
      existingWork.projects.push(project);
      return;
    }
    normalizedWork.push({
      company: projectCompany,
      date: '',
      title: '',
      desc: '',
      projects: [project]
    });
  });

  return normalizedWork;
}

function normalizeCompanyName(value = '') {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function loadResumeData(data) {
  const personal = data.personal || {};
  setValue('name', personal.name);
  setValue('title', personal.title);
  setValue('phone', personal.phone);
  setValue('email', personal.email);
  setValue('website', personal.website);
  setValue('expectedCity', personal.expectedCity);
  setValue('expectedSalary', personal.expectedSalary);
  setValue('availability', personal.availability);
  setValue('jobStatus', personal.jobStatus);
  setValue('projectShowcase', personal.projectShowcase);
  setValue('summary', personal.summary);
  photoDataURL = personal.photo || null;

  clearLists();
  (data.education || []).forEach(item => addEducation(item));
  attachProjectsToWork(data.work || [], data.projects || []).forEach(item => addWork(item));
  (data.skills || []).forEach(item => addSkill(item));
  ensureStarterRows();

  const template = data.template || '默认模板';
  document.getElementById('tplSelect').value = template;
  Templates.activate(template);
  scheduleSave();
}

function clearLists() {
  document.getElementById('educationList').innerHTML = '';
  document.getElementById('workList').innerHTML = '';
  document.getElementById('skillList').innerHTML = '';
}

function ensureStarterRows() {
  if (!document.querySelector('#educationList > .repeatable')) addEducation();
  if (!document.querySelector('#workList > .repeatable')) addWork();
  if (!document.querySelector('#skillList .repeatable')) addSkill();
}

function loadSampleData() {
  if (hasMeaningfulData() && !confirm('载入示例会替换当前内容，确定继续吗？')) return;
  loadResumeData(sampleResume);
  setStatus('已载入示例');
}

async function clearResume() {
  if (!confirm('确定清空当前简历内容吗？')) return;
  await projectStorage.remove(DRAFT_KEY);
  photoDataURL = null;
  loadResumeData({ personal: {}, education: [], work: [], projects: [], skills: [], template: '默认模板' });
  setStatus('已清空');
}

function hasMeaningfulData() {
  const data = collectResumeData();
  const personalFilled = Object.values(data.personal).some(Boolean);
  return personalFilled || data.education.concat(data.work, data.projects, data.skills).some(item => {
    if (typeof item === 'string') return item;
    return Object.values(item).some(Boolean);
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setStatus('正在保存...');
  saveTimer = setTimeout(saveDraft, 350);
}

async function saveDraft() {
  try {
    await projectStorage.set(DRAFT_KEY, JSON.stringify(collectResumeData()));
    publishProjectContext();
    setStatus('已自动保存');
  } catch (error) {
    console.warn('Failed to save resume draft:', error);
    setStatus('保存失败');
  }
}

async function restoreDraft() {
  const raw = await projectStorage.get(DRAFT_KEY);
  if (!raw) return false;
  try {
    loadResumeData(JSON.parse(raw));
    setStatus('已恢复上次草稿');
    return true;
  } catch (error) {
    console.warn('Failed to restore resume draft:', error);
    await projectStorage.remove(DRAFT_KEY);
    return false;
  }
}

function setStatus(text) {
  const el = document.getElementById('saveStatus');
  if (el) el.textContent = text;
}

function toggleMobilePreview() {
  document.getElementById('mainLayout').classList.toggle('show-preview');
}

function getValue(id) {
  return document.getElementById(id).value.trim();
}

function setValue(id, value = '') {
  document.getElementById(id).value = value || '';
}

function valueOf(root, selector) {
  const el = root.querySelector(selector);
  return el ? el.value.trim() : '';
}

function getPersonalInfoItems() {
  return [
    { id: 'phone', label: '电话', value: getOptionalValue('phone'), primary: true },
    { id: 'email', label: '邮箱', value: getOptionalValue('email'), primary: true },
    { id: 'website', label: '个人网站', value: getOptionalValue('website'), primary: true },
    { id: 'expectedCity', label: '期望城市', value: getOptionalValue('expectedCity') },
    { id: 'expectedSalary', label: '预期薪资', value: getOptionalValue('expectedSalary') },
    { id: 'availability', label: '到岗时间', value: getOptionalValue('availability') },
    { id: 'jobStatus', label: '求职状态', value: getOptionalValue('jobStatus') },
    { id: 'projectShowcase', label: '项目展示', value: getOptionalValue('projectShowcase') }
  ].filter(item => item.value);
}

function formatPersonalInfoItem(item, labelPrimary = false) {
  if (item.primary && !labelPrimary) return item.value;
  return `${item.label}: ${item.value}`;
}

function renderPersonalInfoText(separator = ' | ', labelPrimary = false) {
  return getPersonalInfoItems()
    .map(item => escapeHtml(formatPersonalInfoItem(item, labelPrimary)))
    .join(separator);
}

function readPersonalExtras() {
  return {
    expectedCity: getOptionalValue('expectedCity'),
    expectedSalary: getOptionalValue('expectedSalary'),
    availability: getOptionalValue('availability'),
    jobStatus: getOptionalValue('jobStatus'),
    projectShowcase: getOptionalValue('projectShowcase')
  };
}

function updatePreview() {
  const name = getValue('name');
  const title = getValue('title');
  const summary = getValue('summary');

  document.getElementById('prevName').textContent = name || '你的姓名';

  const photoEl = document.getElementById('prevPhoto');
  if (photoDataURL) {
    photoEl.src = photoDataURL;
    photoEl.style.display = 'block';
  } else {
    photoEl.style.display = 'none';
  }

  document.getElementById('prevTitle').textContent = title;
  document.getElementById('prevTitle').style.display = title ? 'block' : 'none';

  const contacts = renderPersonalInfoText(' &nbsp;|&nbsp; ');
  const contactEl = document.getElementById('prevContact');
  if (contacts) {
    contactEl.innerHTML = contacts;
    contactEl.style.display = 'block';
  } else {
    contactEl.style.display = 'none';
  }

  const summaryEl = document.getElementById('prevSummary');
  summaryEl.innerHTML = summary
    ? `<div class="resume-section-title">个人简介</div><div class="resume-item-desc">${escapeHtml(summary)}</div>`
    : '';

  const eduItems = document.querySelectorAll('#educationList > .repeatable');
  document.getElementById('prevEducation').innerHTML = buildItemsHtml(eduItems, '教育经历', item => {
    const school = valueOf(item, '.edu-school');
    const major = valueOf(item, '.edu-major');
    const degree = valueOf(item, '.edu-degree');
    const date = valueOf(item, '.edu-date');
    const desc = valueOf(item, '.edu-desc');
    if (!school && !major && !degree) return '';
    const subtitle = [major, degree].filter(Boolean).join(' · ');
    return `
      <div class="resume-item">
        <div class="resume-item-header"><span class="resume-item-title">${escapeHtml(school)}</span><span class="resume-item-date">${escapeHtml(date)}</span></div>
        ${subtitle ? `<div class="resume-item-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        ${desc ? `<div class="resume-item-desc">${escapeHtml(desc)}</div>` : ''}
      </div>`;
  });

  const workItems = document.querySelectorAll('#workList > .repeatable');
  document.getElementById('prevWork').innerHTML = buildItemsHtml(workItems, '工作经历', item => {
    const company = valueOf(item, '.work-company');
    const wTitle = valueOf(item, '.work-title');
    const date = valueOf(item, '.work-date');
    const desc = valueOf(item, '.work-desc');
    if (!company && !wTitle && !desc) return '';
    return `
      <div class="resume-item">
        <div class="resume-item-header"><span class="resume-item-title">${escapeHtml(company)}</span><span class="resume-item-date">${escapeHtml(date)}</span></div>
        ${wTitle ? `<div class="resume-item-subtitle">${escapeHtml(wTitle)}</div>` : ''}
        ${desc ? `<div class="resume-item-desc">${escapeHtml(desc)}</div>` : ''}
      </div>`;
  });

  const projItems = collectWorkProjects();
  document.getElementById('prevProject').innerHTML = buildDataItemsHtml(projItems, '项目经历', item => {
    const name = item.name;
    const role = item.role;
    const date = item.date;
    const desc = item.desc;
    if (!name) return '';
    return `
      <div class="resume-item">
        <div class="resume-item-header"><span class="resume-item-title">${escapeHtml(name)}</span><span class="resume-item-date">${escapeHtml(date)}</span></div>
        ${role ? `<div class="resume-item-subtitle">${escapeHtml(role)}</div>` : ''}
        ${desc ? `<div class="resume-item-desc">${escapeHtml(desc)}</div>` : ''}
      </div>`;
  });

  const skills = Array.from(document.querySelectorAll('#skillList .repeatable'))
    .map(item => valueOf(item, '.skill-name'))
    .filter(Boolean)
    .map(skill => `<span class="skill-tag">${escapeHtml(skill)}</span>`);
  document.getElementById('prevSkill').innerHTML = skills.length
    ? `<div class="resume-section-title">技能</div><div class="skill-tags">${skills.join('')}</div>`
    : '';
}

function buildItemsHtml(items, title, renderer) {
  const parts = [];
  items.forEach(item => {
    const html = renderer(item);
    if (html) parts.push(html);
  });
  if (parts.length === 0) return '';
  return `<div class="resume-section-title">${title}</div>${parts.join('')}`;
}

function buildDataItemsHtml(items, title, renderer) {
  const parts = items.map(renderer).filter(Boolean);
  if (parts.length === 0) return '';
  return `<div class="resume-section-title">${title}</div>${parts.join('')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function openSmartImport() {
  const input = document.getElementById('smartImportFile');
  if (!input) return;
  input.value = '';
  input.click();
}

function showSmartImportModal(message) {
  loadSmartImportSettingsIntoForm();
  const modal = document.getElementById('smartImportModal');
  const status = document.getElementById('smartImportStatus');
  if (status && message) status.textContent = message;
  if (modal) modal.hidden = false;
}

function closeSmartImportModal() {
  const modal = document.getElementById('smartImportModal');
  if (modal) modal.hidden = true;
}

function setSmartImportStatus(message) {
  const status = document.getElementById('smartImportStatus');
  if (status) status.textContent = message;
  setStatus(message);
}

function getSmartImportSettings() {
  const defaults = { endpoint: '/api/parse-resume', apiKey: '', model: '' };
  return { ...defaults, ...smartImportSettings };
}

function loadSmartImportSettingsIntoForm() {
  const settings = getSmartImportSettings();
  setOptionalValue('aiEndpoint', settings.endpoint);
  setOptionalValue('aiApiKey', settings.apiKey);
  setOptionalValue('aiModel', settings.model);
}

async function saveSmartImportSettings() {
  const settings = {
    endpoint: getOptionalValue('aiEndpoint') || '/api/parse-resume',
    apiKey: getOptionalValue('aiApiKey'),
    model: getOptionalValue('aiModel')
  };
  smartImportSettings = settings;
  await projectStorage.set(AI_IMPORT_SETTINGS_KEY, settings);
  setSmartImportStatus('AI 导入设置已保存');
}

function getOptionalValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function setOptionalValue(id, value = '') {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

function handleSmartImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  pendingSmartImportFile = file;
  showSmartImportModal(`已选择「${file.name}」，正在提取文本...`);
  runSmartImport(file);
}

function retrySmartImport() {
  saveSmartImportSettings();
  if (!pendingSmartImportFile) {
    openSmartImport();
    return;
  }
  runSmartImport(pendingSmartImportFile);
}

async function runSmartImport(file) {
  try {
    setSmartImportStatus(`正在读取「${file.name}」...`);
    const text = await extractTextFromFile(file);
    if (!text || text.trim().length < 20) {
      throw new Error('没有从文件中读取到足够的文本内容，请换一个文件或转换为 PDF/DOCX/TXT 后重试。');
    }

    setSmartImportStatus('正在调用 AI 解析简历内容...');
    const parsed = await parseResumeWithAI(text, file.name);
    const normalized = normalizeImportedResume(parsed);
    const hasImportedData = hasMeaningfulImportedData(normalized);
    if (!hasImportedData) {
      throw new Error('AI 没有返回可用的简历字段，请检查文件内容或模型接口返回。');
    }

    if (hasMeaningfulData() && !confirm('智能导入会替换当前编辑内容，确定继续吗？')) {
      setSmartImportStatus('已取消导入');
      return;
    }

    normalized.template = Templates.getActive();
    loadResumeData(normalized);
    closeSmartImportModal();
    setStatus('智能导入完成');
  } catch (error) {
    console.error('Smart import failed:', error);
    showSmartImportModal(error.message || '智能导入失败，请检查文件或 AI 接口设置。');
  }
}

async function extractTextFromFile(file) {
  const ext = getFileExtension(file.name);
  if (['txt', 'md', 'markdown', 'csv', 'json'].includes(ext) || file.type.startsWith('text/')) {
    return file.text();
  }
  if (ext === 'rtf') {
    return stripRtf(await file.text());
  }
  if (ext === 'pdf' || file.type === 'application/pdf') {
    return extractPdfText(await file.arrayBuffer());
  }
  if (ext === 'docx' || file.type.includes('wordprocessingml')) {
    return extractDocxText(await file.arrayBuffer());
  }
  if (ext === 'doc') {
    const text = await readBinaryAsText(file);
    if (text.replace(/\s/g, '').length > 50) return text;
    throw new Error('旧版 .doc 文件在浏览器中无法稳定解析，请先另存为 .docx、PDF、TXT 或 MD 后导入。');
  }
  throw new Error('暂不支持这个文件类型，请选择 PDF、DOCX、DOC、MD、TXT 或 RTF。');
}

function getFileExtension(name) {
  const parts = (name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function stripRtf(text) {
  return text
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readBinaryAsText(file) {
  const buffer = await file.arrayBuffer();
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/\0/g, ' ');
}

async function extractPdfText(buffer) {
  await loadExternalScript('pdfjsLib', PDFJS_URL);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n\n');
}

async function extractDocxText(buffer) {
  await loadExternalScript('mammoth', MAMMOTH_URL);
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || '';
}

function loadExternalScript(globalName, src) {
  if (window[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('文件解析组件加载失败，请检查网络后重试。'));
    document.head.appendChild(script);
  });
}

async function parseResumeWithAI(text, fileName) {
  const settings = getSmartImportSettings();
  const endpoint = settings.endpoint || '/api/parse-resume';
  const headers = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  const body = endpoint.includes('/chat/completions')
    ? buildChatCompletionBody(text, fileName, settings.model)
    : {
      fileName,
      text: trimForModel(text),
      schema: resumeImportSchema,
      instruction: buildImportInstruction()
    };

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error('无法连接 AI 接口，请确认地址可访问，或在智能导入设置中配置可用的服务端代理。');
  }

  if (!response.ok) {
    throw new Error(`AI 接口请求失败：${response.status} ${response.statusText}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error('AI 接口返回的不是 JSON，请检查服务端解析接口。');
  }
  return parseAIResponsePayload(data);
}

function buildChatCompletionBody(text, fileName, model) {
  if (!model) {
    throw new Error('使用 chat/completions 接口时需要在智能导入设置里填写模型名称。');
  }
  return {
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildImportInstruction() },
      { role: 'user', content: `文件名：${fileName}\n\n简历原文：\n${trimForModel(text)}` }
    ]
  };
}

function buildImportInstruction() {
  return [
    '你是简历信息结构化助手。',
    '请从用户提供的简历文本中抽取信息，只返回严格 JSON，不要 Markdown。',
    'JSON 字段必须匹配这个结构：',
    JSON.stringify(resumeImportSchema),
    '如果某个字段没有找到，填空字符串或空数组。',
    '描述字段可以保留多行，尽量提炼职责、成果、技术栈和量化结果。',
    'skills 返回字符串数组，不要返回对象数组。'
  ].join('\n');
}

function trimForModel(text) {
  return text.replace(/\s+\n/g, '\n').replace(/\n{4,}/g, '\n\n').trim().slice(0, 30000);
}

function parseAIResponsePayload(data) {
  if (data.resume) return data.resume;
  if (data.personal || data.education || data.work || data.projects || data.skills) return data;

  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : data.content || data.text || data.result;

  if (!content) {
    throw new Error('AI 接口没有返回可解析的内容。');
  }

  if (typeof content === 'object') return content;

  try {
    return JSON.parse(stripJsonFence(content));
  } catch (error) {
    throw new Error('AI 返回内容不是有效 JSON，请调整接口提示词或模型配置。');
  }
}

function stripJsonFence(content) {
  return String(content).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function normalizeImportedResume(data) {
  const personal = data.personal || {};
  return {
    personal: {
      name: asText(personal.name),
      title: asText(personal.title || personal.position || personal.jobTitle),
      phone: asText(personal.phone || personal.mobile),
      email: asText(personal.email),
      website: asText(personal.website || personal.github || personal.link),
      expectedCity: asText(personal.expectedCity || personal.desiredCity || personal.city),
      expectedSalary: asText(personal.expectedSalary || personal.salary || personal.expectedCompensation),
      availability: asText(personal.availability || personal.availableTime || personal.noticePeriod),
      jobStatus: asText(personal.jobStatus || personal.status),
      projectShowcase: asText(personal.projectShowcase || personal.portfolio || personal.demo || personal.huggingface),
      summary: asText(personal.summary || personal.profile || personal.objective),
      photo: photoDataURL
    },
    education: asArray(data.education).map(item => ({
      school: asText(item.school || item.name),
      date: asText(item.date || item.time),
      major: asText(item.major),
      degree: asText(item.degree),
      desc: asText(item.desc || item.description)
    })).filter(hasObjectValue),
    work: asArray(data.work || data.experience).map(item => ({
      company: asText(item.company || item.name),
      date: asText(item.date || item.time),
      title: asText(item.title || item.position),
      desc: asText(item.desc || item.description || item.responsibilities)
    })).filter(hasObjectValue),
    projects: asArray(data.projects || data.project).map(item => ({
      name: asText(item.name || item.projectName),
      company: asText(item.company || item.organization || item.employer),
      date: asText(item.date || item.time),
      role: asText(item.role),
      desc: asText(item.desc || item.description)
    })).filter(hasObjectValue),
    skills: asArray(data.skills).map(item => typeof item === 'string' ? item : item.name).map(asText).filter(Boolean)
  };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function asText(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('\n');
  if (typeof value === 'object') return Object.values(value).map(asText).filter(Boolean).join('\n');
  return String(value).trim();
}

function hasObjectValue(item) {
  return Object.values(item).some(Boolean);
}

function hasMeaningfulImportedData(data) {
  return Object.values(data.personal).some(Boolean)
    || data.education.some(hasObjectValue)
    || data.work.some(hasObjectValue)
    || data.projects.some(hasObjectValue)
    || data.skills.some(Boolean);
}

function printResume() {
  window.print();
}

function loadPdfExporter() {
  if (window.html2pdf) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdf-exporter]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.async = true;
    script.dataset.pdfExporter = 'true';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function exportPDF() {
  const el = document.getElementById('resumePreview');
  const name = getValue('name') || '简历';

  setStatus('正在准备 PDF...');
  try {
    await loadPdfExporter();
  } catch (error) {
    setStatus('PDF 组件加载失败');
    alert('PDF 导出组件加载失败，可以先使用“打印”并选择保存为 PDF。');
    return;
  }

  el.classList.add('exporting');

  const opt = {
    margin: 0,
    filename: `${name}_简历.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: null },
    pagebreak: {
      mode: ['css', 'legacy'],
      avoid: ['.resume-section', '.resume-item', '.designer-section', '.designer-item', '.llm-section', '.llm-item', '.section-block']
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  };

  html2pdf().set(opt).from(el).save().finally(() => {
    el.classList.remove('exporting');
    setStatus('已自动保存');
  });
}

(async function initApp() {
  const sel = document.getElementById('tplSelect');
  Templates.getAll().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });

  try {
    const storedSettings = await projectStorage.get(AI_IMPORT_SETTINGS_KEY);
    if (storedSettings && typeof storedSettings === 'object') smartImportSettings = { ...smartImportSettings, ...storedSettings };
  } catch (error) {
    console.warn('Failed to restore AI import settings:', error);
  }
  if (!await restoreDraft() || !hasMeaningfulData()) {
    loadResumeData(sampleResume);
    setStatus('已载入示例简历');
  }
})();
