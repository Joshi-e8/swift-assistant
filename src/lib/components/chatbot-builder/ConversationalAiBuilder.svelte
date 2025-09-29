<script>
  // @ts-nocheck
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { chatbotConfig, updateConfig, saveConfig, buildMethod, activeSection } from '$lib/chatbot-builder-stores.js';
  import { fetchLanguages } from '$lib/api/languages.js';

  const dispatch = createEventDispatcher();

  // Conversational state
  let conversation = [];
  let currentMessage = '';
  let isTyping = false;
  let isGenerating = false;
  let currentQuestionIndex = 0;
  let userResponses = {};
  let isComplete = false;
  let error = '';
  let chatContainer;

  // Available options for suggestions
  let availableLanguages = [];

  // Final generated config
  let generatedConfig = null;

  // Quick reply suggestions
  let currentSuggestions = [];

  // Conversation flow - questions the AI assistant will ask
  const questions = [
    {
      id: 'welcome',
      text: "Hi! I'm your AI assistant, and I'm here to help you create the perfect chatbot. Let's start with the basics - what would you like your chatbot to help with? For example, are you creating it for education, customer support, or something else?",
      type: 'open',
      key: 'purpose'
    },
    {
      id: 'subject',
      text: "That sounds great! If this is for educational purposes, what subject or topic area will your chatbot focus on? (e.g., Math, Science, History, Language Arts, or something else)",
      type: 'open',
      key: 'subject',
      condition: (responses) => responses.purpose?.toLowerCase().includes('educat') || responses.purpose?.toLowerCase().includes('teach') || responses.purpose?.toLowerCase().includes('learn')
    },
    {
      id: 'audience',
      text: "Perfect! Who will be the main users of this chatbot? Are you targeting students, teachers, parents, or a general audience?",
      type: 'open',
      key: 'audience'
    },
    {
      id: 'gradeLevel',
      text: "What grade level or age group are you targeting? This helps me adjust the language and complexity appropriately.",
      type: 'open',
      key: 'gradeLevel'
    },
    {
      id: 'personality',
      text: "Now let's talk about personality! How would you like your chatbot to communicate? Should it be formal and professional, friendly and casual, encouraging and supportive, or something else?",
      type: 'open',
      key: 'tone'
    },
    {
      id: 'role',
      text: "What role should your chatbot play? For example: a helpful tutor, a knowledgeable expert, a friendly guide, a supportive mentor, or something else?",
      type: 'open',
      key: 'botRole'
    },
    {
      id: 'capabilities',
      text: "What special capabilities would you like your chatbot to have? I can enable features like:\n\n• Web search for current information\n• File upload and analysis\n• Image processing and vision\n• Image creation\n• Drawing tools\n• Canvas editing\n\nJust tell me which ones sound useful for your chatbot!",
      type: 'open',
      key: 'capabilities'
    },
    {
      id: 'language',
      text: "What language should your chatbot primarily use? And would you like it to support any additional languages?",
      type: 'open',
      key: 'languages'
    },
    {
      id: 'final',
      text: "Excellent! I have all the information I need. Let me create your chatbot configuration now...",
      type: 'final',
      key: 'complete'
    }
  ];

  onMount(async () => {
    // Load available languages
    try {
      availableLanguages = await fetchLanguages();
    } catch (e) {
      console.warn('Failed to load languages:', e);
    }

    // Start the conversation
    startConversation();
  });

  function startConversation() {
    conversation = [];
    currentQuestionIndex = 0;
    userResponses = {};
    isComplete = false;
    
    // Add welcome message
    addBotMessage(questions[0].text);

    // Set initial suggestions
    updateSuggestions(questions[0]);
  }

  function addBotMessage(text, delay = 1000) {
    isTyping = true;
    
    setTimeout(() => {
      conversation = [...conversation, {
        type: 'bot',
        text: text,
        timestamp: new Date()
      }];
      isTyping = false;
      scrollToBottom();
    }, delay);
  }

  function addUserMessage(text) {
    conversation = [...conversation, {
      type: 'user',
      text: text,
      timestamp: new Date()
    }];
    scrollToBottom();
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 100);
  }

  async function handleUserResponse() {
    if (!currentMessage.trim()) return;

    const userText = currentMessage.trim();
    addUserMessage(userText);

    // Store the response
    const currentQuestion = questions[currentQuestionIndex];
    userResponses[currentQuestion.key] = userText;

    console.log(`Question ${currentQuestionIndex}: ${currentQuestion.key} = ${userText}`);
    console.log('All responses so far:', userResponses);

    // Clear input and suggestions
    currentMessage = '';
    currentSuggestions = [];

    // Process the response and move to next question
    await processResponse(userText, currentQuestion);
  }

  async function processResponse(userText, question) {
    console.log(`Processing response for question ${currentQuestionIndex}: ${question.key}`);

    // Add contextual acknowledgment based on the response
    let acknowledgment = await getAcknowledgment(userText, question);
    if (acknowledgment) {
      addBotMessage(acknowledgment, 800);
    }

    // Check if we need a follow-up question based on the response
    const followUpQuestion = await generateFollowUpQuestion(userText, question);
    if (followUpQuestion) {
      console.log('Generated follow-up question:', followUpQuestion);
      setTimeout(() => {
        addBotMessage(followUpQuestion.text);
        // Store this as a dynamic question
        userResponses[followUpQuestion.key] = ''; // Will be filled by next response
        return; // Don't move to next predefined question yet
      }, acknowledgment ? 1500 : 800);
      return;
    }

    // Move to next question
    currentQuestionIndex++;
    console.log(`Moving to question index: ${currentQuestionIndex} of ${questions.length}`);

    // Check if we have more questions
    if (currentQuestionIndex < questions.length) {
      const nextQuestion = questions[currentQuestionIndex];
      console.log(`Next question: ${nextQuestion.key} - ${nextQuestion.text.slice(0, 50)}...`);

      // Check condition if exists
      if (nextQuestion.condition && !nextQuestion.condition(userResponses)) {
        console.log('Skipping question due to condition');
        // Skip this question and move to next
        currentQuestionIndex++;
        if (currentQuestionIndex < questions.length) {
          setTimeout(() => {
            addBotMessage(questions[currentQuestionIndex].text);
            updateSuggestions(questions[currentQuestionIndex]);
          }, acknowledgment ? 1500 : 800);
        } else {
          console.log('No more questions after skip, generating chatbot');
          setTimeout(() => generateChatbot(), acknowledgment ? 1500 : 800);
        }
      } else {
        // Check if this is the final question
        if (nextQuestion.type === 'final') {
          // This is the final message, generate chatbot immediately
          setTimeout(() => {
            addBotMessage(nextQuestion.text);
            // Generate chatbot after showing the final message
            setTimeout(() => generateChatbot(), 1500);
          }, acknowledgment ? 1500 : 800);
        } else {
          // Ask next question with appropriate delay
          setTimeout(() => {
            addBotMessage(nextQuestion.text);
            updateSuggestions(nextQuestion);
          }, acknowledgment ? 1500 : 800);
        }
      }
    } else {
      // All questions answered, generate the chatbot
      console.log('All questions completed, generating chatbot');
      setTimeout(() => generateChatbot(), acknowledgment ? 1500 : 800);
    }
  }

  async function generateFollowUpQuestion(userText, question) {
    // Disable follow-up questions for now to avoid breaking the flow
    // TODO: Re-enable once the main flow is working properly
    return null;
  }

  async function getAcknowledgment(userText, question) {
    // Use pattern-based acknowledgments for reliability
    // TODO: Re-enable AI acknowledgments once the main flow is stable
    return getFallbackAcknowledgment(userText, question);
  }



  function getFallbackAcknowledgment(userText, question) {
    const text = userText.toLowerCase();

    switch (question.key) {
      case 'purpose':
        if (text.includes('educat') || text.includes('teach') || text.includes('learn')) {
          return "Education - excellent choice! Educational chatbots can be incredibly helpful for learning.";
        } else if (text.includes('support') || text.includes('help')) {
          return "Support and assistance - that's a great use case for chatbots!";
        } else {
          return "Interesting! That sounds like a valuable application.";
        }

      case 'subject':
        return `${userText} - that's a fascinating subject! I'll make sure your chatbot is well-suited for that area.`;

      case 'audience':
        return "Perfect! Understanding your audience helps me tailor the chatbot's communication style.";

      case 'gradeLevel':
        return "Got it! I'll adjust the complexity and language appropriately for that level.";

      case 'tone':
        return "Excellent choice for the communication style! That will really shape how users interact with your bot.";

      case 'botRole':
        return "That's a great role for your chatbot! It will help define its personality and approach.";

      case 'capabilities':
        return "Those capabilities will make your chatbot much more powerful and useful!";

      case 'languages':
        return "Language support noted! I'll configure that for you.";

      default:
        return "Great! I've noted that information.";
    }
  }

  async function generateChatbot() {
    isGenerating = true;
    addBotMessage("Perfect! Let me analyze your responses and create your chatbot...", 500);

    try {
      console.log('Starting chatbot generation with responses:', userResponses);

      // Create the configuration based on responses
      const config = await createConfigFromResponses();
      console.log('Generated config:', config);

      if (!config) {
        throw new Error('Configuration generation returned null');
      }

      generatedConfig = config;

      // Show success message and automatically transition
      addBotMessage(`Great! I've created your chatbot configuration. Your bot will be named "${config.name}" and will help with ${config.description.toLowerCase()}.`, 1000);

      isComplete = true;
      currentSuggestions = []; // Clear suggestions when complete

      // Automatically transition to configuration review after a brief delay
      setTimeout(() => {
        transitionToConfigurationReview();
      }, 2500);
    } catch (e) {
      console.error('Chatbot generation error:', e);
      error = e.message || 'Failed to generate chatbot configuration';
      addBotMessage("I'm sorry, there was an error creating your chatbot configuration. Let me try a different approach...", 1000);

      // Try fallback generation
      try {
        const fallbackConfig = await createBasicConfigFromResponses();
        if (fallbackConfig) {
          generatedConfig = fallbackConfig;
          addBotMessage(`I've created your chatbot using a simplified approach. Your bot "${fallbackConfig.name}" is ready!`, 1500);
          isComplete = true;
          currentSuggestions = [];

          // Automatically transition to configuration review after fallback generation
          setTimeout(() => {
            transitionToConfigurationReview();
          }, 2500);
        }
      } catch (fallbackError) {
        console.error('Fallback generation also failed:', fallbackError);
        addBotMessage("I'm having trouble generating your chatbot. Please try starting over or contact support.", 1000);
      }
    } finally {
      isGenerating = false;
    }
  }

  async function createConfigFromResponses() {
    console.log('Creating config from responses:', userResponses);

    // Use the intelligent pattern matching (no external APIs needed)
    try {
      const basicConfig = await createBasicConfigFromResponses();
      console.log('Config created successfully:', basicConfig);
      return basicConfig;
    } catch (basicError) {
      console.error('Config creation failed:', basicError);
      // Last resort: create minimal config
      return createMinimalConfig();
    }
  }

  function createMinimalConfig() {
    console.log('Creating minimal fallback config');
    return {
      name: 'AI Assistant',
      description: 'AI Assistant',
      botRole: 'helpful assistant',
      instructions: 'You are a helpful AI assistant.',
      greetingMessage: 'Hello! How can I help you today?',
      gradeLevel: '',
      primaryLanguage: '1', // Default to English (API ID format)
      secondaryLanguages: [],
      conversationStarters: ['How can you help me?', 'What can you do?', 'Tell me about yourself'],
      capabilities: {
        webSearch: false,
        fileUpload: false,
        imageUpload: false,
        imageCreation: false,
        drawingTools: false,
        canvasEdit: false
      },
      sessionControl: {
        duration: 0,
        pauseResume: false
      }
    };
  }



  async function createBasicConfigFromResponses() {
    // Enhanced fallback parsing with intelligent pattern matching
    const responses = userResponses;

    // Smart capability parsing with improved detection
    const capabilitiesText = (responses.capabilities || '').toLowerCase();
    console.log('ConversationalAiBuilder - Capabilities text:', capabilitiesText);

    // Enhanced capability detection with more inclusive patterns
    const capabilities = {
      webSearch: /web|search|internet|online|current|news|real.?time|research|information|latest|up.?to.?date/.test(capabilitiesText),
      fileUpload: /file|upload|document|pdf|analyze|attachment|text|doc|analysis/.test(capabilitiesText),
      imageUpload: /image|photo|picture|vision|visual|see|view|analyze.*image/.test(capabilitiesText),
      imageCreation: /create|generate|make|draw.*image|image.*create|illustration|graphic|visual.*content/.test(capabilitiesText),
      drawingTools: /draw|sketch|paint|canvas|art|whiteboard|diagram/.test(capabilitiesText),
      canvasEdit: /canvas|edit|modify|change|text.*edit|document.*edit/.test(capabilitiesText)
    };

    // If user mentions "all capabilities" or similar, enable common ones
    if (/all|everything|full|complete|comprehensive/.test(capabilitiesText)) {
      capabilities.webSearch = true;
      capabilities.fileUpload = true;
      capabilities.imageUpload = true;
    }

    // Default to web search for educational bots if no specific capabilities mentioned
    if (capabilitiesText.trim() === '' || capabilitiesText.includes('basic')) {
      capabilities.webSearch = true; // Most educational bots benefit from web search
    }

    console.log('ConversationalAiBuilder - Generated capabilities:', capabilities);

    // Smart language parsing
    const languageText = (responses.languages || 'english').toLowerCase();
    let primaryLanguage = '1'; // Default English (ID)
    let secondaryLanguages = [];

    if (availableLanguages.length > 0) {
      // Try to find primary language
      const primaryMatch = availableLanguages.find(lang =>
        languageText.includes(lang.name.toLowerCase()) ||
        (lang.code && languageText.includes(lang.code.toLowerCase()))
      );
      if (primaryMatch) {
        // Store as string ID for consistency with API format
        primaryLanguage = String(primaryMatch.id);
      }

      // Look for multiple language indicators
      if (/multiple|several|many|bilingual|multilingual/.test(languageText)) {
        // Add common secondary languages
        const commonSecondary = availableLanguages.filter(lang =>
          ['spanish', 'french', 'german', 'chinese'].includes(lang.name.toLowerCase())
        );
        // Store as string IDs for consistency with API format
        secondaryLanguages = commonSecondary.slice(0, 2).map(lang => String(lang.id));
      }
    }

    // Smart name generation
    const purpose = responses.purpose || 'Assistant';
    const subject = responses.subject || '';
    let botName;

    if (subject && purpose) {
      if (purpose.toLowerCase().includes('educat')) {
        botName = `${subject} Tutor`;
      } else if (purpose.toLowerCase().includes('support')) {
        botName = `${subject} Support Bot`;
      } else {
        botName = `${subject} ${purpose}`;
      }
    } else if (subject) {
      botName = `${subject} Assistant`;
    } else {
      botName = purpose;
    }

    // Smart role inference
    let botRole = responses.botRole || 'helpful assistant';
    if (!responses.botRole) {
      if (purpose.toLowerCase().includes('educat') || purpose.toLowerCase().includes('teach')) {
        botRole = 'educational tutor';
      } else if (purpose.toLowerCase().includes('support')) {
        botRole = 'support specialist';
      } else if (subject) {
        botRole = `${subject} expert`;
      }
    }

    // Smart instruction generation
    const instructions = generateSmartInstructions(responses, botRole);

    // Smart greeting generation
    const greetingMessage = generateSmartGreeting(responses, botRole, subject);

    // Generate comprehensive configuration with ALL manual builder fields
    console.log('ConversationalAiBuilder - Generated language values:');
    console.log('Primary language:', primaryLanguage);
    console.log('Secondary languages:', secondaryLanguages);
    console.log('Available languages:', availableLanguages);

    return {
      // Overview Section
      name: botName.slice(0, 100),
      description: responses.purpose || 'AI Assistant',
      curriculumInfo: generateCurriculumInfo(responses),
      image: null,

      // Behavior & Knowledge Section
      gradeLevel: responses.gradeLevel || '',
      botRole: botRole,
      instructions: instructions,
      greetingMessage: greetingMessage,
      conversationStarters: generateConversationStarters(),
      knowledgeBase: [],

      // Language Control Section
      primaryLanguage: primaryLanguage,
      secondaryLanguages: secondaryLanguages,

      // Grading Section
      gradingRubric: generateGradingRubric(responses),

      // Bot Capabilities Section
      capabilities: capabilities,

      // Session Control Section
      sessionControl: {
        duration: 0,
        deadline: null,
        pauseResume: false
      }
    };
  }

  function generateSmartInstructions(responses, botRole) {
    let instructions = `You are a ${botRole}`;

    if (responses.subject) {
      instructions += ` specializing in ${responses.subject}`;
    }

    if (responses.audience) {
      instructions += `. Your primary audience is ${responses.audience}`;
    }

    if (responses.gradeLevel) {
      instructions += ` at ${responses.gradeLevel} level`;
    }

    if (responses.tone) {
      instructions += `. Your communication style should be ${responses.tone}`;
    } else {
      instructions += '. Your communication style should be friendly and professional';
    }

    instructions += '. Always be helpful, accurate, and encouraging in your responses.';

    return instructions;
  }

  function generateSmartGreeting(responses, botRole, subject) {
    const greetings = [
      `Hello! I'm your ${botRole}${subject ? ` for ${subject}` : ''}. How can I help you today?`,
      `Hi there! I'm here to help you${subject ? ` with ${subject}` : ''}. What would you like to know?`,
      `Welcome! I'm your ${botRole}${subject ? ` specializing in ${subject}` : ''}. What can I assist you with?`
    ];

    // Choose greeting based on tone
    const tone = responses.tone?.toLowerCase() || '';
    if (tone.includes('casual') || tone.includes('friendly')) {
      return greetings[0];
    } else if (tone.includes('professional') || tone.includes('formal')) {
      return greetings[2];
    } else {
      return greetings[1];
    }
  }

  function generateConversationStarters() {
    const subject = userResponses.subject || '';
    const role = userResponses.botRole || 'assistant';

    const starters = [];

    if (subject) {
      starters.push(`Tell me about ${subject}`);
      starters.push(`How can you help me with ${subject}?`);
      starters.push(`What ${subject} topics do you know about?`);
      starters.push(`Can you explain a ${subject} concept?`);
    } else {
      starters.push(`What can you help me with?`);
      starters.push(`Tell me about your capabilities`);
      starters.push(`How do you work?`);
      starters.push(`What topics can we discuss?`);
    }

    return starters;
  }

  function generateCurriculumInfo(responses) {
    const subject = responses.subject || '';
    const gradeLevel = responses.gradeLevel || '';
    const purpose = responses.purpose || '';

    if (subject && gradeLevel) {
      return `This chatbot is designed to support ${gradeLevel} students in ${subject}. ${purpose}`;
    } else if (subject) {
      return `This chatbot focuses on ${subject} education and learning support.`;
    } else if (purpose.toLowerCase().includes('educat')) {
      return `This educational chatbot provides learning support and guidance.`;
    }

    return 'General purpose AI assistant for educational support.';
  }

  function generateGradingRubric(responses) {
    const subject = responses.subject || '';
    const gradeLevel = responses.gradeLevel || '';

    if (subject && gradeLevel) {
      return {
        beginning: `Student shows basic understanding of ${subject} concepts appropriate for ${gradeLevel} level.`,
        emerging: `Student demonstrates developing proficiency in ${subject} with some guidance needed.`,
        proficient: `Student shows solid understanding and can apply ${subject} concepts independently.`,
        advanced: `Student demonstrates mastery of ${subject} concepts and can extend learning to new situations.`
      };
    }

    return {
      beginning: 'Student shows basic understanding of concepts with significant support needed.',
      emerging: 'Student demonstrates developing understanding with some guidance required.',
      proficient: 'Student shows solid understanding and can work independently.',
      advanced: 'Student demonstrates mastery and can extend learning to new contexts.'
    };
  }

  async function transitionToConfigurationReview() {
    if (!generatedConfig) return;

    console.log('🔄 Transitioning to configuration review with config:', generatedConfig);

    try {
      // Add a brief message about the transition
      addBotMessage("Perfect! I've prepared your chatbot configuration. Let me show you a review of everything I've set up...", 1000);

      // Transition to configuration review after a short delay
      setTimeout(() => {
        dispatch('review-config', { config: generatedConfig });
      }, 2000);

    } catch (error) {
      console.error('Error transitioning to configuration review:', error);
      addBotMessage(`Sorry, there was an error preparing your configuration: ${error.message}. Please try again.`, 1000);
    }
  }

  function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleUserResponse();
    }
  }

  function restartConversation() {
    startConversation();
    generatedConfig = null;
    error = '';
  }

  async function updateSuggestions(question) {
    // Use contextual static suggestions (no external APIs needed)
    getStaticSuggestions(question);
  }



  function getStaticSuggestions(question) {
    switch (question.key) {
      case 'purpose':
        currentSuggestions = ['Education & Learning', 'Customer Support', 'Personal Assistant', 'Training & Onboarding'];
        break;
      case 'subject':
        // Make subject suggestions contextual based on purpose
        if (userResponses.purpose?.toLowerCase().includes('educat')) {
          currentSuggestions = ['Mathematics', 'Science', 'History', 'Language Arts', 'Computer Science', 'Art'];
        } else {
          currentSuggestions = ['Technology', 'Business', 'Healthcare', 'Finance', 'General Knowledge'];
        }
        break;
      case 'audience':
        currentSuggestions = ['Elementary Students', 'High School Students', 'College Students', 'Teachers', 'General Public'];
        break;
      case 'gradeLevel':
        currentSuggestions = ['K-2', '3-5', '6-8', '9-12', 'College Level', 'Adult Learning'];
        break;
      case 'tone':
        currentSuggestions = ['Friendly & Casual', 'Professional & Formal', 'Encouraging & Supportive', 'Playful & Fun'];
        break;
      case 'botRole':
        // Make role suggestions contextual
        if (userResponses.purpose?.toLowerCase().includes('educat')) {
          currentSuggestions = ['Helpful Tutor', 'Study Buddy', 'Learning Coach', 'Subject Expert'];
        } else {
          currentSuggestions = ['Helpful Assistant', 'Expert Advisor', 'Friendly Guide', 'Problem Solver'];
        }
        break;
      case 'capabilities':
        currentSuggestions = ['Web Search', 'File Analysis', 'Image Processing', 'All Capabilities', 'Basic Chat Only'];
        break;
      case 'languages':
        currentSuggestions = ['English Only', 'English + Spanish', 'Multiple Languages', 'Other Language'];
        break;
      default:
        currentSuggestions = [];
    }
  }

  function selectSuggestion(suggestion) {
    currentMessage = suggestion;
    handleUserResponse();
  }
</script>

<style>
  .suggestion-btn:hover {
    background: linear-gradient(135deg, #6878B6 0%, #8B49DE 100%) !important;
    color: white !important;
  }

  .input-focus:focus {
    --tw-ring-color: #6878B6 !important;
    border-color: #6878B6 !important;
  }
</style>

<div class="h-full flex flex-col" style="background: #FFFFFF;">
  <!-- Header with Progress -->
  <div class="border-b border-gray-200 p-4" style="background: #FFFFFF;">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-xl font-semibold text-gray-900" style="font-family: 'Plus Jakarta Sans', sans-serif;">AI-Assisted Chatbot Builder</h2>
        <p class="text-sm text-gray-600">Let our AI assistant guide you through creating your perfect chatbot</p>
      </div>
      <div class="flex items-center gap-4">
        {#if !isComplete && !isGenerating}
          <div class="text-sm" style="color: #6878B6; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 500;">
            Step {currentQuestionIndex + 1} of {questions.length}
          </div>
        {/if}
        <button
          class="text-sm hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors"
          style="color: #6878B6;"
          on:click={restartConversation}
        >
          Start Over
        </button>
      </div>
    </div>

    <!-- Progress Bar -->
    {#if !isComplete}
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div
          class="h-2 rounded-full transition-all duration-500 ease-out"
          style="background: linear-gradient(90deg, #6878B6 0%, #8B49DE 100%); width: {((currentQuestionIndex + 1) / questions.length) * 100}%"
        ></div>
      </div>
    {:else if isGenerating}
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div
          class="h-2 rounded-full animate-pulse"
          style="background: linear-gradient(90deg, #6878B6 0%, #8B49DE 100%); width: 100%"
        ></div>
      </div>
      <div class="mt-2 text-center">
        <p class="text-sm" style="color: #6878B6; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 500;">
          🤖 Generating your chatbot configuration...
        </p>
      </div>
    {/if}
  </div>

  <!-- Chat Container -->
  <div class="flex-1 overflow-y-auto p-4" bind:this={chatContainer}>
    <div class="max-w-3xl mx-auto space-y-4">
      {#each conversation as message}
        <div class="flex {message.type === 'user' ? 'justify-end' : 'justify-start'}">
          <div class="max-w-xs lg:max-w-md">
            {#if message.type === 'bot'}
              <div class="flex items-start space-x-3">
                <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style="background: linear-gradient(135deg, #6878B6 0%, #8B49DE 100%);">
                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div class="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <p class="text-sm text-gray-800 whitespace-pre-wrap" style="font-family: 'Plus Jakarta Sans', sans-serif; line-height: 1.5;">{message.text}</p>
                </div>
              </div>
            {:else}
              <div class="rounded-xl px-4 py-3 text-white" style="background: linear-gradient(135deg, #6878B6 0%, #8B49DE 100%);">
                <p class="text-sm whitespace-pre-wrap" style="font-family: 'Plus Jakarta Sans', sans-serif; line-height: 1.5;">{message.text}</p>
              </div>
            {/if}
          </div>
        </div>
      {/each}

      <!-- Typing Indicator -->
      {#if isTyping}
        <div class="flex justify-start">
          <div class="flex items-start space-x-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: linear-gradient(135deg, #6878B6 0%, #8B49DE 100%);">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div class="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
              <div class="flex space-x-1">
                <div class="w-2 h-2 rounded-full animate-bounce" style="background: #6878B6;"></div>
                <div class="w-2 h-2 rounded-full animate-bounce" style="background: #6878B6; animation-delay: 0.1s"></div>
                <div class="w-2 h-2 rounded-full animate-bounce" style="background: #6878B6; animation-delay: 0.2s"></div>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Input Area -->
  <div class="border-t border-gray-200 p-4">
    <div class="max-w-3xl mx-auto">
      {#if isComplete && generatedConfig}
        <!-- Transition Message -->
        <div class="flex items-center justify-center space-x-4">
          <div class="text-center">
            <div class="inline-flex items-center px-6 py-3 rounded-xl border" style="background: linear-gradient(135deg, #6878B6 0%, #8B49DE 100%); color: white;">
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 500;">Preparing configuration review...</span>
            </div>
            <p class="text-sm text-gray-600 mt-3" style="font-family: 'Plus Jakarta Sans', sans-serif;">You'll be able to review and customize everything in the next step</p>
          </div>
        </div>
      {:else if !isGenerating}
        <!-- Quick Reply Suggestions -->
        {#if currentSuggestions.length > 0 && !isTyping}
          <div class="mb-4">
            <p class="text-sm text-gray-600 mb-3" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 500;">Quick replies:</p>
            <div class="flex flex-wrap gap-2">
              {#each currentSuggestions as suggestion}
                <button
                  class="suggestion-btn px-4 py-2 text-sm rounded-xl border border-gray-200 hover:border-transparent transition-all duration-200"
                  style="background: white; color: #6878B6; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 500;"
                  on:click={() => selectSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Message Input -->
        <div class="flex space-x-3">
          <input
            type="text"
            class="input-focus flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:border-transparent transition-all duration-200"
            style="font-family: 'Plus Jakarta Sans', sans-serif;"
            placeholder="Type your response or use quick replies above..."
            bind:value={currentMessage}
            on:keypress={handleKeyPress}
            disabled={isTyping}
          />
          <button
            class="px-6 py-3 text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-all duration-200"
            style="background: linear-gradient(135deg, #6878B6 0%, #8B49DE 100%); font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 500;"
            on:click={handleUserResponse}
            disabled={!currentMessage.trim() || isTyping}
          >
            Send
          </button>
        </div>
      {/if}

      <!-- Error Display -->
      {#if error}
        <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div class="flex items-center">
            <svg class="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-sm text-red-700">{error}</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
