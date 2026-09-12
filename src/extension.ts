/* eslint-disable @typescript-eslint/naming-convention */

import * as vscode from 'vscode';

const https = require('https');
const highlightjs = require('markdown-it-highlightjs');
const md = require('markdown-it')();
const uuid = require('uuid');
md.use(highlightjs);

let gpt_messages_array: any = []; // Array of messages in the current session
let thread_ts: string = "";  // thread_ts value for the current session
let help50_message: string = ""; // help50 message for the current session

// Output channel for troubleshooting (View > Output > "CS50 Duck")
let outputChannel: vscode.OutputChannel;
function log(message: string) {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    outputChannel?.appendLine(line);
}

// Tokens for authenticating with cs50.ai, in order of preference. CS50_TOKEN is written by
// cs50.dev as a Codespaces secret; GITHUB_TOKEN is provided by Codespaces itself.
const TOKEN_ENV_VARS = ['CS50_TOKEN', 'GITHUB_TOKEN'];
interface Token { name: string; value: string; }
function getTokens(): Token[] {
    const tokens: Token[] = [];
    for (const name of TOKEN_ENV_VARS) {
        const value = (process.env[name] || '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        if (value && !tokens.some(t => t.value === value)) {
            tokens.push({ name, value });
        }
    }
    return tokens;
}

// Extract the message from an error response body: JSON {"message": ...} or Werkzeug's HTML page
function extractServerMessage(body: string): string {
    const trimmed = body.trim();
    if (!trimmed) {
        return '';
    }
    try {
        const json = JSON.parse(trimmed);
        const message = json.message || json.description || json.error;
        if (typeof message === 'string') {
            return message;
        }
    } catch {
        // not JSON
    }
    const paragraphs = [...trimmed.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(m => m[1].trim());
    const text = (paragraphs.length ? paragraphs.join(' ') : trimmed.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ').trim();
    return text.length > 300 ? text.slice(0, 300) + '…' : text;
}

export function activate(context: vscode.ExtensionContext) {

    outputChannel = vscode.window.createOutputChannel('CS50 Duck');
    context.subscriptions.push(outputChannel);
    log(`ddb50 activated; tokens available: ${getTokens().map(t => t.name).join(', ') || 'none'}`);

    // Register the ddb50 chat window
    const provider = new DDBViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DDBViewProvider.viewId, provider));


    // Command: Ask a question in the ddb50 chat window
    context.subscriptions.push(
        vscode.commands.registerCommand('ddb50.ask', async(args) => {
            await vscode.commands.executeCommand('ddb50.chatWindow.focus').then(() => {
                setTimeout(() => {
                    provider.webViewGlobal?.webview.postMessage({ command: 'ask', content: { "userMessage": args[0] } });
                }, 100);
            });
        })
    );

    // Command: Have the duck say something in the ddb50 chat window
    context.subscriptions.push(
        vscode.commands.registerCommand('ddb50.say', async(args) => {
            await vscode.commands.executeCommand('ddb50.chatWindow.focus').then(() => {
                setTimeout(() => {
                    provider.webViewGlobal?.webview.postMessage({ command: 'say', content: { "userMessage": args[0] } });
                }, 100);
            });
        })
    );

    // Command: Prompt the user for input in the ddb50 chat window
    context.subscriptions.push(
        vscode.commands.registerCommand('ddb50.prompt', async(args) => {
            vscode.window.showInformationMessage(
                args[0], ...['Ask for Help', 'Dismiss']).then((selection) => {
                if (selection === 'Ask for Help') {
                    vscode.commands.executeCommand('ddb50.chatWindow.focus').then(() => {
                        setTimeout(() => {
                            provider.webViewGlobal?.webview.postMessage({ command: 'ask', content: { "userMessage": args[1] } });
                        }, 100);
                    });
                }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ddb50.hide', async(args) => {
            vscode.window.showInformationMessage("");
        })
    );

    // Command: Download the chat history
    context.subscriptions.push(
      vscode.commands.registerCommand("ddb50.downloadChatHistory", async () => {
        const chatHistory = gpt_messages_array
          .map((message: any) => {
            return `${message.role}: ${message.content}\n`;
          })
          .join("\n");

        // Show a "Save As" dialog
        const uri = await vscode.window.showSaveDialog({
          saveLabel: "Save Chat History",
          filters: { "Text Files": ["txt"] },
          defaultUri: vscode.Uri.file(
            `${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath}/ddb50_chat_history_${Date.now()}.txt`
          ),
        });

        if (uri) {
          // Write the chat history to the selected file
          await vscode.workspace.fs.writeFile(
            uri,
            Buffer.from(chatHistory, "utf8")
          );
          vscode.window.showInformationMessage(
            "Chat history saved successfully!"
          );
        } else {
          vscode.window.showWarningMessage("Save operation was canceled.");
        }
      })
    );

    // Command: Clear Messages in the ddb50 chat window with confirmation
    context.subscriptions.push(
      vscode.commands.registerCommand('ddb50.resetHistory', async () => {
          const result = await vscode.window.showWarningMessage(
              "Are you sure you want to clear the chat history? This action cannot be undone.",
              { modal: true },
              "No, keep history",
              "Yes, clear history",
          );

          if (result === "Yes, clear history") {
              provider.webViewGlobal?.webview.postMessage({ command: 'resetHistory' });
              gpt_messages_array = [];
              vscode.window.showInformationMessage("Chat history cleared.");
          }
      })
    );

    // Expose ddb50 API to other extensions (e.g., style50)
    const api = {
        requestGptResponse: async (displayMessage: string, contextMessage: string, payload: any) => {
            if (!provider.webViewGlobal) {await new Promise((resolve) => setTimeout(resolve, 1000));}
            await vscode.commands.executeCommand('ddb50.chatWindow.focus').then(() => {
                provider.createDisplayMessage(displayMessage).then(() => {
                    setTimeout(() => {
                        provider.getGptResponse(uuid.v4(), payload, contextMessage, false);
                    }, 500);
                });
            });
        },
        requestDuckSay: async (message: string) => {
            if (!provider.webViewGlobal) {await new Promise((resolve) => setTimeout(resolve, 1000));}
            await vscode.commands.executeCommand('ddb50.chatWindow.focus').then(() => {
                setTimeout(() => {
                    provider.webViewGlobal?.webview.postMessage({ command: 'say', content: { "userMessage": message } });
                }, 500);
            });
        }
    };
    return api;
}

class DDBViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewId = 'ddb50.chatWindow';
    public webViewGlobal: vscode.WebviewView | undefined;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'reset_history':
                        gpt_messages_array = [];
                        return;

                    case 'get_gpt_response':
                        this.getGptResponse(message.id, message.content);
                        return;

                    case 'restore_messages':
                        gpt_messages_array = message.content;
                        return;
                }
            },
            undefined,
            this.context.subscriptions
        );
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        this.webViewGlobal = webviewView;
    }

    public async createDisplayMessage(message: string) {
        await vscode.commands.executeCommand('ddb50.chatWindow.focus').then(() => {
            setTimeout(() => {
                this.webViewGlobal!.webview.postMessage(
                    {
                        command: 'addMessage',
                        content: {
                            "userMessage": message,
                        }
                    });
            }, 1000);
        });
    }

    public getGptResponse(id: string, payload: any, contextMessage: string="", chat = true) {

        // request timestamp in epoch time
        const requestTimestamp = Date.now();

        try {

            // if input is too long, abort
            if (chat && payload.length > 10000 || contextMessage.length > 10000) {
                this.webviewDeltaUpdate(id, 'Quack! Too much for me to handle. Please try again with a shorter message.\n');
                this.webViewGlobal!.webview.postMessage({ command: 'enable_input', consumeEnergy: false });
                return;
            }

            // The duck only works where a token is available (i.e., inside a codespace)
            const tokens = getTokens();
            if (tokens.length === 0) {
                log('No CS50_TOKEN or GITHUB_TOKEN in environment; cannot contact cs50.ai');
                this.reportError(id,
                    'No `CS50_TOKEN` or `GITHUB_TOKEN` was found in this environment, so I have no way to authenticate with cs50.ai.',
                    'The CS50 Duck only works inside a CS50 codespace (https://cs50.dev). If you are in a codespace, log in again at https://cs50.dev, then fully stop and restart the codespace.');
                return;
            }

            // Record the user's turn
            chat
            ? gpt_messages_array.push({ role: 'user', content: payload, timestamp: requestTimestamp })
            : gpt_messages_array.push({ role: 'user', content: contextMessage, timestamp: requestTimestamp });

            this.webViewGlobal!.webview.postMessage(
                {
                    command: 'persist_messages',
                    gpt_messages_array: gpt_messages_array
                }
            );

            // ensure message only has "role" and "content" keys
            const payloadMessages = gpt_messages_array.map((message: any) => {
                return { role: message.role, content: message.content };
            });
            let postData;
            chat ? postData = {
                'messages': payloadMessages,
                'stream': true,
                'config': vscode.workspace.getConfiguration('ddb50', null)?.config || 'chat_cs50'
            } : postData = payload;

            // add thread_ts to postData
            postData['thread_ts'] = thread_ts;
            postData = JSON.stringify(postData);

            const path = chat ? '/api/v1/chat' : payload.api;
            this.sendRequest(id, path, postData, tokens, 0, requestTimestamp);
        } catch (error: any) {
            log(`Unexpected error preparing request: ${error?.stack || error}`);
            this.recordFailure(requestTimestamp, '');
            this.reportError(id, `Unexpected error: ${error?.message || error}`);
        }
    }

    /**
     * POST to cs50.ai with tokens[tokenIndex], falling back to the next token on 401/403.
     */
    private sendRequest(id: string, path: string, postData: string, tokens: Token[], tokenIndex: number, requestTimestamp: number) {

        const token = tokens[tokenIndex];
        const attempt = `${token.name} (attempt ${tokenIndex + 1}/${tokens.length})`;
        const triedTokens = tokens.slice(0, tokenIndex + 1).map(t => `\`${t.name}\``).join(', ');

        // Inactivity timeout (reset by each streamed chunk). Kept above the 60s idle timeout of
        // the load balancer and nginx so that a server-side stall yields its real status (e.g., 504).
        const timeoutMs = 75000;

        const postOptions = {
            method: 'POST',
            host: 'cs50.ai',
            port: 443,
            path: path,
            headers: {
                'Authorization': `Bearer ${token.value}`,
                'Content-Type': 'application/json'
            },
            timeout: timeoutMs
        };

        // Report each failure once; `buffers` keeps any partially streamed reply
        let settled = false;
        let buffers: string = '';
        const fail = (detail: string, hint?: string) => {
            if (settled) {
                return;
            }
            settled = true;
            log(`POST ${path} via ${attempt} failed: ${detail}`);
            this.recordFailure(requestTimestamp, buffers);
            this.reportError(id, detail, hint, buffers);
        };

        log(`POST ${path} via ${attempt}`);
        const postRequest = https.request(postOptions, (res: any) => {

            const status: number = res.statusCode;
            const requestId = res.headers?.['x-request-id'] || res.headers?.['x-amzn-requestid'] || '';

            if (status !== 200) {

                // Read the body for the server's explanation
                let body = '';
                res.on('data', (chunk: any) => { body += chunk; });
                res.on('end', () => {
                    const serverMessage = extractServerMessage(body);
                    log(`HTTP ${status} ${res.statusMessage || ''} via ${attempt}` +
                        (requestId ? ` [request-id ${requestId}]` : '') +
                        (serverMessage ? `: ${serverMessage}` : ''));

                    // Authentication failed: try the next token
                    if ((status === 401 || status === 403) && tokenIndex + 1 < tokens.length) {
                        settled = true;
                        log(`Falling back to ${tokens[tokenIndex + 1].name}`);
                        this.sendRequest(id, path, postData, tokens, tokenIndex + 1, requestTimestamp);
                        return;
                    }

                    let detail = `cs50.ai responded with **HTTP ${status}${res.statusMessage ? ' ' + res.statusMessage : ''}**`;
                    if (serverMessage) {
                        detail += ` — "${serverMessage}"`;
                    }
                    detail += ` (token${tokens.length > 1 ? 's' : ''} tried: ${triedTokens}`;
                    if (requestId) {
                        detail += `; request id \`${requestId}\``;
                    }
                    detail += ').';

                    let hint: string;
                    if (status === 401 || status === 403) {
                        hint = 'cs50.ai could not verify your GitHub identity with the token(s) in this codespace. ' +
                            'This usually means the token stored in your codespace is stale or your GitHub API rate limit is exhausted. ' +
                            'Log in again at https://cs50.dev, then fully stop and restart (or rebuild) this codespace. ' +
                            'If it keeps failing, wait an hour and try again.';
                    } else if (status === 413) {
                        hint = 'Your message is too long for me to handle. Please try again with a shorter message (under 10,000 characters).';
                    } else if (status === 429) {
                        hint = 'You are sending messages too quickly or the service is busy. Please wait a bit and try again.';
                    } else if (status >= 500) {
                        hint = 'cs50.ai is having a problem on its end. Please try again in a few minutes.';
                    } else {
                        hint = 'Please try again. If the problem persists, share this message with CS50 staff.';
                    }
                    fail(detail, hint);
                });
                res.on('error', (error: any) => fail(`Error reading HTTP ${status} response: ${error.message}`));
                return;
            }

            res.on('data', (chunk: any) => {

                // Check if this chunk contains thread_ts event data
                if (chunk.includes("event_thread_ts")) {
                    thread_ts = chunk.toString().split(": ")[1];
                } else {
                    buffers += chunk;
                    this.webviewDeltaUpdate(id, buffers);
                }
            });

            res.on('error', (error: any) => {
                fail(`Error while receiving the response from cs50.ai: ${error.message}`, 'Please try again.');
            });

            res.on('end', () => {
                if (settled) {
                    return;
                }
                settled = true;
                if (tokenIndex > 0) {
                    log(`Request succeeded with fallback token ${token.name}; ${tokens[0].name} appears to be stale`);
                }
                gpt_messages_array.push({ role: 'assistant', content: buffers, timestamp: requestTimestamp });
                this.webViewGlobal!.webview.postMessage(
                    {
                        command: 'persist_messages',
                        gpt_messages_array: gpt_messages_array
                    }
                );
                this.webViewGlobal!.webview.postMessage({ command: 'enable_input' });
            });
        });

        // The 'timeout' option only arms the timer; the request must be destroyed explicitly
        postRequest.on('timeout', () => {
            postRequest.destroy(new Error(`No response from cs50.ai within ${timeoutMs / 1000} seconds`));
        });

        // DNS, connection, TLS, and timeout failures
        postRequest.on('error', (error: any) => {
            const code = error?.code ? ` (\`${error.code}\`)` : '';
            let hint = 'Please try again in a moment.';
            if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
                hint = 'The hostname cs50.ai could not be resolved. Check that this environment has network access.';
            } else if (error?.code === 'ECONNREFUSED' || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || /within \d+ seconds/.test(error?.message || '')) {
                hint = 'cs50.ai could not be reached from this environment. It may be temporarily down, or a firewall or proxy may be blocking the connection.';
            } else if (/CERT|certificate|SSL|TLS/i.test(`${error?.code} ${error?.message}`)) {
                hint = 'The TLS connection to cs50.ai failed certificate validation. A proxy or web filter (e.g., Zscaler) on this network may be intercepting HTTPS traffic; ask your network administrator to exempt cs50.ai from SSL inspection.';
            }
            fail(`Could not connect to cs50.ai${code}: ${error?.message || error}`, hint);
        });

        postRequest.write(postData);
        postRequest.end();
    }

    /**
     * Keep the history strictly alternating after a failure (the server's Bedrock backend requires
     * it): keep a partial reply as the assistant turn, otherwise drop the unanswered user turn.
     */
    private recordFailure(requestTimestamp: number, partialReply: string) {
        const last = gpt_messages_array[gpt_messages_array.length - 1];
        if (last?.role === 'user' && last.timestamp === requestTimestamp) {
            if (partialReply) {
                gpt_messages_array.push({ role: 'assistant', content: partialReply, timestamp: requestTimestamp });
            } else {
                gpt_messages_array.pop();
            }
            this.webViewGlobal!.webview.postMessage({
                command: 'persist_messages',
                gpt_messages_array: gpt_messages_array
            });
        }
    }

    /**
     * Replace the pending "..." with a detailed error (after any partial reply) and re-enable input.
     */
    private reportError(id: string, detail: string, hint?: string, partialReply: string = '') {
        let content = partialReply ? `${partialReply}\n\n---\n\n` : '';
        content += `Quack! I couldn't get a response from cs50.ai.\n\n**What happened:** ${detail}\n`;
        if (hint) {
            content += `\n**What to try:** ${hint}\n`;
        }
        content += '\n*Details are also logged under View → Output → "CS50 Duck".*\n';
        this.webviewDeltaUpdate(id, content);
        this.webViewGlobal!.webview.postMessage({ command: 'enable_input', consumeEnergy: false });
    }

    private webviewDeltaUpdate(id: string, content: string) {
        this.webViewGlobal!.webview.postMessage(
            {
                command: 'delta_update',
                content: md.render(content),
                id: id,
            });
    }

    private getHtmlForWebview(webview: vscode.Webview) {

        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'static', 'ddb.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'static', 'style.css'));
        const highlightjsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/highlightjs/11.11.1/highlight.min.js`));
        const bootstrapStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/bootstrap/5.3.3/css/bootstrap.min.css`));
        const bootstrapScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/bootstrap/5.3.3/js/bootstrap.bundle.min.js`));
        let highlightStyleUri: vscode.Uri;
        let codeStyleUri: vscode.Uri;

        let lightTheme = [vscode.ColorThemeKind.Light, vscode.ColorThemeKind.HighContrastLight];
        const isLightTheme = lightTheme.includes(vscode.window.activeColorTheme.kind);
        if (isLightTheme) {
            codeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/css/light.css`));
            highlightStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/highlightjs/11.11.1/styles/a11y-light.css`));
        } else {
            codeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/css/dark.css`));
            highlightStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/highlightjs/11.11.1/styles/a11y-dark.css`));
        }
        const markdownItUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/markdown-it/markdown-it.min.js`));

        let fontSize: number | undefined = vscode.workspace.getConfiguration().get('editor.fontSize');
        fontSize !== undefined ? fontSize : 12;

        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="initial-scale=1.0, width=device-width">
                    <link href="${bootstrapStyleUri}" rel="stylesheet">
                    <link href="${highlightStyleUri}" rel="stylesheet">
                    <link href="${codeStyleUri}" rel="stylesheet">
                    <link href="${styleUri}" rel="stylesheet">
                    <title>ddb50</title>
                    <style>
                        body { font-size: ${fontSize}px; }
                        textarea { font-size: ${fontSize}px; }
                    </style>
                </head>
                <body>
                    <div id="ddbChatContainer">
                        <div id="ddbChatText"></div>
                        <div id="resizeHandle"></div>
                        <div id="ddbOutterEnergyBar" class="progress" role="progressbar" aria-label="CS50 Duck Energy Bar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100">
                            <div id="ddbInnerEnergyBar" class="progress-bar" style="width: 100%; color: black"></div>
                        </div>
                        <div id="ddbInput"><textarea placeholder="Ask a question"></textarea></div>
                    </div>
                </body>
                <script src="${bootstrapScriptUri}"></script>
                <script src="${highlightjsUri}"></script>
                <script src="${markdownItUri}"></script>
                <script src="${scriptUri}"></script>
            </html>
        `;
    }
}

export function deactivate() { }
