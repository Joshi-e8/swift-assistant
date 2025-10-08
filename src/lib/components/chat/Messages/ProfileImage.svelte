<script lang="ts">
	import { WEBUI_BASE_URL } from '$lib/constants';
	import { PUBLIC_CUSTOM_API_BASE_URL } from '$env/static/public';

	export let className = 'size-8';
	export let src = `${WEBUI_BASE_URL}/static/favicon.png`;

	// Get the backend base URL (without /api suffix)
	const getBackendBaseUrl = () => {
		if (PUBLIC_CUSTOM_API_BASE_URL) {
			return PUBLIC_CUSTOM_API_BASE_URL.replace(/\/$/, '');
		}
		return 'http://127.0.0.1:8000';
	};

	const BACKEND_BASE_URL = getBackendBaseUrl();

	// Allow certain external origins (extend as needed or move to config)
	const ALLOWED_EXTERNAL_ORIGINS = [
		'https://www.gravatar.com/avatar/',
		'https://swift-ai-assist.e8demo.com',
		BACKEND_BASE_URL
	];

	let crossOriginAttr: 'anonymous' | undefined;

	// Compute final src and whether to apply crossorigin
	$: isSameOrigin = typeof src === 'string' && (src.startsWith(WEBUI_BASE_URL) || src.startsWith('/'));
	$: isDataUrl = typeof src === 'string' && src.startsWith('data:');
	$: isBackendImage = typeof src === 'string' && src.startsWith(BACKEND_BASE_URL);
	$: isAllowedExternal = typeof src === 'string' && ALLOWED_EXTERNAL_ORIGINS.some((p) => src.startsWith(p));
	$: finalSrc = src === ''
		? `${WEBUI_BASE_URL}/static/favicon.png`
		: (isSameOrigin || isDataUrl || isAllowedExternal ? src : `${WEBUI_BASE_URL}/user.png`);
	// Only set crossorigin for same-origin or Gravatar (which supports CORS)
	// Do NOT set crossorigin for backend images as the backend doesn't have CORS configured for images
	$: crossOriginAttr = (isSameOrigin && !isBackendImage) || (typeof src === 'string' && src.startsWith('https://www.gravatar.com/avatar/'))
		? 'anonymous'
		: undefined;
</script>

<img
	crossorigin={crossOriginAttr}
	src={finalSrc}
	class=" {className} object-cover rounded-full"
	alt="profile"
	draggable="false"
/>
