<script>
  import { createEventDispatcher } from 'svelte';
  import { updateConfig, activeSection, buildMethod } from '$lib/chatbot-builder-stores.js';
  import { fetchLanguages } from '$lib/api/languages.js';

  const dispatch = createEventDispatcher();

  export let generatedConfig = {};


  
  let availableLanguages = [];
  let isLoading = false;
  let languagesLoaded = false;

  // Load languages for display with better error handling
  async function loadLanguages() {
    try {
      const langs = await fetchLanguages();
      availableLanguages = langs;
      languagesLoaded = true;
      console.log('Languages loaded for ConfigurationReview:', langs);
    } catch (error) {
      console.warn('Failed to load languages in ConfigurationReview:', error);
      // Use fallback languages if API fails
      availableLanguages = [
        { code: '1', name: 'English', id: 1 },
        { code: '2', name: 'Spanish', id: 2 },
        { code: '3', name: 'French', id: 3 },
        { code: '4', name: 'German', id: 4 },
        { code: '5', name: 'Italian', id: 5 }
      ];
      languagesLoaded = true;
    }
  }

  // Load languages on component initialization
  loadLanguages();





  const sections = [
    {
      id: 'overview',
      title: 'Overview',
      fields: [
        { key: 'name', label: 'Bot Name', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'image', label: 'Chatbot Image', type: 'image' },
        { key: 'curriculumInfo', label: 'Curriculum Information', type: 'textarea' }
      ]
    },
    {
      id: 'behavior',
      title: 'Behavior & Knowledge',
      fields: [
        { key: 'gradeLevel', label: 'Grade Level', type: 'text' },
        { key: 'botRole', label: 'Bot Role', type: 'text' },
        { key: 'instructions', label: 'Instructions', type: 'textarea' },
        { key: 'greetingMessage', label: 'Greeting Message', type: 'textarea' },
        { key: 'conversationStarters', label: 'Conversation Starters', type: 'array' }
      ]
    },
    {
      id: 'language',
      title: 'Language Control',
      fields: [
        { key: 'primaryLanguage', label: 'Primary Language', type: 'language' },
        { key: 'secondaryLanguages', label: 'Secondary Languages', type: 'language-array' }
      ]
    },
    {
      id: 'grading',
      title: 'Grading',
      fields: [
        { key: 'gradingRubric', label: 'Grading Rubric', type: 'object' }
      ]
    },
    {
      id: 'capabilities',
      title: 'Bot Capabilities',
      fields: [
        { key: 'capabilities', label: 'Capabilities', type: 'capabilities' }
      ]
    },
    {
      id: 'session',
      title: 'Session Control',
      fields: [
        { key: 'sessionControl', label: 'Session Control', type: 'session' }
      ]
    }
  ];

  function getLanguageDisplayName(code) {
    if (!code) return 'Not set';

    // If languages aren't loaded yet, use fallback mapping
    if (availableLanguages.length === 0) {
      const fallbackMap = {
        '1': 'English',
        '2': 'Spanish',
        '3': 'French',
        '4': 'German',
        '5': 'Italian',
        '6': 'Portuguese',
        '7': 'Russian',
        '8': 'Japanese',
        '9': 'Korean',
        '10': 'Chinese'
      };
      return fallbackMap[String(code)] || code;
    }

    // Handle both string and numeric codes
    const codeStr = String(code);

    // First try to find by code (for manual builder format like 'en', 'es')
    let lang = availableLanguages.find(l => l.code === codeStr);

    // If not found, try to find by id (for AI builder format like '1', '2')
    if (!lang) {
      lang = availableLanguages.find(l => String(l.id) === codeStr);
    }

    // If still not found, try to find by numeric comparison
    if (!lang && !isNaN(code)) {
      lang = availableLanguages.find(l => l.id === parseInt(code));
    }

    return lang ? lang.name : code;
  }

  function formatValue(field, value) {
    if (!value) return 'Not set';

    switch (field.type) {
      case 'array':
        return Array.isArray(value) ? value.join(', ') : 'Not set';
      case 'language':
        return getLanguageDisplayName(value);
      case 'language-array':
        return Array.isArray(value) ? value.map(getLanguageDisplayName).join(', ') : 'Not set';
      case 'capabilities':
        const enabled = Object.entries(value || {}).filter(([k, v]) => v).map(([k]) => k);

        // Convert camelCase to readable names
        const readableNames = enabled.map(key => {
          switch (key) {
            case 'webSearch': return 'Web Search';
            case 'fileUpload': return 'File Upload';
            case 'imageUpload': return 'Image Upload';
            case 'imageCreation': return 'Image Creation';
            case 'drawingTools': return 'Drawing Tools';
            case 'canvasEdit': return 'Canvas Edit';
            default: return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          }
        });

        return readableNames.length > 0 ? readableNames.join(', ') : 'None enabled';
      case 'image':
        if (value && typeof value === 'string' && value.startsWith('data:')) {
          return 'Image uploaded (preview available)';
        } else if (value) {
          return 'Image uploaded';
        } else {
          return 'No image';
        }
      case 'session':
        const parts = [];
        if (value?.duration) parts.push(`Duration: ${value.duration} minutes`);
        if (value?.pauseResume) parts.push('Pause/Resume enabled');
        return parts.length > 0 ? parts.join(', ') : 'No session controls';
      case 'object':
        if (field.key === 'gradingRubric') {
          const levels = Object.entries(value || {}).filter(([k, v]) => v);
          return levels.length > 0 ? levels.map(([k, v]) => `${k}: ${v}`).join('; ') : 'Not set';
        }
        return JSON.stringify(value || {});
      default:
        return String(value || 'Not set');
    }
  }



  function confirmConfiguration() {
    isLoading = true;
    try {
      // Apply the generated config to the store to pre-populate manual builder
      updateConfig(generatedConfig);

      // Set the build method to manual to switch to manual builder interface
      buildMethod.set('manual');

      // Set the active section to overview to start from the beginning
      activeSection.set('overview');

      // Dispatch confirmed event to notify parent component
      dispatch('confirmed');
    } catch (error) {
      console.error('Error applying configuration:', error);
      // Still proceed to manual builder even if there's an error
      dispatch('confirmed');
    } finally {
      isLoading = false;
    }
  }

  function goBackToAI() {
    dispatch('back');
  }
</script>



<!-- Full height container with proper scrolling -->
<div class="h-full flex flex-col">
  <!-- Scrollable content area -->
  <div class="flex-1 overflow-y-auto">
    <div class="max-w-4xl mx-auto p-6">
      <!-- Header -->
      <div class="mb-8">
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center mr-4" style="background: linear-gradient(135deg, #6878B6 0%, #8B49DE 100%);">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 mb-1" style="font-family: 'Plus Jakarta Sans', sans-serif;">Review Your Chatbot Configuration</h2>
            <p class="text-gray-600" style="font-family: 'Plus Jakarta Sans', sans-serif;">Please review the AI-generated configuration below. You can proceed to edit the configuration or create your chatbot.</p>
          </div>
        </div>

        <!-- Progress Indicator -->
        <div class="flex items-center justify-center mb-6">
          <div class="flex items-center space-x-4">
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium" style="background: #6878B6;">
                ✓
              </div>
              <span class="ml-2 text-sm font-medium text-gray-900" style="font-family: 'Plus Jakarta Sans', sans-serif;">AI Data Collection</span>
            </div>
            <div class="w-8 h-0.5" style="background: #6878B6;"></div>
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium" style="background: #8B49DE;">
                2
              </div>
              <span class="ml-2 text-sm font-medium" style="color: #8B49DE; font-family: 'Plus Jakarta Sans', sans-serif;">Configuration Review</span>
            </div>
            <div class="w-8 h-0.5 bg-gray-300"></div>
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 text-sm font-medium bg-gray-200">
                3
              </div>
              <span class="ml-2 text-sm font-medium text-gray-500" style="font-family: 'Plus Jakarta Sans', sans-serif;">Manual Builder</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Configuration Sections -->
      <div class="space-y-6">
        {#each sections as section}
          <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
            <!-- Section Header -->
            <div class="px-6 py-4 border-b border-gray-200" style="background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);">
              <h3 class="text-lg font-semibold text-gray-900" style="font-family: 'Plus Jakarta Sans', sans-serif;">{section.title}</h3>
            </div>

            <!-- Section Content -->
            <div class="px-6 py-4">
              <div class="space-y-4">
                {#each section.fields as field}
                  <div class="flex flex-col sm:flex-row sm:items-start gap-2">
                    <div class="sm:w-1/3">
                      <label class="text-sm font-medium text-gray-700">{field.label}:</label>
                    </div>
                    <div class="sm:w-2/3">
                      <div class="text-sm text-gray-900 bg-gray-50 rounded-lg p-3 min-h-[2.5rem] flex items-center">
                        {formatValue(field, generatedConfig[field.key])}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Bottom padding to ensure content doesn't get hidden behind sticky footer -->
      <div class="h-24"></div>
    </div>
  </div>

  <!-- Sticky Action Buttons Footer -->
  <div class="flex-shrink-0 bg-white border-t border-gray-200 px-6 py-4 shadow-lg">
    <div class="max-w-4xl mx-auto flex items-center justify-between">
      <button
        on:click={goBackToAI}
        class="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 hover:shadow-sm"
        style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 500;"
      >
        ← Back to AI Builder
      </button>

      <div class="flex items-center gap-4">
        <button
          on:click={confirmConfiguration}
          disabled={isLoading}
          class="px-8 py-3 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
          style="background: #6878B6; font-family: 'Plus Jakarta Sans', sans-serif;"
        >
          {#if isLoading}
            <div class="flex items-center gap-2">
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span style="font-family: 'Plus Jakarta Sans', sans-serif;">Preparing Manual Builder...</span>
            </div>
          {:else}
            <span style="font-family: 'Plus Jakarta Sans', sans-serif;">Edit or Create Bot</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>
