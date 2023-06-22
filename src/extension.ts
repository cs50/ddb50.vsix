/* eslint-disable @typescript-eslint/naming-convention */

import * as vscode from 'vscode';

const axios = require('axios').default;
const https = require('https');
const highlightjs = require('markdown-it-highlightjs');
const md = require('markdown-it')();
const uuid = require('uuid');
md.use(highlightjs);

let gpt_messages_array: any = []; // Array of messages in the current session
let md_messages_array: any = []; // Array of messages in markdown format in the current session

export function activate(context: vscode.ExtensionContext) {

    // Register the ddb50 chat window
    const provider = new DDBViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DDBViewProvider.viewId, provider));

    // Command: Clear Messages in the ddb50 chat window
    context.subscriptions.push(
        vscode.commands.registerCommand('ddb50.clearMessages', () => {
            provider.webViewGlobal?.webview.postMessage({ command: 'clearMessages' });
            gpt_messages_array = [];
        })
    );

    // Expose ddb50 API to other extensions (e.g., style50)
    const api = {
        requestGptResponse: async (message: string, prompt: string) => {
            provider.addMessageToChat(message, prompt);
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
                    case 'clear_messages':
                        gpt_messages_array = [];
                        md_messages_array = [];
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

    public async addMessageToChat(message: string, prompt: string) {
        await vscode.commands.executeCommand('ddb50.chatWindow.focus').then(() => {
            setTimeout(() => {
                this.webViewGlobal!.webview.postMessage(
                    {
                        command: 'addMessage',
                        content: {
                            "userMessage": message,
                        }
                    });
                this.getGptResponse(uuid.v4(), prompt, false);
            }, 100);
        });
    }

    private getGptResponse(id: string, content: string, persist_messages = true) {

        try {
            if (persist_messages) {
                gpt_messages_array.push({ role: 'user', content: content });
                md_messages_array.push({ role: 'user', content: content});
                this.webViewGlobal!.webview.postMessage(
                    {
                        command: 'persist_messages',
                        gpt_messages_array: gpt_messages_array,
                        md_messages_array: md_messages_array
                    }
                );
            }

            const postOptions = {
                method: 'POST',
                host: 'cs50.ai',
                port: 443,
                path: '/api/v1/ddb50',
                headers: {
                    'Authorization': `Bearer ${process.env['CS50_TOKEN']?.replace(/[\x00-\x1F\x7F-\x9F]/g, "")}`,
                    'Content-Type': 'application/json'
                }
            };

            const postData = JSON.stringify({
                'messages': persist_messages ? gpt_messages_array : [{ role: 'user', content: content }],
                'stream': true
            });

            const postRequest = https.request(postOptions, (res: any) => {

                if (res.statusCode !== 200) {
                    console.log(res.statusCode, res.statusMessage);
                    this.webviewDeltaUpdate(id, 'Quack! I\'m having trouble connecting to the server. Please try again later.');
                    this.webViewGlobal!.webview.postMessage({ command: 'enable_input' });
                    return;
                }

                let buffers: string = '';
                res.on('data', (chunk: any) => {
                    buffers += chunk;
                    this.webviewDeltaUpdate(id, buffers);
                });

                res.on('end', () => {
                    if (persist_messages) {
                        gpt_messages_array.push({ role: 'assistant', content: buffers });
                        md_messages_array.push({ role: 'assistant', content: md.render(buffers) });
                        this.webViewGlobal!.webview.postMessage(
                            {
                                command: 'persist_messages',
                                gpt_messages_array: gpt_messages_array,
                                md_messages_array: md_messages_array
                            }
                        );
                    }
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
        const markdownUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, `static/vendor/markdown/markdown.js`));

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
                    <style>body { font-size: ${fontSize}px; }</style>
                </head>
                <body>
                    <div id="ddbChatContainer">
                        <div id="ddbChatText"></div>
                        <div id="ddbInput"><textarea placeholder="Message ddb"></textarea></div>
                    </div>
                </body>
                <script src="${highlightjsUri}"></script>
                <script src="${markdownUri}"></script>
                <script src="${scriptUri}"></script>
            </html>
        `;
    }
}

export function deactivate() { }
