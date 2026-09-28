(() => {
  const samples = {
    flow: `flowchart LR\n  A[用户输入 Mermaid] --> B{语法有效？}\n  B -- 是 --> C[生成 SVG 图谱]\n  C --> D[导出清晰 PNG]\n  B -- 否 --> E[指出需要修正的位置]`,
    sequence: `sequenceDiagram\n  participant U as 使用者\n  participant S as 图谱工作室\n  participant M as Mermaid 引擎\n  U->>S: 粘贴图表代码\n  S->>M: 解析并渲染\n  M-->>S: 返回 SVG 图形\n  S-->>U: 显示可下载的图表`,
    class: `classDiagram\n  class DiagramStudio {\n    +string source\n    +render() SVG\n    +exportPNG() File\n  }\n  class MermaidEngine {\n    +parse(code)\n  }\n  DiagramStudio --> MermaidEngine : renders with`,
    state: `stateDiagram-v2\n  [*] --> 编辑中\n  编辑中 --> 渲染成功: 代码有效\n  编辑中 --> 语法提示: 代码错误\n  语法提示 --> 编辑中: 继续修改\n  渲染成功 --> 已下载: 导出 PNG\n  已下载 --> 编辑中: 再次编辑`,
  };
  const source = document.querySelector('#source');
  const lines = document.querySelector('#lineNumbers');
  const target = document.querySelector('#renderTarget');
  const status = document.querySelector('#renderStatus');
  const download = document.querySelector('#downloadPng');
  const theme = document.querySelector('#theme');
  const maxTextSize = document.querySelector('#maxTextSize');
  const maxEdges = document.querySelector('#maxEdges');
  const copy = document.querySelector('#copyCode');
  const canvasStage = document.querySelector('#canvasStage');
  let debounce; let counter = 0; let latestSvg = null;
  const viewport = { zoom: 1, x: 0, y: 0, pointers: new Map(), panning: false, lastPoint: null };

  // Eido 的项目 iframe 使用隔离沙盒；有些运行环境会禁用 localStorage。
  // 将“记住草稿”降级为可选能力，绝不能阻断图表本身的渲染。
  function readDraft(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
  function saveDraft(key, value) { try { window.localStorage.setItem(key, value); } catch { /* 沙盒中继续正常渲染 */ } }
  function lineCount() { lines.textContent = Array.from({ length: Math.max(1, source.value.split('\n').length) }, (_, i) => i + 1).join('\n'); }
  function setStatus(message, kind = '') { status.className = `render-status ${kind}`; status.lastElementChild.textContent = message; }
  function activeTemplate(name) { document.querySelectorAll('.template').forEach((button) => button.classList.toggle('active', button.dataset.template === name)); }
  function applyViewport() { canvasStage.style.setProperty('--zoom', viewport.zoom); canvasStage.style.setProperty('--pan-x', `${viewport.x}px`); canvasStage.style.setProperty('--pan-y', `${viewport.y}px`); }
  function fitDiagram() {
    const svg = target.querySelector('svg'); if (!svg) return;
    const viewBox = svg.viewBox.baseVal; const width = viewBox.width || svg.getBoundingClientRect().width; const height = viewBox.height || svg.getBoundingClientRect().height;
    if (!width || !height) return;
    svg.style.width = `${width}px`; svg.style.height = `${height}px`;
    viewport.x = 0; viewport.y = 0; viewport.zoom = Math.max(.05, Math.min(1, (canvasStage.clientWidth - 64) / width, (canvasStage.clientHeight - 64) / height)); applyViewport();
  }
  function zoomAt(clientX, clientY, factor) {
    const bounds = canvasStage.getBoundingClientRect(); const nextZoom = Math.min(6, Math.max(.05, viewport.zoom * factor)); if (nextZoom === viewport.zoom) return;
    const localX = clientX - bounds.left - (bounds.width / 2) - viewport.x; const localY = clientY - bounds.top - (bounds.height / 2) - viewport.y;
    viewport.x -= localX * ((nextZoom / viewport.zoom) - 1); viewport.y -= localY * ((nextZoom / viewport.zoom) - 1); viewport.zoom = nextZoom; applyViewport();
  }
  function config() {
    const themes = {
      dark: { theme: 'dark', themeVariables: { background: '#f8f8f6', primaryColor: '#e8edff', primaryTextColor: '#172035', primaryBorderColor: '#6b7ce6', lineColor: '#354263', secondaryColor: '#f1f3ff', tertiaryColor: '#ecf0ff', fontFamily: 'Arial, sans-serif' } },
      neutral: { theme: 'base', themeVariables: { background: '#fbfaf7', primaryColor: '#ece8de', primaryTextColor: '#24211d', primaryBorderColor: '#49443c', lineColor: '#48433b', secondaryColor: '#f5f1e9', tertiaryColor: '#fffdf9', fontFamily: 'Arial, sans-serif' } },
      forest: { theme: 'base', themeVariables: { background: '#f8fbf7', primaryColor: '#e2eee5', primaryTextColor: '#143b32', primaryBorderColor: '#3f806d', lineColor: '#326a5b', secondaryColor: '#edf6ef', tertiaryColor: '#f5faf4', fontFamily: 'Arial, sans-serif' } },
    };
    const textLimit = maxTextSize.value === 'unlimited' ? Number.POSITIVE_INFINITY : Number(maxTextSize.value);
    const edgeLimit = maxEdges.value === 'unlimited' ? Number.POSITIVE_INFINITY : Number(maxEdges.value);
    return { startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, maxTextSize: textLimit, maxEdges: edgeLimit, ...themes[theme.value] };
  }
  async function render() {
    const code = source.value.trim();
    lineCount(); saveDraft('mermaid-studio-source', source.value); saveDraft('mermaid-studio-theme', theme.value); saveDraft('mermaid-studio-max-text-size', maxTextSize.value); saveDraft('mermaid-studio-max-edges', maxEdges.value);
    if (!code) { target.replaceChildren(); latestSvg = null; download.disabled = true; setStatus('等待输入 Mermaid 代码'); return; }
    const id = `diagram-${++counter}`;
    setStatus('正在生成图谱…');
    try {
      mermaid.initialize(config());
      const { svg, bindFunctions } = await mermaid.render(id, code);
      if (id !== `diagram-${counter}`) return;
      target.innerHTML = svg;
      bindFunctions?.(target);
      latestSvg = target.querySelector('svg');
      requestAnimationFrame(fitDiagram);
      download.disabled = !latestSvg;
      setStatus('图谱已更新，可下载 PNG', 'success');
    } catch (error) {
      latestSvg = null; download.disabled = true; target.replaceChildren();
      const message = error?.message?.replace(/^Error:\s*/i, '').split('\n')[0] || '无法解析这段 Mermaid 代码。';
      setStatus(`语法提示：${message}`, 'error');
    }
  }
  function schedule() { clearTimeout(debounce); debounce = setTimeout(render, 320); }
  async function exportPng() {
    if (!latestSvg) return;
    const clone = latestSvg.cloneNode(true);
    const box = latestSvg.getBoundingClientRect();
    const width = Number.parseFloat(latestSvg.getAttribute('width')) || box.width || 1200;
    const height = Number.parseFloat(latestSvg.getAttribute('height')) || box.height || 800;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', width); clone.setAttribute('height', height);
    const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const image = new Image(); const url = URL.createObjectURL(svgBlob);
    image.onload = () => { const scale = 2; const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale); const context = canvas.getContext('2d'); context.fillStyle = '#f8f8f6'; context.fillRect(0, 0, canvas.width, canvas.height); context.scale(scale, scale); context.drawImage(image, 0, 0, width, height); URL.revokeObjectURL(url); canvas.toBlob((blob) => { if (!blob) return; const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `mermaid-diagram-${new Date().toISOString().slice(0, 10)}.png`; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); setStatus('PNG 图片已下载', 'success'); }, 'image/png'); };
    image.onerror = () => { URL.revokeObjectURL(url); setStatus('PNG 导出失败，请尝试重新渲染。', 'error'); };
    image.src = url;
  }
  source.value = readDraft('mermaid-studio-source') || samples.flow;
  theme.value = readDraft('mermaid-studio-theme') || 'dark';
  maxTextSize.value = readDraft('mermaid-studio-max-text-size') || '50000';
  maxEdges.value = readDraft('mermaid-studio-max-edges') || '500';
  source.addEventListener('input', schedule); source.addEventListener('scroll', () => { lines.scrollTop = source.scrollTop; });
  canvasStage.addEventListener('wheel', (event) => { event.preventDefault(); if (event.ctrlKey || event.metaKey) { zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * .008)); return; } viewport.x -= event.deltaX; viewport.y -= event.deltaY; applyViewport(); }, { passive: false });
  function touchCenter() { const points = [...viewport.pointers.values()]; return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }; }
  canvasStage.addEventListener('pointerdown', (event) => { viewport.pointers.set(event.pointerId, { x:event.clientX, y:event.clientY }); if (event.pointerType === 'mouse' || viewport.pointers.size >= 3) { viewport.panning = true; viewport.lastPoint = event.pointerType === 'mouse' ? { x:event.clientX, y:event.clientY } : touchCenter(); canvasStage.classList.add('is-panning'); canvasStage.setPointerCapture?.(event.pointerId); } });
  canvasStage.addEventListener('pointermove', (event) => { if (!viewport.pointers.has(event.pointerId)) return; viewport.pointers.set(event.pointerId, { x:event.clientX, y:event.clientY }); if (!viewport.panning || (event.pointerType !== 'mouse' && viewport.pointers.size < 3)) return; const point = event.pointerType === 'mouse' ? { x:event.clientX, y:event.clientY } : touchCenter(); viewport.x += point.x - viewport.lastPoint.x; viewport.y += point.y - viewport.lastPoint.y; viewport.lastPoint = point; applyViewport(); });
  function stopPointer(event) { viewport.pointers.delete(event.pointerId); if (event.pointerType === 'mouse' || viewport.pointers.size < 3) { viewport.panning = false; viewport.lastPoint = null; canvasStage.classList.remove('is-panning'); } }
  canvasStage.addEventListener('pointerup', stopPointer); canvasStage.addEventListener('pointercancel', stopPointer);
  source.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); render(); } if (event.key === 'Tab') { event.preventDefault(); const start = source.selectionStart; source.setRangeText('  ', start, source.selectionEnd, 'end'); schedule(); } });
  theme.addEventListener('change', render); maxTextSize.addEventListener('change', () => { if (maxTextSize.value === 'unlimited') maxEdges.value = 'unlimited'; render(); }); maxEdges.addEventListener('change', render); download.addEventListener('click', exportPng);
  copy.addEventListener('click', async () => { await navigator.clipboard.writeText(source.value); copy.textContent = '已复制'; setTimeout(() => { copy.textContent = '复制代码'; }, 1300); });
  document.querySelector('#resetSample').addEventListener('click', () => { source.value = samples.flow; activeTemplate('flow'); render(); });
  document.querySelectorAll('.template').forEach((button) => button.addEventListener('click', () => { const name = button.dataset.template; source.value = samples[name]; activeTemplate(name); render(); source.focus(); }));
  render();
})();
