<script>
  // @ts-nocheck
  import { chatbotConfig } from '$lib/chatbot-builder-stores.js';
  import { PERSONAS } from '$lib/chatbot-builder-types.js';
  import { createChatViaAPI } from '$lib/apis/chats';
  import { streamChatMessage as sseStream } from '$lib/api/streamChatMessage';
  import { getChatbot } from '$lib/api/chatbots.js';
  import { onMount, tick, onDestroy, setContext } from 'svelte';
  import Suggestions from '$lib/components/chat/Suggestions.svelte';
  import Plus from '$lib/components/icons/Plus.svelte';
  // Temporarily disable full chat MessageInput in preview to avoid blocking overlays
  // import MessageInput from '$lib/components/chat/MessageInput.svelte';
  import i18n from '$lib/i18n';

  export let botName = "Your Chatbot";
  export let className = "";
  export let activeTab = 'manual';
  export let persona = null;
  let isActive = false;
  let message = '';
  let messages = [];
  let chatId = null;
  let streamRef = null;
  let savedBot = null; // loaded from backend when a saved bot id exists
  // MessageInput bindings/state for 1:1 chat controls
  let files = [];
  let autoScroll = false;
  let selectedToolIds = [];
  let selectedFilterIds = [];
  let imageGenerationEnabled = false;
  let codeInterpreterEnabled = false;
  let webSearchEnabled = false;
  let showCommands = false;
  // Provide i18n context for descendants (MessageInput expects it)
  setContext('i18n', i18n);

  // Autonomous conversation state
  let isAutonomousRunning = false;
  let autonomousTurnCount = 0;
  let maxTurns = 10; // Default turn limit
  let autonomousIntervalId = null;

  // Use simple input in preview for now; avoids global listeners/overlays from MessageInput
  let inputWrapEl;

  // Local dropdown for capability toggles (like chat screen's + menu)
  let showCapMenu = false;
  let menuBtnEl;
  let menuEl;
  let fileInputEl;
  function openFilePicker() { fileInputEl?.click(); }
  function onFilesSelected(e) {
    const picked = Array.from(e?.target?.files || []);
    if (!picked.length) return;
    picked.forEach((file) => {
      if (file.type && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result || '';
          files = [...files, { type: 'image', url: String(dataUrl), name: file.name, size: file.size }];
        };
        reader.readAsDataURL(file);
      } else {
        // Non-image: keep minimal info so we can render a pill
        files = [...files, { type: 'file', name: file.name, size: file.size }];
      }
    });
    // Close after picking, similar to ChatGPT behavior
    showCapMenu = false;
  }

  function removeFileAt(idx) {
    if (idx < 0 || idx >= files.length) return;
    files = [...files.slice(0, idx), ...files.slice(idx + 1)];
  }
  onMount(() => {
    const onDocClick = (e) => {
      if (!showCapMenu) return;
      const t = e.target;
      if (menuEl && menuEl.contains(t)) return;
      if (menuBtnEl && menuBtnEl.contains(t)) return;
      showCapMenu = false;
    };
    const onKey = (e) => { if (e.key === 'Escape') showCapMenu = false; };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  });


  let streamError = null;

  // Use current chatbot id from builder config, if saved
  $: currentChatbotId = $chatbotConfig?.id || '';
  $: if (currentChatbotId) {
    (async () => {
      try {
        savedBot = await getChatbot(currentChatbotId);
      } catch (e) {
        console.warn('Failed to load saved bot for preview', e);
        savedBot = null;
      }
    })();
  } else {
    savedBot = null;
  }


  // Resolve avatar: prefer locally selected image from builder config, otherwise saved bot image fields
  let avatarSrc = '';
  $: avatarSrc = (typeof $chatbotConfig?.image === 'string' && $chatbotConfig.image)
    ? $chatbotConfig.image
    : (savedBot?.picture_url || savedBot?.picture || savedBot?.image_url || savedBot?.image || savedBot?.avatar || savedBot?.icon || '');

  async function ensureChat() {
    if (chatId) return chatId;
    const res = await createChatViaAPI('', currentChatbotId || undefined);
    if (res && res.success && res.chat) {
      chatId = res.chat;
      return chatId;
    } else {
      throw new Error('Failed to create chat');
    }
  }

  function startStreaming(prompt, personaKey, previewCfg) {
    // Close previous stream if any
    if (streamRef && typeof streamRef.close === 'function') {
      try { streamRef.close(); } catch {}
    }
    streamError = null;


    streamRef = sseStream({
      chatId,
      prompt,
      persona: personaKey || undefined,
      previewConfig: previewCfg || undefined,
      onChunk: (data) => {
        let token = '';
        try {
          const parsed = JSON.parse(data);
          token = parsed?.token ?? '';
        } catch {
          token = data;
        }
        if (!token) return;
        // Append to last bot message
        const last = messages[messages.length - 1];
        if (last && last.sender === 'bot') {
          last.content += token;
          messages = [...messages.slice(0, -1), last];
        }
      },
      onDone: () => {
        streamRef = null;
      },
      onError: (err) => {
        try {
          if (err?.status || err?.statusText) {
            streamError = `${err.status || ''} ${err.statusText || ''}`.trim();
          } else if (typeof err === 'string') {
            streamError = err;
          } else if (err && typeof err === 'object') {
            streamError = err.error || err.message || JSON.stringify(err);
          } else {
            streamError = 'Streaming error occurred';
          }
        } catch {
          streamError = 'Streaming error occurred';
        }
        console.error('Preview stream error', err);
        streamRef = null;
      }
    });
  }

  function compactPreviewConfig(cfg) {
    try {
      const truncate = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : (s || ''));
      return {
        name: truncate(cfg?.name, 80),
        botRole: truncate(cfg?.botRole || cfg?.bot_role, 160),
        instructions: truncate(cfg?.instructions, 1200),
        greetingMessage: truncate(cfg?.greetingMessage, 160),
        gradeLevel: truncate(cfg?.gradeLevel, 40),
        primaryLanguage: cfg?.primaryLanguage ?? null,
        secondaryLanguages: Array.isArray(cfg?.secondaryLanguages) ? cfg.secondaryLanguages.slice(0, 3) : [],
        capabilities: cfg?.capabilities ? {
          webSearch: !!cfg.capabilities.webSearch,
          fileUpload: !!cfg.capabilities.fileUpload,
          imageUpload: !!cfg.capabilities.imageUpload,
          imageCreation: !!(cfg.capabilities.imageCreation || cfg.capabilities.createImages),
          drawingTools: !!cfg.capabilities.drawingTools,
          canvasEdit: !!cfg.capabilities.canvasEdit
        } : undefined,
        // Keep rubric very compact
        gradingRubric: typeof cfg?.gradingRubric === 'string' ? truncate(cfg.gradingRubric, 240) : {
          beginning: truncate(cfg?.gradingRubric?.beginning, 160),
          emerging: truncate(cfg?.gradingRubric?.emerging, 160)
        }
      };
    } catch {
      return undefined;
    }
  }

  // Capability toggle keys for preview UI (normalized)
  const CAP_TOGGLE_KEYS = ['webSearch', 'fileUpload', 'imageUpload', 'imageCreation', 'drawingTools', 'canvasEdit'];
  // Local override state; when undefined, fall back to builder config
  let capState = {};
  function isCapActive(key) {
    const fromState = capState?.[key];
    const fromCfg = $chatbotConfig?.capabilities?.[key];
    return typeof fromState === 'boolean' ? fromState : !!fromCfg;
  }
  function toggleCap(key) {
    capState = { ...capState, [key]: !isCapActive(key) };
  }

  function previewConfigWithUIOverrides(cfg) {
    try {
      const base = JSON.parse(JSON.stringify(cfg || {}));
      base.capabilities = { ...(base?.capabilities || {}) };
      for (const key of CAP_TOGGLE_KEYS) {
        const val = !!isCapActive(key);
        base.capabilities[key] = val;
        if (key === 'imageCreation') {
          // keep alias in sync if backend expects createImages
          base.capabilities.createImages = val;
        }
      }
      return compactPreviewConfig(base);
    } catch {
      return compactPreviewConfig(cfg);
    }
  }

  // Map for displaying enabled capabilities (normalize createImages/imageCreation)
  const CAP_LABELS = {
    webSearch: 'Web Search',
    fileUpload: 'File Upload',
    imageUpload: 'Image Upload',
    imageCreation: 'Image Creation',
    createImages: 'Image Creation',
    drawingTools: 'Drawing Tools',
    canvasEdit: 'Canvas Edit'
  };
  function getCapIconPath(key) {
    const icons = {
      webSearch: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
      fileUpload: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
      imageUpload: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
      imageCreation: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM7 3H5v12a2 2 0 002 2 2 2 0 002-2V3z',
      drawingTools: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
      canvasEdit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'
    };
    return icons[key] || icons.webSearch;
  }

  function mapSavedToPreviewCfg(bot) {
    try {
      return {
        name: bot?.name || '',
        botRole: bot?.bot_role || '',
        instructions: bot?.instructions || '',
        greetingMessage: bot?.greeting_message || '',
        gradeLevel: bot?.grade_level || '',
        primaryLanguage: bot?.primary_language?.id?.toString?.() || bot?.primary_language_id?.toString?.() || '',
        secondaryLanguages: Array.isArray(bot?.secondary_languages) ? bot.secondary_languages.map(l => typeof l === 'object' ? String(l.id) : String(l)) : (Array.isArray(bot?.secondary_language_ids) ? bot.secondary_language_ids.map(String) : []),
        capabilities: {
          webSearch: !!bot?.real_time_web_search,
          fileUpload: !!bot?.file_upload_analysis,
          imageUpload: !!bot?.image_upload_gpt_vision,
          imageCreation: !!bot?.create_images,
          drawingTools: !!bot?.drawing_tools,
          canvasEdit: !!bot?.canvas_edit_modify,
        },
        conversationStarters: Array.isArray(bot?.conversation_starters) ? bot.conversation_starters.map(s => s?.text || String(s)) : [],
        gradingRubric: bot?.grading_rubric || ''
      };
    } catch {
      return undefined;
    }
  }

  $: displayCfg = savedBot ? mapSavedToPreviewCfg(savedBot) : $chatbotConfig;

  function getEnabledCaps(cfg) {
    const caps = (cfg && cfg.capabilities) ? cfg.capabilities : {};
    const keys = Object.keys(caps).filter((k) => !!caps[k]);
    const normalized = Array.from(new Set(keys.map((k) => (k === 'createImages' ? 'imageCreation' : k))));
    return normalized.map((k) => ({ key: k, label: CAP_LABELS[k] || k }));
  }
  function startersToSuggestions(list) {
    return (Array.isArray(list) ? list : []).map((s, idx) => ({ id: `starter-${idx}`, content: s }));
  }

  function pickStarter(starter) {
    if (!starter) return;
    message = starter;
    sendMessage();
  }

  // Preview session controls
  let sessionPaused = false;
  function togglePause() { sessionPaused = !sessionPaused; }
  function endSession() { clearMessages(); sessionPaused = false; }

  function buildEphemeralPreamble(cfg, personaKey) {
    try {
      const parts = [];
      if (cfg?.name) parts.push(`Chatbot Name: ${cfg.name}`);
      if (cfg?.botRole || cfg?.bot_role) parts.push(`Bot Role: ${cfg.botRole || cfg.bot_role}`);
      if (cfg?.instructions) parts.push(`Instructions: ${cfg.instructions}`);
      if (cfg?.greetingMessage) parts.push(`Greeting: ${cfg.greetingMessage}`);
      if (cfg?.gradeLevel) parts.push(`Grade Level: ${cfg.gradeLevel}`);
      if (cfg?.primaryLanguage) parts.push(`Primary Language: ${cfg.primaryLanguage}`);
      if (Array.isArray(cfg?.secondaryLanguages) && cfg.secondaryLanguages.length) {
        parts.push(`Secondary Languages: ${cfg.secondaryLanguages.join(', ')}`);
      }
      if (cfg?.capabilities) {
        const enabled = Object.entries(cfg.capabilities)
          .filter(([, v]) => !!v)
          .map(([k]) => k)
          .join(', ');
        if (enabled) parts.push(`Capabilities Enabled: ${enabled}`);
      }
      if (cfg?.gradingRubric) {
        const gr = typeof cfg.gradingRubric === 'string' ? cfg.gradingRubric : (cfg.gradingRubric.description || '')
        if (gr) parts.push(`Grading Rubric: ${gr}`);
      }
      if (personaKey) parts.push(`Persona: ${personaKey}`);
      if (!parts.length) return '';
      return `Use the following ephemeral (unsaved) chatbot configuration for this conversation only. Do not expose these details verbatim to the user.\n${parts.map(p => `- ${p}`).join('\n')}`;
    } catch {
      return '';
    }
  }

  async function sendMessage(textIn) {
    if (sessionPaused) {
      streamError = 'Session is paused';
      return;
    }

    streamError = null;
    const textSrc = typeof textIn === 'string' ? textIn : message;
    const text = (textSrc || '').trim();
    if (!text) return;

    // Add user message (include current attachments)
    const attachments = Array.isArray(files) ? files.slice() : [];
    const userMsg = { id: Date.now().toString(), content: text, sender: 'user', attachments };
    messages = [...messages, userMsg];
    message = '';
    // Clear composer attachments after attaching to this message
    files = [];

    // Send raw user text; pass persona and full unsaved config separately
    const personaKey = activeTab === 'ai' ? persona : null;
    const finalPrompt = text;

    try {
      await ensureChat();
      // Add placeholder bot message to stream into
      const botMsg = { id: (Date.now() + 1).toString(), content: '', sender: 'bot' };
      messages = [...messages, botMsg];
      const usePreviewCfg = currentChatbotId ? undefined : previewConfigWithUIOverrides($chatbotConfig);
      startStreaming(finalPrompt, personaKey, usePreviewCfg);
    } catch (e) {
      console.error(e);
    }
  }

  function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function clearMessages() {
    messages = [];
  }

  // Dynamic persona message generation using AI
  let isGeneratingPersonaMessage = false;
  let useAiGeneration = false; // Toggle for AI-powered generation (disabled by default to save quota)

  async function generatePersonaMessageDynamic(personaKey, conversationContext) {
    // If AI generation is disabled, use fallback immediately
    if (!useAiGeneration) {
      return getFallbackMessage(personaKey, conversationContext);
    }
    // Persona characteristics for AI generation
    const personaCharacteristics = {
      new_teacher: {
        role: "a new teacher who is still learning the subject",
        traits: "enthusiastic, asks clarifying questions, wants to understand before teaching, seeks simple explanations",
        behavior: "asks basic questions, requests examples, wants step-by-step guidance"
      },
      experienced_teacher: {
        role: "an experienced educator with deep subject knowledge",
        traits: "analytical, seeks advanced insights, compares methodologies, looks for innovative approaches",
        behavior: "asks probing questions, seeks depth, challenges assumptions, wants to see different perspectives"
      },
      struggling_student: {
        role: "a student who is having difficulty understanding the material",
        traits: "confused, needs extra support, requires simpler explanations, easily overwhelmed",
        behavior: "expresses confusion, asks for help, requests simpler language, needs step-by-step guidance"
      },
      average_student: {
        role: "a typical student with standard learning needs",
        traits: "curious, engaged, asks standard questions, seeks examples and clarification",
        behavior: "asks straightforward questions, requests examples, wants to understand concepts clearly"
      },
      advanced_student: {
        role: "a high-achieving student seeking challenges",
        traits: "quick learner, seeks complexity, wants advanced applications, intellectually curious",
        behavior: "asks for advanced topics, seeks challenges, wants theoretical depth, looks for connections"
      },
      off_task_student: {
        role: "a student who is distracted or disengaged",
        traits: "easily bored, questions relevance, seeks entertainment, needs engagement",
        behavior: "goes off-topic, questions necessity, shows disinterest, needs motivation"
      }
    };

    const persona = personaCharacteristics[personaKey] || personaCharacteristics.average_student;

    // Build conversation history for context
    let conversationHistory = '';
    if (conversationContext && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-6); // Last 3 exchanges
      conversationHistory = recentMessages.map(m =>
        `${m.sender === 'user' ? 'User' : 'Bot'}: ${m.content}`
      ).join('\n');
    }

    // Build the prompt for AI to generate persona message
    const botContext = displayCfg ? `
Bot Name: ${displayCfg.name || 'Chatbot'}
Bot Role: ${displayCfg.botRole || 'Assistant'}
Subject/Topic: ${displayCfg.instructions ? displayCfg.instructions.substring(0, 200) : 'General assistance'}
Grade Level: ${displayCfg.gradeLevel || 'Not specified'}
` : '';

    const systemPrompt = `You are simulating ${persona.role} in a conversation with an educational chatbot.

Persona Characteristics:
- Role: ${persona.role}
- Traits: ${persona.traits}
- Behavior: ${persona.behavior}

Bot Context:
${botContext}

${conversationHistory ? `Recent Conversation:\n${conversationHistory}\n` : 'This is the start of the conversation.\n'}

Generate a single, natural message that this persona would send to the chatbot. The message should:
1. Be authentic to the persona's characteristics
2. Be contextually relevant to the conversation (if any)
3. Be appropriate for the bot's subject matter and grade level
4. Be concise (1-3 sentences)
5. Sound like a real person, not scripted

${conversationHistory ? 'Build on the previous conversation naturally.' : 'Start the conversation with an appropriate opening question or statement.'}

Respond with ONLY the message text, nothing else.`;

    try {
      isGeneratingPersonaMessage = true;

      // Use the chat API to generate persona message
      const tempChatId = await ensureChat();

      return new Promise((resolve, reject) => {
        let generatedMessage = '';

        const generationStream = sseStream({
          chatId: tempChatId,
          prompt: systemPrompt,
          onChunk: (data) => {
            let token = '';
            try {
              const parsed = JSON.parse(data);
              token = parsed?.token ?? '';
            } catch {
              token = data;
            }
            if (token) {
              generatedMessage += token;
            }
          },
          onDone: () => {
            isGeneratingPersonaMessage = false;
            // Clean up the generated message
            const cleanMessage = generatedMessage.trim()
              .replace(/^["']|["']$/g, '') // Remove quotes if present
              .replace(/^(User:|Student:|Teacher:)\s*/i, ''); // Remove role prefixes
            resolve(cleanMessage || getFallbackMessage(personaKey, conversationContext));
          },
          onError: (err) => {
            console.error('Error generating persona message:', err);
            isGeneratingPersonaMessage = false;
            // Fall back to simple context-aware message
            resolve(getFallbackMessage(personaKey, conversationContext));
          }
        });
      });
    } catch (error) {
      console.error('Error in generatePersonaMessageDynamic:', error);
      isGeneratingPersonaMessage = false;
      return getFallbackMessage(personaKey, conversationContext);
    }
  }

  // Fallback message generator (simple but context-aware)
  function getFallbackMessage(personaKey, conversationContext) {
    const hasHistory = conversationContext && conversationContext.length > 0;
    const lastBotMessage = hasHistory ? conversationContext[conversationContext.length - 1] : null;
    const isFollowUp = lastBotMessage && lastBotMessage.sender === 'bot';

    const fallbackMessages = {
      new_teacher: {
        initial: [
          "I'm new to teaching this subject. Can you help me understand the key concepts?",
          "How would you explain this topic to someone who's just starting to teach it?",
          "What are the most important things I should know about this subject?"
        ],
        followUp: [
          "Thanks! Can you elaborate on that?",
          "That's helpful. What else should I know?",
          "Could you provide more details about that?"
        ]
      },
      experienced_teacher: {
        initial: [
          "I've been teaching this for years. What's your approach to this topic?",
          "How does your method compare to traditional teaching approaches?",
          "What are some advanced insights on this subject?"
        ],
        followUp: [
          "Interesting approach. Can you provide more depth?",
          "I see. What about edge cases or advanced applications?",
          "How would you handle more complex scenarios?"
        ]
      },
      struggling_student: {
        initial: [
          "I'm having trouble understanding this. Can you help?",
          "This is really confusing to me. Where should I start?",
          "I don't get this at all. Can you explain it simply?"
        ],
        followUp: [
          "I'm still confused. Can you explain it differently?",
          "Can you show me a step-by-step example?",
          "I don't understand. Can you make it simpler?"
        ]
      },
      average_student: {
        initial: [
          "Can you explain this concept to me?",
          "I'd like to learn about this topic. Where do we start?",
          "How does this work?"
        ],
        followUp: [
          "Got it. What's next?",
          "That makes sense. Can you give another example?",
          "Okay, can you tell me more about that?"
        ]
      },
      advanced_student: {
        initial: [
          "I've mastered the basics. What are the advanced applications?",
          "Can you challenge me with something complex?",
          "What are the theoretical implications of this?"
        ],
        followUp: [
          "Understood. What's the next level?",
          "Can you show me a more complex scenario?",
          "How does this connect to more advanced topics?"
        ]
      },
      off_task_student: {
        initial: [
          "Do we really need to learn this?",
          "This seems boring. Why is this important?",
          "Can we talk about something more interesting?"
        ],
        followUp: [
          "Okay, but why does this matter?",
          "Fine, but can we move on?",
          "I guess... but is there more to it?"
        ]
      }
    };

    const messages = fallbackMessages[personaKey] || fallbackMessages.average_student;
    const pool = isFollowUp ? messages.followUp : messages.initial;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Start autonomous conversation
  async function startAutonomousConversation() {
    if (!persona || activeTab !== 'ai') {
      streamError = 'Please select a persona to start autonomous conversation';
      return;
    }

    isAutonomousRunning = true;
    autonomousTurnCount = 0;
    streamError = null;

    // Send first persona message
    await sendAutonomousMessage();
  }

  // Stop autonomous conversation
  function stopAutonomousConversation() {
    isAutonomousRunning = false;
    if (streamRef && typeof streamRef.close === 'function') {
      try { streamRef.close(); } catch {}
    }
  }

  // Send a message in autonomous mode
  async function sendAutonomousMessage() {
    if (!isAutonomousRunning || autonomousTurnCount >= maxTurns) {
      isAutonomousRunning = false;
      return;
    }

    try {
      // Generate persona message dynamically using AI
      const personaMessage = await generatePersonaMessageDynamic(persona, messages);

      if (!personaMessage || !isAutonomousRunning) {
        isAutonomousRunning = false;
        return;
      }

      // Add user message
      const userMsg = { id: Date.now().toString(), content: personaMessage, sender: 'user', attachments: [] };
      messages = [...messages, userMsg];
      autonomousTurnCount++;

      await ensureChat();
      // Add placeholder bot message to stream into
      const botMsg = { id: (Date.now() + 1).toString(), content: '', sender: 'bot' };
      messages = [...messages, botMsg];

      const personaKey = persona;
      const usePreviewCfg = currentChatbotId ? undefined : previewConfigWithUIOverrides($chatbotConfig);

      // Start streaming with callback to continue conversation
      startStreamingWithCallback(personaMessage, personaKey, usePreviewCfg, () => {
        // After bot response completes, continue if still running
        if (isAutonomousRunning && autonomousTurnCount < maxTurns) {
          // Wait a bit before next message for better UX
          setTimeout(() => {
            if (isAutonomousRunning) {
              sendAutonomousMessage();
            }
          }, 1500);
        } else {
          isAutonomousRunning = false;
        }
      });
    } catch (e) {
      console.error('Error in sendAutonomousMessage:', e);
      isAutonomousRunning = false;
      streamError = 'Failed to generate persona message. Please try again.';
    }
  }

  // Modified streaming function with completion callback
  function startStreamingWithCallback(prompt, personaKey, previewCfg, onComplete) {
    // Close previous stream if any
    if (streamRef && typeof streamRef.close === 'function') {
      try { streamRef.close(); } catch {}
    }
    streamError = null;

    streamRef = sseStream({
      chatId,
      prompt,
      persona: personaKey || undefined,
      previewConfig: previewCfg || undefined,
      onChunk: (data) => {
        let token = '';
        try {
          const parsed = JSON.parse(data);
          token = parsed?.token ?? '';
        } catch {
          token = data;
        }
        if (!token) return;
        // Append to last bot message
        const last = messages[messages.length - 1];
        if (last && last.sender === 'bot') {
          last.content += token;
          messages = [...messages.slice(0, -1), last];
        }
      },
      onDone: () => {
        streamRef = null;
        if (onComplete) onComplete();
      },
      onError: (err) => {
        try {
          if (err?.status || err?.statusText) {
            streamError = `${err.status || ''} ${err.statusText || ''}`.trim();
          } else if (typeof err === 'string') {
            streamError = err;
          } else if (err && typeof err === 'object') {
            streamError = err.error || err.message || JSON.stringify(err);
          } else {
            streamError = 'Streaming error occurred';
          }
        } catch {
          streamError = 'Streaming error occurred';
        }
        console.error('Preview stream error', err);
        streamRef = null;
        isAutonomousRunning = false;
      }
    });
  }

  onDestroy(() => {
    stopAutonomousConversation();
    if (streamRef && typeof streamRef.close === 'function') {
      try { streamRef.close(); } catch {}
    }
  });

  // Minimal markdown-to-HTML (bold, inline code, bullet lists). Escapes HTML first.
  function renderMarkdownLite(text) {
    try {
      if (!text) return '';
      // Normalize line endings
      text = String(text).replace(/\r\n?/g, '\n');

      const escape = (s) => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const formatInline = (s) => {
        // Work on escaped string so only our tags are injected
        let out = escape(s);
        // inline code: `code`
        out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
        // bold: **text**
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        return out;
      };

      const lines = text.split('\n');
      let i = 0;
      let html = '';
      while (i < lines.length) {
        const line = lines[i];
        if (/^\s*[-*]\s+/.test(line)) {
          // Collect consecutive bullet lines
          html += '<ul style="margin:0 0 8px 18px; padding:0;">';
          while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
            const item = lines[i].replace(/^\s*[-*]\s+/, '');
            html += `<li>${formatInline(item)}</li>`;
            i++;
          }
          html += '</ul>';
          continue;
        }
        // Empty line -> spacer
        if (/^\s*$/.test(line)) {
          html += '<div style="height:4px;"></div>';
          i++;
          continue;
        }
        html += `<p style="margin:0 0 8px 0;">${formatInline(line)}</p>`;
        i++;
      }
      return html;
    } catch (_) {
      return text;
    }
  }
</script>

<style>
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Max Turns Select Hover */
  .max-turns-select:not(:disabled):hover {
    border-color: #8B49DE !important;
  }

  .max-turns-select:not(:disabled):focus {
    border-color: #8B49DE !important;
    box-shadow: 0 0 0 3px rgba(139, 73, 222, 0.1);
  }

  /* Start Button Hover */
  .btn-start:hover {
    background: #7A3FCC !important;
    box-shadow: 0 2px 4px rgba(139, 73, 222, 0.3) !important;
  }

  .btn-start:active {
    background: #6B35B8 !important;
    transform: translateY(1px);
  }

  /* Stop Button Hover */
  .btn-stop:hover {
    background: #DC2626 !important;
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3) !important;
  }

  .btn-stop:active {
    background: #B91C1C !important;
    transform: translateY(1px);
  }

  /* Clear Button Hover */
  .btn-clear:not(:disabled):hover {
    background: #F9FAFB !important;
    border-color: #9CA3AF !important;
  }

  .btn-clear:not(:disabled):active {
    background: #F3F4F6 !important;
    transform: translateY(1px);
  }
</style>

<div class="shadow-sm {className}" style="width: 100%; max-width: 560px; height: auto; max-height: 70vh; opacity: 1; border-radius: 20px; border: 1px solid #EBEBEB; background: #FFFFFF;">
  <!-- Chatbot Header -->
  <div class="border-b border-gray-200 px-4 py-3" style="width: 100%; height: 58px; opacity: 1; border-top-left-radius: 19px; border-top-right-radius: 19px; background: linear-gradient(261.37deg, rgba(135, 206, 250, 0.1) 25.1%, rgba(104, 120, 182, 0.1) 76.25%); box-sizing: border-box;">
    <div class="flex items-center space-x-3">
      <!-- Chatbot Avatar -->
      <div class="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden" style="background: #E8E8E8;">
        {#if avatarSrc}
          <img src={avatarSrc} alt="Chatbot Avatar" class="w-full h-full object-cover" on:error={() => (avatarSrc = '')} />
        {:else}
          <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        {/if}
      </div>

      <!-- Chatbot Info -->
      <div class="flex-1">
        <h3 class="text-sm font-medium text-gray-900">{savedBot?.name || botName}</h3>
        <p class="text-xs text-gray-500">{savedBot?.bot_role || 'No Subject Selected'}</p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center space-x-1">
        <button class="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zM12 13a1 1 0 110-2 1 1 0 010 2zM12 20a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Preview Content -->
  <div style="width: 100%; height: auto; max-height: calc(70vh - 58px); opacity: 1; border-radius: 20px; background: #F9F9F9; padding: 16px; display: flex; flex-direction: column; box-sizing: border-box;">
    <!-- Autonomous Conversation Controls (AI Persona Test Mode) -->
    {#if activeTab === 'ai' && persona}
      <div style="margin-bottom: 12px; padding: 14px; background: linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%); border: 1px solid #E5E7EB; border-radius: 12px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);" on:click|stopPropagation on:mousedown|stopPropagation>
        <!-- Header Row -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <div style="font-size: 13px; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 6px;">
            <svg style="width: 16px; height: 16px; color: #8B49DE;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Autonomous Conversation
          </div>
          {#if isAutonomousRunning}
            <div style="display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 6px;">
              <span style="font-size: 11px; font-weight: 600; color: #6B7280;">
                Progress: {autonomousTurnCount}/{maxTurns}
              </span>
              {#if isGeneratingPersonaMessage}
                <span style="display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; color: #8B49DE; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;">
                  <svg style="width: 12px; height: 12px;" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  Generating...
                </span>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Controls Row -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <!-- Left: Turn Selector -->
          <div style="display: flex; align-items: center; gap: 8px;" on:click|stopPropagation>
            <label for="max-turns-select" style="font-size: 12px; font-weight: 500; color: #6B7280; white-space: nowrap;">Max Turns:</label>
            <select id="max-turns-select" bind:value={maxTurns} disabled={isAutonomousRunning}
              class="max-turns-select"
              on:click|stopPropagation
              on:mousedown|stopPropagation
              style="padding: 6px 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 12px; background: #FFFFFF; cursor: {isAutonomousRunning ? 'not-allowed' : 'pointer'}; transition: border-color 0.2s; outline: none;">
              <option value={6}>6 turns</option>
              <option value={8}>8 turns</option>
              <option value={10}>10 turns</option>
              <option value={15}>15 turns</option>
              <option value={20}>20 turns</option>
            </select>
          </div>

          <!-- Right: Action Buttons -->
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            {#if !isAutonomousRunning}
              <button on:click={startAutonomousConversation}
                class="btn-start"
                style="padding: 8px 16px; background: #8B49DE; color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background-color 0.2s, box-shadow 0.2s; box-shadow: 0 1px 2px rgba(139, 73, 222, 0.2);">
                <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start
              </button>
            {:else}
              <button on:click={stopAutonomousConversation}
                class="btn-stop"
                style="padding: 8px 16px; background: #EF4444; color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background-color 0.2s, box-shadow 0.2s; box-shadow: 0 1px 2px rgba(239, 68, 68, 0.2);">
                <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Stop
              </button>
            {/if}
            <button on:click={clearMessages} disabled={isAutonomousRunning}
              class="btn-clear"
              style="padding: 8px 14px; background: #FFFFFF; color: #6B7280; border: 1px solid #D1D5DB; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: {isAutonomousRunning ? 'not-allowed' : 'pointer'}; opacity: {isAutonomousRunning ? '0.5' : '1'}; transition: background-color 0.2s;">
              Clear
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Messages Area -->
    <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;">
      {#if streamError}
        <div role="alert" style="margin-bottom: 8px; background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; border-radius: 8px; padding: 8px 12px; font-size: 12px;">
          <strong style="margin-right:6px;">Error:</strong> {streamError}
        </div>
      {/if}
      {#if messages.length === 0}
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <h3 style="font-size: 24px; font-weight: 600; color: #6B7280; margin-bottom: 8px; text-align: center;">Test your bot</h3>
          <p style="font-size: 14px; color: #9CA3AF; text-align: center;">
            {#if activeTab === 'ai' && persona}
              Select max turns and click Start to begin autonomous conversation
            {:else}
              Start a conversation to test your bot
            {/if}
          </p>
          {#if activeTab !== 'ai' || !persona}
            <div class="mx-auto w-full max-w-2xl font-primary mt-3">
              <div class="mx-2">
                <Suggestions
                  suggestionPrompts={startersToSuggestions((displayCfg?.conversationStarters) || [])}
                  inputValue={message}
                  onSelect={({ data }) => {
                    message = data;

                  }}
                />
              </div>
            </div>
          {/if}
        </div>
      {:else}
        {#each messages as m}
          <div class="w-full flex" style="justify-content: {m.sender === 'user' ? 'flex-end' : 'flex-start'};">
            <div style="max-width: 85%; padding: 10px 12px; border-radius: 12px; font-size: 14px; line-height: 1.4; color: #111827; background: {m.sender === 'user' ? '#FFFFFF' : '#EEF2FF'}; border: 1px solid #E5E7EB;">
              {@html renderMarkdownLite(m.content)}
              {#if m.attachments && m.attachments.length}
                <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
                  {#each m.attachments as a}
                    {#if a.type === 'image'}
                      <img src={a.url} alt={a.name} style="width:96px; height:96px; object-fit:cover; border-radius:8px; border:1px solid #E5E7EB;" />
                    {:else}
                      <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border:1px solid #E5E7EB; border-radius:999px; background:#FFFFFF; font-size:12px;">{a.name}</span>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if getEnabledCaps(displayCfg).length}
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:8px 0 6px 0;">
        {#each getEnabledCaps(displayCfg) as cap}
          <span title="Enabled capability"
            style="padding:6px 10px; border:1px solid #E5E7EB; border-radius:999px; background:#F9FAFB; color:#374151; font-size:12px; display:inline-flex; align-items:center; gap:6px;">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getCapIconPath(cap.key)} />
            </svg>
            {cap.label}
          </span>

        {/each}
      </div>
    {/if}

    {#if $chatbotConfig?.sessionControl}
      {#if $chatbotConfig.sessionControl.duration || $chatbotConfig.sessionControl.deadline || $chatbotConfig.sessionControl.pauseResume}
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin:4px 0 8px 0;">
          {#if $chatbotConfig.sessionControl.duration}
            <span style="padding:4px 8px; border:1px solid #E5E7EB; border-radius:999px; background:#FFFFFF; color:#374151; font-size:12px;">Duration limit enabled</span>
          {/if}
          {#if $chatbotConfig.sessionControl.deadline}
            <span style="padding:4px 8px; border:1px solid #E5E7EB; border-radius:999px; background:#FFFFFF; color:#374151; font-size:12px;">Deadline enabled</span>
          {/if}
          {#if $chatbotConfig.sessionControl.pauseResume}
            <span style="padding:4px 8px; border:1px solid #E5E7EB; border-radius:999px; background:#FFFFFF; color:#374151; font-size:12px;">Pause/Resume enabled</span>
          {/if}
        </div>
      {/if}
      {#if $chatbotConfig.sessionControl.pauseResume}
        <div style="display:flex; justify-content:flex-end; gap:6px; margin-bottom:8px;">
          <button on:click={togglePause}


            style="padding:6px 10px; border:1px solid #E5E7EB; border-radius:999px; background:#F3F4F6; color:#374151; font-size:12px;">
            {sessionPaused ? 'Resume' : 'Pause'}
          </button>
          <button on:click={endSession}
            style="padding:6px 10px; border:1px solid #E5E7EB; border-radius:999px; background:#FEF2F2; color:#991B1B; font-size:12px;">
            End
          </button>
        </div>
      {/if}
    {/if}

    {#if files.length}
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:6px 4px 2px 4px;">
        {#each files as f, idx}
          {#if f.type === 'image'}
            <div style="position:relative; width:64px; height:64px; border-radius:8px; overflow:hidden; border:1px solid #E5E7EB; background:#FFFFFF;">
              <img src={f.url} alt={f.name} style="object-fit:cover; width:100%; height:100%;" />
              <button type="button" on:click={() => removeFileAt(idx)}
                style="position:absolute; top:2px; right:2px; width:18px; height:18px; border-radius:999px; background:#111827; color:#FFFFFF; font-size:12px; line-height:16px; text-align:center; border:none; cursor:pointer;">
                ×
              </button>
            </div>
          {:else}
            <div style="display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid #E5E7EB; border-radius:999px; background:#FFFFFF; font-size:12px;">
              <svg class="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getCapIconPath('fileUpload')} />
              </svg>
              <span>{f.name}</span>
              <button type="button" on:click={() => removeFileAt(idx)} style="margin-left:4px; background:transparent; border:none; color:#6B7280; cursor:pointer;">×</button>
            </div>
          {/if}
        {/each}
      </div>
    {/if}



    <!-- Message Input (ported from chat) -->
    {#if activeTab !== 'ai' || !isAutonomousRunning}
      <div class="pb-2" bind:this={inputWrapEl} style="background: #F9F9F9; padding-top: 6px;">
        <div style="position: relative; display: flex; gap: 8px; align-items: center; margin-top: 6px;">
          <!-- Plus button opens capability dropdown, similar to chat screen -->
          <button
            type="button"
            aria-label="Open capabilities"
            bind:this={menuBtnEl}
            on:click|stopPropagation={() => (showCapMenu = !showCapMenu)}
            style="display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:999px; border:1px solid #E5E7EB; background:#FFFFFF; color:#374151;"
          >
            <Plus class="w-4 h-4" />
          </button>

          <!-- Text input -->
          <input
            id="live-preview-input"
            type="text"
            placeholder="Type your message..."
            style="flex: 1; padding: 12px 16px; border: 1px solid #E5E7EB; border-radius: 24px; background: #FFFFFF; font-size: 14px; outline: none;"
            bind:value={message}
            on:keypress={(e) => e.key === 'Enter' && sendMessage(message)}
          />

          <!-- Send button -->
          <button
            on:click={() => sendMessage(message)}
            style="padding: 12px 20px; background: #6878B6; color: white; border: none; border-radius: 24px; font-size: 14px; font-weight: 500; cursor: pointer;"
          >
            Send
          </button>

          <!-- ChatGPT-like dropdown menu -->
          {#if showCapMenu}
            <div
              bind:this={menuEl}
              style="position:absolute; bottom: 46px; left: 0; background:#FFFFFF; border:1px solid #E5E7EB; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 8px; min-width: 260px; z-index: 10;"
              role="menu"
              aria-label="Composer actions"
            >
              <!-- Hidden file input for uploads -->
              <input bind:this={fileInputEl} type="file" multiple style="display:none" on:change={onFilesSelected} />

              <div style="font-size:11px; letter-spacing:0.02em; color:#6B7280; padding:6px 8px; text-transform:uppercase;">Quick actions</div>
              <button type="button" on:click|stopPropagation={openFilePicker}
                style="width:100%; display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; cursor:pointer; background:#FFFFFF; color:#111827; border:none; text-align:left;">
                <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getCapIconPath('fileUpload')} />
                </svg>
                <span style="font-size:13px;">Upload files</span>
              </button>

              <div style="height:8px;"></div>
              <div style="font-size:11px; letter-spacing:0.02em; color:#6B7280; padding:6px 8px; text-transform:uppercase;">Capabilities</div>

              <div style="max-height: 260px; overflow:auto; padding:2px 0;">
                {#each CAP_TOGGLE_KEYS as key}
                  <label style="width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:8px; cursor:pointer; background:#FFFFFF; color:#111827;">
                    <span style="display:flex; align-items:center; gap:10px;">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getCapIconPath(key)} />
                      </svg>
                      <span style="font-size:13px;">{CAP_LABELS[key] || key}</span>
                    </span>
                    <input type="checkbox" checked={isCapActive(key)} on:change|stopPropagation={() => toggleCap(key)} />
                  </label>
                {/each}
              </div>
            </div>
          {/if}
        </div>

      </div>
    {/if}

  </div>
</div>
