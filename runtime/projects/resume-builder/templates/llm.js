const llmTplCSS = `
.resume-page.tpl-paper,
.resume-page.tpl-kernel,
.resume-page.tpl-lab,
.resume-page.tpl-ats,
.resume-page.tpl-paper *,
.resume-page.tpl-kernel *,
.resume-page.tpl-lab *,
.resume-page.tpl-ats * {
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

.resume-page.tpl-paper,
.resume-page.tpl-kernel,
.resume-page.tpl-lab,
.resume-page.tpl-ats {
  color: #20242b;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
  overflow: visible;
}

.llm-shell {
  min-height: 297mm;
}

.llm-header {
  break-inside: avoid;
}

.llm-name {
  font-size: 30px;
  line-height: 1.1;
  font-weight: 780;
  letter-spacing: 0;
}

.llm-title {
  margin-top: 7px;
  font-size: 14px;
  line-height: 1.45;
}

.llm-contact {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 13px;
  font-size: 11.5px;
  line-height: 1.45;
  word-break: break-word;
}

.llm-section {
  break-inside: avoid;
  margin-bottom: 15px;
}

.llm-section-title {
  font-size: 14px;
  line-height: 1.2;
  font-weight: 760;
  letter-spacing: 0;
  margin-bottom: 9px;
}

.llm-summary,
.llm-desc {
  font-size: 12.3px;
  line-height: 1.72;
  white-space: pre-wrap;
}

.llm-item {
  break-inside: avoid;
  margin-bottom: 10px;
}

.llm-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.llm-item-title {
  font-size: 13.4px;
  line-height: 1.42;
  font-weight: 720;
}

.llm-date {
  flex: 0 0 auto;
  font-size: 11.2px;
  line-height: 1.45;
  white-space: nowrap;
}

.llm-subtitle {
  margin-top: 1px;
  font-size: 12.2px;
  line-height: 1.5;
}

.llm-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.llm-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 11.2px;
  line-height: 1.2;
}

.llm-empty {
  color: rgba(32,36,43,0.42);
  font-size: 12px;
}

/* Research paper style */
.resume-page.tpl-paper {
  padding: 30px 36px;
  background: #fffdfa;
}

.tpl-paper .llm-header {
  padding-bottom: 13px;
  border-bottom: 2px solid #15191f;
  margin-bottom: 16px;
}

.tpl-paper .llm-header-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.tpl-paper .llm-name {
  color: #15191f;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", serif;
}

.tpl-paper .llm-title {
  color: #5b3324;
}

.tpl-paper .llm-contact {
  justify-content: flex-end;
  color: #5f6670;
}

.tpl-paper .llm-section-title {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #15191f;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", serif;
}

.tpl-paper .llm-section-title::after {
  content: "";
  height: 1px;
  flex: 1;
  background: #d8d0c4;
}

.tpl-paper .llm-item {
  padding-left: 12px;
  border-left: 2px solid #b66d42;
}

.tpl-paper .llm-date,
.tpl-paper .llm-subtitle {
  color: #6e7783;
}

.tpl-paper .llm-desc,
.tpl-paper .llm-summary {
  color: #343b44;
}

.tpl-paper .llm-tag {
  background: #f4ece3;
  color: #5b3324;
  border: 1px solid #e4d2c1;
}

/* Model system style */
.resume-page.tpl-kernel {
  padding: 28px 34px;
  background: #f7f9fb;
}

.tpl-kernel .llm-shell {
  border-top: 5px solid #234a63;
}

.tpl-kernel .llm-header {
  padding: 18px 0 14px;
  border-bottom: 1px solid #c9d7df;
  margin-bottom: 16px;
}

.tpl-kernel .llm-name-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tpl-kernel .llm-name-row::before {
  content: "";
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #2f7d6b;
  box-shadow: 18px 0 0 #c0674f, 36px 0 0 #234a63;
  flex: 0 0 auto;
}

.tpl-kernel .llm-name {
  color: #163347;
}

.tpl-kernel .llm-title {
  color: #456371;
}

.tpl-kernel .llm-contact {
  margin-top: 11px;
  color: #5e6d77;
}

.tpl-kernel .llm-section-title {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: #e5eef2;
  color: #163347;
  border-left: 4px solid #2f7d6b;
}

.tpl-kernel .llm-item {
  padding: 9px 0 10px;
  border-bottom: 1px solid #dde6ea;
}

.tpl-kernel .llm-date {
  color: #6d7c87;
}

.tpl-kernel .llm-subtitle {
  color: #2f7d6b;
}

.tpl-kernel .llm-desc,
.tpl-kernel .llm-summary {
  color: #39464f;
}

.tpl-kernel .llm-tag {
  background: #ffffff;
  color: #234a63;
  border: 1px solid #c9d7df;
}

/* Experiment note style */
.resume-page.tpl-lab {
  padding: 30px 34px;
  background: #fbfbf7;
}

.tpl-lab .llm-header {
  padding: 16px 18px 15px;
  margin-bottom: 17px;
  border: 1px solid #d6ddd2;
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(47,125,107,0.1) 0 4px, transparent 4px),
    #ffffff;
}

.tpl-lab .llm-name {
  color: #26332f;
}

.tpl-lab .llm-title {
  color: #74633f;
}

.tpl-lab .llm-contact {
  margin-top: 10px;
  color: #61706a;
}

.tpl-lab .llm-section {
  padding: 0 2px 13px;
  border-bottom: 1px dashed #cbd6ce;
}

.tpl-lab .llm-section-title {
  color: #2f7d6b;
}

.tpl-lab .llm-section-title::before {
  content: ">";
  margin-right: 7px;
  color: #c0674f;
}

.tpl-lab .llm-item-head {
  padding: 5px 8px;
  background: #eef4ef;
  border-radius: 4px;
}

.tpl-lab .llm-date {
  color: #79827c;
}

.tpl-lab .llm-subtitle {
  color: #6a593b;
  padding-left: 8px;
}

.tpl-lab .llm-desc {
  padding: 6px 8px 0;
  color: #3e4a45;
}

.tpl-lab .llm-summary {
  color: #3e4a45;
}

.tpl-lab .llm-header-top {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 18px;
  align-items: center;
}

.tpl-lab .llm-avatar,
.tpl-lab .llm-photo {
  width: 78px;
  height: 78px;
  border-radius: 8px;
  border: 1px solid #d4e3da;
  box-shadow: 0 8px 20px rgba(47,125,107,0.09);
  flex: 0 0 auto;
}

.tpl-lab .llm-photo {
  display: block;
  object-fit: cover;
  background: #eef4ef;
}

.tpl-lab .llm-avatar {
  display: grid;
  place-items: center;
  background: #eef4ef;
  color: #2f7d6b;
  font-size: 24px;
  font-weight: 760;
}

.tpl-lab .llm-tag {
  background: #eef4ef;
  color: #2f5f54;
  border: 1px solid #d4e3da;
}

/* ATS compact style */
.resume-page.tpl-ats {
  padding: 28px 38px;
  background: #ffffff;
}

.tpl-ats .llm-header {
  text-align: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #252a31;
  margin-bottom: 15px;
}

.tpl-ats .llm-name {
  font-size: 28px;
  color: #1f242b;
}

.tpl-ats .llm-title {
  color: #39434f;
}

.tpl-ats .llm-contact {
  margin-top: 8px;
  justify-content: center;
  color: #59636f;
}

.tpl-ats .llm-section {
  margin-bottom: 13px;
}

.tpl-ats .llm-section-title {
  padding-bottom: 4px;
  border-bottom: 1px solid #d9dee4;
  color: #1f242b;
}

.tpl-ats .llm-item {
  margin-bottom: 8px;
}

.tpl-ats .llm-date,
.tpl-ats .llm-subtitle {
  color: #59636f;
}

.tpl-ats .llm-desc,
.tpl-ats .llm-summary {
  color: #303741;
  line-height: 1.65;
}

.tpl-ats .llm-tag {
  background: #f2f4f7;
  color: #303741;
  border: 1px solid #d9dee4;
  border-radius: 3px;
}

/* Ordered application style */
.resume-page.tpl-focus {
  padding: 30px 36px;
  background: #fcfcfb;
}

.tpl-focus .llm-header {
  padding: 18px 20px;
  margin-bottom: 18px;
  border: 1px solid #d9e0e5;
  border-top: 5px solid #2f7d6b;
  border-radius: 8px;
  background: #ffffff;
}

.tpl-focus .llm-header-top {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 18px;
  align-items: center;
}

.tpl-focus .llm-name {
  color: #1f2a33;
}

.tpl-focus .llm-title {
  color: #2f7d6b;
}

.tpl-focus .llm-contact {
  margin-top: 10px;
  color: #52616d;
}

.tpl-focus .llm-photo,
.tpl-focus .llm-avatar {
  width: 86px;
  height: 108px;
  border-radius: 6px;
  border: 1px solid #d9e0e5;
  box-shadow: 0 10px 24px rgba(31,42,51,0.1);
}

.tpl-focus .llm-photo {
  display: block;
  object-fit: cover;
  background: #f2f5f7;
}

.tpl-focus .llm-avatar {
  display: grid;
  place-items: center;
  background: #eef5f2;
  color: #2f7d6b;
  font-size: 28px;
  font-weight: 760;
}

.tpl-focus .llm-section {
  padding: 0 2px 14px;
  margin-bottom: 15px;
  border-bottom: 1px solid #e1e6ea;
}

.tpl-focus .llm-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1f2a33;
}

.tpl-focus .llm-section-title::before {
  content: "";
  width: 8px;
  height: 18px;
  border-radius: 2px;
  background: #2f7d6b;
}

.tpl-focus .llm-item {
  padding-left: 14px;
  border-left: 2px solid #d3e4dd;
}

.tpl-focus .llm-work-part {
  margin-bottom: 8px;
}

.tpl-focus .llm-work-label {
  margin-bottom: 4px;
  color: #2f7d6b;
  font-size: 11px;
  font-weight: 760;
}

.tpl-focus .llm-nested-projects {
  margin-top: 8px;
  padding-left: 2px;
}

.tpl-focus .llm-project-item {
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 6px;
  padding: 0 0 8px;
  margin-bottom: 8px;
}

.tpl-focus .llm-project-item:last-child {
  padding-bottom: 0;
  margin-bottom: 0;
}

.tpl-focus .llm-project-index {
  color: #2f7d6b;
  font-size: 12.5px;
  font-weight: 760;
  line-height: 1.5;
}

.tpl-focus .llm-project-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.tpl-focus .llm-project-name {
  color: #26343d;
  font-size: 12.6px;
  font-weight: 700;
}

.tpl-focus .llm-project-meta {
  margin-top: 1px;
  color: #5c6a72;
  font-size: 11.5px;
}

.tpl-focus .llm-project-desc {
  margin-top: 4px;
  color: #303b44;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.tpl-focus .llm-date {
  color: #667580;
}

.tpl-focus .llm-subtitle {
  color: #4d5a63;
}

.tpl-focus .llm-summary,
.tpl-focus .llm-desc {
  color: #303b44;
}

.tpl-focus .llm-tag {
  background: #eef5f2;
  color: #255f52;
  border: 1px solid #d3e4dd;
}

@media screen and (max-width: 900px) {
  .resume-page.tpl-paper,
  .resume-page.tpl-kernel,
  .resume-page.tpl-lab,
  .resume-page.tpl-focus,
  .resume-page.tpl-ats {
    padding: 24px 20px;
  }

  .tpl-paper .llm-header-top,
  .llm-item-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .tpl-paper .llm-contact {
    justify-content: flex-start;
  }

  .tpl-lab .llm-header-top {
    grid-template-columns: 1fr auto;
    gap: 12px;
  }

  .tpl-lab .llm-avatar,
  .tpl-lab .llm-photo {
    width: 64px;
    height: 64px;
  }

  .tpl-focus .llm-header-top {
    grid-template-columns: 1fr auto;
    gap: 12px;
  }

  .tpl-focus .llm-photo,
  .tpl-focus .llm-avatar {
    width: 68px;
    height: 86px;
  }
}
`;

function readLlmData() {
  const read = id => document.getElementById(id).value.trim();
  const mapItems = (selector, mapper) => Array.from(document.querySelectorAll(selector)).map(mapper);

  return {
    personal: {
      name: read('name'),
      title: read('title'),
      phone: read('phone'),
      email: read('email'),
      website: read('website'),
      summary: read('summary'),
      ...readPersonalExtras(),
      photo: typeof photoDataURL === 'undefined' ? null : photoDataURL,
    },
    education: mapItems('#educationList > .repeatable', item => ({
      school: item.querySelector('.edu-school').value.trim(),
      date: item.querySelector('.edu-date').value.trim(),
      major: item.querySelector('.edu-major').value.trim(),
      degree: item.querySelector('.edu-degree').value.trim(),
      desc: item.querySelector('.edu-desc').value.trim(),
    })).filter(item => item.school || item.major || item.degree || item.desc),
    work: mapItems('#workList > .repeatable', item => ({
      company: item.querySelector('.work-company').value.trim(),
      date: item.querySelector('.work-date').value.trim(),
      title: item.querySelector('.work-title').value.trim(),
      desc: item.querySelector('.work-desc').value.trim(),
    })).filter(item => item.company || item.title || item.desc),
    projects: mapItems('#workList > .repeatable', workItem => {
      const company = workItem.querySelector('.work-company').value.trim();
      return mapItems(`#${workItem.id}_projects > .repeatable`, item => ({
        name: item.querySelector('.proj-name').value.trim(),
        company,
        date: item.querySelector('.proj-date').value.trim(),
        role: item.querySelector('.proj-role').value.trim(),
        desc: item.querySelector('.proj-desc').value.trim(),
      })).filter(item => item.name || item.role || item.desc);
    }).flat(),
    skills: mapItems('#skillList .repeatable', item => item.querySelector('.skill-name').value.trim()).filter(Boolean),
  };
}

function llmContacts(personal) {
  return getPersonalInfoItems()
    .map(item => `<span>${escapeHtml(formatPersonalInfoItem(item))}</span>`)
    .join('');
}

function llmTags(skills) {
  if (!skills.length) return '<div class="llm-empty">添加技能后会显示在这里</div>';
  return skills.map(skill => `<span class="llm-tag">${escapeHtml(skill)}</span>`).join('');
}

function llmItems(items, options) {
  if (!items.length) return '<div class="llm-empty">添加内容后会显示在这里</div>';
  return items.map(item => {
    const title = options.title(item);
    const subtitle = options.subtitle ? options.subtitle(item) : '';
    return `
      <div class="llm-item">
        <div class="llm-item-head">
          <div class="llm-item-title">${escapeHtml(title)}</div>
          ${item.date ? `<div class="llm-date">${escapeHtml(item.date)}</div>` : ''}
        </div>
        ${subtitle ? `<div class="llm-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        ${item.desc ? `<div class="llm-desc">${escapeHtml(item.desc)}</div>` : ''}
      </div>`;
  }).join('');
}

function llmSection(id, title, body) {
  return `
    <section id="${id}" class="llm-section">
      <div class="llm-section-title">${title}</div>
      ${body}
    </section>`;
}

function llmSummaryBody(personal, className) {
  return personal.summary
    ? `<div class="llm-summary">${escapeHtml(personal.summary)}</div>`
    : '<div class="llm-empty">填写个人简介后会显示在这里</div>';
}

function llmAvatar(personal) {
  const initial = (personal.name || '简历').slice(0, 1);
  return personal.photo
    ? `<img class="llm-photo" src="${personal.photo}" alt="照片">`
    : `<div class="llm-avatar">${escapeHtml(initial)}</div>`;
}

function llmHeader(personal, className, title, contactHtml) {
  const photoRight = className === 'tpl-lab' || className === 'tpl-focus';
  const identity = `
    <div>
      <div class="llm-name-row">
        <div id="prevName" class="llm-name">${escapeHtml(personal.name || '你的姓名')}</div>
      </div>
      <div id="prevTitle" class="llm-title">${escapeHtml(title)}</div>
      ${photoRight ? `<div id="prevContact" class="llm-contact">${contactHtml}</div>` : ''}
    </div>`;

  if (photoRight) {
    return `
      <div class="llm-header-top">
        ${identity}
        ${llmAvatar(personal)}
      </div>`;
  }

  return `
    <div class="llm-header-top">
      ${identity}
      <div id="prevContact" class="llm-contact">${contactHtml}</div>
    </div>`;
}

function normalizeCompanyName(value) {
  return (value || '').replace(/\s+/g, '').toLowerCase();
}

function focusProjectItems(projects) {
  if (!projects.length) return '';
  return `
    <div class="llm-nested-projects">
      ${projects.map((project, index) => `
        <div class="llm-project-item">
          <div class="llm-project-index">${index + 1}.</div>
          <div>
            <div class="llm-project-head">
              <div class="llm-project-name">${escapeHtml(project.name || '项目')}</div>
              ${project.date ? `<div class="llm-date">${escapeHtml(project.date)}</div>` : ''}
            </div>
            ${project.role ? `<div class="llm-project-meta">${escapeHtml(project.role)}</div>` : ''}
            ${project.desc ? `<div class="llm-project-desc">${escapeHtml(project.desc)}</div>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

function focusWorkWithProjects(workItems, projects) {
  const usedProjects = new Set();
  const workHtml = workItems.length
    ? workItems.map(work => {
      const workCompany = normalizeCompanyName(work.company);
      const matchedProjects = projects.filter((project, index) => {
        const sameCompany = project.company && workCompany && normalizeCompanyName(project.company) === workCompany;
        if (sameCompany) usedProjects.add(index);
        return sameCompany;
      });

      return `
        <div class="llm-item">
          <div class="llm-work-part">
            <div class="llm-work-label">工作经历</div>
            <div class="llm-item-head">
              <div class="llm-item-title">${escapeHtml(work.company || work.title || '工作经历')}</div>
              ${work.date ? `<div class="llm-date">${escapeHtml(work.date)}</div>` : ''}
            </div>
            ${work.title ? `<div class="llm-subtitle">${escapeHtml(work.title)}</div>` : ''}
          </div>
          ${matchedProjects.length ? `<div class="llm-work-label">项目经历</div>${focusProjectItems(matchedProjects)}` : ''}
        </div>`;
    }).join('')
    : '<div class="llm-empty">添加工作经历后会显示在这里</div>';

  const unmatchedProjects = projects.filter((project, index) => !usedProjects.has(index));
  if (!unmatchedProjects.length) return workHtml;

  return `${workHtml}
    <div class="llm-item">
      <div class="llm-item-title">其他项目经历</div>
      ${focusProjectItems(unmatchedProjects)}
    </div>`;
}

function renderLlmTemplate(className, labels) {
  const data = readLlmData();
  const personal = data.personal;
  const preview = document.getElementById('resumePreview');
  const contactHtml = llmContacts(personal);
  const title = personal.title || '大模型算法工程师';

  preview.className = `resume-page ${className}`;
  preview.innerHTML = `
    <div class="llm-shell">
      <header class="llm-header">
        ${llmHeader(personal, className, title, contactHtml)}
      </header>
      <main class="llm-main">
        ${llmSection('prevSummary', labels.summary, llmSummaryBody(personal, className))}
        ${llmSection('prevWork', labels.work, llmItems(data.work, {
          title: item => item.company,
          subtitle: item => item.title,
        }))}
        ${llmSection('prevProject', labels.projects, llmItems(data.projects, {
          title: item => item.name,
          subtitle: item => item.role,
        }))}
        ${llmSection('prevEducation', labels.education, llmItems(data.education, {
          title: item => item.school,
          subtitle: item => [item.major, item.degree].filter(Boolean).join(' · '),
        }))}
        ${llmSection('prevSkill', labels.skills, `<div class="llm-tags">${llmTags(data.skills)}</div>`)}
      </main>
    </div>`;
}

function renderOrderedApplicationTemplate() {
  const data = readLlmData();
  const personal = data.personal;
  const preview = document.getElementById('resumePreview');
  const contactHtml = llmContacts(personal);
  const title = personal.title || '大模型算法工程师';

  preview.className = 'resume-page tpl-focus';
  preview.innerHTML = `
    <div class="llm-shell">
      <header class="llm-header">
        ${llmHeader(personal, 'tpl-focus', title, contactHtml)}
      </header>
      <main class="llm-main">
        ${llmSection('prevEducation', '教育经历', llmItems(data.education, {
          title: item => item.school,
          subtitle: item => [item.major, item.degree].filter(Boolean).join(' · '),
        }))}
        ${llmSection('prevSkill', '专业技能', `<div class="llm-tags">${llmTags(data.skills)}</div>`)}
        ${llmSection('prevWork', '工作项目', focusWorkWithProjects(data.work, data.projects))}
        ${llmSection('prevSummary', '个人总结', llmSummaryBody(personal, 'tpl-focus'))}
      </main>
    </div>`;
}

Templates.register('论文极简', llmTplCSS, () => renderLlmTemplate('tpl-paper', {
  summary: '研究概述',
  work: '工程经历',
  projects: '模型与算法项目',
  education: '教育背景',
  skills: '技术栈',
}));

Templates.register('模型系统', llmTplCSS, () => renderLlmTemplate('tpl-kernel', {
  summary: 'Profile',
  work: 'Production Experience',
  projects: 'LLM Projects',
  education: 'Education',
  skills: 'Stack',
}));

Templates.register('实验记录', llmTplCSS, () => renderLlmTemplate('tpl-lab', {
  summary: '方向摘要',
  work: '训练与部署经历',
  projects: '实验 / 项目',
  education: '教育经历',
  skills: '能力标签',
}));

Templates.register('ATS 清爽', llmTplCSS, () => renderLlmTemplate('tpl-ats', {
  summary: '个人简介',
  work: '工作经历',
  projects: '项目经历',
  education: '教育经历',
  skills: '技能',
}));

Templates.register('求职递进', llmTplCSS, renderOrderedApplicationTemplate);
