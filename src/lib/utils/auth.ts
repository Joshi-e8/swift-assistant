/**
 * Authentication utilities for token management and validation
 */

import { goto } from '$app/navigation';
import { browser } from '$app/environment';

/**
 * Get the token expiry time from localStorage
 */
export const getTokenExpiry = (): Date | null => {
	if (!browser) return null;
	
	const expiryStr = localStorage.getItem('token_expiry');
	if (!expiryStr) return null;
	
	return new Date(expiryStr);
};

/**
 * Check if the current token is expired
 */
export const isTokenExpired = (): boolean => {
	const expiry = getTokenExpiry();
	if (!expiry) return true; // No expiry means no valid token
	
	const now = new Date();
	return now >= expiry;
};

/**
 * Get the access token from localStorage
 */
export const getAccessToken = (): string | null => {
	if (!browser) return null;
	return localStorage.getItem('token');
};

/**
 * Get the refresh token from localStorage
 */
export const getRefreshToken = (): string | null => {
	if (!browser) return null;
	return localStorage.getItem('refresh_token');
};

/**
 * Clear all authentication tokens from localStorage
 */
export const clearTokens = (): void => {
	if (!browser) return;
	
	localStorage.removeItem('token');
	localStorage.removeItem('refresh_token');
	localStorage.removeItem('token_type');
	localStorage.removeItem('token_scope');
	localStorage.removeItem('token_expiry');
};

/**
 * Redirect to Swift-Teach backend home page
 */
export const redirectToBackendHome = (): void => {
	if (!browser) return;
	
	// Get the backend URL from environment or use default
	const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/';
	
	// Clear tokens before redirecting
	clearTokens();
	
	// Redirect to backend home
	window.location.href = `${backendUrl}home/`;
};

/**
 * Validate token and redirect if expired
 * Returns true if token is valid, false if expired (and redirects)
 */
export const validateTokenOrRedirect = (): boolean => {
	if (!browser) return true; // Skip validation on server-side
	
	const token = getAccessToken();
	
	// No token at all - redirect
	if (!token) {
		console.warn('⚠️ No access token found - redirecting to backend');
		redirectToBackendHome();
		return false;
	}
	
	// Token expired - redirect
	if (isTokenExpired()) {
		console.warn('⚠️ Token expired - redirecting to backend');
		redirectToBackendHome();
		return false;
	}
	
	return true;
};

/**
 * Create an authenticated fetch wrapper that validates token before each request
 */
export const authenticatedFetch = async (
	url: string,
	options: RequestInit = {}
): Promise<Response> => {
	// Validate token before making request
	if (!validateTokenOrRedirect()) {
		throw new Error('Token expired - redirecting to login');
	}
	
	const token = getAccessToken();
	
	// Add Authorization header
	const headers = new Headers(options.headers || {});
	if (token && !headers.has('Authorization')) {
		headers.set('Authorization', `Bearer ${token}`);
	}
	
	// Make the request
	const response = await fetch(url, {
		...options,
		headers
	});
	
	// Check if response indicates token expiry (401 Unauthorized)
	if (response.status === 401) {
		console.warn('⚠️ Received 401 Unauthorized - token may be expired');
		redirectToBackendHome();
		throw new Error('Unauthorized - token expired');
	}
	
	return response;
};

/**
 * Store tokens in localStorage with expiry time
 */
export const storeTokens = (
	accessToken: string,
	refreshToken: string,
	expiresIn: string | Date
): void => {
	if (!browser) return;
	
	localStorage.setItem('token', accessToken);
	localStorage.setItem('refresh_token', refreshToken);
	
	// Calculate expiry time
	let expiryDate: Date;
	if (typeof expiresIn === 'string') {
		// If it's an ISO string, parse it
		expiryDate = new Date(expiresIn);
	} else {
		// If it's already a Date object
		expiryDate = expiresIn;
	}
	
	// Store expiry time
	localStorage.setItem('token_expiry', expiryDate.toISOString());
	
	console.log('✅ Tokens stored successfully');
	console.log('📅 Token expires at:', expiryDate.toLocaleString());
};

/**
 * Get time remaining until token expiry (in milliseconds)
 */
export const getTokenTimeRemaining = (): number => {
	const expiry = getTokenExpiry();
	if (!expiry) return 0;
	
	const now = new Date();
	return expiry.getTime() - now.getTime();
};

/**
 * Check if token will expire soon (within the next 5 minutes)
 */
export const isTokenExpiringSoon = (): boolean => {
	const timeRemaining = getTokenTimeRemaining();
	const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
	
	return timeRemaining > 0 && timeRemaining < fiveMinutes;
};

