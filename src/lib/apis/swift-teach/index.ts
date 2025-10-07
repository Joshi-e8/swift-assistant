/**
 * Swift-Teach Backend API Integration
 * Handles token exchange and authentication with Swift-Teach backend
 */

import { browser } from '$app/environment';

/**
 * Get the Swift-Teach API base URL from environment variables
 * Removes trailing slash to prevent double slashes in URLs
 */
const getSwiftTeachApiUrl = (): string => {
	// Default to the same base URL as configured in .env
	let url = 'http://127.0.0.1:8000';
	
	if (browser && import.meta.env.VITE_API_BASE_URL) {
		url = import.meta.env.VITE_API_BASE_URL;
	}
	
	// Remove trailing slash if present
	return url.endsWith('/') ? url.slice(0, -1) : url;
};

export const SWIFT_TEACH_API_BASE_URL = getSwiftTeachApiUrl();
export const SWIFT_TEACH_AI_ASSISTANT_BASE_URL = `${SWIFT_TEACH_API_BASE_URL}/api/v1`;

/**
 * Token exchange response from Swift-Teach backend
 */
export interface SwiftTeachTokenResponse {
	result: 'success' | 'failure';
	message?: string;
	records?: {
		access_token: string;
		refresh_token: string;
		expires_in: string; // ISO datetime string
		chat_id: string; // Chat UUID for redirect
	};
}

/**
 * Exchange a temporary token UID for OAuth2 access and refresh tokens
 * 
 * @param tempTokenUid - The temporary token UID from the URL
 * @returns Token response with access_token, refresh_token, and expires_in
 * @throws Error if the exchange fails
 */
export const exchangeTemporaryToken = async (
	tempTokenUid: string
): Promise<SwiftTeachTokenResponse['records']> => {
	let error: Error | null = null;

	console.log('🔄 Exchanging temporary token:', tempTokenUid);
	console.log('📡 API URL:', `${SWIFT_TEACH_AI_ASSISTANT_BASE_URL}/generate-token/${tempTokenUid}/`);

	const res = await fetch(
		`${SWIFT_TEACH_AI_ASSISTANT_BASE_URL}/generate-token/${tempTokenUid}/`,
		{
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		}
	)
		.then(async (res) => {
			console.log('📥 Response status:', res.status);
			
			if (!res.ok) {
				const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
				throw new Error(errorData.message || `HTTP ${res.status}: ${res.statusText}`);
			}
			
			return res.json();
		})
		.catch((err) => {
			console.error('❌ Token exchange error:', err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}

	if (!res || res.result !== 'success' || !res.records) {
		throw new Error(res?.message || 'Token exchange failed');
	}

	console.log('✅ Token exchange successful');
	return res.records;
};

/**
 * Check if the current token is still valid
 * 
 * @param token - The access token to validate
 * @returns True if token is valid, false otherwise
 */
export const checkTokenStatus = async (token: string): Promise<boolean> => {
	let error: Error | null = null;

	const res = await fetch(`${SWIFT_TEACH_AI_ASSISTANT_BASE_URL}/token-status/`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error('Token status check error:', err);
			error = err;
			return null;
		});

	if (error) {
		return false;
	}

	return res?.result === 'success';
};

/**
 * Get recent chats for the authenticated user
 * 
 * @param token - The access token
 * @returns Array of recent chats
 */
export const getRecentChats = async (token: string): Promise<any[]> => {
	let error: Error | null = null;

	const res = await fetch(`${SWIFT_TEACH_AI_ASSISTANT_BASE_URL}/recent-chats/`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error('Get recent chats error:', err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}

	return res?.records || [];
};

/**
 * Get chat history for a specific chat
 * 
 * @param token - The access token
 * @param chatUuid - The chat UUID
 * @returns Chat history
 */
export const getChatHistory = async (token: string, chatUuid: string): Promise<any> => {
	let error: Error | null = null;

	const res = await fetch(
		`${SWIFT_TEACH_AI_ASSISTANT_BASE_URL}/chat-history/${chatUuid}/`,
		{
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			}
		}
	)
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error('Get chat history error:', err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}

	return res?.records || null;
};

/**
 * Create a new chat
 * 
 * @param token - The access token
 * @param chatData - Chat creation data
 * @returns Created chat information
 */
export const createChat = async (token: string, chatData: any): Promise<any> => {
	let error: Error | null = null;

	const res = await fetch(`${SWIFT_TEACH_AI_ASSISTANT_BASE_URL}/chat-create/`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(chatData)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error('Create chat error:', err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}

	return res?.records || null;
};

/**
 * Send a message in a chat
 * 
 * @param token - The access token
 * @param chatUuid - The chat UUID
 * @param message - Message data
 * @returns Message response
 */
export const sendChatMessage = async (
	token: string,
	chatUuid: string,
	message: any
): Promise<any> => {
	let error: Error | null = null;

	const res = await fetch(`${SWIFT_TEACH_AI_ASSISTANT_BASE_URL}/chat/${chatUuid}/`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(message)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error('Send chat message error:', err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}

	return res || null;
};

