<script lang="ts">
	import { onMount } from 'svelte';
	import ContentRenderer from './ContentRenderer.svelte';
	import TypingIndicator from './TypingIndicator.svelte';
	import TypingAnimation from './TypingAnimation.svelte';

	export let id;
	export let content = '';
	export let history;
	export let selectedModels = [];
	export let model = null;
	export let sources = null;
	export let save = false;
	export let preview = false;
	export let floatingButtons = true;
	export let onSave = () => {};
	export let onSourceClick = () => {};
	export let onTaskClick = () => {};
	export let onAddMessages = () => {};

	// Animation control props
	export let isStreaming = false;
	export let isComplete = false;
	export let botName = 'AI Assistant';
	export let enableTypingAnimation = true;
	export let typingSpeed = 38; // slower, smoother default for word mode (ms per step)
	// New: global animation controls and options
	export let enableThinkingIndicator = true;
	export let showThinkingOnWaiting = true; // show dots even before streaming flag if empty
	export let animationsEnabled = true; // master switch
	export let typingMode: 'char' | 'word' = 'word';

	let showTypingIndicator = false;
	let animatedContent = '';
	let shouldShowContent = false;
	let typingFinished = false;
	let wasStreaming = false; // latch streaming state until typing finishes
	let historicalOnMount = false;
	let initialEmptyAtMount = true;
	let hasTransitionedToNonEmpty = false;

	onMount(() => {
		initialEmptyAtMount = content === '';
		// If this is a historical message (complete and not streaming with non-empty content), never animate
		if (!isStreaming && isComplete && content !== '') {
			historicalOnMount = true;
			typingFinished = true;
		}
	});

	// Track first transition from empty to non-empty during this mount
	$: if (initialEmptyAtMount && !hasTransitionedToNonEmpty && content !== '') {
		hasTransitionedToNonEmpty = true;
	}

	// Latch streaming once it occurs, and clear when typing ends
	$: if (isStreaming) wasStreaming = true;
	$: if (typingFinished) wasStreaming = false;

	// State management for different phases
	$: {
		// Determine which phase we're in
		let phase = 'default';

		// Handle cases where streaming/done properties might be undefined
		const actuallyStreaming = isStreaming === true;
		const actuallyComplete = isComplete === true;

		if (!actuallyComplete && (actuallyStreaming || showThinkingOnWaiting) && (content === '' || content.length === 0)) {
			phase = 'thinking';
		} else if (actuallyStreaming && !actuallyComplete && content !== '') {
			phase = 'typing';
		} else if (actuallyComplete || (!actuallyStreaming && content !== '')) {
			phase = 'complete';
		} else {
			// Default case: not streaming, not complete, empty content
			phase = 'waiting';
		}

		// Set state based on phase
		switch (phase) {
			case 'thinking':
				showTypingIndicator = enableThinkingIndicator;
				shouldShowContent = false;
				animatedContent = '';
				break;
			case 'typing':
				showTypingIndicator = false;
				shouldShowContent = true;
				animatedContent = content;
				break;
			case 'complete':
				showTypingIndicator = false;
				shouldShowContent = true;
				animatedContent = content;
				break;
			case 'waiting':
			default:
				// Show empty content, no animation
				showTypingIndicator = false;
				shouldShowContent = false;
				animatedContent = content;
				break;
		}
	}

	// Handle the transition from thinking to typing and reset typingFinished when content changes
	let previousContent = '';
	$: if (content !== previousContent) {
		previousContent = content;
		// Reset typing state on new content only if not historical complete
		if (!(isComplete && !isStreaming && historicalOnMount)) {
			typingFinished = false;
		}
		if (content !== '' && showTypingIndicator) {
			// Smooth transition from thinking to typing
			setTimeout(() => {
				showTypingIndicator = false;
				shouldShowContent = true;
			}, 150);
		}
	}

	// Derived: is typing animation active (continue even after done until TypingAnimation signals completion)
	$: isTypingActive =
		enableTypingAnimation &&
		animationsEnabled &&
		content !== '' &&
		!typingFinished &&
		(
			isStreaming ||
			wasStreaming ||
			(!isComplete && !historicalOnMount) ||
			(initialEmptyAtMount && hasTransitionedToNonEmpty)
		);
</script>

<div class="animated-content-wrapper" aria-busy={showTypingIndicator || isTypingActive}>
	{#if showTypingIndicator}
		<TypingIndicator {botName} animationsEnabled={animationsEnabled} />
	{:else if shouldShowContent}
		{#if isTypingActive}
			<!-- Use typing animation for streaming or non-streaming content -->
			<div class="typing-content markdown-prose">
				<TypingAnimation
					content={animatedContent}
					{isStreaming}
					{isComplete}
					{typingSpeed}
					animationsEnabled={animationsEnabled}
					typingMode={typingMode}
					showCursor={isStreaming && !isComplete}
					on:done={() => (typingFinished = true)}
				/>
			</div>
		{:else}
			<!-- Use regular content renderer for completed content or when animation is disabled -->
			<ContentRenderer
				{id}
				{history}
				{selectedModels}
				content={animatedContent}
				{sources}
				{floatingButtons}
				{save}
				{preview}
				{model}
				{onTaskClick}
				{onSourceClick}
				{onSave}
				{onAddMessages}
			/>
		{/if}
	{/if}
</div>

<style>
	.animated-content-wrapper {
		width: 100%;
		min-height: 1.5rem; /* Prevent layout shift */
	}

	.typing-content {
		font-family: inherit;
		line-height: inherit;
	}

	/* Smooth transitions between states */
	.animated-content-wrapper {
		transition: all 0.2s ease-in-out;
	}

	/* Respect reduced motion for container fades */
	@media (prefers-reduced-motion: reduce) {
		.animated-content-wrapper {
			transition: none;
		}
	}
</style>
