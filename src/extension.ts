import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const provider = new DDBViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(DDBViewProvider.viewId, provider));
}

class DDBViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewId = 'ddb50.debugView';

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'static', 'ddb.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'static', 'style.css'));
		return `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="initial-scale=1.0, width=device-width">
					<link href="${styleUri}" rel="stylesheet">
					<script src="${scriptUri}"></script>
					<title>ddb50</title>
				</head>
				<body>
					<div id="ddbChatContainer">
						<div id="ddbChatText"></div>
						<div id="ddbInput"><textarea placeholder="Message ddb"></textarea></div>
					</div>
				</body>
			</html>
		`;
	}
}

export function deactivate() {}
