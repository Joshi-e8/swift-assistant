<script lang="ts">
	export let botName = 'AI Assistant';
	export let size = 'md';
	// New: animation controls
	export let animationsEnabled = true;
</script>

<div class="typing-indicator flex items-center gap-2 py-2" role="status" aria-live="polite" aria-busy="true">
	<div class="typing-dots flex items-center gap-1 {animationsEnabled ? '' : 'motion-disabled'}">
		<span class="dot dot-1 {size === 'sm' ? 'size-1.5' : 'size-2'} bg-gray-500 dark:bg-gray-400 rounded-full"></span>
		<span class="dot dot-2 {size === 'sm' ? 'size-1.5' : 'size-2'} bg-gray-500 dark:bg-gray-400 rounded-full"></span>
		<span class="dot dot-3 {size === 'sm' ? 'size-1.5' : 'size-2'} bg-gray-500 dark:bg-gray-400 rounded-full"></span>
	</div>
	<span class="text-sm text-gray-500 dark:text-gray-400 italic">
		{botName} is typing...
	</span>
</div>

<style>
	.typing-indicator {
		animation: fadeIn 0.3s ease-in-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(5px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dot {
		animation: typingDots 1.4s infinite ease-in-out;
	}

	/* Disable motion when animations are disabled */
	.motion-disabled .dot {
		animation: none !important;
		opacity: 1;
		transform: none;
	}

	/* Respect user prefers-reduced-motion */
	@media (prefers-reduced-motion: reduce) {
		.dot {
			animation: none !important;
			opacity: 1;
			transform: none;
		}
	}

	.dot-1 { animation-delay: 0ms; }
	.dot-2 { animation-delay: 200ms; }
	.dot-3 { animation-delay: 400ms; }

	@keyframes typingDots {
		0%, 60%, 100% {
			transform: translateY(0);
			opacity: 0.4;
		}
		30% {
			transform: translateY(-8px);
			opacity: 1;
		}
	}

	/* Smooth entrance animation */
	.typing-indicator {
		will-change: transform, opacity;
	}
</style>
