import { writable, derived } from 'svelte/store';
import { defaultChatbotConfig } from './chatbot-builder-types.js';

// Chatbot configuration store
export const chatbotConfig = writable(defaultChatbotConfig);

// Loading state
export const isLoading = writable(false);

// Errors store
export const errors = writable({});

// Dirty state (has unsaved changes)
export const isDirty = writable(false);

// Active section in the builder
export const activeSection = writable('overview');

// Build method (ai or manual)
export const buildMethod = writable('manual');

// Derived store for validation
export const isValid = derived(
  [chatbotConfig, errors],
  ([$config, $errors]) => {
    return Object.keys($errors).length === 0 && $config.name.trim() !== '';
  }
);

// Helper functions
export function updateConfig(updates) {
  chatbotConfig.update(config => ({ ...config, ...updates }));
  isDirty.set(true);
}

export function setError(field, message) {
  errors.update(errs => ({ ...errs, [field]: message }));
}

export function clearError(field) {
  errors.update(errs => {
    const newErrors = { ...errs };
    delete newErrors[field];
    return newErrors;
  });
}

export function clearAllErrors() {
  errors.set({});
}

export function resetConfig() {
  chatbotConfig.set(defaultChatbotConfig);
  clearAllErrors();
  isDirty.set(false);
}

export async function saveConfig() {
  isLoading.set(true);
  clearAllErrors(); // Clear previous errors

  try {
    // Import the API function dynamically to avoid SSR issues
    const { createChatbot, transformConfigToApiFormat } = await import('./api/chatbots.js');

    // Get current config
    let currentConfig;
    chatbotConfig.subscribe(config => {
      currentConfig = config;
    })();

    console.log('Saving config:', currentConfig);

    // Transform config to API format
    const apiData = transformConfigToApiFormat(currentConfig);
    console.log('Transformed API data:', apiData);

    // Create chatbot via API
    const result = await createChatbot(apiData);
    console.log('Chatbot created successfully:', result);

    // Reset the form after successful creation
    resetConfig();

    // If you need to keep the created ID somewhere else, handle it in the caller.
    isDirty.set(false);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to save configuration:', error);

    // Parse API error response to set field-specific errors
    parseAndSetErrors(error.message);

    return { success: false, error: error.message };
  } finally {
    isLoading.set(false);
  }
}

/**
 * Update an existing chatbot configuration
 * @param {string|number} chatbotId - The ID or UID of the chatbot to update
 * @param {boolean} partial - Whether to do a partial update (default: true)
 * @returns {Promise<Object>} Result object with success status and data/error
 */
export async function updateSavedConfig(chatbotId, partial = true) {
  isLoading.set(true);
  clearAllErrors(); // Clear previous errors

  try {
    // Import the API function dynamically to avoid SSR issues
    const { updateChatbot, transformConfigToApiFormat } = await import('./api/chatbots.js');

    // Get current config
    let currentConfig;
    chatbotConfig.subscribe(config => {
      currentConfig = config;
    })();

    console.log('Updating chatbot:', chatbotId, 'with config:', currentConfig);

    // Transform config to API format
    const apiData = transformConfigToApiFormat(currentConfig);
    console.log('Transformed API data:', apiData);

    // Update chatbot via API
    const result = await updateChatbot(chatbotId, apiData, { showAlerts: true, partial });
    console.log('Chatbot updated successfully:', result);

    // Mark as clean after successful update
    isDirty.set(false);

    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to update configuration:', error);

    // Parse API error response to set field-specific errors
    parseAndSetErrors(error.message);

    return { success: false, error: error.message };
  } finally {
    isLoading.set(false);
  }
}

/**
 * Load an existing chatbot configuration for editing
 * @param {string|number} chatbotId - The ID or UID of the chatbot to load
 * @returns {Promise<Object>} Result object with success status and data/error
 */
export async function loadConfigForEdit(chatbotId) {
  isLoading.set(true);
  clearAllErrors();

  try {
    // Import the API function dynamically to avoid SSR issues
    const { getChatbot } = await import('./api/chatbots.js');

    console.log('Loading chatbot for edit:', chatbotId);

    // Fetch chatbot data from API
    const result = await getChatbot(chatbotId);
    console.log('Chatbot loaded:', result);

    // Extract the actual chatbot data from the response
    const chatbotData = result?.records || result?.data || result;

    // Transform API data to internal config format
    const internalConfig = transformApiDataToConfig(chatbotData);
    console.log('Transformed to internal config:', internalConfig);

    // Update the store with loaded config
    chatbotConfig.set(internalConfig);
    isDirty.set(false);

    return { success: true, data: internalConfig };
  } catch (error) {
    console.error('Failed to load chatbot:', error);
    setError('general', `Failed to load chatbot: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    isLoading.set(false);
  }
}

/**
 * Transform API chatbot data to internal config format
 * @param {Object} apiData - Chatbot data from API
 * @returns {Object} Internal config format
 */
function transformApiDataToConfig(apiData) {
  // Helper to safely get array of conversation starter texts
  const getConversationStarters = (starters) => {
    if (!Array.isArray(starters)) return [];
    return starters.map(s => typeof s === 'string' ? s : (s?.text || '')).filter(t => t.trim());
  };

  // Helper to transform analysis scales to grading rubric format
  const getGradingRubric = (scales) => {
    if (!Array.isArray(scales) || scales.length === 0) {
      return { beginning: '', emerging: '' };
    }

    const rubric = {};
    scales.forEach(scale => {
      const levelName = (scale.level_name || '').toLowerCase();
      if (levelName === 'beginning') {
        rubric.beginning = scale.description || '';
      } else if (levelName === 'emerging') {
        rubric.emerging = scale.description || '';
      }
    });

    return rubric;
  };

  return {
    id: apiData.uid || apiData.id || '',
    name: apiData.name || '',
    description: apiData.description || '',
    image: apiData.picture || null,
    curriculumInfo: apiData.curriculum_info || '',
    curriculumSelected: Boolean(apiData.select_from_curriculum),
    gradeLevel: apiData.grade_level || '',
    botRole: apiData.bot_role || '',
    instructions: apiData.instructions || '',
    greetingMessage: apiData.greeting_message || '',
    conversationStarters: getConversationStarters(apiData.conversation_starters),
    knowledgeBase: apiData.chatbot_files || [],
    primaryLanguage: apiData.primary_language?.id || apiData.primary_language_id || '',
    secondaryLanguages: Array.isArray(apiData.secondary_languages)
      ? apiData.secondary_languages.map(lang => lang.id || lang)
      : [],
    gradingRubric: getGradingRubric(apiData.analysis_scales),
    capabilities: {
      webSearch: Boolean(apiData.real_time_web_search),
      fileUpload: Boolean(apiData.file_upload_analysis),
      imageUpload: Boolean(apiData.image_upload_gpt_vision),
      imageCreation: Boolean(apiData.create_images),
      createImages: Boolean(apiData.create_images),
      drawingTools: Boolean(apiData.drawing_tools),
      canvasEdit: Boolean(apiData.canvas_edit_modify)
    },
    sessionControl: {
      duration: apiData.duration_minutes || 0,
      deadline: apiData.deadlines || null,
      pauseResume: Boolean(apiData.pause_session),
      pause: Boolean(apiData.pause_session)
    }
  };
}

// Helper function to parse API errors and set field-specific errors
function parseAndSetErrors(errorMessage) {
  try {
    // Try to parse JSON error response
    const errorData = JSON.parse(errorMessage);

    if (errorData.errors) {
      // Handle field-specific errors
      Object.entries(errorData.errors).forEach(([field, messages]) => {
        const message = Array.isArray(messages) ? messages[0] : messages;

        // Map API field names to internal field names
        const fieldMapping = {
          'duration_minutes': 'duration',
          'secondary_language_ids': 'secondaryLanguages',
          'primary_language_id': 'primaryLanguage',
          'grade_level': 'gradeLevel',
          'bot_role': 'botRole',
          'greeting_message': 'greetingMessage',
          'conversation_starters': 'conversationStarters',
          'curriculum_info': 'curriculumInfo',
          'analysis_scales': 'gradingRubric',
          'chatbot_files': 'knowledgeFiles', // Map to the field used by existing UI
          'grading_rubric': 'gradingRubric'
        };

        const mappedField = fieldMapping[field] || field;
        setError(mappedField, message);
      });
    } else if (errorData.message) {
      // General error message
      setError('general', errorData.message);
    } else {
      // Fallback error
      setError('general', 'Failed to save configuration');
    }
  } catch (parseError) {
    // If we can't parse the error, show a general error
    setError('general', errorMessage || 'Failed to save configuration');
  }
}
