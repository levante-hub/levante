import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '@/services/logger';

// Utility functions for PKCE flow
const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
};

const base64UrlEncode = (buffer: Uint8Array): string => {
  const base64 = btoa(String.fromCharCode(...Array.from(buffer)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
};

interface UseOpenRouterOAuthOptions {
  onSuccess: (apiKey: string) => void;
  onError?: (error: string) => void;
}

export function useOpenRouterOAuth({ onSuccess, onError }: UseOpenRouterOAuthOptions) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const initiateOAuthFlow = async () => {
    try {
      setIsAuthenticating(true);
      logger.core.info('Initiating OpenRouter OAuth flow');

      // Start local callback server
      const serverResult = await window.levante.oauth.startServer();
      if (!serverResult.success || !serverResult.callbackUrl) {
        throw new Error(serverResult.error || 'Failed to start callback server');
      }

      logger.core.info('OAuth callback server started', {
        port: serverResult.port,
        callbackUrl: serverResult.callbackUrl
      });

      // Generate PKCE parameters
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      // Store code verifier in sessionStorage for later use
      sessionStorage.setItem('openrouter_code_verifier', codeVerifier);

      // Build authorization URL with localhost callback
      const authUrl = new URL('https://openrouter.ai/auth');
      authUrl.searchParams.set('callback_url', serverResult.callbackUrl);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      const authUrlString = authUrl.toString();

      logger.core.info('Opening OAuth authorization URL', {
        url: authUrlString,
        callbackUrl: serverResult.callbackUrl
      });

      // Open external browser for authorization
      const openResult = await window.levante.openExternal(authUrlString);

      if (!openResult.success) {
        throw new Error(openResult.error || 'Failed to open browser');
      }

      toast.info('Authorization started', {
        description: 'Please complete the login in your browser',
        duration: 10000
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start authentication';
      logger.core.error('Failed to initiate OAuth flow', {
        error: errorMessage
      });
      toast.error('OAuth error', {
        description: errorMessage,
        duration: 5000
      });
      setIsAuthenticating(false);

      // Stop server on error
      await window.levante.oauth.stopServer();

      if (onError) {
        onError(errorMessage);
      }
    }
  };

  const exchangeCodeForApiKey = async (code: string) => {
    try {
      logger.core.info('Exchanging authorization code for API key');

      // Retrieve code verifier from sessionStorage
      const codeVerifier = sessionStorage.getItem('openrouter_code_verifier');
      if (!codeVerifier) {
        throw new Error('Code verifier not found. Please try again.');
      }

      // Exchange code for API key
      const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          code_challenge_method: 'S256'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.core.error('Failed to exchange code for API key', {
          status: response.status,
          error: errorText
        });
        throw new Error(`Authentication failed: ${response.status}`);
      }

      const data = await response.json();
      const newApiKey = data.key;

      if (!newApiKey) {
        throw new Error('No API key received from OpenRouter');
      }

      logger.core.info('Successfully obtained API key from OpenRouter');

      // Clean up stored code verifier
      sessionStorage.removeItem('openrouter_code_verifier');

      toast.success('Login successful!', {
        description: 'Your OpenRouter account has been connected',
        duration: 5000
      });

      // Call success callback with the new API key
      onSuccess(newApiKey);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not complete login';
      logger.core.error('Failed to exchange code for API key', {
        error: errorMessage
      });
      toast.error('Authentication failed', {
        description: errorMessage,
        duration: 5000
      });

      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsAuthenticating(false);

      // Stop OAuth callback server
      await window.levante.oauth.stopServer();
    }
  };

  // Listen for OAuth callback from local server
  useEffect(() => {
    const cleanup = window.levante.oauth.onCallback((data) => {
      logger.core.info('Received OAuth callback', { data });

      if (!data.success) {
        const errorMessage = data.error || 'Unknown error';
        toast.error('Authorization failed', {
          description: errorMessage,
          duration: 5000
        });
        setIsAuthenticating(false);

        if (onError) {
          onError(errorMessage);
        }
        return;
      }

      if (data.provider === 'openrouter' && data.code) {
        logger.core.info('Processing OpenRouter OAuth callback', {
          codeLength: data.code.length
        });
        exchangeCodeForApiKey(data.code);
      }
    });

    return cleanup;
  }, [onSuccess, onError]);

  return {
    isAuthenticating,
    initiateOAuthFlow
  };
}
