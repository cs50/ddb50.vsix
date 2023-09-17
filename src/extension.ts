/* eslint-disable @typescript-eslint/naming-convention */

import * as vscode from 'vscode';

const https = require('https');
const highlightjs = require('markdown-it-highlightjs');
const md = require('markdown-it')();
const uuid = require('uuid');
md.use(highlightjs);

let gpt_messages_array: any = []; // Array of messages in the current session

export function activate(context: vscode.ExtensionContext) {

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

    // Command: Clear Messages in the ddb50 chat window
    context.subscriptions.push(
        vscode.commands.registerCommand('ddb50.resetHistory', () => {
            provider.webViewGlobal?.webview.postMessage({ command: 'resetHistory' });
            gpt_messages_array = [];
        })
    );

    // Expose ddb50 API to other extensions (e.g., style50)
    const api = {
        requestGptResponse: async (displayMessage: string, contextMessage: string, payload: any) => {
            provider.createDisplayMessage(displayMessage).then(() => {
                setTimeout(() => {
                    provider.getGptResponse(uuid.v4(), payload, contextMessage, false);
                }, 1000);
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
            }, 100);
        });
    }

    public getGptResponse(id: string, payload: any, contextMessage: string="", chat = true) {

        try {

            // if input is too long, abort
            if (chat && payload.length > 1000 || contextMessage.length > 1000) {
                this.webviewDeltaUpdate(id, 'Quack! Too much for me to handle. Please try again with a shorter message.\n');
                this.webViewGlobal!.webview.postMessage({ command: 'enable_input' });
                return;
            }

            // request timestamp in epoch time
            const requestTimestamp = Date.now();

            chat
            ? gpt_messages_array.push({ role: 'user', content: payload, timestamp: requestTimestamp })
            : gpt_messages_array.push({ role: 'user', content: contextMessage, timestamp: requestTimestamp });

            this.webViewGlobal!.webview.postMessage(
                {
                    command: 'persist_messages',
                    gpt_messages_array: gpt_messages_array
                }
            );

            const postOptions = {
                method: 'POST',
                host: 'cs50.ai',
                port: 443,
                path: chat ? '/api/v1/chat' : payload.api,
                headers: {
                    'Authorization': `Bearer ${(process.env['CS50_TOKEN'] || process.env['GITHUB_TOKEN'])!.replace(/[\x00-\x1F\x7F-\x9F]/g, "")}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            };

            // ensure message only has "role" and "content" keys
            const payloadMessages = gpt_messages_array.map((message: any) => {
                return { role: message.role, content: message.content };
            });
            let postData;
            chat ? postData = JSON.stringify({
                'messages': payloadMessages,
                'stream': true,
                'config': 'chat_cs50'
            }) : postData = JSON.stringify(payload);

            const postRequest = https.request(postOptions, (res: any) => {

                if (res.statusCode !== 200) {
                    console.log(res.statusCode, res.statusMessage);
                    this.webviewDeltaUpdate(id, 'Quack! I\'m having trouble connecting to the server. Please try again later.\n');
                    this.webViewGlobal!.webview.postMessage({ command: 'enable_input' });
                    return;
                }

                res.on('timeout', () => {
                    console.log('Request timed out');
                    console.log(res.statusCode, res.statusMessage);
                    postRequest.abort();
                    this.webviewDeltaUpdate(id, 'Quack! I\'m having trouble connecting to the server. Please try again later.\n');
                    this.webViewGlobal!.webview.postMessage({ command: 'enable_input' });
                    return;
                });

                let buffers: string = '';
                res.on('data', (chunk: any) => {
                    buffers += chunk;
                    this.webviewDeltaUpdate(id, buffers);
                });

                res.on('end', () => {
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

            postRequest.write(postData);
            postRequest.end();
        } catch (error: any) {
            console.log(error);
        }
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
        const highlightjsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/highlightjs/11.7.0/highlight.min.js`));
        let highlightStyleUri: vscode.Uri;
        let codeStyleUri: vscode.Uri;

        let lightTheme = [vscode.ColorThemeKind.Light, vscode.ColorThemeKind.HighContrastLight];
        const isLightTheme = lightTheme.includes(vscode.window.activeColorTheme.kind);
        if (isLightTheme) {
            codeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/css/light.css`));
            highlightStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/highlightjs/11.7.0/styles/github.min.css`));
        } else {
            codeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/css/dark.css`));
            highlightStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/highlightjs/11.7.0/styles/github-dark.min.css`));
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
                        <div id="ddbInput"><textarea placeholder="Ask a question"></textarea></div>
                    </div>
                </body>
                <script src="${highlightjsUri}"></script>
                <script src="${markdownItUri}"></script>
                <script src="${scriptUri}"></script>
            </html>
        `;
    }
}

export function deactivate() { }
