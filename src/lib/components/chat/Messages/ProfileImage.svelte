<script lang="ts">
	import { WEBUI_BASE_URL } from '$lib/constants';

	export let className = 'size-8';
	export let src = `${WEBUI_BASE_URL}/static/favicon.png`;

	// Allow certain external origins (extend as needed or move to config)
	const ALLOWED_EXTERNAL_ORIGINS = [
		'https://www.gravatar.com/avatar/',
		'https://swift-ai-assist.e8demo.com'
	];

	let crossOriginAttr: 'anonymous' | undefined;

	// Compute final src and whether to apply crossorigin
	$: isSameOrigin = typeof src === 'string' && (src.startsWith(WEBUI_BASE_URL) || src.startsWith('/'));
	$: isDataUrl = typeof src === 'string' && src.startsWith('data:');
	$: isAllowedExternal = typeof src === 'string' && ALLOWED_EXTERNAL_ORIGINS.some((p) => src.startsWith(p));
	$: finalSrc = src === ''
		? `${WEBUI_BASE_URL}/static/favicon.png`
		: (isSameOrigin || isDataUrl || isAllowedExternal ? src : `${WEBUI_BASE_URL}/user.png`);
	// Only set crossorigin where we know the server will include CORS headers
	$: crossOriginAttr = (isSameOrigin || (typeof src === 'string' && src.startsWith('https://www.gravatar.com/avatar/')))
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
