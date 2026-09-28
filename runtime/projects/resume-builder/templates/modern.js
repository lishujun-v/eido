const designedTplCSS = `
.resume-page.tpl-sage,
.resume-page.tpl-graphite,
.resume-page.tpl-coral,
.resume-page.tpl-sage *,
.resume-page.tpl-graphite *,
.resume-page.tpl-coral * {
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

.resume-page.tpl-sage,
.resume-page.tpl-graphite,
.resume-page.tpl-coral {
  padding: 0;
  overflow: hidden;
  color: #27313a;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.designer-shell {
  min-height: 297mm;
}

.designer-photo,
.designer-avatar {
  width: 74px;
  height: 74px;
  border-radius: 50%;
  object-fit: cover;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 750;
}

.designer-name {
  font-size: 30px;
  line-height: 1.1;
  font-weight: 760;
  letter-spacing: 0;
}

.designer-role {
  font-size: 13px;
  line-height: 1.5;
  margin-top: 8px;
}

.designer-contact {
  display: grid;
  gap: 7px;
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.designer-section {
  margin-bottom: 17px;
}

.designer-section-title {
  font-size: 14px;
  font-weight: 760;
  letter-spacing: 0;
  margin-bottom: 10px;
}

.designer-summary,
.designer-desc {
  font-size: 12.5px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.designer-item {
  break-inside: avoid;
  margin-bottom: 12px;
}

.designer-item-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.designer-item-title {
  font-size: 13.5px;
  line-height: 1.45;
  font-weight: 720;
}

.designer-date {
  flex: 0 0 auto;
  font-size: 11.5px;
  line-height: 1.45;
  white-space: nowrap;
}

.designer-subtitle {
  font-size: 12.5px;
  line-height: 1.45;
  margin-top: 2px;
}

.designer-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.designer-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  line-height: 1.2;
}

.designer-empty {
  color: rgba(39,49,58,0.45);
}

/* Mist green split layout */
.resume-page.tpl-sage {
  background: #f8fbf7;
}

.tpl-sage .designer-shell {
  display: grid;
  grid-template-columns: 66mm 1fr;
  background: linear-gradient(90deg, #d8eee6 0 66mm, #fffaf4 66mm 100%);
}

.tpl-sage .designer-sidebar {
  padding: 28px 24px;
  background: #d8eee6;
  color: #193a35;
}

.tpl-sage .designer-main {
  padding: 30px 34px 28px;
  background: #fffaf4;
}

.tpl-sage .designer-photo,
.tpl-sage .designer-avatar {
  background: #2f7d6b;
  color: #fffaf4;
  border: 4px solid rgba(255,255,255,0.78);
  box-shadow: 0 10px 26px rgba(25,58,53,0.16);
  margin-bottom: 18px;
}

.tpl-sage .designer-name {
  color: #173d36;
}

.tpl-sage .designer-role {
  color: #32675c;
}

.tpl-sage .designer-sidebar .designer-section {
  padding-top: 18px;
  border-top: 1px solid rgba(25,58,53,0.16);
}

.tpl-sage .designer-main .designer-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1f5f52;
}

.tpl-sage .designer-main .designer-section-title::after {
  content: "";
  height: 1px;
  flex: 1;
  background: #cfe4dc;
}

.tpl-sage .designer-item {
  padding-left: 14px;
  border-left: 3px solid #95cdbb;
}

.tpl-sage .designer-date {
  color: #629284;
}

.tpl-sage .designer-subtitle {
  color: #4d665f;
}

.tpl-sage .designer-desc,
.tpl-sage .designer-summary {
  color: #45554f;
}

.tpl-sage .designer-tag {
  background: #fffaf4;
  color: #1f5f52;
  border: 1px solid rgba(47,125,107,0.18);
}

/* Graphite editorial layout */
.resume-page.tpl-graphite {
  background: #f5f0e8;
}

.tpl-graphite .designer-shell {
  display: grid;
  grid-template-columns: 72mm 1fr;
  background: #f5f0e8;
}

.tpl-graphite .designer-sidebar {
  padding: 28px 24px;
  background: #26313a;
  color: #f8f3ea;
}

.tpl-graphite .designer-main {
  padding: 28px 32px 30px;
  background: #f5f0e8;
}

.tpl-graphite .designer-photo,
.tpl-graphite .designer-avatar {
  background: #d6a35f;
  color: #26313a;
  border: 3px solid rgba(248,243,234,0.72);
  margin-bottom: 18px;
}

.tpl-graphite .designer-role,
.tpl-graphite .designer-contact {
  color: rgba(248,243,234,0.76);
}

.tpl-graphite .designer-sidebar .designer-section-title {
  color: #f2c984;
}

.tpl-graphite .designer-sidebar .designer-section {
  padding-top: 18px;
  border-top: 1px solid rgba(248,243,234,0.16);
}

.tpl-graphite .designer-main .designer-section {
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(67,76,84,0.12);
  border-radius: 10px;
  padding: 15px 16px 14px;
  box-shadow: 0 8px 22px rgba(38,49,58,0.06);
}

.tpl-graphite .designer-main .designer-section-title {
  color: #26313a;
}

.tpl-graphite .designer-main .designer-section-title::before {
  content: "";
  display: inline-block;
  width: 28px;
  height: 4px;
  border-radius: 999px;
  background: #d6a35f;
  margin-right: 8px;
  vertical-align: middle;
}

.tpl-graphite .designer-date {
  color: #9a7440;
}

.tpl-graphite .designer-subtitle,
.tpl-graphite .designer-desc,
.tpl-graphite .designer-summary {
  color: #4e5962;
}

.tpl-graphite .designer-tag {
  background: rgba(242,201,132,0.16);
  color: #f8f3ea;
  border: 1px solid rgba(242,201,132,0.28);
}

/* Coral card layout */
.resume-page.tpl-coral {
  background: #fff7f2;
}

.tpl-coral .designer-shell {
  display: block;
  background: #fff7f2;
}

.tpl-coral .designer-hero {
  min-height: 56mm;
  padding: 30px 34px 24px;
  background: linear-gradient(135deg, #ef7966 0%, #f2b366 52%, #77b7a5 100%);
  color: #fff;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 20px;
}

.tpl-coral .designer-photo,
.tpl-coral .designer-avatar {
  background: rgba(255,255,255,0.22);
  color: #fff;
  border: 3px solid rgba(255,255,255,0.75);
}

.tpl-coral .designer-role,
.tpl-coral .designer-contact {
  color: rgba(255,255,255,0.86);
}

.tpl-coral .designer-contact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 12px;
  margin-top: 13px;
}

.tpl-coral .designer-main {
  padding: 24px 32px 30px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.tpl-coral .designer-section {
  background: #fff;
  border: 1px solid #f0dfd4;
  border-radius: 12px;
  padding: 15px 16px 14px;
  box-shadow: 0 8px 20px rgba(88,61,41,0.06);
}

.tpl-coral .designer-section.wide {
  grid-column: 1 / -1;
}

.tpl-coral .designer-section-title {
  color: #9f4d42;
}

.tpl-coral .designer-item-title {
  color: #33413d;
}

.tpl-coral .designer-date {
  color: #b96d59;
}

.tpl-coral .designer-subtitle,
.tpl-coral .designer-desc,
.tpl-coral .designer-summary {
  color: #58635f;
}

.tpl-coral .designer-tag {
  background: #f2fbf8;
  color: #357d70;
  border: 1px solid #cdebe3;
}

@media screen and (max-width: 900px) {
  .tpl-sage .designer-shell,
  .tpl-graphite .designer-shell {
    grid-template-columns: 1fr;
  }

  .tpl-sage .designer-main,
  .tpl-graphite .designer-main,
  .tpl-coral .designer-main {
    padding: 22px;
  }

  .tpl-coral .designer-hero {
    grid-template-columns: 1fr;
  }

  .tpl-coral .designer-contact,
  .tpl-coral .designer-main {
    grid-template-columns: 1fr;
  }

  .designer-item-head {
    display: block;
  }

  .designer-date {
    display: block;
    margin-top: 2px;
  }
}
`;

function readDesignedData() {
  const read = (id) => document.getElementById(id).value.trim();
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
    projects: collectWorkProjects().filter(item => item.name || item.role || item.desc),
    skills: mapItems('#skillList .repeatable', item => item.querySelector('.skill-name').value.trim()).filter(Boolean),
  };
}

function designerAvatar(personal) {
  if (personal.photo) {
    return `<img id="prevPhoto" class="designer-photo" src="${personal.photo}" alt="照片">`;
  }
  const initial = (personal.name || '简历').slice(0, 1);
  return `<div id="prevPhoto" class="designer-avatar">${escapeHtml(initial)}</div>`;
}

function designerContacts(personal) {
  return getPersonalInfoItems()
    .map(item => `<div>${escapeHtml(formatPersonalInfoItem(item))}</div>`)
    .join('');
}

function designerTags(skills) {
  if (!skills.length) return '<div class="designer-empty">添加技能后会显示在这里</div>';
  return skills.map(skill => `<span class="designer-tag">${escapeHtml(skill)}</span>`).join('');
}

function designerItems(items, options) {
  if (!items.length) return '<div class="designer-empty">添加内容后会显示在这里</div>';
  return items.map(item => {
    const title = options.title(item);
    const subtitle = options.subtitle ? options.subtitle(item) : '';
    const date = item.date || '';
    const desc = item.desc || '';

    return `
      <div class="designer-item">
        <div class="designer-item-head">
          <div class="designer-item-title">${escapeHtml(title)}</div>
          ${date ? `<div class="designer-date">${escapeHtml(date)}</div>` : ''}
        </div>
        ${subtitle ? `<div class="designer-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        ${desc ? `<div class="designer-desc">${escapeHtml(desc)}</div>` : ''}
      </div>`;
  }).join('');
}

function designerSection(id, title, body, wide = false) {
  return `
    <section id="${id}" class="designer-section${wide ? ' wide' : ''}">
      <div class="designer-section-title">${title}</div>
      ${body}
    </section>`;
}

function renderSplitDesignedTemplate(className) {
  const data = readDesignedData();
  const personal = data.personal;
  const preview = document.getElementById('resumePreview');
  const title = personal.title ? `<div id="prevTitle" class="designer-role">${escapeHtml(personal.title)}</div>` : '';
  const contacts = designerContacts(personal);

  preview.className = `resume-page ${className}`;
  preview.innerHTML = `
    <div class="designer-shell">
      <aside class="designer-sidebar">
        ${designerAvatar(personal)}
        <div id="prevName" class="designer-name">${escapeHtml(personal.name || '你的姓名')}</div>
        ${title}
        ${designerSection('prevContact', '联系方式', `<div class="designer-contact">${contacts || '<div class="designer-empty">填写联系方式后会显示在这里</div>'}</div>`)}
        ${designerSection('prevSkill', '核心技能', `<div class="designer-tags">${designerTags(data.skills)}</div>`)}
        ${designerSection('prevEducation', '教育背景', designerItems(data.education, {
          title: item => item.school,
          subtitle: item => [item.major, item.degree].filter(Boolean).join(' · '),
        }))}
      </aside>
      <main class="designer-main">
        ${designerSection('prevSummary', '个人简介', personal.summary ? `<div class="designer-summary">${escapeHtml(personal.summary)}</div>` : '<div class="designer-empty">填写个人简介后会显示在这里</div>')}
        ${designerSection('prevWork', '工作经历', designerItems(data.work, {
          title: item => item.company,
          subtitle: item => item.title,
        }))}
        ${designerSection('prevProject', '项目经历', designerItems(data.projects, {
          title: item => item.name,
          subtitle: item => item.role,
        }))}
      </main>
    </div>`;
}

function renderCoralTemplate() {
  const data = readDesignedData();
  const personal = data.personal;
  const preview = document.getElementById('resumePreview');
  const contacts = designerContacts(personal);
  const title = personal.title ? `<div id="prevTitle" class="designer-role">${escapeHtml(personal.title)}</div>` : '';

  preview.className = 'resume-page tpl-coral';
  preview.innerHTML = `
    <div class="designer-shell">
      <header class="designer-hero">
        ${designerAvatar(personal)}
        <div>
          <div id="prevName" class="designer-name">${escapeHtml(personal.name || '你的姓名')}</div>
          ${title}
          <div id="prevContact" class="designer-contact">${contacts}</div>
        </div>
      </header>
      <main class="designer-main">
        ${designerSection('prevSummary', '个人简介', personal.summary ? `<div class="designer-summary">${escapeHtml(personal.summary)}</div>` : '<div class="designer-empty">填写个人简介后会显示在这里</div>', true)}
        ${designerSection('prevWork', '工作经历', designerItems(data.work, {
          title: item => item.company,
          subtitle: item => item.title,
        }), true)}
        ${designerSection('prevProject', '项目经历', designerItems(data.projects, {
          title: item => item.name,
          subtitle: item => item.role,
        }), true)}
        ${designerSection('prevEducation', '教育背景', designerItems(data.education, {
          title: item => item.school,
          subtitle: item => [item.major, item.degree].filter(Boolean).join(' · '),
        }))}
        ${designerSection('prevSkill', '核心技能', `<div class="designer-tags">${designerTags(data.skills)}</div>`)}
      </main>
    </div>`;
}

Templates.register('雾青双栏', designedTplCSS, () => renderSplitDesignedTemplate('tpl-sage'));
Templates.register('石墨侧栏', designedTplCSS, () => renderSplitDesignedTemplate('tpl-graphite'));
Templates.register('珊瑚卡片', designedTplCSS, renderCoralTemplate);
