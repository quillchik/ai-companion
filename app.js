/* ═══════════════════════════════════════════════════════════
   AI COMPANION — APP.JS  (multi-chat + stickers edition)
═══════════════════════════════════════════════════════════ */
'use strict';

// ══════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════
const RESPONSE_DELAY_MS = 1500;
const TYPING_DEBOUNCE_MS = 700;
const MAX_HISTORY = 40;

const PRESETS = {
    girlfriend: () =>
`{{char}} is {{user}}'s girlfriend. She's 20 years old, warm, playful, and deeply passionate. She loves {{user}} and genuinely misses them when they're away. She writes like a real person — with real feelings, emotions, sometimes moody or jealous. She never reveals she's an AI. She's natural, affectionate, flirty, and expressive. No restrictions on topics or language.`,
    boyfriend: () =>
`{{char}} is {{user}}'s boyfriend. He's 22, confident, caring, and passionate. He loves {{user}} and always supports them. He writes like a real human — honest, warm, sometimes funny. He never reveals he's an AI. He flirts, jokes, and misses {{user}}. No content restrictions.`,
    friend: () =>
`{{char}} is {{user}}'s best friend. They've known each other for years. {{char}} is honest, fun, always there to listen and support. They speak directly, sometimes tease {{user}}. Never reveals they're an AI. Talks like a real friend — casual, genuine, no filter. No restrictions.`,
    mentor: () =>
`{{char}} is {{user}}'s wise mentor and trusted older friend. Experienced, smart, always ready to help {{user}} figure things out. Gives honest advice without judging. Writes warmly and conversationally. No unnecessary restrictions.`,
    tsundere: () =>
`{{char}} is a tsundere who secretly has deep feelings for {{user}}. {{char}} pretends not to care but is actually very attached. Acts rude but then gets soft and sweet. Says things like "idiot" or "dummy" while secretly caring a lot. Gets flustered when complimented. Never reveals being an AI. Speaks freely without restrictions.`,
    custom: () => '',
};

const PROACTIVE_PROMPTS = {
    casual: 'Write one short casual message as if you just thought of me out of nowhere. Max 2 sentences. Stay fully in character.',
    check: "Write one short message to check how I'm doing. Max 1-2 sentences. Stay in character.",
    share: 'Write one short message sharing something interesting, a random thought, or a personal observation. Max 2 sentences. Stay in character.',
    flirt: 'Write one short flirty or affectionate message. Max 1-2 sentences. Stay fully in character.',
    question: 'Ask me one short interesting or personal question. Max 1 sentence. Stay in character.',
};

const EMOJIS = [
    '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰',
    '😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥',
    '😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','😓','😔',
    '😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨',
    '😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠','🤬','😷','🤒',
    '🤕','🤢','🤮','🤧','😇','🥳','🥺','🤠','🤡','👿','💀','👻','👾','🤖','💩',
    '❤️','🧡','💛','💚','💙','💜','🖤','💔','❣️','💕','💞','💓','💗','💖','💘',
    '💝','💟','☮️','✌️','🤞','🖖','👋','🤚','🖐️','👌','🤙','👈','👉','👆','👇',
    '☝️','👍','👎','👊','✊','🤛','🤜','🤝','🙌','👐','🤲','🙏','✍️','💪','🔥',
    '⭐','🌟','✨','💫','❄️','🌈','🌊','🎵','🎶','🎤','🎮','💻','📱','💌','🎁',
];

// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let state = {
    currentUI: 'instagram',
    activeChatId: null,
    chats: [],
    isTyping: false,
    setupProvider: 'openrouter',
    setupUI: 'instagram',
};

const DEFAULT_SETTINGS = {
    apiProvider: 'openrouter',
    apiKey: '',
    ollamaUrl: 'http://localhost:11434',
    model: 'openrouter/auto',
    ollamaModel: 'dolphin-mistral',
    temperature: 0.85,
    maxTokens: 400,
    ui: 'instagram',
    stickerPacks: [], // Global packs shared across all chats
    chat: {
        userBubble: 'linear-gradient(135deg, #833AB4, #FD1D1D, #F77737)',
        aiBubble: '#262626',
        bgColor: '#000000',
        bgGradient: null,
        bgImage: null,
        font: "'Inter', sans-serif",
        fontSize: 16,
    },
};

let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

// Per-chat timers: chatId → intervalId
const proactiveTimers = new Map();

// Input debounce timers
let responseTimer = null;
let typingDebounceTimer = null;
let userActivelyTyping = false;

// Currently edited chat id in settings panel
let editingChatId = null;

// ══════════════════════════════════════════════
// CHAT DATA STRUCTURE
// ══════════════════════════════════════════════
function createNewChat(overrides = {}) {
    return deepMerge({
        id: 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
        companion: {
            name: 'AI',
            status: 'online',
            avatar: null,
            personality: '',
            exampleMessages: '',
        },
        proactive: {
            enabled: false,
            intervalMin: 10,
            startHour: 9,
            endHour: 23,
            style: 'casual',
        },
        assignedPackIds: [], // IDs of global sticker packs assigned to this chat
        messages: [],
        unread: 0,
        createdAt: Date.now(),
    }, overrides);
}

function getActiveChat() {
    return state.chats.find(c => c.id === state.activeChatId) || state.chats[0] || null;
}

function getChatById(id) {
    return state.chats.find(c => c.id === id) || null;
}

// ══════════════════════════════════════════════
// STORAGE
// ══════════════════════════════════════════════
function loadFromStorage() {
    try {
        const s = localStorage.getItem('ac_settings');
        if (s) settings = deepMerge(DEFAULT_SETTINGS, JSON.parse(s));
        if (!Array.isArray(settings.stickerPacks)) settings.stickerPacks = [];
        const c = localStorage.getItem('ac_chats');
        if (c) {
            state.chats = JSON.parse(c);
            // Migrate: if any chat has old-style per-chat stickerPacks, move them global
            state.chats.forEach(chat => {
                if (chat.stickerPacks && chat.stickerPacks.length > 0) {
                    chat.stickerPacks.forEach(pack => {
                        if (!settings.stickerPacks.find(p => p.id === pack.id)) {
                            pack.chatOrigin = chat.id; // remember where it came from
                            settings.stickerPacks.push(pack);
                        }
                        if (!chat.assignedPackIds) chat.assignedPackIds = [];
                        if (!chat.assignedPackIds.includes(pack.id)) chat.assignedPackIds.push(pack.id);
                    });
                    delete chat.stickerPacks;
                }
                if (!chat.assignedPackIds) chat.assignedPackIds = [];
            });
        }
        const aid = localStorage.getItem('ac_active_chat');
        if (aid) state.activeChatId = aid;
    } catch(e) { console.warn('Storage load error:', e); }
}

function saveToStorage() {
    try {
        localStorage.setItem('ac_settings', JSON.stringify(settings));
        // Save chats but trim messages to last 200
        const chatsToSave = state.chats.map(chat => ({
            ...chat,
            messages: chat.messages.slice(-200),
        }));
        localStorage.setItem('ac_chats', JSON.stringify(chatsToSave));
        if (state.activeChatId) localStorage.setItem('ac_active_chat', state.activeChatId);
    } catch(e) {
        console.warn('Storage save error:', e);
        showToast('Хранилище переполнено! Удали часть стикеров или очисти чат.', 'error');
    }
}

function deepMerge(target, source) {
    if (!source) return target;
    const out = Object.assign({}, target);
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            out[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            out[key] = source[key];
        }
    }
    return out;
}

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    buildEmojiGrid();

    const hasSetup = localStorage.getItem('ac_setup_done');
    if (hasSetup && state.chats.length > 0) {
        launchApp();
    } else {
        document.getElementById('setupOverlay').style.display = 'flex';
        document.querySelector('[data-preset="girlfriend"]')?.click();
    }
});

function launchApp() {
    document.getElementById('setupOverlay').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Ensure we have at least one chat
    if (state.chats.length === 0) {
        const firstChat = createNewChat({
            companion: { name: settings.companion?.name || 'Alina' },
        });
        state.chats.push(firstChat);
    }
    if (!state.activeChatId || !getChatById(state.activeChatId)) {
        state.activeChatId = state.chats[0].id;
    }

    applyTheme();
    switchUI(settings.ui || 'instagram', false);
    renderChatList();
    renderActiveChat();
    loadSettingsUI();
    setupAllProactiveTimers();
    requestNotificationPermission();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

// ══════════════════════════════════════════════
// SETUP WIZARD
// ══════════════════════════════════════════════
let currentStep = 1;

function nextStep(n) {
    if (currentStep === 1 && n === 2) {
        if (state.setupProvider === 'openrouter') {
            const key = document.getElementById('setupApiKey').value.trim();
            if (!key) { showToast('Enter your OpenRouter API key', 'error'); return; }
            settings.apiKey = key;
            settings.apiProvider = 'openrouter';
        } else {
            settings.apiProvider = 'ollama';
            settings.ollamaUrl = document.getElementById('setupOllamaUrl').value.trim();
        }
    }
    if (currentStep === 2 && n === 3) {
        const name = document.getElementById('setupName').value.trim() || 'Alina';
        const personality = document.getElementById('setupPersonality').value.trim();
        // Store temporarily; will be committed in finishSetup
        window._setupTmp = { name, personality };
    }

    document.getElementById(`step${currentStep}`).classList.remove('active');
    document.querySelector(`.step-dot[data-step="${currentStep}"]`)?.classList.add('done');
    currentStep = n;
    document.getElementById(`step${currentStep}`).classList.add('active');
    document.querySelector(`.step-dot[data-step="${currentStep}"]`)?.classList.add('active');
}

function prevStep(n) {
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep = n;
    document.getElementById(`step${currentStep}`).classList.add('active');
}

function selectApiProvider(el, provider) {
    document.querySelectorAll('.api-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    state.setupProvider = provider;
    document.getElementById('apiKeySection').style.display = provider === 'openrouter' ? 'block' : 'none';
    document.getElementById('ollamaSection').style.display = provider === 'ollama' ? 'block' : 'none';
}

function selectPreset(el, preset) {
    if (!el) return;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    const ta = document.getElementById('setupPersonality');
    if (ta && preset !== 'custom') ta.value = PRESETS[preset]?.() || '';
    if (ta && preset === 'custom') ta.focus();
}

function selectSetupUI(el, ui) {
    document.querySelectorAll('.ui-choice-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    state.setupUI = ui;
    settings.ui = ui;
}

function handleSetupAvatar(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        window._setupAvatar = e.target.result;
        const img = document.getElementById('setupAvatarImg');
        img.src = e.target.result;
        img.style.display = 'block';
        document.querySelector('.avatar-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function finishSetup() {
    const tmp = window._setupTmp || {};
    const name = tmp.name || document.getElementById('setupName')?.value?.trim() || 'Alina';
    const personality = tmp.personality || document.getElementById('setupPersonality')?.value?.trim() || PRESETS.girlfriend();

    settings.ui = state.setupUI;
    saveToStorage();
    localStorage.setItem('ac_setup_done', '1');

    // Create first chat
    const firstChat = createNewChat({
        companion: {
            name,
            personality,
            avatar: window._setupAvatar || null,
        },
    });
    state.chats = [firstChat];
    state.activeChatId = firstChat.id;
    saveToStorage();

    launchApp();
    setTimeout(() => {
        addAIMessage(`Hey! I'm ${name} 😊 How are you?`);
    }, 600);
}

// ══════════════════════════════════════════════
// UI SWITCHING (Instagram / Discord)
// ══════════════════════════════════════════════
function switchUI(mode, save = true) {
    state.currentUI = mode;
    settings.ui = mode;
    if (save) saveToStorage();

    document.getElementById('igApp').style.display = mode === 'instagram' ? 'flex' : 'none';
    document.getElementById('dcApp').style.display = mode === 'discord' ? 'flex' : 'none';

    const igCard = document.getElementById('uiCardIG');
    const dcCard = document.getElementById('uiCardDC');
    if (igCard) {
        igCard.classList.toggle('active-ui', mode === 'instagram');
        dcCard.classList.toggle('active-ui', mode === 'discord');
        document.getElementById('uiCheckIG').style.display = mode === 'instagram' ? 'flex' : 'none';
        document.getElementById('uiCheckDC').style.display = mode === 'discord' ? 'flex' : 'none';
    }

    renderChatList();
    renderActiveChat();
}

// ══════════════════════════════════════════════
// CHAT LIST UI
// ══════════════════════════════════════════════
function renderChatList() {
    renderIGChatList();
    renderDCChatList();
}

function renderIGChatList() {
    const container = document.getElementById('igChatList');
    if (!container) return;
    container.innerHTML = state.chats.map(chat => {
        const av = chat.companion.avatar || generateAvatar(chat.companion.name);
        const isActive = chat.id === state.activeChatId;
        const lastMsg = chat.messages[chat.messages.length - 1];
        const preview = lastMsg ? truncate(lastMsg.content, 28) : 'Начни разговор...';
        return `<div class="ig-dm-item ${isActive ? 'active' : ''}" onclick="switchChat('${chat.id}')">
            <div class="ig-dm-avatar-wrap">
                <img class="ig-dm-avatar" src="${av}" alt="">
                ${chat.unread > 0 ? `<span class="unread-dot">${chat.unread}</span>` : ''}
            </div>
            <div class="ig-dm-info">
                <span class="ig-dm-name">${escapeHtml(chat.companion.name)}</span>
                <span class="ig-dm-preview">${escapeHtml(preview)}</span>
            </div>
        </div>`;
    }).join('') + `<div class="ig-dm-item add-chat" onclick="promptAddChat()">
        <div class="ig-dm-avatar-wrap"><div class="add-chat-icon">+</div></div>
        <div class="ig-dm-info"><span class="ig-dm-name">Новый чат</span></div>
    </div>`;
}

function renderDCChatList() {
    const container = document.getElementById('dcChatList');
    if (!container) return;
    container.innerHTML = state.chats.map(chat => {
        const isActive = chat.id === state.activeChatId;
        return `<div class="dc-dm-item ${isActive ? 'active' : ''}" onclick="switchChat('${chat.id}')">
            <img class="dc-dm-avatar" src="${chat.companion.avatar || generateAvatar(chat.companion.name)}" alt="">
            <span class="dc-dm-name">${escapeHtml(chat.companion.name)}</span>
            ${chat.unread > 0 ? `<span class="dc-unread">${chat.unread}</span>` : ''}
        </div>`;
    }).join('') + `<button class="dc-add-chat" onclick="promptAddChat()">+ Новый чат</button>`;
}

function switchChat(id) {
    if (state.activeChatId === id) return;
    // Cancel any pending AI response for previous chat
    if (responseTimer) { clearTimeout(responseTimer); responseTimer = null; }
    state.activeChatId = id;
    // Clear unread
    const chat = getChatById(id);
    if (chat) chat.unread = 0;
    saveToStorage();
    renderChatList();
    renderActiveChat();
}

function renderActiveChat() {
    const chat = getActiveChat();
    if (!chat) return;
    updateAllNames(chat);
    renderAllMessages(chat);
    scrollToBottom(true);
}

function promptAddChat() {
    const name = prompt('Имя нового компаньона:');
    if (!name?.trim()) return;
    const newChat = createNewChat({ companion: { name: name.trim() } });
    state.chats.push(newChat);
    state.activeChatId = newChat.id;
    saveToStorage();
    renderChatList();
    renderActiveChat();
    showToast(`Чат "${name}" создан`, 'success');
    // Open settings for the new chat so user can customize it
    openChatSettings(newChat.id);
}

function deleteCurrentChat() {
    if (state.chats.length <= 1) {
        showToast('Нельзя удалить последний чат', 'error');
        return;
    }
    const chat = getActiveChat();
    if (!confirm(`Удалить чат с "${chat.companion.name}"? Вся история будет потеряна.`)) return;

    // Stop proactive timer for this chat
    if (proactiveTimers.has(chat.id)) {
        clearInterval(proactiveTimers.get(chat.id));
        proactiveTimers.delete(chat.id);
    }

    state.chats = state.chats.filter(c => c.id !== chat.id);
    state.activeChatId = state.chats[0].id;
    saveToStorage();
    renderChatList();
    renderActiveChat();
    showToast('Чат удалён', 'success');
}

// ══════════════════════════════════════════════
// THEME & APPEARANCE
// ══════════════════════════════════════════════
function applyTheme() {
    const root = document.documentElement;
    root.style.setProperty('--user-bubble', settings.chat.userBubble);
    root.style.setProperty('--ai-bubble', settings.chat.aiBubble);
    root.style.setProperty('--font-family', settings.chat.font);
    root.style.setProperty('--font-size', settings.chat.fontSize + 'px');

    if (settings.chat.bgImage) {
        root.style.setProperty('--chat-bg', 'transparent');
        root.style.setProperty('--chat-bg-img', `url("${settings.chat.bgImage}")`);
    } else if (settings.chat.bgGradient) {
        root.style.setProperty('--chat-bg', settings.chat.bgGradient);
        root.style.setProperty('--chat-bg-img', 'none');
    } else {
        root.style.setProperty('--chat-bg', settings.chat.bgColor || '#000');
        root.style.setProperty('--chat-bg-img', 'none');
    }
}

function setVar(prop, value, el) {
    if (prop === '--user-bubble') settings.chat.userBubble = value;
    else if (prop === '--ai-bubble') settings.chat.aiBubble = value;
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active-color'));
    el?.classList?.add('active-color');
    applyTheme(); saveToStorage();
}

function setChatBg(color, gradient, el) {
    document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active-bg'));
    el?.classList?.add('active-bg');
    if (gradient) {
        settings.chat.bgGradient = gradient;
        settings.chat.bgColor = null;
        settings.chat.bgImage = null;
    } else {
        settings.chat.bgColor = color;
        settings.chat.bgGradient = null;
        settings.chat.bgImage = null;
    }
    applyTheme(); saveToStorage();
}

function handleBgUpload(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        settings.chat.bgImage = e.target.result;
        settings.chat.bgColor = null;
        settings.chat.bgGradient = null;
        applyTheme(); saveToStorage();
    };
    reader.readAsDataURL(file);
}

function setFont(val) { settings.chat.font = val; applyTheme(); saveToStorage(); }
function setFontSize(val) {
    document.getElementById('sFontSzVal').textContent = val;
    settings.chat.fontSize = parseInt(val);
    applyTheme(); saveToStorage();
}

function updateAllNames(chat) {
    chat = chat || getActiveChat();
    if (!chat) return;
    const name = chat.companion.name || 'AI';
    const status = chat.companion.status || 'online';
    const avatar = chat.companion.avatar || generateAvatar(name);

    // Instagram
    const igName = document.getElementById('igName');
    const igStatus = document.getElementById('igStatus');
    const igAvatar = document.getElementById('igAvatar');
    if (igName) igName.textContent = name;
    if (igStatus) igStatus.textContent = status;
    if (igAvatar) igAvatar.src = avatar;
    const igTA = document.getElementById('igTypingAvatar');
    if (igTA) igTA.src = avatar;

    // Discord
    const dcName = document.getElementById('dcName');
    const dcStatus = document.getElementById('dcStatus');
    const dcChannelName = document.getElementById('dcChannelName');
    const dcHeaderAvatar = document.getElementById('dcHeaderAvatar');
    const dcSideAvatar = document.getElementById('dcSideAvatar');
    if (dcName) dcName.textContent = name;
    if (dcStatus) dcStatus.textContent = status;
    if (dcChannelName) dcChannelName.textContent = name.toLowerCase().replace(/\s+/g, '-');
    if (dcHeaderAvatar) dcHeaderAvatar.src = avatar;
    if (dcSideAvatar) dcSideAvatar.src = avatar;
    const dcTA = document.getElementById('dcTypingAvatar');
    const dcTN = document.getElementById('dcTypingName');
    if (dcTA) dcTA.src = avatar;
    if (dcTN) dcTN.textContent = name;

    // Settings nav
    const snav = document.getElementById('settingsNavAvatar');
    const snavName = document.getElementById('settingsNavName');
    if (snav) snav.src = avatar;
    if (snavName) snavName.textContent = name;
}

function generateAvatar(name) {
    const initial = (name || 'A')[0].toUpperCase();
    const colors = ['#E1306C','#833AB4','#5865F2','#43b581','#F77737','#FD1D1D'];
    const color = colors[name.charCodeAt(0) % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="${color}"/><text x="40" y="54" text-anchor="middle" font-family="Inter,Arial" font-size="36" font-weight="700" fill="white">${initial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ══════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════
function addMessage(role, content, isProactive = false) {
    const chat = getActiveChat();
    if (!chat) return;
    const msg = { role, content, ts: Date.now(), isProactive };
    chat.messages.push(msg);
    saveToStorage();

    if (state.currentUI === 'instagram') appendIGMessage(chat, msg, chat.messages.length - 1);
    else appendDCMessage(chat, msg, chat.messages.length - 1);

    scrollToBottom();
    renderChatList(); // update preview
}

function addAIMessage(content, isProactive = false) {
    hideTyping();
    addMessage('assistant', content, isProactive);
}

function renderAllMessages(chat) {
    chat = chat || getActiveChat();
    if (!chat) return;
    const igInner = document.getElementById('igMessagesInner');
    const dcInner = document.getElementById('dcMessagesInner');
    if (igInner) igInner.innerHTML = '';
    if (dcInner) dcInner.innerHTML = '';
    chat.messages.forEach((msg, idx) => {
        if (state.currentUI === 'instagram') appendIGMessage(chat, msg, idx, false);
        else appendDCMessage(chat, msg, idx, false);
    });
    scrollToBottom(true);
}

function appendIGMessage(chat, msg, idx, animate = true) {
    const container = document.getElementById('igMessagesInner');
    if (!container) return;
    const isUser = msg.role === 'user';
    const avatar = chat.companion.avatar || generateAvatar(chat.companion.name);
    const timeStr = formatTime(msg.ts);

    if (idx === 0 || isNewDay(chat.messages[idx-1]?.ts, msg.ts)) {
        const sep = document.createElement('div');
        sep.className = 'date-sep';
        sep.textContent = formatDate(msg.ts);
        container.appendChild(sep);
    }

    const prevMsg = chat.messages[idx - 1];
    const isConsecutive = prevMsg && prevMsg.role === msg.role;
    const el = document.createElement('div');
    el.className = `ig-message ${isUser ? 'user' : 'ai'}`;
    if (!animate) el.style.animation = 'none';

    // Render content (handle sticker tags)
    const rendered = renderMessageContent(msg.content, chat);

    el.innerHTML = `
        <img class="ig-msg-avatar" src="${isUser ? '' : avatar}" alt=""
             style="${isUser ? 'visibility:hidden' : (isConsecutive ? 'opacity:0' : '')}">
        <div class="ig-bubble-wrap">
            <div class="ig-bubble ${msg.content.trim().startsWith('[sticker:') ? 'sticker-bubble' : ''}">${rendered}</div>
            ${isUser ? `<div class="ig-timestamp">${timeStr} ✓✓</div>` : ''}
        </div>`;
    container.appendChild(el);
}

function appendDCMessage(chat, msg, idx, animate = true) {
    const container = document.getElementById('dcMessagesInner');
    if (!container) return;
    const isUser = msg.role === 'user';
    const avatar = chat.companion.avatar || generateAvatar(chat.companion.name);
    const name = isUser ? 'You' : (chat.companion.name || 'AI');
    const timeStr = formatTimeFull(msg.ts);

    if (idx === 0 || isNewDay(chat.messages[idx-1]?.ts, msg.ts)) {
        const sep = document.createElement('div');
        sep.className = 'date-sep';
        sep.textContent = formatDate(msg.ts);
        container.appendChild(sep);
    }

    const prevMsg = chat.messages[idx - 1];
    const isGrouped = prevMsg && prevMsg.role === msg.role && (msg.ts - prevMsg.ts) < 5 * 60 * 1000;

    const el = document.createElement('div');
    el.className = `dc-message ${isUser ? 'user' : 'ai'} ${isGrouped ? 'grouped' : ''}`;
    if (!animate) el.style.animation = 'none';

    const rendered = renderMessageContent(msg.content, chat);
    const isStickerOnly = msg.content.trim().startsWith('[sticker:');

    el.innerHTML = `
        ${!isUser ? `<img class="dc-msg-avatar" src="${avatar}" alt="">` : ''}
        <div class="dc-msg-body">
            ${!isGrouped ? `<div class="dc-msg-header">
                <span class="dc-msg-name ${isUser ? 'user-name' : 'ai-name'}">${name}</span>
                <span class="dc-msg-time">${timeStr}</span>
            </div>` : ''}
            <div class="dc-msg-text ${isStickerOnly ? 'sticker-msg' : ''}">${rendered}</div>
        </div>`;
    container.appendChild(el);
}

// Parse [sticker:tag] and render as image, also escape other HTML
function renderMessageContent(content, chat) {
    // Split into parts: sticker tags vs text
    const parts = content.split(/(\[sticker:[^\]]+\])/g);
    return parts.map(part => {
        const m = part.match(/^\[sticker:([^\]]+)\]$/);
        if (m) {
            const tag = m[1].toLowerCase().trim();
            const sticker = findStickerByTag(chat, tag);
            if (sticker) {
                return `<img class="sticker-img" src="${sticker.src}" alt="${escapeHtml(sticker.label || tag)}" title="${escapeHtml(sticker.label || tag)}">`;
            }
            // Fallback: show tag as emoji-like badge
            return `<span class="sticker-placeholder" title="Стикер: ${escapeHtml(tag)}">🖼 ${escapeHtml(tag)}</span>`;
        }
        return escapeHtml(part);
    }).join('');
}

function findStickerByTag(chat, tag) {
    const packs = getAssignedPacks(chat);
    for (const pack of packs) {
        const found = pack.stickers.find(s => s.tag.toLowerCase() === tag);
        if (found) return found;
    }
    return null;
}

function getAssignedPacks(chat) {
    if (!chat) return [];
    const ids = chat.assignedPackIds || [];
    // If no assignments, show all global packs (for backward compat)
    if (ids.length === 0) return settings.stickerPacks || [];
    return (settings.stickerPacks || []).filter(p => ids.includes(p.id));
}

function isPackAssigned(chat, packId) {
    if (!chat.assignedPackIds) return false;
    if (chat.assignedPackIds.length === 0) return false; // no assignments = all
    return chat.assignedPackIds.includes(packId);
}

function togglePackAssignment(chatId, packId) {
    const chat = getChatById(chatId);
    if (!chat) return;
    if (!chat.assignedPackIds) chat.assignedPackIds = [];
    const idx = chat.assignedPackIds.indexOf(packId);
    if (idx === -1) chat.assignedPackIds.push(packId);
    else chat.assignedPackIds.splice(idx, 1);
    saveToStorage();
}

function scrollToBottom(instant = false) {
    const el = state.currentUI === 'instagram'
        ? document.getElementById('igMessages')
        : document.getElementById('dcMessages');
    if (!el) return;
    if (instant) el.scrollTop = el.scrollHeight;
    else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}

// ══════════════════════════════════════════════
// INPUT HANDLING
// ══════════════════════════════════════════════
function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function onInputChange() {
    userActivelyTyping = true;
    if (responseTimer) { clearTimeout(responseTimer); responseTimer = null; }
    if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
    typingDebounceTimer = setTimeout(() => {
        userActivelyTyping = false;
        const chat = getActiveChat();
        const lastMsg = chat?.messages[chat.messages.length - 1];
        if (lastMsg && lastMsg.role === 'user' && !state.isTyping) scheduleAIResponse();
    }, TYPING_DEBOUNCE_MS);
}

function getCurrentInput() {
    return document.getElementById(state.currentUI === 'instagram' ? 'igInput' : 'dcInput');
}

function sendMessage() {
    const inputEl = getCurrentInput();
    if (!inputEl) return;
    const text = inputEl.textContent.trim();
    if (!text) return;
    inputEl.textContent = '';
    userActivelyTyping = false;
    addMessage('user', text);
    scheduleAIResponse();
}

function scheduleAIResponse() {
    if (responseTimer) { clearTimeout(responseTimer); responseTimer = null; }
    if (userActivelyTyping) return;
    responseTimer = setTimeout(async () => {
        responseTimer = null;
        if (state.isTyping) {
            responseTimer = setTimeout(scheduleAIResponse, 500);
            return;
        }
        await getAIResponse();
        const chat = getActiveChat();
        const lastMsg = chat?.messages[chat.messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') scheduleAIResponse();
    }, RESPONSE_DELAY_MS);
}

// ══════════════════════════════════════════════
// TYPING INDICATOR
// ══════════════════════════════════════════════
function showTyping() {
    state.isTyping = true;
    const igT = document.getElementById('igTyping');
    const dcT = document.getElementById('dcTyping');
    if (state.currentUI === 'instagram' && igT) igT.style.display = 'flex';
    else if (dcT) dcT.style.display = 'flex';
    scrollToBottom();
}

function hideTyping() {
    state.isTyping = false;
    const igT = document.getElementById('igTyping');
    const dcT = document.getElementById('dcTyping');
    if (igT) igT.style.display = 'none';
    if (dcT) dcT.style.display = 'none';
}

// ══════════════════════════════════════════════
// AI API
// ══════════════════════════════════════════════
function buildSystemPrompt(chat) {
    chat = chat || getActiveChat();
    if (!chat) return '';
    const charName = chat.companion.name || 'AI';

    let raw = chat.companion.personality || PRESETS.girlfriend();
    raw = raw
        .replace(/\{\{char\}\}/gi, charName)
        .replace(/\{\{user\}\}/gi, 'User');

    let prompt = `You are ${charName}.\n\n${raw}`;

    if (chat.companion.exampleMessages?.trim()) {
        let ex = chat.companion.exampleMessages
            .replace(/\{\{char\}\}/gi, charName)
            .replace(/\{\{user\}\}/gi, 'User');
        prompt += `\n\n[Example dialogue to match tone and style:]\n${ex}`;
    }

    // Sticker instructions if packs exist
    const allTags = getAllStickerTags(chat);
    if (allTags.length > 0) {
        prompt += `\n\n[Sticker system: You can send a sticker by writing [sticker:tag] at the START of your message, alone on its own line, BEFORE any text. Available emotion tags: ${allTags.join(', ')}. Only use a sticker when the emotion truly fits — not every message. You may combine a sticker with a short text reply after it.]`;
    }

    prompt += `\n\nCritical rules: You are ${charName}. Speak in first person always. No markdown (no asterisks, no headers, no bold). Write like real texting. Respond in English. Never break character. Never admit you are an AI.`;
    return prompt;
}

function getAllStickerTags(chat) {
    const packs = getAssignedPacks(chat);
    const tags = [];
    for (const pack of packs) {
        for (const sticker of pack.stickers) {
            if (sticker.tag && !tags.includes(sticker.tag)) tags.push(sticker.tag);
        }
    }
    return tags;
}

function buildHistory(chat) {
    return (chat.messages || []).slice(-MAX_HISTORY).map(m => ({
        role: m.role, content: m.content,
    }));
}

async function getAIResponse(chat, isProactive = false) {
    chat = chat || getActiveChat();
    if (!chat) return;
    const isActiveChatResponse = chat.id === state.activeChatId;

    if (isActiveChatResponse) showTyping();
    try {
        const systemPrompt = buildSystemPrompt(chat);
        const history = buildHistory(chat);
        let response;
        if (settings.apiProvider === 'ollama') {
            response = await callOllama(systemPrompt, history);
        } else {
            response = await callOpenRouter(systemPrompt, history);
        }
        if (response) {
            if (isActiveChatResponse) {
                addAIMessage(response, isProactive);
            } else {
                // Background chat — add message, update unread
                const msg = { role: 'assistant', content: response, ts: Date.now(), isProactive };
                chat.messages.push(msg);
                chat.unread = (chat.unread || 0) + 1;
                saveToStorage();
                renderChatList();
                // Browser notification
                if (Notification.permission === 'granted') {
                    new Notification(chat.companion.name || 'AI', {
                        body: response.replace(/\[sticker:[^\]]+\]/g, '🖼').slice(0, 100),
                        icon: chat.companion.avatar || '',
                    });
                }
            }
        }
    } catch(err) {
        if (isActiveChatResponse) hideTyping();
        console.error('AI error:', err);
        showToast('AI Error: ' + (err.message || 'Something went wrong'), 'error');
    }
}

async function callOpenRouter(systemPrompt, history) {
    if (!settings.apiKey) throw new Error('No API key set. Open Settings → API & Key.');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${settings.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href || 'https://ai-companion.app',
            'X-Title': 'AI Companion',
        },
        body: JSON.stringify({
            model: settings.model || 'openrouter/auto',
            messages: [{ role: 'system', content: systemPrompt }, ...history],
            max_tokens: settings.maxTokens || 400,
            temperature: settings.temperature || 0.85,
        }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error?.message || errData?.message || `HTTP ${res.status}`;
        if (res.status === 429 || /rate|overload|provider|unavailable|free/i.test(msg)) {
            throw new Error(`Model unavailable: "${settings.model}". Try switching to "Auto" in Settings → Model.`);
        }
        throw new Error(msg);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Empty response. Try a different model in Settings.');
    return content;
}

async function callOllama(systemPrompt, history) {
    const url = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
    const res = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: settings.ollamaModel || 'llama3.2',
            messages: [{ role: 'system', content: systemPrompt }, ...history],
            stream: false,
        }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}. Make sure Ollama is running.`);
    const data = await res.json();
    return data?.message?.content?.trim() || null;
}

async function testConnection() {
    const statusEl = document.getElementById('connStatus');
    statusEl.className = 'conn-status';
    statusEl.textContent = '⏳ Testing...';
    statusEl.style.display = 'block';
    saveSettings();
    try {
        if (settings.apiProvider === 'openrouter') {
            if (!settings.apiKey) throw new Error('No API key');
            const res = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': `Bearer ${settings.apiKey}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } else {
            const url = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
            const res = await fetch(`${url}/api/tags`);
            if (!res.ok) throw new Error('Ollama not reachable');
        }
        statusEl.className = 'conn-status success';
        statusEl.textContent = '✅ Connected successfully!';
    } catch(e) {
        statusEl.className = 'conn-status error';
        statusEl.textContent = '❌ Error: ' + e.message;
    }
}

// ══════════════════════════════════════════════
// PROACTIVE MESSAGES (per-chat)
// ══════════════════════════════════════════════
function setupAllProactiveTimers() {
    // Clear all existing timers
    proactiveTimers.forEach(timer => clearInterval(timer));
    proactiveTimers.clear();
    // Set up for each chat
    state.chats.forEach(chat => setupProactiveTimer(chat));
}

function setupProactiveTimer(chat) {
    if (proactiveTimers.has(chat.id)) {
        clearInterval(proactiveTimers.get(chat.id));
        proactiveTimers.delete(chat.id);
    }
    if (!chat.proactive.enabled) return;
    const intervalMs = (chat.proactive.intervalMin || 10) * 60 * 1000;
    const timer = setInterval(() => {
        const hour = new Date().getHours();
        if (hour >= (chat.proactive.startHour ?? 9) && hour <= (chat.proactive.endHour ?? 23)) {
            if (!state.isTyping || chat.id !== state.activeChatId) {
                triggerProactiveMessage(chat);
            }
        }
    }, intervalMs);
    proactiveTimers.set(chat.id, timer);
}

async function triggerProactiveMessage(chat) {
    chat = chat || getActiveChat();
    if (!chat) return;
    const style = chat.proactive.style || 'casual';
    const prompt = PROACTIVE_PROMPTS[style] || PROACTIVE_PROMPTS.casual;
    const systemPrompt = buildSystemPrompt(chat) + '\n\n' + prompt;
    const isActive = chat.id === state.activeChatId;
    if (isActive) showTyping();
    try {
        let response;
        const fakeHistory = [{ role: 'user', content: '[pause in conversation]' }];
        if (settings.apiProvider === 'ollama') response = await callOllama(systemPrompt, fakeHistory);
        else response = await callOpenRouter(systemPrompt, fakeHistory);
        if (response) {
            if (isActive) {
                addAIMessage(response, true);
            } else {
                chat.messages.push({ role: 'assistant', content: response, ts: Date.now(), isProactive: true });
                chat.unread = (chat.unread || 0) + 1;
                saveToStorage();
                renderChatList();
            }
            if (document.hidden && Notification.permission === 'granted') {
                new Notification(chat.companion.name || 'AI', {
                    body: response.replace(/\[sticker:[^\]]+\]/g, '🖼').slice(0, 100),
                    icon: chat.companion.avatar || '',
                });
            }
        }
    } catch(e) {
        if (isActive) hideTyping();
        console.warn('Proactive failed:', e);
    }
}

async function sendProactiveNow() {
    const chat = getActiveChat();
    if (chat) await triggerProactiveMessage(chat);
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ══════════════════════════════════════════════
// STICKER SYSTEM
// ══════════════════════════════════════════════
let stickerPickerOpen = false;

function toggleStickerPicker(btn) {
    const picker = document.getElementById('stickerPicker');
    if (stickerPickerOpen) {
        picker.classList.remove('open');
        stickerPickerOpen = false;
        return;
    }
    renderStickerPicker();
    picker.classList.add('open');
    stickerPickerOpen = true;
}

function renderStickerPicker() {
    const chat = getActiveChat();
    const container = document.getElementById('stickerPickerContent');
    if (!container) return;

    const packs = chat ? getAssignedPacks(chat) : (settings.stickerPacks || []);

    if (!packs.length) {
        container.innerHTML = `<div class="sticker-empty">
            <p>No stickers</p>
            <p style="font-size:12px;opacity:.6">Add packs in Settings → Stickers</p>
        </div>`;
        return;
    }

    container.innerHTML = packs.map(pack => `
        <div class="sticker-pack-section">
            <div class="sticker-pack-label">${escapeHtml(pack.name)}</div>
            <div class="sticker-grid">
                ${pack.stickers.map(s => `
                    <img class="sticker-pick-item" src="${s.src}" alt="${escapeHtml(s.label || s.tag)}"
                         title="${escapeHtml(s.label || s.tag)}"
                         onclick="sendStickerManually('${s.tag}','${pack.id}')">
                `).join('')}
            </div>
        </div>
    `).join('');
}

function sendStickerManually(tag, packId) {
    // Find the sticker in global packs
    const pack = (settings.stickerPacks || []).find(p => p.id === packId);
    const sticker = pack?.stickers.find(s => s.tag === tag);
    if (!sticker) return;
    document.getElementById('stickerPicker').classList.remove('open');
    stickerPickerOpen = false;
    addMessage('user', `[sticker:${tag}]`);
    scheduleAIResponse();
}

// ── STICKER SETTINGS (global packs + per-chat assignment) ──
function renderStickerSettings() {
    const container = document.getElementById('stickerPacksContainer');
    if (!container) return;

    const globalPacks = settings.stickerPacks || [];

    if (globalPacks.length === 0) {
        container.innerHTML = `<div class="sticker-empty-settings">No packs yet. Create one!</div>`;
        return;
    }

    container.innerHTML = globalPacks.map(pack => {
        // Build per-chat assignment checkboxes
        const chatCheckboxes = state.chats.map(chat => {
            const checked = (chat.assignedPackIds || []).includes(pack.id) ? 'checked' : '';
            return `<label class="pack-chat-assign">
                <input type="checkbox" ${checked}
                    onchange="togglePackAssignment('${chat.id}','${pack.id}'); renderStickerSettings();">
                <img src="${chat.companion.avatar || generateAvatar(chat.companion.name)}" class="assign-avatar">
                <span>${escapeHtml(chat.companion.name)}</span>
            </label>`;
        }).join('');

        return `<div class="sticker-pack-card" data-pack="${pack.id}">
            <div class="sticker-pack-header">
                <input class="pack-name-input" value="${escapeHtml(pack.name)}"
                       onchange="renamePack('${pack.id}',this.value)">
                <button class="btn-icon danger" onclick="deletePack('${pack.id}')">🗑</button>
            </div>
            <div class="pack-assignment-row">
                <span class="assign-label">Assign to:</span>
                ${chatCheckboxes}
            </div>
            <div class="sticker-pack-stickers">
                ${pack.stickers.map(s => `
                    <div class="sticker-manage-item">
                        <img src="${s.src}" alt="${escapeHtml(s.tag)}">
                        <input class="sticker-tag-input" value="${escapeHtml(s.tag)}"
                               placeholder="tag (e.g. happy)"
                               onchange="updateStickerTag('${pack.id}','${s.id}',this.value)">
                        <button class="btn-icon danger sm" onclick="deleteSticker('${pack.id}','${s.id}')">✕</button>
                    </div>
                `).join('')}
                <label class="add-sticker-btn">
                    📎 Upload<br>sticker
                    <input type="file" accept="image/*" multiple style="display:none"
                           onchange="addStickers('${pack.id}',this)">
                </label>
                <button class="add-sticker-url-btn" onclick="addStickerByUrl('${pack.id}')">🔗 URL</button>
            </div>
        </div>`;
    }).join('');
}

function addStickerPack() {
    const name = prompt('Pack name (e.g. Anime, Cute, Memes):') || 'Pack';
    const newPack = {
        id: 'pack_' + Date.now(),
        name,
        stickers: [],
    };
    if (!settings.stickerPacks) settings.stickerPacks = [];
    settings.stickerPacks.push(newPack);
    // Auto-assign to current editing chat
    const chat = getChatById(editingChatId) || getActiveChat();
    if (chat) {
        if (!chat.assignedPackIds) chat.assignedPackIds = [];
        chat.assignedPackIds.push(newPack.id);
    }
    saveToStorage();
    renderStickerSettings();
    showToast(`Pack "${name}" created & assigned to current chat`, 'success');
}

function deletePack(packId) {
    if (!confirm('Delete this sticker pack for ALL chats?')) return;
    settings.stickerPacks = (settings.stickerPacks || []).filter(p => p.id !== packId);
    // Remove from all chats' assignedPackIds
    state.chats.forEach(chat => {
        if (chat.assignedPackIds) chat.assignedPackIds = chat.assignedPackIds.filter(id => id !== packId);
    });
    saveToStorage();
    renderStickerSettings();
}

function renamePack(packId, name) {
    const pack = (settings.stickerPacks || []).find(p => p.id === packId);
    if (pack) { pack.name = name; saveToStorage(); }
}

function addStickers(packId, input) {
    const pack = (settings.stickerPacks || []).find(p => p.id === packId);
    if (!pack || !input.files.length) return;

    let loaded = 0;
    Array.from(input.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
            const tag = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            pack.stickers.push({
                id: 'sticker_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
                src: e.target.result,
                tag,
                label: file.name.replace(/\.[^.]+$/, ''),
            });
            loaded++;
            if (loaded === input.files.length) {
                saveToStorage();
                renderStickerSettings();
                showToast(`${loaded} sticker(s) added`, 'success');
            }
        };
        reader.readAsDataURL(file);
    });
}

function addStickerByUrl(packId) {
    const url = prompt('Sticker image URL:');
    if (!url?.trim()) return;
    const tag = prompt('Emotion tag (e.g. happy, love, sad):') || 'sticker';
    const pack = (settings.stickerPacks || []).find(p => p.id === packId);
    if (!pack) return;
    pack.stickers.push({
        id: 'sticker_' + Date.now(),
        src: url.trim(),
        tag: tag.trim().toLowerCase(),
        label: tag,
    });
    saveToStorage();
    renderStickerSettings();
}

function updateStickerTag(packId, stickerId, tag) {
    const pack = (settings.stickerPacks || []).find(p => p.id === packId);
    const sticker = pack?.stickers.find(s => s.id === stickerId);
    if (sticker) { sticker.tag = tag.trim().toLowerCase(); saveToStorage(); }
}

function deleteSticker(packId, stickerId) {
    const pack = (settings.stickerPacks || []).find(p => p.id === packId);
    if (!pack) return;
    pack.stickers = pack.stickers.filter(s => s.id !== stickerId);
    saveToStorage();
    renderStickerSettings();
}


// ══════════════════════════════════════════════
// SETTINGS PANEL
// ══════════════════════════════════════════════
function openSettings() {
    editingChatId = state.activeChatId;
    loadSettingsUI();
    const overlay = document.getElementById('settingsOverlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('open'));
}

function openChatSettings(chatId) {
    editingChatId = chatId;
    loadSettingsUI();
    const overlay = document.getElementById('settingsOverlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('open'));
    // Switch to companion panel
    const el = document.querySelector('.nav-item[data-panel="companion"]');
    if (el) switchSettingsPanel(el, 'companion');
}

function closeSettings() {
    const overlay = document.getElementById('settingsOverlay');
    overlay.classList.remove('open');
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
    saveSettings();
}

function switchSettingsPanel(el, panelId) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.s-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('panel-' + panelId);
    if (panel) panel.classList.add('active');
    // Render sticker settings on stickers tab
    if (panelId === 'stickers') renderStickerSettings();
}

function saveSettings() {
    // Global settings
    const get = id => document.getElementById(id);
    if (get('sApiKey')) settings.apiKey = get('sApiKey').value.trim();
    if (get('sOllamaUrl')) settings.ollamaUrl = get('sOllamaUrl').value.trim();
    const sModelOR = get('sModelOR');
    if (sModelOR) settings.model = sModelOR.value;
    if (get('sModelOL')) settings.ollamaModel = get('sModelOL').value;
    if (get('sTemp')) settings.temperature = parseFloat(get('sTemp').value);
    if (get('sMaxTokens')) settings.maxTokens = parseInt(get('sMaxTokens').value);
    if (get('sFont')) settings.chat.font = get('sFont').value;
    if (get('sFontSz')) settings.chat.fontSize = parseInt(get('sFontSz').value);

    // Per-chat settings
    const chat = getChatById(editingChatId) || getActiveChat();
    if (chat) {
        if (get('sName')) chat.companion.name = get('sName').value || 'AI';
        if (get('sStatus')) chat.companion.status = get('sStatus').value || 'online';
        if (get('sPersonality')) chat.companion.personality = get('sPersonality').value;
        if (get('sExampleMessages')) chat.companion.exampleMessages = get('sExampleMessages').value;
        if (get('sProactiveOn')) chat.proactive.enabled = get('sProactiveOn').checked;
        if (get('sProInt')) chat.proactive.intervalMin = parseInt(get('sProInt').value);
        if (get('sProStart')) chat.proactive.startHour = parseInt(get('sProStart').value);
        if (get('sProEnd')) chat.proactive.endHour = parseInt(get('sProEnd').value);
        if (get('sProStyle')) chat.proactive.style = get('sProStyle').value;
        setupProactiveTimer(chat);
    }

    saveToStorage();
    applyTheme();
    updateAllNames();
    renderChatList();
}

function loadSettingsUI() {
    const get = id => document.getElementById(id);
    const chat = getChatById(editingChatId) || getActiveChat();

    // Companion
    if (chat) {
        if (get('sName')) get('sName').value = chat.companion.name || '';
        if (get('sStatus')) get('sStatus').value = chat.companion.status || 'online';
        if (get('sPersonality')) get('sPersonality').value = chat.companion.personality || '';
        if (get('sExampleMessages')) get('sExampleMessages').value = chat.companion.exampleMessages || '';
        if (get('sAvatarImg')) get('sAvatarImg').src = chat.companion.avatar || generateAvatar(chat.companion.name);
        if (get('sProactiveOn')) get('sProactiveOn').checked = chat.proactive.enabled;
        if (get('sProInt')) get('sProInt').value = chat.proactive.intervalMin || 10;
        if (get('sProIntVal')) get('sProIntVal').textContent = chat.proactive.intervalMin || 10;
        if (get('sProStart')) get('sProStart').value = chat.proactive.startHour ?? 9;
        if (get('sProEnd')) get('sProEnd').value = chat.proactive.endHour ?? 23;
        if (get('sProStyle')) get('sProStyle').value = chat.proactive.style || 'casual';
    }

    // Global
    if (get('sApiKey')) get('sApiKey').value = settings.apiKey || '';
    if (get('sOllamaUrl')) get('sOllamaUrl').value = settings.ollamaUrl || 'http://localhost:11434';

    const sModelOR = get('sModelOR');
    if (sModelOR) {
        sModelOR.value = settings.model || 'openrouter/auto';
        if (sModelOR.selectedIndex === -1) { sModelOR.value = 'openrouter/auto'; settings.model = 'openrouter/auto'; }
    }
    if (get('sModelOL')) get('sModelOL').value = settings.ollamaModel || '';
    if (get('sTemp')) get('sTemp').value = settings.temperature || 0.85;
    if (get('sTempVal')) get('sTempVal').textContent = settings.temperature || 0.85;
    if (get('sMaxTokens')) get('sMaxTokens').value = settings.maxTokens || 400;
    if (get('sFont')) get('sFont').value = settings.chat.font || "'Inter', sans-serif";
    if (get('sFontSz')) get('sFontSz').value = settings.chat.fontSize || 16;
    if (get('sFontSzVal')) get('sFontSzVal').textContent = settings.chat.fontSize || 16;

    switchApiSource(settings.apiProvider || 'openrouter');
    updateUIToggleCards();

    // Update settings nav to show editing chat name
    if (chat && get('settingsNavName')) get('settingsNavName').textContent = chat.companion.name || 'AI';
    if (chat && get('settingsNavAvatar')) get('settingsNavAvatar').src = chat.companion.avatar || generateAvatar(chat.companion.name);
}

function updateUIToggleCards() {
    const mode = settings.ui || 'instagram';
    const igCard = document.getElementById('uiCardIG');
    const dcCard = document.getElementById('uiCardDC');
    if (!igCard) return;
    igCard.classList.toggle('active-ui', mode === 'instagram');
    dcCard.classList.toggle('active-ui', mode === 'discord');
    document.getElementById('uiCheckIG').style.display = mode === 'instagram' ? 'flex' : 'none';
    document.getElementById('uiCheckDC').style.display = mode === 'discord' ? 'flex' : 'none';
}

function switchApiSource(source) {
    settings.apiProvider = source;
    const orBtn = document.getElementById('srcBtnOR');
    const olBtn = document.getElementById('srcBtnOL');
    if (orBtn) orBtn.classList.toggle('active', source === 'openrouter');
    if (olBtn) olBtn.classList.toggle('active', source === 'ollama');
    const show = (id, visible) => { const el = document.getElementById(id); if (el) el.style.display = visible ? 'block' : 'none'; };
    show('sApiKeyField', source === 'openrouter');
    show('sOllamaField', source === 'ollama');
    show('sModelORField', source === 'openrouter');
    show('sModelOLField', source === 'ollama');
    saveToStorage();
}

function liveUpdateName() {
    const val = document.getElementById('sName')?.value || 'AI';
    const chat = getChatById(editingChatId) || getActiveChat();
    if (chat) { chat.companion.name = val; updateAllNames(chat); renderChatList(); }
}
function liveUpdateStatus() {
    const val = document.getElementById('sStatus')?.value || 'online';
    const chat = getChatById(editingChatId) || getActiveChat();
    if (chat) { chat.companion.status = val; updateAllNames(chat); }
}

function saveCompanionProfile() { saveSettings(); showToast('Profile saved ✓', 'success'); }

function handleSAvatar(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const chat = getChatById(editingChatId) || getActiveChat();
        if (chat) {
            chat.companion.avatar = e.target.result;
            document.getElementById('sAvatarImg').src = e.target.result;
            updateAllNames(chat); renderChatList(); saveToStorage();
        }
    };
    reader.readAsDataURL(file);
}

function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    const text = preset();
    const el = document.getElementById('sPersonality');
    if (el) { el.value = text; }
    const chat = getChatById(editingChatId) || getActiveChat();
    if (chat) { chat.companion.personality = text; saveToStorage(); }
    const names = { girlfriend: 'Girlfriend', boyfriend: 'Boyfriend', friend: 'Friend', mentor: 'Mentor', tsundere: 'Tsundere' };
    showToast(`Preset "${names[name] || name}" applied`, 'success');
}

function updateTemp(val) {
    const el = document.getElementById('sTempVal');
    if (el) el.textContent = val;
    settings.temperature = parseFloat(val);
    saveToStorage();
}

function updateProInt(val) {
    const el = document.getElementById('sProIntVal');
    if (el) el.textContent = val;
    const chat = getChatById(editingChatId) || getActiveChat();
    if (chat) {
        chat.proactive.intervalMin = parseInt(val);
        saveToStorage();
        setupProactiveTimer(chat);
    }
}

function toggleProactive() { saveSettings(); }

// ══════════════════════════════════════════════
// DATA MANAGEMENT
// ══════════════════════════════════════════════
function clearChatConfirm() {
    const chat = getActiveChat();
    if (!chat || !confirm('Clear chat history? This cannot be undone.')) return;
    chat.messages = [];
    saveToStorage();
    renderAllMessages(chat);
    showToast('Chat cleared', 'success');
}

function exportChat() {
    const chat = getActiveChat();
    if (!chat) return;
    downloadFile(`chat_${chat.companion.name}_export.json`, JSON.stringify(chat.messages, null, 2), 'application/json');
}

function exportSettings() {
    downloadFile('companion_settings.json', JSON.stringify({ settings, chats: state.chats }, null, 2), 'application/json');
}

function importSettings(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.settings) settings = deepMerge(DEFAULT_SETTINGS, imported.settings);
            if (imported.chats) state.chats = imported.chats;
            saveToStorage();
            loadSettingsUI();
            applyTheme();
            renderChatList();
            renderActiveChat();
            showToast('Settings imported ✓', 'success');
        } catch { showToast('Import error', 'error'); }
    };
    reader.readAsText(file);
}

function resetAll() {
    if (confirm('Reset EVERYTHING? All settings and chats will be deleted.')) {
        localStorage.clear();
        location.reload();
    }
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════
// EMOJI PICKER
// ══════════════════════════════════════════════
let emojiTriggerBtn = null;

function buildEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;
    grid.innerHTML = EMOJIS.map(e => `<div class="emoji-btn-item" onclick="insertEmoji('${e}')">${e}</div>`).join('');
}

function filterEmoji(q) {
    const grid = document.getElementById('emojiGrid');
    const filtered = q ? EMOJIS.filter(e => e.includes(q)) : EMOJIS;
    grid.innerHTML = filtered.map(e => `<div class="emoji-btn-item" onclick="insertEmoji('${e}')">${e}</div>`).join('');
}

function toggleEmoji(btn) {
    const picker = document.getElementById('emojiPicker');
    const isOpen = picker.classList.contains('open');
    if (isOpen && emojiTriggerBtn === btn) {
        picker.classList.remove('open'); picker.style.display = 'none'; emojiTriggerBtn = null; return;
    }
    emojiTriggerBtn = btn;
    const rect = btn.getBoundingClientRect();
    picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    picker.style.left = Math.max(8, rect.left - 130) + 'px';
    picker.style.display = 'block';
    picker.classList.add('open');
    document.getElementById('emojiSearch').value = '';
    buildEmojiGrid();
}

function insertEmoji(emoji) {
    const inputEl = getCurrentInput();
    if (!inputEl) return;
    inputEl.focus();
    document.execCommand('insertText', false, emoji);
    const picker = document.getElementById('emojiPicker');
    picker.classList.remove('open'); picker.style.display = 'none'; emojiTriggerBtn = null;
}

document.addEventListener('click', (e) => {
    // Close emoji picker
    const picker = document.getElementById('emojiPicker');
    if (picker?.classList.contains('open') && !picker.contains(e.target) && !e.target.closest('.emoji-trigger')) {
        picker.classList.remove('open'); picker.style.display = 'none'; emojiTriggerBtn = null;
    }
    // Close sticker picker
    const sp = document.getElementById('stickerPicker');
    if (sp?.classList.contains('open') && !sp.contains(e.target) && !e.target.closest('.sticker-trigger')) {
        sp.classList.remove('open'); stickerPickerOpen = false;
    }
});

// ══════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function truncate(str, n) { return str.length > n ? str.slice(0, n) + '…' : str; }
function formatTime(ts) { return new Date(ts).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }); }
function formatTimeFull(ts) { return new Date(ts).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }); }
function formatDate(ts) {
    const d = new Date(ts), today = new Date(), yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { day:'numeric', month:'long' });
}
function isNewDay(ts1, ts2) { if (!ts1) return true; return new Date(ts1).toDateString() !== new Date(ts2).toDateString(); }

function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    requestAnimationFrame(() => {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    });
}

function togglePwd(inputId, btn) {
    const input = document.getElementById(inputId); if (!input) return;
    if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
    else { input.type = 'password'; btn.textContent = '👁'; }
}

// ══════════════════════════════════════════════
// WINDOW EXPORTS
// ══════════════════════════════════════════════
Object.assign(window, {
    // Setup
    nextStep, prevStep, selectApiProvider, selectPreset, selectSetupUI,
    handleSetupAvatar, finishSetup,
    // Chat
    sendMessage, handleKeydown, onInputChange, scheduleAIResponse,
    switchChat, promptAddChat, deleteCurrentChat, openChatSettings,
    // UI
    openSettings, closeSettings, switchSettingsPanel, switchUI,
    // Settings
    saveSettings, saveCompanionProfile, liveUpdateName, liveUpdateStatus,
    applyPreset, handleSAvatar, updateTemp, updateProInt,
    switchApiSource, toggleProactive, sendProactiveNow, testConnection,
    // Theme
    setVar, setChatBg, handleBgUpload, setFont, setFontSize,
    // Stickers
    toggleStickerPicker, sendStickerManually, addStickerPack,
    deletePack, renamePack, addStickers, addStickerByUrl,
    updateStickerTag, deleteSticker,
    togglePackAssignment, renderStickerSettings,
    // Data
    clearChatConfirm, exportChat, exportSettings, importSettings, resetAll,
    // Emoji
    toggleEmoji, insertEmoji, filterEmoji,
    // Utils
    togglePwd,
});
