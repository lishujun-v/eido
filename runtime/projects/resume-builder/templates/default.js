const defaultTplCSS = `
.resume-page {
  padding: 32px 36px;
  font-size: 14px;
  line-height: 1.5;
}

.resume-header-section {
  text-align: center;
  padding-bottom: 16px;
  border-bottom: 2px solid #1a1a2e;
  margin-bottom: 18px;
}

.resume-photo {
  width: 80px;
  height: 100px;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 8px;
  border: 1px solid #ddd;
}

.resume-header-section h1 {
  font-size: 26px;
  color: #1a1a2e;
  letter-spacing: 2px;
}

.resume-title {
  font-size: 15px;
  color: #4361ee;
  margin: 4px 0 6px;
}

.resume-contact {
  font-size: 13px;
  color: #666;
}

.resume-section { margin-bottom: 16px; }

.resume-section-title {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a2e;
  padding-bottom: 4px;
  margin-bottom: 10px;
  border-bottom: 1px solid #ddd;
}

.resume-item { margin-bottom: 10px; }

.resume-item-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.resume-item-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.resume-item-date {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
}

.resume-item-subtitle {
  font-size: 13px;
  color: #555;
  margin-top: 1px;
}

.resume-item-desc {
  font-size: 13px;
  color: #555;
  margin-top: 4px;
  white-space: pre-wrap;
}

.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.skill-tag {
  background: #e8ecff;
  color: #4361ee;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
}

@media screen and (max-width: 900px) {
  .resume-page {
    padding: 26px 24px;
  }

  .resume-contact {
    line-height: 1.7;
    word-break: break-word;
  }

  .resume-item-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}
`;

function defaultTplRender() {
  const name = document.getElementById('name').value;
  const title = document.getElementById('title').value;
  const summary = document.getElementById('summary').value;

  // Rebuild entire preview DOM
  const preview = document.getElementById('resumePreview');
  const photoSrc = photoDataURL || '';
  const photoStyle = photoDataURL ? '' : 'display:none;';

  const contactHtml = renderPersonalInfoText(' &nbsp;|&nbsp; ');

  preview.innerHTML = `
    <div class="resume-header-section">
      <img id="prevPhoto" class="resume-photo" src="${photoSrc}" style="${photoStyle}" alt="照片">
      <h1 id="prevName">${escapeHtml(name || '你的姓名')}</h1>
      <div id="prevTitle" class="resume-title" style="${title ? '' : 'display:none'}">${escapeHtml(title)}</div>
      <div id="prevContact" class="resume-contact" style="${contactHtml ? '' : 'display:none'}">${contactHtml}</div>
    </div>
    <div id="prevSummary"></div>
    <div id="prevEducation"></div>
    <div id="prevWork"></div>
    <div id="prevProject"></div>
    <div id="prevSkill"></div>`;

  // Summary
  const summaryEl = document.getElementById('prevSummary');
  if (summary) {
    summaryEl.innerHTML = `<div class="resume-section-title">个人简介</div><div class="resume-item-desc">${escapeHtml(summary)}</div>`;
  } else {
    summaryEl.innerHTML = '';
  }

  // Education
  const eduItems = document.querySelectorAll('#educationList > .repeatable');
  document.getElementById('prevEducation').innerHTML = buildItemsHtml(eduItems, '教育经历', item => {
    const school = item.querySelector('.edu-school').value;
    const major = item.querySelector('.edu-major').value;
    const degree = item.querySelector('.edu-degree').value;
    const date = item.querySelector('.edu-date').value;
    const desc = item.querySelector('.edu-desc').value;
    if (!school && !major && !degree) return '';
    let html = '<div class="resume-item">';
    html += `<div class="resume-item-header"><span class="resume-item-title">${escapeHtml(school)}</span><span class="resume-item-date">${escapeHtml(date)}</span></div>`;
    const sub = [major, degree].filter(Boolean).join(' · ');
    if (sub) html += `<div class="resume-item-subtitle">${escapeHtml(sub)}</div>`;
    if (desc) html += `<div class="resume-item-desc">${escapeHtml(desc)}</div>`;
    html += '</div>';
    return html;
  });

  // Work
  const workItems = document.querySelectorAll('#workList > .repeatable');
  document.getElementById('prevWork').innerHTML = buildItemsHtml(workItems, '工作经历', item => {
    const company = item.querySelector('.work-company').value;
    const wTitle = item.querySelector('.work-title').value;
    const date = item.querySelector('.work-date').value;
    const desc = item.querySelector('.work-desc').value;
    if (!company && !wTitle && !desc) return '';
    let html = '<div class="resume-item">';
    html += `<div class="resume-item-header"><span class="resume-item-title">${escapeHtml(company)}</span><span class="resume-item-date">${escapeHtml(date)}</span></div>`;
    if (wTitle) html += `<div class="resume-item-subtitle">${escapeHtml(wTitle)}</div>`;
    if (desc) html += `<div class="resume-item-desc">${escapeHtml(desc)}</div>`;
    html += '</div>';
    return html;
  });

  // Projects
  const projItems = collectWorkProjects();
  document.getElementById('prevProject').innerHTML = buildItemsHtml(projItems, '项目经历', item => {
    const pname = item.name;
    const role = item.role;
    const date = item.date;
    const desc = item.desc;
    if (!pname) return '';
    let html = '<div class="resume-item">';
    html += `<div class="resume-item-header"><span class="resume-item-title">${escapeHtml(pname)}</span><span class="resume-item-date">${escapeHtml(date)}</span></div>`;
    if (role) html += `<div class="resume-item-subtitle">${escapeHtml(role)}</div>`;
    if (desc) html += `<div class="resume-item-desc">${escapeHtml(desc)}</div>`;
    html += '</div>';
    return html;
  });

  // Skills
  const skillItems = document.querySelectorAll('#skillList .repeatable');
  const skills = [];
  skillItems.forEach(item => {
    const val = item.querySelector('.skill-name').value.trim();
    if (val) skills.push(`<span class="skill-tag">${escapeHtml(val)}</span>`);
  });
  const skillEl = document.getElementById('prevSkill');
  if (skills.length) {
    skillEl.innerHTML = `<div class="resume-section-title">技能</div><div class="skill-tags">${skills.join('')}</div>`;
  } else {
    skillEl.innerHTML = '';
  }
}

Templates.register('默认模板', defaultTplCSS, defaultTplRender);
