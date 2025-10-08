<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ChatbotBuilderMain from '$lib/components/chatbot-builder/ChatbotBuilderMain.svelte';
  import { loadConfigForEdit, chatbotConfig } from '$lib/chatbot-builder-stores.js';

  let chatbotId = '';
  let loading = true;

  // Reactive statement to watch for changes in the id parameter
  $: if ($page.params.id) {
    loadChatbot($page.params.id);
  }

  async function loadChatbot(id) {
    // Reset loading state
    loading = true;
    chatbotId = id;

    if (!chatbotId) {
      toast.error('No chatbot ID provided');
      goto('/chatbot-builder');
      return;
    }

    console.log('Loading chatbot for edit:', chatbotId);

    // Load the chatbot data
    const result = await loadConfigForEdit(chatbotId);

    if (result.success) {
      toast.success('Chatbot loaded successfully');
      loading = false;
    } else {
      toast.error(`Failed to load chatbot: ${result.error}`);
      // Redirect back to builder after a delay
      setTimeout(() => {
        goto('/chatbot-builder');
      }, 2000);
    }
  }
</script>

<svelte:head>
  <title>Edit Chatbot - {$chatbotConfig.name || 'Swift Assistant'}</title>
</svelte:head>

{#if loading}
  <div class="flex items-center justify-center h-full">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p class="text-gray-600">Loading chatbot...</p>
    </div>
  </div>
{:else}
  <ChatbotBuilderMain editMode={true} {chatbotId} />
{/if}

