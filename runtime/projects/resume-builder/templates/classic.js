const classicTplCSS = `
.resume-page {
  padding: 0;
  font-size: 14px;
  line-height: 1.6;
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
  color: #555;
}

/* ── Header ── */
.resume-header-section {
  display: flex;
  align-items: center;
  padding: 24px 32px 18px;
  position: relative;
  overflow: hidden;
  background: #fff;
}

.resume-header-section::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 300px;
  height: 100%;
  background: linear-gradient(135deg, transparent 30px, #8faadc 30px, #8faadc 100%);
  clip-path: polygon(30px 0, 100% 0, 100% 100%, 0 100%);
}

.resume-photo {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  margin-right: 24px;
  border: 3px solid #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  position: relative;
  z-index: 1;
}

.header-text {
  flex: 1;
  position: relative;
  z-index: 1;
}

.header-text h1 {
  font-size: 28px;
  color: #4a6fa5;
  letter-spacing: 4px;
  margin-bottom: 10px;
  font-weight: 400;
}

.contact-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 24px;
  font-size: 13px;
  color: #777;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.contact-item svg {
  width: 14px;
  height: 14px;
  fill: #8faadc;
  flex-shrink: 0;
}

/* Header separator */
.header-sep {
  height: 8px;
  background: #e0e0e0;
  position: relative;
}

.header-sep::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #8faadc;
}

/* ── Content body ── */
.resume-body {
  padding: 16px 32px 24px;
}

/* ── Section title ── */
.resume-section-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  background: #8faadc;
  display: inline-block;
  padding: 4px 18px;
  position: relative;
  letter-spacing: 1px;
  margin-bottom: 0;
}

.resume-section-title::after {
  content: '';
  position: absolute;
  top: 0;
  right: -12px;
  width: 12px;
  height: 100%;
  background: #7a9cc8;
  clip-path: polygon(0 0, 100% 10%, 100% 90%, 0 100%);
}

.section-line {
  border-bottom: 1px solid #d0dff0;
  margin: 0 0 14px 0;
  padding-bottom: 0;
}

/* ── Resume items (work, project) ── */
.resume-section {
  margin-bottom: 18px;
}

.resume-item {
  margin-bottom: 10px;
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px 16px;
}

.resume-item-date {
  font-size: 13px;
  color: #8faadc;
  font-weight: 500;
  white-space: nowrap;
  padding-top: 1px;
}

.resume-item-title {
  font-size: 14px;
  font-weight: 600;
  color: #444;
}

.resume-item-subtitle {
  font-size: 13px;
  color: #777;
  grid-column: 2;
  margin-top: -4px;
}

.resume-item-desc {
  font-size: 13px;
  color: #666;
  grid-column: 2;
  white-space: pre-wrap;
  margin-top: 2px;
}

/* ── Education section ── */
.edu-block {
  margin-bottom: 8px;
}

.edu-block .edu-header {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px 16px;
  margin-bottom: 4px;
}

.edu-block .edu-school {
  font-size: 14px;
  font-weight: 600;
  color: #444;
}

.edu-block .edu-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 24px;
  font-size: 13px;
  color: #666;
  padding-left: 136px;
}

/* ── Paragraph sections ── */
.resume-paragraph {
  font-size: 13px;
  color: #666;
  line-height: 1.8;
}

/* ── Skill tags ── */
.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-tag {
  background: #e8eff8;
  color: #4a6fa5;
  padding: 3px 12px;
  border-radius: 3px;
  font-size: 12px;
}

/* ── Numbered list ── */
.numbered-list {
  font-size: 13px;
  color: #666;
  line-height: 2;
}

.numbered-item {
  display: flex;
  gap: 6px;
}

.numbered-item .num {
  color: #8faadc;
  font-weight: 600;
  flex-shrink: 0;
}

/* ── Hide default elements that this template doesn't use ── */
#prevTitle, #prevContact, .resume-title, .resume-contact {
  display: none !important;
}

@media screen and (max-width: 900px) {
  .resume-page {
    font-size: 13px;
  }

  .resume-header-section {
    align-items: flex-start;
    padding: 24px 24px 18px;
  }

  .resume-header-section::before {
    width: 38%;
    opacity: 0.72;
  }

  .header-text h1 {
    font-size: 25px;
    letter-spacing: 2px;
  }

  .contact-grid {
    grid-template-columns: 1fr;
    gap: 4px;
    font-size: 12px;
    max-width: 62%;
    word-break: break-word;
  }

  .resume-body {
    padding: 16px 24px 24px;
  }

  .resume-item {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .resume-item-date,
  .resume-item-subtitle,
  .resume-item-desc {
    grid-column: 1;
  }

  .edu-block .edu-header {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .edu-block .edu-details {
    padding-left: 0;
    grid-template-columns: 1fr 1fr;
    gap: 4px 18px;
  }
}
`;

function classicTplRender() {
  const name = document.getElementById('name').value;
  const title = document.getElementById('title').value;
  const summary = document.getElementById('summary').value;

  // ── Rebuild entire preview DOM ─
  const preview = document.getElementById('resumePreview');
  const photoSrc = photoDataURL || '';
  const photoStyle = photoDataURL ? '' : 'display:none;';

  // Build contact items
  const contactItems = [];
  getPersonalInfoItems().forEach(item => {
    if (item.id === 'phone') contactItems.push(`<span class="contact-item"><svg viewBox="0 0 24 24"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.58 1 1 0 01-.24 1.01l-2.2 2.2z"/></svg>${escapeHtml(item.value)}</span>`);
    else if (item.id === 'email') contactItems.push(`<span class="contact-item"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>${escapeHtml(item.value)}</span>`);
    else if (item.id === 'website') contactItems.push(`<span class="contact-item"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>${escapeHtml(item.value)}</span>`);
    else contactItems.push(`<span class="contact-item">${escapeHtml(formatPersonalInfoItem(item))}</span>`);
  });

  preview.innerHTML = `
    <div class="resume-header-section">
      <img id="prevPhoto" class="resume-photo" src="${photoSrc}" style="${photoStyle}" alt="照片">
      <div class="header-text">
        <h1 id="prevName">${escapeHtml(name || '你的姓名')}</h1>
        ${title ? `<div style="font-size:13px;color:#999;margin-bottom:6px;">${escapeHtml(title)}</div>` : ''}
        <div class="contact-grid">${contactItems.join('')}</div>
      </div>
    </div>
    <div class="header-sep"></div>
    <div class="resume-body">
      <div id="prevSummary"></div>
      <div id="prevEducation"></div>
      <div id="prevWork"></div>
      <div id="prevProject"></div>
      <div id="prevSkill"></div>
    </div>`;

  // ── Summary as self-evaluation ─
  const summaryEl = document.getElementById('prevSummary');
  if (summary) {
    const lines = summary.split(/[\n,;，；]/).filter(Boolean).map(s => s.trim());
    if (lines.length > 1) {
      summaryEl.innerHTML = `
        <div class="resume-section-title">自我评价</div>
        <div class="section-line"></div>
        <div class="numbered-list">
          ${lines.slice(0, 6).map((l, i) => `<div class="numbered-item"><span class="num">${i + 1}、</span><span>${escapeHtml(l)}</span></div>`).join('')}
        </div>`;
    } else {
      summaryEl.innerHTML = `
        <div class="resume-section-title">自我评价</div>
        <div class="section-line"></div>
        <div class="resume-paragraph">${escapeHtml(summary)}</div>`;
    }
  } else {
    summaryEl.innerHTML = '';
  }

  // ── Work Experience ─
  const workItems = document.querySelectorAll('#workList > .repeatable');
  const workEl = document.getElementById('prevWork');
  const workHtml = [];
  workItems.forEach(item => {
    const company = item.querySelector('.work-company').value;
    const wTitle = item.querySelector('.work-title').value;
    const date = item.querySelector('.work-date').value;
    const desc = item.querySelector('.work-desc').value;
    if (!company && !wTitle) return;
    workHtml.push(`
      <div class="resume-item">
        <div class="resume-item-date">${escapeHtml(date)}</div>
        <div class="resume-item-title">${escapeHtml(company)}</div>
        ${wTitle ? `<div class="resume-item-subtitle">${escapeHtml(wTitle)}</div>` : ''}
        ${desc ? `<div class="resume-item-desc">${escapeHtml(desc)}</div>` : ''}
      </div>`);
  });
  if (workHtml.length) {
    workEl.innerHTML = `
      <div class="resume-section-title">工作经验</div>
      <div class="section-line"></div>
      ${workHtml.join('')}`;
  } else {
    workEl.innerHTML = '';
  }

  // ── Projects ──
  const projItems = collectWorkProjects();
  const projEl = document.getElementById('prevProject');
  const projHtml = [];
  projItems.forEach(item => {
    const pname = item.name;
    const role = item.role;
    const date = item.date;
    const desc = item.desc;
    if (!pname) return;
    projHtml.push(`
      <div class="resume-item">
        <div class="resume-item-date">${escapeHtml(date)}</div>
        <div class="resume-item-title">${escapeHtml(pname)}</div>
        ${role ? `<div class="resume-item-subtitle">${escapeHtml(role)}</div>` : ''}
        ${desc ? `<div class="resume-item-desc">${escapeHtml(desc)}</div>` : ''}
      </div>`);
  });
  if (projHtml.length) {
    projEl.innerHTML = `
      <div class="resume-section-title">项目经历</div>
      <div class="section-line"></div>
      ${projHtml.join('')}`;
  } else {
    projEl.innerHTML = '';
  }

  // ── Education ──
  const eduItems = document.querySelectorAll('#educationList > .repeatable');
  const eduEl = document.getElementById('prevEducation');
  const eduHtml = [];
  eduItems.forEach(item => {
    const school = item.querySelector('.edu-school').value;
    const major = item.querySelector('.edu-major').value;
    const degree = item.querySelector('.edu-degree').value;
    const date = item.querySelector('.edu-date').value;
    const desc = item.querySelector('.edu-desc').value;
    if (!school) return;
    let detailParts = [];
    if (degree) detailParts.push(`最高学历：${escapeHtml(degree)}`);
    if (major) detailParts.push(`个人专业：${escapeHtml(major)}`);
    if (desc) detailParts.push(escapeHtml(desc));
    eduHtml.push(`
      <div class="edu-block">
        <div class="edu-header">
          <div class="edu-school">${escapeHtml(school)}</div>
          <div>${escapeHtml(date)}</div>
        </div>
        ${detailParts.length ? `<div class="edu-details">${detailParts.map(p => `<div>${p}</div>`).join('')}</div>` : ''}
      </div>`);
  });
  if (eduHtml.length) {
    eduEl.innerHTML = `
      <div class="resume-section-title">教育背景</div>
      <div class="section-line"></div>
      ${eduHtml.join('')}`;
  } else {
    eduEl.innerHTML = '';
  }

  // ── Skills ──
  const skillItems = document.querySelectorAll('#skillList .repeatable');
  const skills = [];
  skillItems.forEach(item => {
    const val = item.querySelector('.skill-name').value.trim();
    if (val) skills.push(`<span class="skill-tag">${escapeHtml(val)}</span>`);
  });
  const skillEl = document.getElementById('prevSkill');
  if (skills.length) {
    skillEl.innerHTML = `
      <div class="resume-section-title">个人能力</div>
      <div class="section-line"></div>
      <div class="skill-tags">${skills.join('')}</div>`;
  } else {
    skillEl.innerHTML = '';
  }
}

Templates.register('经典蓝', classicTplCSS, classicTplRender);
