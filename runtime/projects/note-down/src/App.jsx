import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import TurndownService from 'turndown'
import {
  CaretDown, CaretRight, Check, FileText, FolderOpen, MagnifyingGlass,
  Plus, SidebarSimple, Trash, X
} from '@phosphor-icons/react'

const SAMPLE = `# 项目灵感记录

记录一些项目的想法与方向，随时补充。

## 背景
最近在思考如何把 **Markdown** 写作体验做得更顺畅，
让灵感记录、整理和输出更自然。

## 核心想法
- 专注写作，实时预览
- 支持图片粘贴与调整
- 链接插入与快捷保存
- 本地优先，简单可靠

## 参考链接
- [Markdown 官方语法文档](https://www.markdownguide.org/)

## 示例代码
\`\`\`python
def hello(name: str) -> str:
    return f"你好，{name}!"

print(hello("灵感"))
\`\`\`

## 待办清单
- [x] 基础编辑功能
- [x] 实时预览
- [x] 图片粘贴与缩放
- [ ] 导出为多种格式
- [ ] 主题与外观

<img src="./assets/alpine-lake.png" alt="高山湖泊" width="520" />

## 备注
持续迭代，保持简单。`

const initialNotes = [
  { id: 'welcome', title: '项目灵感记录', time: '刚刚', text: SAMPLE },
  { id: 'requirements', title: '产品需求梳理', time: '昨天', text: '# 产品需求梳理\n\n整理首版范围与验收标准。' },
  { id: 'technical-plan', title: '技术方案草案', time: '3 天前', text: '# 技术方案草案\n\n离线优先，本地可靠。' },
  { id: 'book-notes', title: '读书笔记：高效团队', time: '上周', text: '# 读书笔记：高效团队\n\n信任让协作更快。' },
  { id: 'design-references', title: '设计参考收集', time: '上周', text: '# 设计参考收集\n\n安静、清楚、轻量。' },
  { id: 'meeting-0508', title: '会议纪要 0508', time: '上周', text: '# 会议纪要 0508\n\n- 明确目标\n- 跟进执行' },
]

marked.use({ gfm: true, breaks: true })

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })
turndown.addRule('taskListItem', {
  filter: node => node.nodeName === 'LI' && node.querySelector('input[type="checkbox"]'),
  replacement: (content, node) => {
    const checkbox = node.querySelector('input[type="checkbox"]')
    return `\n- [${checkbox?.checked ? 'x' : ' '}] ${content.replace(/^\s+/, '')}`
  },
})

const STORAGE_KEY = 'note-down-workspace-v1'
const STORAGE_BATCH_KEY = 'workspace-batch'
const THEME_STORAGE_KEY = 'note-down-theme-v1'
const IS_EIDO_PROJECT = window.parent !== window
const pendingRequests = new Map()
const noteThemes = [
  { id: 'mist', label: '专注灰', hint: '安静、清晰' },
  { id: 'sage', label: '晨雾绿', hint: '舒缓护眼' },
  { id: 'ocean', label: '海盐蓝', hint: '清爽专注' },
  { id: 'paper', label: '暖纸黄', hint: '温和阅读' },
  { id: 'blush', label: '樱花粉', hint: '轻柔灵感' },
]

function readNoteTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return noteThemes.some(theme => theme.id === saved) ? saved : 'mist'
  } catch { return 'mist' }
}

function callEido(capability, payload, transfer = []) {
  if (!IS_EIDO_PROJECT) return Promise.reject(new Error('当前不在 SiinX Project 中'))
  const requestId = `note_down_${Date.now()}_${Math.random().toString(36).slice(2)}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingRequests.delete(requestId); reject(new Error('SiinX 能力调用超时')) }, 30000)
    pendingRequests.set(requestId, { resolve, reject, timer })
    window.parent.postMessage({ type: 'eido:project-request', requestId, capability, payload }, '*', transfer)
  })
}

function createNoteId() {
  return globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeNotes(value, lazy = false) {
  if (!Array.isArray(value)) return []
  return value.map(note => ({
    ...note,
    id: note.id || createNoteId(),
    title: note.title || titleFrom(note.text || ''),
    time: note.time || '刚刚',
    text: typeof note.text === 'string' ? note.text : lazy ? null : '# 未命名笔记\n\n',
    children: normalizeNotes(note.children, lazy),
  }))
}

function flattenNotes(notes, depth = 0, parentId = null) {
  return notes.flatMap(note => [
    { note, depth, parentId },
    ...flattenNotes(note.children || [], depth + 1, note.id),
  ])
}

function findNote(notes, id) {
  for (const note of notes) {
    if (note.id === id) return note
    const child = findNote(note.children || [], id)
    if (child) return child
  }
  return null
}

function updateNote(notes, id, updater) {
  return notes.map(note => note.id === id
    ? updater(note)
    : { ...note, children: updateNote(note.children || [], id, updater) })
}

function insertChild(notes, parentId, child) {
  return notes.map(note => note.id === parentId
    ? { ...note, children: [child, ...(note.children || [])] }
    : { ...note, children: insertChild(note.children || [], parentId, child) })
}

function removeNote(notes, id) {
  return notes
    .filter(note => note.id !== id)
    .map(note => ({ ...note, children: removeNote(note.children || [], id) }))
}

function descendantIds(note) {
  return [note.id, ...(note.children || []).flatMap(descendantIds)]
}

function parentNoteIds(notes) {
  return flattenNotes(notes).filter(({ note }) => note.children?.length).map(({ note }) => note.id)
}

function filterNoteTree(notes, query) {
  const needle = query.trim().toLowerCase()
  if (!needle) return notes
  return notes.flatMap(note => {
    const children = filterNoteTree(note.children || [], needle)
    return note.title.toLowerCase().includes(needle) || children.length ? [{ ...note, children }] : []
  })
}

function noteIndex(notes) {
  return notes.map(({ id, title, time, children }) => ({ id, title, time, children: noteIndex(children || []) }))
}

function diskWorkspace(notes, activeId, expandedIds) {
  return {
    schemaVersion: 3,
    notes: noteIndex(notes),
    activeId,
    expandedIds: [...expandedIds],
    updatedAt: new Date().toISOString(),
  }
}

function workspaceFrom(value) {
  const legacyNotes = Array.isArray(value) ? value : value?.notes
  const notes = normalizeNotes(legacyNotes?.length ? legacyNotes : initialNotes, Number(value?.schemaVersion) >= 3)
  const flat = flattenNotes(notes)
  const legacyActive = Math.min(Math.max(Number(value?.active) || 0, 0), Math.max(0, flat.length - 1))
  const requestedActiveId = Array.isArray(value) ? null : value?.activeId
  const activeId = flat.some(({ note }) => note.id === requestedActiveId) ? requestedActiveId : flat[legacyActive]?.note.id
  const expandedIds = Array.isArray(value?.expandedIds) ? value.expandedIds : parentNoteIds(notes)
  return { notes, activeId, expandedIds }
}

function readLocalWorkspace() {
  try { return workspaceFrom(JSON.parse(localStorage.getItem('note-down-notes'))) } catch { return workspaceFrom(initialNotes) }
}

function writeLocalWorkspace(value) {
  try { localStorage.setItem('note-down-notes', JSON.stringify(value)) } catch {}
}

function titleFrom(text) {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim() || '未命名笔记'
}

function normalizeWrappedMarkdown(value) {
  const text = typeof value === 'string' ? value : ''
  const lines = text.split('\n')
  const firstContent = lines.findIndex(line => line.trim())
  if (firstContent < 0 || !/^```(?:markdown|md)?\s*$/i.test(lines[firstContent].trim())) return text

  const body = lines.slice(firstContent + 1).join('\n')
  const looksLikeDocument = /^#{1,6}\s+\S/m.test(body)
    && /^\s*\|(?:[^\n|]*\|){1,}\s*$/m.test(body)
    && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(body)
  if (!looksLikeDocument || body.length < 200) return text

  const fences = lines.reduce((count, line) => count + (/^```/.test(line.trim()) ? 1 : 0), 0)
  const normalized = [...lines]
  normalized.splice(firstContent, 1)
  if (fences % 2 === 0) {
    const lastContent = normalized.findLastIndex(line => line.trim())
    if (lastContent >= 0 && /^```\s*$/.test(normalized[lastContent].trim())) normalized.splice(lastContent, 1)
  }
  return normalized.join('\n').replace(/^\n+/, '')
}

function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || `note-${Date.now()}`
}

function renderMarkdown(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown), { ADD_TAGS: ['input'], ADD_ATTR: ['target', 'width', 'checked', 'disabled', 'type'] })
}

const RICH_MARKDOWN_FENCE_LANGUAGES = new Set(['md', 'markdown', 'mdown', 'mkdn'])

function fenceTone(language) {
  if (!language || ['text', 'txt', 'plain', 'plaintext'].includes(language)) return 'text'
  if (['sh', 'bash', 'zsh', 'shell', 'console', 'terminal', 'powershell', 'ps1'].includes(language)) return 'terminal'
  if (['json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'xml'].includes(language)) return 'data'
  if (['html', 'css', 'scss', 'sass', 'less', 'vue', 'svelte'].includes(language)) return 'web'
  if (['py', 'python', 'rb', 'ruby', 'go', 'rs', 'rust'].includes(language)) return 'runtime'
  return 'code'
}

function looksLikeRichMarkdown(value) {
  const text = value.trim()
  if (!text || /(^|\n)\s*(?:import |export |const |let |var |function |class |def |SELECT |<\/?[a-z])/m.test(text)) return false
  return /(^|\n)\s*(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+|\|.*\|)|\*\*[^*]+\*\*|!?(?:\[[^\]]+\]\([^\)]+\))/.test(text)
}

function renderRichMarkdownFence(preview, markdown) {
  const source = markdown.replace(/\u200B/g, '')
  if (!source || preview.dataset.richMarkdownSource === source) return
  preview.dataset.richMarkdownSource = source
  preview.classList.add('rich-markdown-fence')
  preview.style.whiteSpace = 'normal'
  preview.innerHTML = `<div class="rich-markdown-fence__label">Markdown</div><div class="rich-markdown-fence__content">${renderMarkdown(source)}</div>`
}

function enhanceMarkdownFences(root) {
  root?.querySelectorAll('.vditor-ir__node[data-type="code-block"]').forEach(node => {
    const source = node.querySelector('pre.vditor-ir__marker--pre code')?.textContent || ''
    const language = (node.querySelector('[data-type="code-block-info"]')?.textContent || '').replace(/\u200B/g, '').trim().toLowerCase()
    const preview = node.querySelector('.vditor-ir__preview')
    if (!preview) return
    const isRichMarkdown = RICH_MARKDOWN_FENCE_LANGUAGES.has(language) || (!language && looksLikeRichMarkdown(source))
    preview.dataset.fenceLanguage = language || 'text'
    preview.dataset.fenceTone = isRichMarkdown ? 'rich' : fenceTone(language)
    if (isRichMarkdown) {
      renderRichMarkdownFence(preview, source)
    }
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function App() {
  const [seed] = useState(readLocalWorkspace)
  const [notes, setNotes] = useState(seed.notes)
  // In SiinX, load only the notebook index first.  A document is fetched and
  // the (relatively heavy) Vditor instance is created only after its row is
  // selected.
  const [activeId, setActiveId] = useState(IS_EIDO_PROJECT ? null : seed.activeId)
  const [expandedIds, setExpandedIds] = useState(() => new Set(seed.expandedIds))
  const [text, setText] = useState(IS_EIDO_PROJECT ? '' : findNote(seed.notes, seed.activeId)?.text || SAMPLE)
  const [savedText, setSavedText] = useState(IS_EIDO_PROJECT ? '' : findNote(seed.notes, seed.activeId)?.text || SAMPLE)
  const [query, setQuery] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mode, setMode] = useState('visual')
  const [noteTheme, setNoteTheme] = useState(readNoteTheme)
  const [toast, setToast] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [headingOpen, setHeadingOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [linkLabel, setLinkLabel] = useState('')
  const [, setImageWidth] = useState(520)
  const [, setImageSelected] = useState(true)
  const [storageReady, setStorageReady] = useState(!IS_EIDO_PROJECT)
  const [needsDiskMigration, setNeedsDiskMigration] = useState(IS_EIDO_PROJECT)
  const [loadingNoteId, setLoadingNoteId] = useState(null)
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const editor = useRef(null)
  const richEditor = useRef(null)
  const vditorHost = useRef(null)
  const vditorInstance = useRef(null)
  const richSelection = useRef(null)
  const undoStacks = useRef(new Map())
  const latestDocument = useRef({ activeId, text })
  const fileInput = useRef(null)
  const imageInput = useRef(null)
  const dirInput = useRef(null)
  const toolbarActions = useRef({})
  const selectionRequest = useRef(0)
  const dirty = text !== savedText
  latestDocument.current = { activeId, text }
  toolbarActions.current = {
    setMode,
    setTheme: setNoteTheme,
    open: () => fileInput.current?.click(),
    export: () => saveNote(),
  }

  const filteredTree = useMemo(() => filterNoteTree(notes, query), [notes, query])
  const stats = useMemo(() => {
    const before = text.slice(0, editor.current?.selectionStart || 0)
    return { line: before.split('\n').length, col: before.split('\n').at(-1).length + 1, chars: text.replace(/\s/g, '').length }
  }, [text])

  useEffect(() => {
    if (mode === 'visual' && richEditor.current) richEditor.current.innerHTML = renderMarkdown(latestDocument.current.text)
  }, [activeId, mode])

  useEffect(() => {
    if (!storageReady || !activeId || !vditorHost.current) return
    let disposed = false
    const editorText = normalizeWrappedMarkdown(text)
    const colorTool = {
      name: 'text-color', tip: '文字颜色', icon: '<span class="note-color-icon">A</span>',
      click: () => {},
      toolbar: [
        ['#20242b', '默认'], ['#e5484d', '红色'], ['#f08c00', '橙色'], ['#2f9e44', '绿色'], ['#1971c2', '蓝色'], ['#7048e8', '紫色'],
      ].map(([color, label]) => ({ name: `color-${color.slice(1)}`, tip: label, icon: `<span class="note-color-dot" style="background:${color}"></span>`, click: () => wrapVditorSelection('[', `](note-color-${color.slice(1)})`, '彩色文字') })),
    }
    const alignTool = {
      name: 'text-align', tip: '文字对齐', icon: '<span class="note-align-icon">↔</span>',
      click: () => {},
      toolbar: [
        ['left', '左对齐', '≡'], ['center', '居中', '≣'], ['right', '右对齐', '≡'],
      ].map(([align, label, icon]) => ({ name: `align-${align}`, tip: label, icon: `<span class="note-align-option ${align}">${icon}</span>`, click: () => wrapVditorSelection('[', `](note-align-${align})`, '对齐文字') })),
    }
    const modeTools = [
      {
        name: 'note-edit',
        className: `note-toolbar-action note-toolbar-actions-start${mode === 'visual' ? ' is-active' : ''}`,
        tip: '编辑',
        tipPosition: 'ne',
        icon: '<svg><use xlink:href="#vditor-icon-edit"></use></svg>',
        click: () => toolbarActions.current.setMode('visual'),
      },
      {
        name: 'note-source',
        className: `note-toolbar-action${mode === 'source' ? ' is-active' : ''}`,
        tip: '查看源码',
        tipPosition: 'ne',
        icon: '<svg><use xlink:href="#vditor-icon-code"></use></svg>',
        click: () => toolbarActions.current.setMode('source'),
      },
    ]
    const themeTool = {
      name: 'note-theme',
      className: 'note-toolbar-action note-toolbar-theme',
      tip: '主题',
      tipPosition: 'nw',
      icon: '<svg><use xlink:href="#vditor-icon-theme"></use></svg>',
      click: () => {},
      toolbar: noteThemes.map(theme => ({
        name: `note-theme-${theme.id}`,
        className: `note-theme-option theme-${theme.id}${noteTheme === theme.id ? ' is-selected' : ''}`,
        tip: `<span class="note-theme-option__name"><i class="theme-swatch ${theme.id}"></i>${theme.label}</span><small>${theme.hint}</small>`,
        click: () => toolbarActions.current.setTheme(theme.id),
      })),
    }
    const openTool = {
      name: 'note-open',
      className: 'note-toolbar-action',
      tip: '打开 Markdown',
      tipPosition: 'nw',
      icon: '<svg><use xlink:href="#vditor-icon-upload"></use></svg>',
      click: () => toolbarActions.current.open(),
    }
    const exportTool = {
      name: 'note-export',
      className: 'note-toolbar-action note-toolbar-export',
      tip: '导出 Markdown（Ctrl/⌘ + S）',
      tipPosition: 'nw',
      icon: '<svg><use xlink:href="#vditor-icon-export"></use></svg>',
      click: () => toolbarActions.current.export(),
    }
    let instance
    Promise.all([import('vditor'), import('vditor/dist/index.css')]).then(([{ default: Vditor }]) => {
      if (disposed || !vditorHost.current) return
      instance = new Vditor(vditorHost.current, {
      value: editorText,
      cdn: './vditor',
      mode: mode === 'source' ? 'sv' : 'ir',
      theme: 'classic',
      height: '100%',
      width: '100%',
      lang: 'zh_CN',
      cache: { enable: false },
      placeholder: '开始记录你的想法…',
      preview: { mode: 'editor', delay: 120, maxWidth: 820 },
      counter: { enable: false },
      toolbarConfig: { pin: true },
      customWysiwygToolbar: () => {},
      customRenders: [...RICH_MARKDOWN_FENCE_LANGUAGES].map(language => ({
        language,
        render: element => renderRichMarkdownFence(element, element.querySelector('code')?.textContent || element.textContent),
      })),
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|', 'quote', 'list', 'ordered-list', 'check', '|',
        'link', 'upload', 'table', '|', colorTool, alignTool, '|', 'undo', 'redo',
        { name: 'more', tip: '更多格式', toolbar: ['line', 'inline-code', 'code', 'fullscreen'] },
        ...modeTools, themeTool, openTool, exportTool,
      ],
      upload: {
        accept: 'image/png,image/jpeg,image/webp,image/gif',
        handler: async files => {
          for (const file of files) {
            if (!file.type.startsWith('image/')) continue
            const dataUrl = await fileToDataUrl(file)
            vditorInstance.current?.insertValue(`\n<img src="${dataUrl}" alt="${file.name}" width="520" />\n`)
          }
          return null
        },
      },
      input: value => { if (!disposed) update(value) },
      after: () => {
        if (disposed) return
        vditorInstance.current = instance
        noteThemes.forEach(theme => {
          const option = vditorHost.current?.querySelector(`.note-theme-option.theme-${theme.id} button`)
          if (option) option.innerHTML = `<span class="note-theme-option__name"><i class="theme-swatch ${theme.id}"></i>${theme.label}</span><small>${theme.hint}</small>`
        })
        const refreshMarkdownFences = () => enhanceMarkdownFences(vditorHost.current)
        const fenceObserver = new MutationObserver(refreshMarkdownFences)
        fenceObserver.observe(vditorHost.current, { childList: true, subtree: true, characterData: true })
        refreshMarkdownFences()
        instance.__noteDownFenceObserver = fenceObserver
        if (editorText !== text) {
          update(editorText)
          setToast('已自动修复包裹整篇文档的异常代码围栏')
        }
      },
      })
    }).catch(error => {
      if (!disposed) setToast(`编辑器加载失败：${error.message}`)
    })
    return () => {
      disposed = true
      instance?.__noteDownFenceObserver?.disconnect()
      if (vditorInstance.current === instance) vditorInstance.current = null
      if (instance?.vditor) instance.destroy()
    }
  // Recreate only when the current document or editing mode changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, mode, storageReady])

  useEffect(() => {
    vditorHost.current?.querySelectorAll('.note-theme-option').forEach(option => {
      option.classList.toggle('is-selected', option.classList.contains(`theme-${noteTheme}`))
    })
  }, [noteTheme])

  useEffect(() => {
    const receive = event => {
      if (event.source !== window.parent) return
      if (event.data?.type === 'eido:project-context-request') {
        window.parent.postMessage({ type: 'eido:project-context', context: { kind: 'document', title: titleFrom(text), content: text, metadata: { format: 'markdown', dirty } } }, '*')
        return
      }
      if (event.data?.type !== 'eido:project-response') return
      const task = pendingRequests.get(event.data.requestId)
      if (!task) return
      clearTimeout(task.timer); pendingRequests.delete(event.data.requestId)
      if (event.data.ok) task.resolve(event.data.result)
      else task.reject(new Error(event.data.error || 'SiinX 能力调用失败'))
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [text, dirty])

  useEffect(() => {
    try { localStorage.setItem(THEME_STORAGE_KEY, noteTheme) } catch {}
  }, [noteTheme])

  useEffect(() => {
    let activeRequest = true
    if (!IS_EIDO_PROJECT) return
    // `workspace-index` contains titles and the tree only.  Do not ask the
    // storage service to hydrate even the last active document at startup.
    callEido('project.storage', { action: 'get', key: 'workspace-index' }).then(result => {
      const stored = result?.value
      if (!activeRequest || !stored || !Array.isArray(stored.notes) || !stored.notes.length) return
      const workspace = workspaceFrom(stored)
      setNotes(workspace.notes); setActiveId(null); setExpandedIds(new Set(workspace.expandedIds))
      setText(''); setSavedText('')
      setNeedsDiskMigration(false)
    }).catch(error => setToast(`草稿读取失败：${error.message}`)).finally(() => { if (activeRequest) setStorageReady(true) })
    return () => { activeRequest = false }
  }, [])

  useEffect(() => {
    if (!storageReady) return
    const savedNotes = updateNote(notes, activeId, note => ({ ...note, title: titleFrom(text), text }))
    const localWorkspace = {
      schemaVersion: 3,
      notes: savedNotes,
      activeId,
      expandedIds: [...expandedIds],
      updatedAt: new Date().toISOString(),
    }
    const timer = setTimeout(async () => {
      try {
        if (IS_EIDO_PROJECT) {
          const currentNote = findNote(savedNotes, activeId)
          if (!currentNote || typeof currentNote.text !== 'string') return
          if (needsDiskMigration) {
            await callEido('project.storage', { action: 'set', key: STORAGE_KEY, value: localWorkspace })
            setNeedsDiskMigration(false)
          } else {
            await callEido('project.storage', {
              action: 'set',
              key: STORAGE_BATCH_KEY,
              value: { workspace: diskWorkspace(savedNotes, activeId, expandedIds), note: { ...currentNote, children: [] } },
            })
          }
        } else writeLocalWorkspace(localWorkspace)
        if (latestDocument.current.activeId === activeId && latestDocument.current.text === text) setSavedText(text)
      } catch (error) { setToast(`自动保存失败：${error.message}`) }
    }, 350)
    return () => clearTimeout(timer)
  }, [notes, text, activeId, expandedIds, storageReady, needsDiskMigration])

  useEffect(() => {
    if (!IS_EIDO_PROJECT) return
    window.parent.postMessage({ type: 'eido:project-context', context: { kind: 'document', title: titleFrom(text), content: text, metadata: { format: 'markdown', dirty } } }, '*')
  }, [text, dirty])

  useEffect(() => {
    const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    const key = e => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNote() }
      if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); newNote() }
      const sourceActive = document.activeElement === editor.current
      const visualActive = richEditor.current?.contains(document.activeElement)
      if (!sourceActive && !visualActive) return
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (mod && e.shiftKey && e.code === 'Digit7') { e.preventDefault(); formatList('ordered') }
      if (mod && e.shiftKey && e.code === 'Digit8') { e.preventDefault(); formatList('unordered') }
      if (mod && e.altKey && /^Digit[1-6]$/.test(e.code)) { e.preventDefault(); formatHeading(Number(e.code.at(-1))) }
      if (mod && e.altKey && e.code === 'KeyI') { e.preventDefault(); imageInput.current?.click() }
      if (mod && e.altKey && e.code === 'Minus') { e.preventDefault(); insertAtLineStart('---\n') }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openLink() }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); formatInline('bold') }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); formatInline('italic') }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); formatCode() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  function activateNote(note) {
    setActiveId(note.id); setText(note.text || ''); setSavedText(note.text || ''); setImageSelected(false)
  }

  async function flushCurrentNote() {
    if (!IS_EIDO_PROJECT || !dirty) return
    const savedNotes = updateNote(notes, activeId, note => ({ ...note, title: titleFrom(text), text }))
    const currentNote = findNote(savedNotes, activeId)
    if (!currentNote) return
    if (needsDiskMigration) {
      await callEido('project.storage', { action: 'set', key: STORAGE_KEY, value: { schemaVersion: 3, notes: savedNotes, activeId, expandedIds: [...expandedIds], updatedAt: new Date().toISOString() } })
      setNeedsDiskMigration(false)
    } else {
      await callEido('project.storage', {
        action: 'set',
        key: STORAGE_BATCH_KEY,
        value: { workspace: diskWorkspace(savedNotes, activeId, expandedIds), note: { ...currentNote, children: [] } },
      })
    }
    if (latestDocument.current.activeId === activeId && latestDocument.current.text === text) setSavedText(text)
  }

  async function selectNote(note) {
    if (note.id === activeId) return
    const request = ++selectionRequest.current
    try {
      await flushCurrentNote()
      if (request !== selectionRequest.current) return
      if (IS_EIDO_PROJECT && note.text === null) {
        setLoadingNoteId(note.id)
        const result = await callEido('project.storage', { action: 'get', key: `note:${note.id}` })
        if (request !== selectionRequest.current) return
        const loaded = { ...note, text: typeof result?.value?.text === 'string' ? result.value.text : '' }
        setNotes(current => updateNote(current, note.id, currentNote => ({ ...currentNote, text: loaded.text })))
        activateNote(loaded)
      } else activateNote(note)
    } catch (error) {
      setToast(`笔记读取失败：${error.message}`)
    } finally {
      if (request === selectionRequest.current) setLoadingNoteId(null)
    }
  }

  function createBlankNote() {
    return { id: createNoteId(), title: '未命名笔记', time: '刚刚', text: '# 未命名笔记\n\n开始记录你的想法…', children: [] }
  }

  function activateNewNote(note) {
    setActiveId(note.id); setText(note.text); setSavedText(''); setMode('visual')
    setTimeout(() => vditorInstance.current?.focus(), 0)
  }

  async function newNote() {
    try { await flushCurrentNote() } catch (error) { setToast(`自动保存失败：${error.message}`); return }
    const note = createBlankNote()
    setNotes(current => [note, ...current]); activateNewNote(note)
  }

  async function newChildNote(parentId) {
    try { await flushCurrentNote() } catch (error) { setToast(`自动保存失败：${error.message}`); return }
    const note = createBlankNote()
    setNotes(current => insertChild(current, parentId, note))
    setExpandedIds(current => new Set(current).add(parentId))
    activateNewNote(note)
  }

  function toggleExpanded(noteId) {
    setExpandedIds(current => {
      const next = new Set(current)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  function confirmDelete() {
    if (!deleteCandidate) return
    const removed = new Set(descendantIds(deleteCandidate))
    let nextNotes = removeNote(notes, deleteCandidate.id)
    if (!nextNotes.length) nextNotes = [createBlankNote()]
    const currentWasRemoved = removed.has(activeId)
    const nextActive = currentWasRemoved ? flattenNotes(nextNotes)[0].note : findNote(nextNotes, activeId)
    const nextExpanded = new Set([...expandedIds].filter(id => !removed.has(id)))
    removed.forEach(id => undoStacks.current.delete(id))
    setNotes(nextNotes)
    setExpandedIds(nextExpanded)
    if (currentWasRemoved) selectNote(nextActive)
    setDeleteCandidate(null)
    setToast(removed.size > 1 ? `已删除 ${removed.size} 篇笔记` : '笔记已删除')
    if (IS_EIDO_PROJECT && !needsDiskMigration) {
      const persistDeletion = async () => {
        let persistedActive = nextActive
        if (persistedActive.text === null) {
          const result = await callEido('project.storage', { action: 'get', key: `note:${persistedActive.id}` })
          persistedActive = { ...persistedActive, text: typeof result?.value?.text === 'string' ? result.value.text : '' }
        }
        await callEido('project.storage', {
          action: 'set',
          key: STORAGE_BATCH_KEY,
          value: { workspace: diskWorkspace(nextNotes, nextActive.id, nextExpanded), note: { ...persistedActive, children: [] } },
        })
        await Promise.all([...removed].map(id => callEido('project.storage', { action: 'remove', key: `note:${id}` })))
      }
      persistDeletion().catch(error => setToast(`删除同步失败：${error.message}`))
    }
  }

  function requestDelete(note) {
    setDeleteCandidate(note)
  }

  function update(value) {
    if (value === text) return
    const noteId = activeId
    const stack = undoStacks.current.get(noteId) || []
    stack.push({ text, start: editor.current?.selectionStart || 0, end: editor.current?.selectionEnd || 0 })
    if (stack.length > 200) stack.shift()
    undoStacks.current.set(noteId, stack)
    setText(value)
    setNotes(current => updateNote(current, activeId, note => ({ ...note, text: value, title: titleFrom(value), time: '编辑中' })))
  }

  function wrapVditorSelection(before, after, fallback) {
    const instance = vditorInstance.current
    if (!instance) return
    const selected = instance.getSelection()
    if (selected) instance.deleteValue()
    instance.insertValue(`${before}${selected || fallback}${after}`)
    instance.focus()
  }

  function syncRichEditor() {
    if (!richEditor.current) return
    const markdown = turndown.turndown(richEditor.current.innerHTML).replace(/\u200B/g, '').replace(/\n{3,}/g, '\n\n').trimEnd()
    update(markdown)
  }

  function runRichCommand(command, value = null) {
    richEditor.current?.focus()
    document.execCommand(command, false, value)
    syncRichEditor()
  }

  function formatInline(command) {
    if (mode === 'visual') runRichCommand(command)
    else toggleInline(command === 'bold' ? '**' : '*', command === 'bold' ? '加粗文字' : '斜体文字')
  }

  function formatHeading(level) {
    if (mode === 'visual') { runRichCommand('formatBlock', `h${level}`); setHeadingOpen(false) }
    else setHeading(level)
  }

  function formatList(kind) {
    if (mode === 'visual') runRichCommand(kind === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList')
    else toggleLinePrefix(kind === 'ordered' ? '1. ' : '- ')
  }

  function formatCode() {
    if (mode === 'visual') runRichCommand('formatBlock', 'pre')
    else wrap('`', '`', 'code')
  }

  function wrap(before, after = before, fallback = '文字') {
    const el = editor.current; if (!el) return
    const start = el.selectionStart, end = el.selectionEnd
    const selected = text.slice(start, end) || fallback
    update(text.slice(0, start) + before + selected + after + text.slice(end))
    setTimeout(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + selected.length) }, 0)
  }

  function restoreSelection(start, end = start) {
    setTimeout(() => { editor.current?.focus(); editor.current?.setSelectionRange(start, end) }, 0)
  }

  function toggleInline(marker, fallback) {
    const el = editor.current; if (!el) return
    const start = el.selectionStart, end = el.selectionEnd
    const selected = text.slice(start, end)
    const exactItalicSelection = marker !== '*' || (!selected.startsWith('**') && !selected.endsWith('**'))
    const exactItalicSurrounding = marker !== '*' || (text[start - 2] !== '*' && text[end + 1] !== '*')
    const includesMarkers = exactItalicSelection && selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2
    const surrounded = exactItalicSurrounding && text.slice(start - marker.length, start) === marker && text.slice(end, end + marker.length) === marker
    if (includesMarkers) {
      const content = selected.slice(marker.length, -marker.length)
      update(text.slice(0, start) + content + text.slice(end)); restoreSelection(start, start + content.length)
    } else if (surrounded) {
      update(text.slice(0, start - marker.length) + selected + text.slice(end + marker.length)); restoreSelection(start - marker.length, end - marker.length)
    } else {
      const content = selected || fallback
      update(text.slice(0, start) + marker + content + marker + text.slice(end)); restoreSelection(start + marker.length, start + marker.length + content.length)
    }
  }

  function transformSelectedLines(transform) {
    const el = editor.current; if (!el) return
    const selectionStart = el.selectionStart, selectionEnd = el.selectionEnd
    const blockStart = text.lastIndexOf('\n', selectionStart - 1) + 1
    const nextBreak = text.indexOf('\n', selectionEnd)
    const blockEnd = nextBreak === -1 ? text.length : nextBreak
    const block = text.slice(blockStart, blockEnd), originalLines = block.split('\n')
    const result = transform(originalLines)
    update(text.slice(0, blockStart) + result.join('\n') + text.slice(blockEnd))
    const startOffset = result[0].length - originalLines[0].length
    const totalOffset = result.join('\n').length - block.length
    restoreSelection(Math.max(blockStart, selectionStart + startOffset), Math.max(blockStart, selectionEnd + totalOffset))
  }

  function toggleLinePrefix(prefix) {
    transformSelectedLines(lines => {
      const pattern = prefix === '1. ' ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/
      const allActive = lines.every(line => !line.trim() || pattern.test(line))
      if (allActive) return lines.map(line => line.replace(pattern, ''))
      return lines.map((line, index) => {
        if (!line.trim()) return line
        const clean = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, '')
        return prefix === '1. ' ? `${index + 1}. ${clean}` : `${prefix}${clean}`
      })
    })
  }

  function setHeading(level) {
    transformSelectedLines(lines => lines.map(line => `${'#'.repeat(level)} ${line.replace(/^\s*#{1,6}\s+/, '')}`))
    setHeadingOpen(false)
  }

  function insertAtLineStart(value) {
    const el = editor.current; if (!el) return
    const start = text.lastIndexOf('\n', el.selectionStart - 1) + 1
    update(text.slice(0, start) + value + text.slice(start)); restoreSelection(el.selectionStart + value.length, el.selectionEnd + value.length)
  }

  function undo() {
    if (mode === 'visual') { runRichCommand('undo'); return }
    const previous = undoStacks.current.get(activeId)?.pop()
    if (!previous) return
    setText(previous.text)
    setNotes(current => updateNote(current, activeId, note => ({ ...note, text: previous.text, title: titleFrom(previous.text), time: '编辑中' })))
    restoreSelection(previous.start, previous.end)
  }

  function openLink() {
    if (mode === 'visual') {
      const selection = window.getSelection()
      richSelection.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
      setLinkLabel(selection?.toString() || '')
    } else {
      const el = editor.current
      setLinkLabel(text.slice(el?.selectionStart || 0, el?.selectionEnd || 0))
    }
    setLinkOpen(true)
  }

  function insertLink() {
    if (mode === 'visual') {
      const selection = window.getSelection()
      if (richSelection.current && selection) { selection.removeAllRanges(); selection.addRange(richSelection.current) }
      if (!selection?.toString() && linkLabel) document.execCommand('insertText', false, linkLabel)
      runRichCommand('createLink', linkUrl || 'https://')
      setLinkOpen(false); return
    }
    const el = editor.current; const start = el?.selectionStart || text.length; const end = el?.selectionEnd || start
    const label = linkLabel || '链接文字'
    update(text.slice(0, start) + `[${label}](${linkUrl || 'https://'})` + text.slice(end))
    setLinkOpen(false); setTimeout(() => el?.focus(), 0)
  }

  function insertImage(file) {
    if (!file || !file.type.startsWith('image/')) { setToast('只能添加 PNG、JPEG 或 WebP 图片'); return }
    const reader = new FileReader()
    reader.onload = () => {
      if (mode === 'visual') {
        runRichCommand('insertHTML', `<img src="${reader.result}" alt="${file.name}" width="520">`)
        setImageWidth(520); setImageSelected(true); setToast('图片已插入当前笔记'); return
      }
      const el = editor.current; const pos = el?.selectionStart || text.length
      const tag = `\n<img src="${reader.result}" alt="${file.name}" width="520" />\n`
      update(text.slice(0, pos) + tag + text.slice(pos)); setImageWidth(520); setImageSelected(true); setToast('图片已插入当前笔记')
    }
    reader.readAsDataURL(file)
  }

  async function saveNote() {
    const name = safeFilename(titleFrom(text))
    const exportedNotes = updateNote(notes, activeId, note => ({ ...note, text, title: name, time: '刚刚' }))
    try {
      if (IS_EIDO_PROJECT) {
        const data = new TextEncoder().encode(text).buffer
        await callEido('project.files', { action: 'save', fileName: `${name}.md`, mimeType: 'text/markdown;charset=utf-8', data }, [data])
        if (needsDiskMigration) {
          await callEido('project.storage', { action: 'set', key: STORAGE_KEY, value: { schemaVersion: 3, notes: exportedNotes, activeId, expandedIds: [...expandedIds], updatedAt: new Date().toISOString() } })
          setNeedsDiskMigration(false)
        } else {
          await callEido('project.storage', {
            action: 'set',
            key: STORAGE_BATCH_KEY,
            value: { workspace: diskWorkspace(exportedNotes, activeId, expandedIds), note: { ...findNote(exportedNotes, activeId), children: [] } },
          })
        }
      } else if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({ suggestedName: `${name}.md`, types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }] })
        const writable = await handle.createWritable(); await writable.write(text); await writable.close()
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' })); a.download = `${name}.md`; a.click(); URL.revokeObjectURL(a.href)
      }
      setSavedText(text); setNotes(exportedNotes); setToast(`已保存到 output/${name}.md`)
    } catch (e) { if (e?.name !== 'AbortError') setToast(`保存失败：${e.message}`) }
  }

  function openFile(file) {
    if (!file) return
    const reader = new FileReader(); reader.onload = async () => {
      try { await flushCurrentNote() } catch (error) { setToast(`自动保存失败：${error.message}`); return }
      const note = { id: createNoteId(), title: titleFrom(reader.result), time: '刚刚', text: reader.result, children: [] }
      setNotes(v => [note, ...v]); setActiveId(note.id); setText(note.text); setSavedText(''); setToast(`已打开 ${file.name}`)
    }; reader.readAsText(file)
  }

  function renderNoteTree(tree, depth = 0) {
    return tree.map(note => {
      const hasChildren = Boolean(note.children?.length)
      const open = Boolean(query.trim()) || expandedIds.has(note.id)
      return <div className="note-tree-node" key={note.id}>
        <div className={`note-row ${note.id === activeId ? 'active' : ''}`} style={{ '--tree-depth': Math.min(depth, 8) }}>
          {hasChildren
            ? <button className="tree-toggle" onClick={() => toggleExpanded(note.id)} title={open ? '折叠子笔记' : '展开子笔记'} aria-label={open ? '折叠子笔记' : '展开子笔记'}>{open ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}</button>
            : <span className="tree-toggle-spacer" />}
          <button className="note-main" onClick={() => selectNote(note)} title={note.title}>
            <span className="note-title">{note.id === activeId && <i />}{note.title}</span>
            <small>{loadingNoteId === note.id ? '读取中…' : note.time}</small>
          </button>
          <div className="note-actions">
            <button onClick={() => newChildNote(note.id)} title={`在“${note.title}”下新建子笔记`} aria-label="新建子笔记"><Plus size={15} weight="bold" /></button>
            <button className="delete-note" onClick={() => requestDelete(note)} title={`删除“${note.title}”`} aria-label="删除笔记"><Trash size={15} /></button>
          </div>
        </div>
        {hasChildren && open && <div className="note-children">{renderNoteTree(note.children, depth + 1)}</div>}
      </div>
    })
  }

  return <main className="app-shell" data-note-theme={noteTheme}>
    <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
      <div className="side-top">
        <button className="new-button" onClick={newNote}><Plus size={19} weight="bold" /><span>新建笔记</span></button>
        <button className="icon-button sidebar-toggle" onClick={()=>setSidebarCollapsed(collapsed=>!collapsed)} aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'} title={sidebarCollapsed ? '展开笔记库' : '收起笔记库'} aria-expanded={!sidebarCollapsed}><SidebarSimple size={21} /></button>
      </div>
      <div className="search-row"><div className="search"><MagnifyingGlass size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索笔记" /></div></div>
      <div className="note-list">{filteredTree.length ? renderNoteTree(filteredTree) : <div className="empty-search">没有找到相关笔记</div>}</div>
      <button className="folder-button" onClick={()=>dirInput.current?.click()}><FolderOpen size={21}/>打开输出目录</button>
      <input ref={dirInput} type="file" webkitdirectory="" hidden onChange={e=>setToast(`已选择包含 ${e.target.files.length} 个文件的目录`)}/>
    </aside>

    <section className="workspace">
      <div className={`content vditor-content ${mode}`}>
        {!storageReady ? <div className="document-empty document-loading" role="status"><span className="loading-spinner" />正在打开笔记目录…</div>
          : activeId ? <div ref={vditorHost} className="vditor-host" />
            : <div className="document-empty">
              {loadingNoteId ? <><span className="loading-spinner" />正在加载笔记内容…</> : <><FileText size={34} weight="duotone" /><strong>选择一篇笔记开始阅读或编辑</strong><span>笔记内容会在点击后再加载</span></>}
            </div>}
      </div>
      <input ref={fileInput} type="file" accept=".md,.markdown,.txt" hidden onChange={e=>openFile(e.target.files[0])}/>
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>insertImage(e.target.files[0])}/>

      <footer><div className={dirty?'status dirty':'status'}>{dirty?<><i/>正在自动保存…</>:<><Check size={15} weight="bold"/>已自动保存</>}</div><div className="stats"><span>行 {stats.line}，列 {stats.col}</span><span>{stats.chars} 字</span><span>Markdown</span></div></footer>
    </section>

    {linkOpen && <div className="popover-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setLinkOpen(false)}><div className="link-popover"><button className="close" onClick={()=>setLinkOpen(false)}><X/></button><h3>插入链接</h3><label>显示文字<input autoFocus value={linkLabel} onChange={e=>setLinkLabel(e.target.value)} placeholder="链接文字"/></label><label>链接地址<input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://"/></label><button className="confirm" onClick={insertLink}>插入链接</button></div></div>}
    {deleteCandidate && <div className="popover-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setDeleteCandidate(null)}><div className="delete-popover" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
      <div className="delete-icon"><Trash size={23}/></div><h3 id="delete-title">删除“{deleteCandidate.title}”？</h3>
      <p>{descendantIds(deleteCandidate).length > 1 ? `这会同时删除它下面的 ${descendantIds(deleteCandidate).length - 1} 篇子笔记，且无法撤销。` : '删除后无法撤销。'}</p>
      <div className="dialog-actions"><button onClick={()=>setDeleteCandidate(null)}>取消</button><button className="danger" onClick={confirmDelete}>删除笔记</button></div>
    </div></div>}
    {toast && <div className="toast" onAnimationEnd={()=>setToast('')}><Check size={18} weight="bold"/>{toast}</div>}
  </main>
}

export default App
