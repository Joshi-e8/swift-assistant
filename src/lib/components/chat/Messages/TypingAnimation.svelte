<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import Markdown from './Markdown.svelte';

	export let content = '';
	export let isStreaming = false;
	export let isComplete = false;
	export let typingSpeed = 38; // milliseconds per step (char or word) for smoother word pacing
	export let showCursor = true;
	// New: typing mode and animation controls
	export let typingMode: 'char' | 'word' = 'word';
	export let animationsEnabled = true;
	export let respectReducedMotion = true;

	const dispatch = createEventDispatcher();

	let displayedContent = '';
	let currentIndex = 0;
	let typingInterval: NodeJS.Timeout | null = null;
	let cursorVisible = true;
	let cursorInterval: NodeJS.Timeout | null = null;
	let prefersReducedMotion = false;

	onMount(() => {
		if (respectReducedMotion && typeof window !== 'undefined' && 'matchMedia' in window) {
			const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
			prefersReducedMotion = mq.matches;
			const handler = (e: MediaQueryListEvent) => (prefersReducedMotion = e.matches);
			// Safari/old support
			// @ts-ignore
			mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler);
		}

		if (showCursor && animationsEnabled && !prefersReducedMotion) {
			startCursorBlink();
		}
	});

	onDestroy(() => {
		clearTyping();
		clearCursorBlink();
	});

	// Reactive statement to handle content changes
	$: if (content !== displayedContent) {
		startTyping();
	}

	function startTyping() {
		clearTyping();

		// If animations are disabled or reduced motion preferred, render immediately
		if (!animationsEnabled || (respectReducedMotion && prefersReducedMotion)) {
			completeTyping();
			return;
		}

		if (content.length === 0) {
			displayedContent = '';
			currentIndex = 0;
			return;
		}

		// If content is shorter than displayed (backspace scenario), adjust immediately
		if (content.length < displayedContent.length) {
			displayedContent = content;
			currentIndex = content.length;
			return;
		}

		// Start from where we left off
		currentIndex = displayedContent.length;

		typingInterval = setInterval(() => {
			if (currentIndex < content.length) {
				let nextIndex = currentIndex + 1;
				if (typingMode === 'word') {
					nextIndex = Math.max(currentIndex + 1, getWordBoundaryIndex(content, currentIndex + 1));
				}
				displayedContent = content.slice(0, nextIndex);
				currentIndex = nextIndex;
			} else {
				clearTyping();
				// Notify parent that typing is done for current content
				dispatch('done');
			}
		}, typingSpeed);
	}

	function completeTyping() {
		clearTyping();
		displayedContent = content;
		currentIndex = content.length;
		// Notify parent that typing is completed instantly
		dispatch('done');
	}

	function clearTyping() {
		if (typingInterval) {
			clearInterval(typingInterval);
			typingInterval = null;
		}
	}

	function startCursorBlink() {
		cursorInterval = setInterval(() => {
			cursorVisible = !cursorVisible;
		}, 530); // Standard cursor blink rate
	}

	function clearCursorBlink() {
		if (cursorInterval) {
			clearInterval(cursorInterval);
			cursorInterval = null;
		}
	}

	// Show cursor when streaming or typing
	$: showActiveCursor =
		showCursor && animationsEnabled && !prefersReducedMotion && (isStreaming || currentIndex < content.length);

	// Handle word-by-word typing with smoother boundaries
	function getWordBoundaryIndex(text: string, charIndex: number): number {
		const len = text.length;
		if (charIndex >= len) return len;

		// If at whitespace, consume contiguous whitespace
		if (/\s/.test(text[charIndex])) {
			let i = charIndex;
			while (i < len && /\s/.test(text[i])) i++;
			return i;
		}

		// Define punctuation set (includes quotes, brackets, dashes)
		const punct = /[.,!?;:…—–\-()\[\]{}"'“”‘’]/;

		// Advance until next whitespace or punctuation
		let i = charIndex;
		while (i < len && !/[\s]/.test(text[i]) && !punct.test(text[i])) i++;
		// Include trailing punctuation
		while (i < len && punct.test(text[i])) i++;
		// Include a following single space for a smoother flow
		if (i < len && text[i] === ' ') i++;
		return i;
	}
</script>

<div class="typing-animation" aria-live="off" aria-busy={isStreaming && displayedContent !== content}>
	<Markdown id="typing" content={displayedContent} />
	<span class="cursor {showActiveCursor && cursorVisible ? 'visible' : 'invisible'}" aria-hidden="true">|</span>
</div>

<style>
	.typing-animation {
		position: relative;
		display: block;
	}

	.cursor {
		display: inline-block;
		font-weight: normal;
		color: currentColor;
		animation: none;
		margin-left: 1px;
	}

	.cursor.visible {
		opacity: 1;
	}

	.cursor.invisible {
		opacity: 0;
	}

	/* Smooth transitions for cursor */
	.cursor {
		transition: opacity 0.1s ease-in-out;
	}
</style>
