<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { v4 as uuidv4 } from 'uuid';

	import { goto } from '$app/navigation';
	import {
		user,
		chats,
		settings,
		showSettings,
		chatId,
		tags,
		showSidebar,
		showSearch,
		mobile,
		showArchivedChats,
		pinnedChats,
		scrollPaginationEnabled,
		currentChatPage,
		temporaryChatEnabled,
		channels,
		socket,
		config,
		isApp,
		models,
		selectedFolder
	} from '$lib/stores';
	import { onMount, getContext, tick, onDestroy } from 'svelte';

	const i18n = getContext('i18n');

	import {
		getChatList,
		getAllTags,
		getPinnedChatList,
		toggleChatPinnedStatusById,
		getChatById,
		updateChatFolderIdById,
		importChat,
		createChatViaAPI,
		getRecentChats
	} from '$lib/apis/chats';
	import { getChatbots } from '$lib/api/chatbots.js';
	import { createNewFolder, getFolders, updateFolderParentIdById } from '$lib/apis/folders';
	import { WEBUI_BASE_URL } from '$lib/constants';
	import { extractUserMessage } from '$lib/utils';

	import ArchivedChatsModal from './ArchivedChatsModal.svelte';
	import UserMenu from './Sidebar/UserMenu.svelte';
	import ChatItem from './Sidebar/ChatItem.svelte';
	import Spinner from '../common/Spinner.svelte';
	import Loader from '../common/Loader.svelte';
	import AddFilesPlaceholder from '../AddFilesPlaceholder.svelte';
	import Folder from '../common/Folder.svelte';
	import Plus from '../icons/Plus.svelte';
	import Tooltip from '../common/Tooltip.svelte';
	import Folders from './Sidebar/Folders.svelte';
	import { getChannels, createNewChannel } from '$lib/apis/channels';
	import ChannelModal from './Sidebar/ChannelModal.svelte';
	import ChannelItem from './Sidebar/ChannelItem.svelte';
	import PencilSquare from '../icons/PencilSquare.svelte';
	import Home from '../icons/Home.svelte';
	import Search from '../icons/Search.svelte';
	import SearchModal from './SearchModal.svelte';

	const BREAKPOINT = 768;

	let navElement;
	let shiftKey = false;

	let selectedChatId = null;
	let showDropdown = false;
	let showPinnedChat = true;

	let showCreateChannel = false;

	// Pagination variables
	let chatListLoading = false;
	let allChatsLoaded = false;

	let folders = {};
	let newFolderId = null;

	let recentChats = [];
	let chatbots = [];
	let loadingChatbots = false;

	const initFolders = async () => {
		const folderList = await getFolders(localStorage.token).catch((error) => {
			toast.error(`${error}`);
			return [];
		});
		const safeFolderList = Array.isArray(folderList) ? folderList : [];

		folders = {};

		// First pass: Initialize all folder entries
		for (const folder of safeFolderList) {
			// Ensure folder is added to folders with its data
			folders[folder.id] = { ...(folders[folder.id] || {}), ...folder };

			if (newFolderId && folder.id === newFolderId) {
				folders[folder.id].new = true;
				newFolderId = null;
			}
		}

		// Second pass: Tie child folders to their parents
		for (const folder of safeFolderList) {
			if (folder.parent_id) {
				// Ensure the parent folder is initialized if it doesn't exist
				if (!folders[folder.parent_id]) {
					folders[folder.parent_id] = {}; // Create a placeholder if not already present
				}

				// Initialize childrenIds array if it doesn't exist and add the current folder id
				folders[folder.parent_id].childrenIds = folders[folder.parent_id].childrenIds
					? [...folders[folder.parent_id].childrenIds, folder.id]
					: [folder.id];

				// Sort the children by updated_at field
				folders[folder.parent_id].childrenIds.sort((a, b) => {
					return folders[b].updated_at - folders[a].updated_at;
				});
			}
		}
	};

	const loadChatbots = async (showToast = false) => {
		try {
			loadingChatbots = true;
			const response = await getChatbots({ page_size: 10 }); // Load first 10 chatbots
			console.log('Chatbots API response:', response);

			// Handle different response structures; only include items that have a real id/uid
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

			chatbots = list
				.filter((chatbot) => chatbot && (chatbot.id != null || chatbot.uid != null))
				.map((chatbot) => ({ ...chatbot, id: String(chatbot.id ?? chatbot.uid) }));

			console.log('Loaded chatbots (filtered, with real IDs):', chatbots);

			if (showToast && chatbots.length > 0) {
				toast.success(`Loaded ${chatbots.length} chatbot${chatbots.length === 1 ? '' : 's'}`);
			}
		} catch (error) {
			console.error('Error loading chatbots:', error);
			chatbots = [];
			if (showToast) {
				toast.error('Failed to load chatbots');
			}
		} finally {
			loadingChatbots = false;
		}
	};

	// Function to refresh chatbots (can be called from other components)
	const refreshChatbots = async () => {
		await loadChatbots(true);
	};

	// Make refreshChatbots available globally for other components to call
	if (typeof window !== 'undefined') {
		window.refreshSidebarChatbots = refreshChatbots;
	}

	const createFolder = async (name = 'Untitled') => {
		if (name === '') {
			toast.error($i18n.t('Folder name cannot be empty.'));
			return;
		}

		const rootFolders = Object.values(folders).filter((folder) => folder.parent_id === null);
		if (rootFolders.find((folder) => folder.name.toLowerCase() === name.toLowerCase())) {
			// If a folder with the same name already exists, append a number to the name
			let i = 1;
			while (
				rootFolders.find((folder) => folder.name.toLowerCase() === `${name} ${i}`.toLowerCase())
			) {
				i++;
			}

			name = `${name} ${i}`;
		}

		// Add a dummy folder to the list to show the user that the folder is being created
		const tempId = uuidv4();
		folders = {
			...folders,
			tempId: {
				id: tempId,
				name: name,
				created_at: Date.now(),
				updated_at: Date.now()
			}
		};

		const res = await createNewFolder(localStorage.token, name).catch((error) => {
			toast.error(`${error}`);
			return null;
		});

		if (res) {
			newFolderId = res.id;
			await initFolders();
		}
	};

	const initChannels = async () => {
		await channels.set(await getChannels(localStorage.token));
	};

	const initChatList = async () => {
		// Reset pagination variables
		tags.set(await getAllTags(localStorage.token));
		pinnedChats.set(await getPinnedChatList(localStorage.token));
		initFolders();

		currentChatPage.set(1);
		allChatsLoaded = false;

		await chats.set(await getChatList(localStorage.token, $currentChatPage));

		// Enable pagination
		scrollPaginationEnabled.set(true);
	};

	const loadMoreChats = async () => {
		chatListLoading = true;

		currentChatPage.set($currentChatPage + 1);

		let newChatList = [];

		newChatList = await getChatList(localStorage.token, $currentChatPage);

		// once the bottom of the list has been reached (no results) there is no need to continue querying
		allChatsLoaded = newChatList.length === 0;
		await chats.set([...($chats ? $chats : []), ...newChatList]);

		chatListLoading = false;
	};

	const importChatHandler = async (items, pinned = false, folderId = null) => {
		console.log('importChatHandler', items, pinned, folderId);
		for (const item of items) {
			console.log(item);
			if (item.chat) {
				await importChat(
					localStorage.token,
					item.chat,
					item?.meta ?? {},
					pinned,
					folderId,
					item?.created_at ?? null,
					item?.updated_at ?? null
				);
			}
		}

		initChatList();
	};

	const newChatHandler = async () => {
		try {
			// Call the external API to create a new chat
			const response = await createChatViaAPI(localStorage.token);
			
			if (response && response.success) {
				// Set the chat ID and navigate to the chat
				const newChatId = response.chat;
				chatId.set(newChatId);
				await goto(`/c/${newChatId}`);
				
				// Show success message
				toast.success('Chat created successfully');
			} else {
				// Fallback to original behavior if API fails
				console.error('Failed to create chat via API:', response);
				chatId.set('');
				await goto('/');
				toast.error('Failed to create chat');
			}
		} catch (error) {
			console.error('Error creating chat:', error);
			// Fallback to original behavior
			chatId.set('');
			await goto('/');
			toast.error('Error creating chat');
		}

		if ($mobile) {
			showSidebar.set(false);
		}
	};

	const inputFilesHandler = async (files) => {
		console.log(files);

		for (const file of files) {
			const reader = new FileReader();
			reader.onload = async (e) => {
				const content = e.target.result;

				try {
					const chatItems = JSON.parse(content);
					importChatHandler(chatItems);
				} catch {
					toast.error($i18n.t(`Invalid file format.`));
				}
			};

			reader.readAsText(file);
		}
	};

	const tagEventHandler = async (type, tagName, chatId) => {
		console.log(type, tagName, chatId);
		if (type === 'delete') {
			initChatList();
		} else if (type === 'add') {
			initChatList();
		}
	};

	let draggedOver = false;

	const onDragOver = (e) => {
		e.preventDefault();

		// Check if a file is being draggedOver.
		if (e.dataTransfer?.types?.includes('Files')) {
			draggedOver = true;
		} else {
			draggedOver = false;
		}
	};

	const onDragLeave = () => {
		draggedOver = false;
	};

	const onDrop = async (e) => {
		e.preventDefault();
		console.log(e); // Log the drop event

		// Perform file drop check and handle it accordingly
		if (e.dataTransfer?.files) {
			const inputFiles = Array.from(e.dataTransfer?.files);

			if (inputFiles && inputFiles.length > 0) {
				console.log(inputFiles); // Log the dropped files
				inputFilesHandler(inputFiles); // Handle the dropped files
			}
		}

		draggedOver = false; // Reset draggedOver status after drop
	};

	let touchstart;
	let touchend;

	function checkDirection() {
		const screenWidth = window.innerWidth;
		const swipeDistance = Math.abs(touchend.screenX - touchstart.screenX);
		if (touchstart.clientX < 40 && swipeDistance >= screenWidth / 8) {
			if (touchend.screenX < touchstart.screenX) {
				showSidebar.set(false);
			}
			if (touchend.screenX > touchstart.screenX) {
				showSidebar.set(true);
			}
		}
	}

	const onTouchStart = (e) => {
		touchstart = e.changedTouches[0];
		console.log(touchstart.clientX);
	};

	const onTouchEnd = (e) => {
		touchend = e.changedTouches[0];
		checkDirection();
	};

	const onKeyDown = (e) => {
		if (e.key === 'Shift') {
			shiftKey = true;
		}
	};

	const onKeyUp = (e) => {
		if (e.key === 'Shift') {
			shiftKey = false;
		}
	};

	const onFocus = () => {};

	const onBlur = () => {
		shiftKey = false;
		selectedChatId = null;
	};

	onMount(async () => {
		showPinnedChat = localStorage?.showPinnedChat ? localStorage.showPinnedChat === 'true' : true;

		mobile.subscribe((value) => {
			if ($showSidebar && value) {
				showSidebar.set(false);
			}

			if ($showSidebar && !value) {
				const navElement = document.getElementsByTagName('nav')[0];
				if (navElement) {
					navElement.style['-webkit-app-region'] = 'drag';
				}
			}

			if (!$showSidebar && !value) {
				showSidebar.set(true);
			}
		});

		showSidebar.set(!$mobile ? localStorage.sidebar === 'true' : false);
		showSidebar.subscribe((value) => {
			localStorage.sidebar = value;

			// nav element is not available on the first render
			const navElement = document.getElementsByTagName('nav')[0];

			if (navElement) {
				if ($mobile) {
					if (!value) {
						navElement.style['-webkit-app-region'] = 'drag';
					} else {
						navElement.style['-webkit-app-region'] = 'no-drag';
					}
				} else {
					navElement.style['-webkit-app-region'] = 'drag';
				}
			}
		});

		chats.subscribe((value) => {
			if ($selectedFolder) {
				initFolders();
			}
		});

		await initChannels();
		await initChatList();
		await loadChatbots();

		const recent = await getRecentChats();
		if (recent && recent.success && Array.isArray(recent.response)) {
			recentChats = recent.response;
		}

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);

		window.addEventListener('touchstart', onTouchStart);
		window.addEventListener('touchend', onTouchEnd);

		window.addEventListener('focus', onFocus);
		window.addEventListener('blur', onBlur);

		const dropZone = document.getElementById('sidebar');

		dropZone?.addEventListener('dragover', onDragOver);
		dropZone?.addEventListener('drop', onDrop);
		dropZone?.addEventListener('dragleave', onDragLeave);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', onKeyDown);
		window.removeEventListener('keyup', onKeyUp);

		window.removeEventListener('touchstart', onTouchStart);
		window.removeEventListener('touchend', onTouchEnd);

		window.removeEventListener('focus', onFocus);
		window.removeEventListener('blur', onBlur);

		const dropZone = document.getElementById('sidebar');

		dropZone?.removeEventListener('dragover', onDragOver);
		dropZone?.removeEventListener('drop', onDrop);
		dropZone?.removeEventListener('dragleave', onDragLeave);
	});
</script>

<ArchivedChatsModal
	bind:show={$showArchivedChats}
	onUpdate={async () => {
		await initChatList();
	}}
/>

<ChannelModal
	bind:show={showCreateChannel}
	onSubmit={async ({ name, access_control }) => {
		const res = await createNewChannel(localStorage.token, {
			name: name,
			access_control: access_control
		}).catch((error) => {
			toast.error(`${error}`);
			return null;
		});

		if (res) {
			$socket.emit('join-channels', { auth: { token: $user?.token } });
			await initChannels();
			showCreateChannel = false;
		}
	}}
/>

<!-- svelte-ignore a11y-no-static-element-interactions -->

{#if $showSidebar}
	<div
		class=" {$isApp
			? ' ml-[4.5rem] md:ml-0'
			: ''} fixed md:hidden z-40 top-0 right-0 left-0 bottom-0 bg-black/60 w-full min-h-screen h-screen flex justify-center overflow-hidden overscroll-contain"
		on:mousedown={() => {
			showSidebar.set(!$showSidebar);
		}}
	/>
{/if}

<SearchModal
	bind:show={$showSearch}
	onClose={() => {
		if ($mobile) {
			showSidebar.set(false);
		}
	}}
/>

<!-- Icon Sidebar - Narrow left sidebar matching target design -->
<div
	class="h-screen max-h-[100dvh] min-h-screen select-none w-[60px] shrink-0 text-white text-sm fixed z-50 top-0 left-0 flex flex-col items-center py-4 space-y-4"
	style="background: linear-gradient(180deg, #375A7F 0%, #8B49DE 100%);"
>
	<!-- Logo/Brand Icon -->
	<div class="flex items-center justify-center w-8 h-8 mb-2">
		<div class="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
			<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
				<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
			</svg>
		</div>
	</div>

	<!-- Navigation Icons -->
	<div class="flex flex-col space-y-3">
		<!-- Menu/Expand Sidebar -->
		<button
			class="p-2 rounded-lg hover:bg-white/10 transition-colors"
			on:click={() => showSidebar.set(!$showSidebar)}
			title="Toggle Menu"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
			</svg>
		</button>

		<!-- Home - Redirect to Swift-Teach Backend -->
		<button
			class="p-2 rounded-lg hover:bg-white/10 transition-colors"
			on:click={() => {
				const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/';
				console.log('🏠 Back to Home clicked (Sidebar)');
				console.log('🔧 VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL);
				console.log('🔧 Backend URL:', backendUrl);
				console.log('🔧 Full redirect URL:', `${backendUrl}home/`);
				window.location.href = `${backendUrl}home/`;
				if ($mobile) {
					showSidebar.set(false);
				}
			}}
			title="Home"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
			</svg>
		</button>

		<!-- Chat/Messages -->
		<button
			class="p-2 rounded-lg hover:bg-white/10 transition-colors"
			on:click={() => showSidebar.set(!$showSidebar)}
			title="Chat"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.476L3 21l2.476-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z"></path>
			</svg>
		</button>

		<!-- Library -->
		<button
			class="p-2 rounded-lg hover:bg-white/10 transition-colors"
			on:click={() => showSidebar.set(!$showSidebar)}
			title="Library"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
			</svg>
		</button>

		<!-- Models -->
		<button
			class="p-2 rounded-lg hover:bg-white/10 transition-colors"
			on:click={() => showSidebar.set(!$showSidebar)}
			title="Models"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
			</svg>
		</button>

		<!-- Users -->
		<button
			class="p-2 rounded-lg hover:bg-white/10 transition-colors"
			on:click={() => showSidebar.set(!$showSidebar)}
			title="Users"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
			</svg>
		</button>

		<!-- Settings -->
		<button
			class="p-2 rounded-lg hover:bg-white/10 transition-colors"
			on:click={() => showSettings.set(true)}
			title="Settings"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
			</svg>
		</button>

		<!-- Knowledge -->
		<button
			class="p-2 rounded-lg hover:bg-white/10 transition-colors"
			title="Knowledge"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
			</svg>
		</button>

		<!-- Tools -->
		<button
			class="p-2 rounded-lg hover:bg-white/10 transition-colors"
			title="Tools"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
			</svg>
		</button>
	</div>

	<!-- Bottom Icons -->
	<div class="flex-1 flex flex-col justify-end space-y-3">
		<!-- User Profile -->
		{#if $user !== undefined}
			<UserMenu>
				<button class="p-2 rounded-lg hover:bg-white/10 transition-colors" title="User Profile">
					<div class="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
						<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>
						</svg>
					</div>
				</button>
			</UserMenu>
		{/if}
	</div>
</div>

<!-- Expandable Content Sidebar - Restored functionality with target design -->
<div
	bind:this={navElement}
	id="content-sidebar"
	class="h-screen max-h-[100dvh] min-h-screen select-none {$showSidebar
		? 'md:relative w-[280px] max-w-[280px]'
		: '-translate-x-[280px] w-[0px]'} {$isApp
		? `ml-[60px] md:ml-[60px] `
		: 'transition-all duration-300 ease-in-out'}  shrink-0 text-gray-900 text-sm fixed z-40 top-0 left-[60px] overflow-x-hidden border-r border-gray-200 shadow-lg"
	style="background: #FFFFFF;"
	data-state={$showSidebar}
>
	<div
		class="flex flex-col h-screen max-h-[100dvh] w-[280px] overflow-x-hidden z-50 {$showSidebar
			? ''
			: 'invisible'}"
	>
		<!-- Header with back arrow only -->
		<div class="px-5 py-4 border-b border-gray-100 bg-white">
			<div class="flex items-center">
				<button
					class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
					on:click={() => showSidebar.set(false)}
					title="Close sidebar"
				>
					<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
					</svg>
				</button>
			</div>
		</div>

		<!-- Content Area -->
		<div class="flex-1 overflow-y-auto bg-white">
			<!-- Main Action Buttons -->
			<div class="px-4 py-4 space-y-2">
				<!-- New Chat Button -->
				<button
					class="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 rounded-xl transition-colors group"
					on:click={() => {
						newChatHandler();
					}}
				>
					<div class="flex-shrink-0">
						<PencilSquare className="w-5 h-5 text-gray-600 group-hover:text-gray-800" />
					</div>
					<span class="text-gray-700 font-medium group-hover:text-gray-900">New Chat</span>
				</button>

				<!-- Search Chat Button -->
				<button
					class="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 rounded-xl transition-colors group"
					on:click={() => {
						showSearch.set(true);
					}}
				>
					<div class="flex-shrink-0">
						<Search className="w-5 h-5 text-gray-600 group-hover:text-gray-800" />
					</div>
					<span class="text-gray-700 font-medium group-hover:text-gray-900">Search Chat</span>
				</button>

				<!-- Library Button -->
				<button
					class="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 rounded-xl transition-colors group"
					on:click={() => {
						// Add library functionality here
					}}
				>
					<div class="flex-shrink-0">
						<svg class="w-5 h-5 text-gray-600 group-hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
						</svg>
					</div>
					<span class="text-gray-700 font-medium group-hover:text-gray-900">Library</span>
				</button>

				<!-- Chatbot Builder Button -->
				<button
					class="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 rounded-xl transition-colors group"
					on:click={() => {
						goto('/chatbot-builder');
						if ($mobile) {
							showSidebar.set(false);
						}
					}}
				>
					<div class="flex-shrink-0">
						<svg class="w-5 h-5 text-gray-600 group-hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
						</svg>
					</div>
					<span class="text-gray-700 font-medium group-hover:text-gray-900">Chatbot Builder</span>
				</button>
			</div>

			<!-- Chatbots Section -->
			<div class="px-4 py-3 border-t border-gray-100">
				<div class="flex items-center justify-between mb-3 px-1">
					<div class="text-sm font-semibold text-gray-800">My Chatbots ({chatbots.length})</div>
					<div class="flex items-center space-x-2">
						<button
							class="text-xs text-gray-500 hover:text-gray-700 transition-colors p-1 rounded hover:bg-gray-100"
							on:click={() => refreshChatbots()}
							title="Refresh chatbots"
							disabled={loadingChatbots}
						>
							{#if loadingChatbots}
								<div class="animate-spin rounded-full h-3 w-3 border-b border-gray-500"></div>
							{:else}
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
								</svg>
							{/if}
						</button>
						<button
							class="text-xs text-blue-600 hover:text-blue-800 transition-colors font-medium px-2 py-1 rounded hover:bg-blue-50"
							on:click={() => {
								goto('/chatbot-builder');
								if ($mobile) {
									showSidebar.set(false);
								}
							}}
							title="Create new chatbot"
						>
							+ New
						</button>
					</div>
				</div>

				{#if loadingChatbots}
					<div class="flex items-center justify-center py-6">
						<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
						<span class="ml-3 text-sm text-gray-500">Loading...</span>
					</div>
				{:else if chatbots.length === 0}
					<div class="text-center py-6 px-4">
						<div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
							<svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.476L3 21l2.476-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
							</svg>
						</div>
						<p class="text-sm text-gray-500 mb-3">No chatbots yet</p>
						<button
							class="text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50"
							on:click={() => {
								goto('/chatbot-builder');
								if ($mobile) {
									showSidebar.set(false);
								}
							}}
						>
							Create your first chatbot
						</button>
					</div>
				{:else}
					<div class="space-y-1 max-h-52 overflow-y-auto px-1">
						{#each chatbots as chatbot (chatbot.id)}
							<button
								class="w-full flex items-center space-x-3 px-3 py-3 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer text-left group"
								on:click={() => {
									// Use the guaranteed unique ID and force Chat screen to treat it as a chatbot id
									console.log('🤖 Clicking chatbot:', chatbot.name, 'ID:', chatbot.id);
									console.log('🔗 Navigating to:', `/c/${chatbot.id}?bot=1`);
									goto(`/c/${chatbot.id}?bot=1`);
									if ($mobile) {
										showSidebar.set(false);
									}
								}}
								title="Chat with {chatbot.name}"
							>
								{#if chatbot.picture}
									<img src={chatbot.picture} alt="{chatbot.name} avatar" class="w-8 h-8 rounded-full object-cover flex-shrink-0" />
								{:else}
									<div class="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
										<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.476L3 21l2.476-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
										</svg>
									</div>
								{/if}
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-gray-700 truncate group-hover:text-gray-900">{chatbot.name}</p>
									{#if chatbot.bot_role}
										<p class="text-xs text-gray-500 truncate">{chatbot.bot_role}</p>
									{/if}
								</div>
								{#if chatbot.primary_language}
									<div class="flex-shrink-0">
										<span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
											{chatbot.primary_language.name.slice(0, 2).toUpperCase()}
										</span>
									</div>
								{/if}
							</button>
						{/each}
					</div>

					{#if chatbots.length >= 10}
						<div class="mt-3 text-center px-3">
							<button
								class="text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium px-3 py-2 rounded-lg hover:bg-blue-50"
								on:click={() => {
									goto('/c/new');
									if ($mobile) {
										showSidebar.set(false);
									}
								}}
							>
								View all chatbots →
							</button>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Recent Chats Section -->
			<div class="px-4 py-3 border-t border-gray-100">
				<div class="text-sm font-semibold text-gray-800 mb-3 px-1">Recent Chats</div>
				<div class="space-y-1 px-1">
					{#if recentChats.length === 0}
						<div class="px-3 py-4 text-center">
							<div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
								<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.476L3 21l2.476-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
								</svg>
							</div>
							<p class="text-sm text-gray-500">No recent chats</p>
						</div>
					{:else}
						{#each recentChats as chat}
							<button
								class="w-full px-3 py-3 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer text-left {chat.id === $chatId ? 'bg-blue-50 border border-blue-200' : ''}"
								on:click={() => goto(`/c/${chat.id}`)}
							>
								<p class="text-sm text-gray-700 truncate font-medium">{extractUserMessage(chat.title)}</p>
							</button>
						{/each}
					{/if}
				</div>
			</div>
		</div>

		<!-- User Menu at Bottom -->
		<div class="px-4 py-4 border-t border-gray-100 bg-white">
			{#if $user !== undefined}
				<UserMenu>
					<button
						class="flex items-center space-x-3 w-full px-3 py-3 hover:bg-gray-50 rounded-xl transition-colors group"
						aria-label="User Menu"
					>
						<div class="flex-shrink-0">
							<img
								src={$user?.profile_image_url || '/assets/images/avatar.png'}
								class="w-9 h-9 object-cover rounded-full border-2 border-gray-200 group-hover:border-gray-300 transition-colors"
								alt="User profile"
							/>
						</div>
						<div class="flex-1 text-left min-w-0">
							<div class="text-sm font-semibold text-gray-900 truncate">{$user?.name}</div>
							<div class="text-xs text-gray-500 capitalize">{$user?.role || 'user'}</div>
						</div>
						<div class="flex-shrink-0">
							<svg class="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
							</svg>
						</div>
					</button>
				</UserMenu>
			{/if}
		</div>
	</div>
</div>




<style>
	.scrollbar-hidden:active::-webkit-scrollbar-thumb,
	.scrollbar-hidden:focus::-webkit-scrollbar-thumb,
	.scrollbar-hidden:hover::-webkit-scrollbar-thumb {
		visibility: visible;
	}
	.scrollbar-hidden::-webkit-scrollbar-thumb {
		visibility: hidden;
	}
</style>
