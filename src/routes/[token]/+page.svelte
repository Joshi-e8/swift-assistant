<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';
	import { exchangeTemporaryToken } from '$lib/apis/swift-teach';
	import { getSessionUser } from '$lib/apis/auths';

	let isLoading = true;
	let errorMessage = '';
	let statusMessage = 'Authenticating with Swift-Teach...';

	/**
	 * Validate if a string is a valid UUID format
	 */
	const isValidUUID = (str: string): boolean => {
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		return uuidRegex.test(str);
	};

	/**
	 * Store tokens in localStorage (compatible with existing system)
	 */
	const storeTokens = (accessToken: string, refreshToken: string, expiresIn: string) => {
		try {
			// Store tokens in the same format as existing login system
			localStorage.setItem('token', accessToken);
			localStorage.setItem('refresh_token', refreshToken);
			localStorage.setItem('token_type', 'Bearer');
			localStorage.setItem('token_scope', 'read write');
			
			// Store expiry time for future reference
			if (expiresIn) {
				localStorage.setItem('token_expiry', expiresIn);
			}
			
			console.log('✅ Tokens stored successfully');
		} catch (error) {
			console.error('❌ Error storing tokens:', error);
			throw new Error('Failed to store authentication tokens');
		}
	};

	/**
	 * Handle the token exchange process
	 */
	const handleTokenExchange = async (tempTokenUid: string) => {
		try {
			console.log('🔑 Starting Swift-Teach authentication...');
			console.log('📝 Temporary token UID:', tempTokenUid);

			statusMessage = 'Exchanging authentication token...';

			// Exchange temporary token for OAuth2 tokens
			const tokens = await exchangeTemporaryToken(tempTokenUid);

			if (!tokens || !tokens.access_token || !tokens.refresh_token) {
				throw new Error('Invalid token response from server');
			}

			console.log('✅ Token exchange successful');
			console.log('💬 Chat ID:', tokens.chat_id);
			statusMessage = 'Storing authentication credentials...';

			// Store tokens in localStorage
			storeTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);

			statusMessage = 'Verifying session...';

			// Verify the token by getting session user
			const sessionUser = await getSessionUser(tokens.access_token).catch((error) => {
				console.warn('⚠️ Session verification failed, but continuing:', error);
				return null;
			});

			if (sessionUser) {
				console.log('✅ Session verified:', sessionUser);
			}

			statusMessage = 'Redirecting to chat...';

			// Show success message
			toast.success('Authentication successful!');

			// Redirect to chat page with chat_id (same as existing login flow)
			const chatId = tokens.chat_id;
			setTimeout(() => {
				if (chatId) {
					goto(`/c/${chatId}`);
				} else {
					// Fallback to home if no chat_id
					goto('/home');
				}
			}, 500);
			
		} catch (error: any) {
			console.error('❌ Token exchange failed:', error);
			
			// Determine error message
			let message = 'Authentication failed. ';
			
			if (error.message?.includes('expired')) {
				message += 'The authentication link has expired. Please try again from Swift-Teach.';
			} else if (error.message?.includes('404')) {
				message += 'Invalid authentication link. Please try again from Swift-Teach.';
			} else if (error.message?.includes('Network')) {
				message += 'Unable to connect to authentication server. Please check your connection.';
			} else {
				message += error.message || 'Please try again from Swift-Teach.';
			}
			
			errorMessage = message;
			isLoading = false;
			
			// Show error toast
			toast.error(message);
			
			// Redirect to login page after 5 seconds
			setTimeout(() => {
				goto('/');
			}, 5000);
		}
	};

	onMount(async () => {
		// Get the token parameter from the URL
		const tempTokenUid = $page.params.token;
		
		console.log('🌐 Token exchange page loaded');
		console.log('📍 URL parameter:', tempTokenUid);
		
		// Validate the token format
		if (!tempTokenUid || !isValidUUID(tempTokenUid)) {
			console.error('❌ Invalid token format:', tempTokenUid);
			errorMessage = 'Invalid authentication link. Please use the link provided by Swift-Teach.';
			isLoading = false;
			
			toast.error(errorMessage);
			
			// Redirect to login page after 3 seconds
			setTimeout(() => {
				goto('/');
			}, 3000);
			return;
		}
		
		// Check if user is already authenticated
		if (localStorage.token) {
			console.log('ℹ️ User already has a token, checking validity...');
			
			try {
				const sessionUser = await getSessionUser(localStorage.token);
				if (sessionUser) {
					console.log('✅ User already authenticated, redirecting to home...');
					toast.info('You are already logged in');
					goto('/home');
					return;
				}
			} catch (error) {
				console.log('⚠️ Existing token invalid, proceeding with new token exchange');
				// Clear invalid token
				localStorage.removeItem('token');
			}
		}
		
		// Proceed with token exchange
		await handleTokenExchange(tempTokenUid);
	});
</script>

<svelte:head>
	<title>Authenticating - Swift</title>
</svelte:head>

<div class="w-full h-screen max-h-[100dvh] text-white relative">
	<!-- Background Gradient -->
	<div 
		class="w-full h-full absolute top-0 left-0" 
		style="background: linear-gradient(180deg, #375a7f 0%, #8b49de 100%);"
	/>

	<!-- Content -->
	<div class="relative z-50 w-full h-full flex items-center justify-center px-5 py-4">
		<div class="w-full max-w-md">
			<div class="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/20">
				<div class="flex flex-col items-center space-y-6">
					<!-- Logo -->
					<div class="animate-pulse">
						<img
							src="/assets/images/swift_logo.png"
							alt="Swift Logo"
							class="w-20 h-20 object-contain"
						/>
					</div>

					{#if isLoading}
						<!-- Loading State -->
						<div class="flex flex-col items-center space-y-4">
							<!-- Spinner -->
							<svg 
								class="animate-spin h-12 w-12 text-white" 
								xmlns="http://www.w3.org/2000/svg" 
								fill="none" 
								viewBox="0 0 24 24"
							>
								<circle 
									class="opacity-25" 
									cx="12" 
									cy="12" 
									r="10" 
									stroke="currentColor" 
									stroke-width="4"
								/>
								<path 
									class="opacity-75" 
									fill="currentColor" 
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>

							<!-- Status Message -->
							<div class="text-center">
								<div class="text-lg font-medium text-white mb-2">
									{statusMessage}
								</div>
								<div class="text-sm text-white/70">
									Please wait while we authenticate your session
								</div>
							</div>
						</div>
					{:else if errorMessage}
						<!-- Error State -->
						<div class="flex flex-col items-center space-y-4 w-full">
							<!-- Error Icon -->
							<div class="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
								<svg 
									class="w-8 h-8 text-red-400" 
									fill="none" 
									stroke="currentColor" 
									viewBox="0 0 24 24"
								>
									<path 
										stroke-linecap="round" 
										stroke-linejoin="round" 
										stroke-width="2" 
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</div>

							<!-- Error Message -->
							<div class="text-center">
								<div class="text-lg font-medium text-white mb-2">
									Authentication Failed
								</div>
								<div class="text-sm text-white/80 mb-4">
									{errorMessage}
								</div>
								<div class="text-xs text-white/60">
									Redirecting to login page...
								</div>
							</div>

							<!-- Manual Redirect Button -->
							<button
								on:click={() => goto('/')}
								class="mt-4 px-6 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-all"
							>
								Go to Login Page
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
	
	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>

