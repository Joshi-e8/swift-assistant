<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { getChatbots, deleteChatbot } from '$lib/api/chatbots.js';

  let chatbots = [];
  let loading = true;
  let deleting = null;
  let searchQuery = '';
  let currentPage = 1;
  let pageSize = 12;
  let totalChatbots = 0;

  $: filteredChatbots = chatbots.filter(chatbot => 
    chatbot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (chatbot.bot_role && chatbot.bot_role.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  onMount(async () => {
    await loadChatbots();
  });

  async function loadChatbots() {
    loading = true;
    try {
      const response = await getChatbots({ page: currentPage, page_size: pageSize });
      console.log('Chatbots response:', response);

      // Handle different response structures
      const list = Array.isArray(response?.results)
        ? response.results
        : Array.isArray(response?.records)
        ? response.records
        : Array.isArray(response?.data?.results)
        ? response.data.results
        : Array.isArray(response?.data?.records)
        ? response.data.records
        : Array.isArray(response)
        ? response
        : [];

      chatbots = list.filter(chatbot => chatbot && (chatbot.id != null || chatbot.uid != null));
      totalChatbots = response?.count || chatbots.length;

      console.log('Loaded chatbots:', chatbots);
    } catch (error) {
      console.error('Error loading chatbots:', error);
      toast.error('Failed to load chatbots');
      chatbots = [];
    } finally {
      loading = false;
    }
  }

  async function handleDelete(chatbot) {
    if (!confirm(`Are you sure you want to delete "${chatbot.name}"?`)) {
      return;
    }

    deleting = chatbot.id || chatbot.uid;
    try {
      await deleteChatbot(chatbot.id || chatbot.uid);
      toast.success('Chatbot deleted successfully');
      await loadChatbots();
    } catch (error) {
      console.error('Error deleting chatbot:', error);
      toast.error('Failed to delete chatbot');
    } finally {
      deleting = null;
    }
  }

  function handleEdit(chatbot) {
    goto(`/chatbot/edit/${chatbot.id || chatbot.uid}`);
  }

  function handleChat(chatbot) {
    goto(`/c/${chatbot.id || chatbot.uid}?bot=1`);
  }

  function handleCreate() {
    goto('/chatbot-builder');
  }
</script>

<svelte:head>
  <title>My Chatbots - Swift Assistant</title>
</svelte:head>

<div class="flex flex-col h-full bg-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-gray-200 flex-shrink-0">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">My Chatbots</h1>
          <p class="mt-1 text-sm text-gray-500">
            Manage and configure your AI chatbots
          </p>
        </div>
        <button
          on:click={handleCreate}
          class="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create New Chatbot
        </button>
      </div>

      <!-- Search Bar -->
      <div class="mt-6">
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search chatbots..."
            class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {#if loading}
        <div class="flex items-center justify-center py-12">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p class="text-gray-600">Loading chatbots...</p>
          </div>
        </div>
      {:else if filteredChatbots.length === 0}
        <div class="text-center py-12">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.476L3 21l2.476-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No chatbots found</h3>
          <p class="mt-1 text-sm text-gray-500">
            {searchQuery ? 'Try adjusting your search' : 'Get started by creating a new chatbot'}
          </p>
          {#if !searchQuery}
            <div class="mt-6">
              <button
                on:click={handleCreate}
                class="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Chatbot
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <!-- Chatbot Grid -->
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {#each filteredChatbots as chatbot (chatbot.id || chatbot.uid)}
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden">
              <!-- Chatbot Header -->
              <div class="p-6">
                <div class="flex items-start space-x-4">
                  {#if chatbot.picture}
                    <img src={chatbot.picture} alt="{chatbot.name} avatar" class="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  {:else}
                    <div class="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.476L3 21l2.476-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
                      </svg>
                    </div>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <h3 class="text-lg font-semibold text-gray-900 truncate">{chatbot.name}</h3>
                    {#if chatbot.bot_role}
                      <p class="text-sm text-gray-500 truncate">{chatbot.bot_role}</p>
                    {/if}
                  </div>
                </div>

                {#if chatbot.description}
                  <p class="mt-4 text-sm text-gray-600 line-clamp-2">{chatbot.description}</p>
                {/if}

                <!-- Capabilities -->
                <div class="mt-4 flex flex-wrap gap-2">
                  {#if chatbot.real_time_web_search}
                    <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700">
                      Web Search
                    </span>
                  {/if}
                  {#if chatbot.file_upload_analysis}
                    <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
                      File Analysis
                    </span>
                  {/if}
                  {#if chatbot.image_upload_gpt_vision}
                    <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-700">
                      Vision
                    </span>
                  {/if}
                  {#if chatbot.create_images}
                    <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-700">
                      Image Gen
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Actions -->
              <div class="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
                <button
                  on:click={() => handleChat(chatbot)}
                  class="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.476L3 21l2.476-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
                  </svg>
                  Chat
                </button>

                <div class="flex items-center space-x-2">
                  <button
                    on:click={() => handleEdit(chatbot)}
                    class="inline-flex items-center p-2 border border-transparent rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    title="Edit chatbot"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>

                  <button
                    on:click={() => handleDelete(chatbot)}
                    disabled={deleting === (chatbot.id || chatbot.uid)}
                    class="inline-flex items-center p-2 border border-transparent rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete chatbot"
                  >
                    {#if deleting === (chatbot.id || chatbot.uid)}
                      <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"></div>
                    {:else}
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

