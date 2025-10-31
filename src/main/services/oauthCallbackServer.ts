import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { BrowserWindow } from 'electron';
import { getLogger } from './logging';

const logger = getLogger();

export class OAuthCallbackServer {
  private server: Server | null = null;
  private port: number = 0;
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Start the OAuth callback server on a random available port
   * Returns the port number and callback URL
   */
  async start(): Promise<{ port: number; callbackUrl: string }> {
    if (this.server) {
      logger.core.warn('OAuth callback server already running', { port: this.port });
      return { port: this.port, callbackUrl: `http://localhost:${this.port}` };
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        this.handleRequest(req, res);
      });

      // Try port 3000 first (recommended by OpenRouter), then fall back to random port
      const tryPorts = [3000, 0]; // 0 means random available port
      let portIndex = 0;

      const tryListen = () => {
        const port = tryPorts[portIndex];

        this.server?.listen(port, 'localhost', () => {
          const address = this.server?.address();
          if (address && typeof address === 'object') {
            this.port = address.port;
            logger.core.info('OAuth callback server started', {
              port: this.port,
              isRecommendedPort: this.port === 3000
            });
            resolve({
              port: this.port,
              callbackUrl: `http://localhost:${this.port}`
            });
          } else {
            reject(new Error('Failed to get server address'));
          }
        });

        this.server?.once('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE' && portIndex < tryPorts.length - 1) {
            // Port 3000 is in use, try random port
            logger.core.info('Port 3000 in use, trying random port');
            portIndex++;
            this.server?.removeAllListeners();
            tryListen();
          } else {
            logger.core.error('OAuth callback server error', {
              error: error.message
            });
            reject(error);
          }
        });
      };

      tryListen();
    });
  }

  /**
   * Stop the OAuth callback server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      logger.core.warn('OAuth callback server not running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          logger.core.error('Error closing OAuth callback server', {
            error: error.message
          });
          reject(error);
        } else {
          logger.core.info('OAuth callback server stopped');
          this.server = null;
          this.port = 0;
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '', `http://localhost:${this.port}`);

    logger.core.info('OAuth callback received', {
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries())
    });

    // Handle callback endpoint (accept both /callback and / as valid paths)
    if (url.pathname === '/callback' || url.pathname === '/') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        logger.core.error('OAuth authorization error', {
          error,
          errorDescription
        });

        // Send error response
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authorization Failed</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: #f5f5f5;
                }
                .container {
                  text-align: center;
                  padding: 2rem;
                  background: white;
                  border-radius: 8px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                h1 { color: #000; }
                p { color: #000; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Authorization Failed</h1>
                <p>${errorDescription || error}</p>
                <p>Return to Levante and try again. You can close this window.</p>
              </div>
            </body>
          </html>
        `);

        // Send error to renderer
        if (this.mainWindow) {
          this.mainWindow.webContents.send('levante/oauth/callback', {
            success: false,
            error: errorDescription || error
          });
        }

        // Stop server after a delay
        setTimeout(() => {
          this.stop();
        }, 2000);

        return;
      }

      if (!code) {
        logger.core.warn('OAuth callback missing code parameter');

        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Invalid Request</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: #f5f5f5;
                }
                .container {
                  text-align: center;
                  padding: 2rem;
                  background: white;
                  border-radius: 8px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                h1 { color: #000; }
                p { color: #000; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Invalid Request</h1>
                <p>Missing authorization code.</p>
                <p>Return to Levante and close this window.</p>
              </div>
            </body>
          </html>
        `);

        return;
      }

      // Success! Send code to renderer
      logger.core.info('OAuth authorization successful', {
        codeLength: code.length
      });

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authorization Successful</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }
              h1 { color: #000; }
              p { color: #000; }
              .spinner {
                margin: 1rem auto;
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #38a169;
                border-radius: 50%;
                animation: spin 1s linear infinite;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Authorization Successful!</h1>
              <div class="spinner"></div>
              <p>Completing login...</p>
              <p><small>You can now return to Levante and close this window.</small></p>
            </div>
            <script>
              // Try to auto-close (only works if opened by window.open)
              setTimeout(() => {
                window.close();
                // If close failed, update message
                setTimeout(() => {
                  const spinner = document.querySelector('.spinner');
                  const messages = document.querySelectorAll('p');
                  if (spinner) spinner.style.display = 'none';
                  if (messages[0]) messages[0].textContent = 'Login completed!';
                  if (messages[1]) messages[1].innerHTML = '<small>Return to Levante and close this window.</small>';
                }, 100);
              }, 2000);
            </script>
          </body>
        </html>
      `);

      // Send code to renderer
      if (this.mainWindow) {
        this.mainWindow.webContents.send('levante/oauth/callback', {
          success: true,
          provider: 'openrouter',
          code
        });

        // Focus the main window
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.show();
        this.mainWindow.focus();
      }

      // Stop server after a delay to allow browser to display success page
      setTimeout(() => {
        this.stop();
      }, 5000);
    } else {
      // Unknown endpoint
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  }
}

// Export singleton instance
export const oauthCallbackServer = new OAuthCallbackServer();
