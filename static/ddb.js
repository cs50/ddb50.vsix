document.addEventListener('DOMContentLoaded', () => {

    const vscode = acquireVsCodeApi();
    const textarea = document.querySelector('#ddbInput textarea');

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'clearMessages':
                clearMessages();
                break;

            case 'delta_update':
                const ddbChatMessage = document.querySelector(`#id-${message.id}`);
                ddbChatMessage.innerHTML = message.content;
                break;

            case 'enable_input':
                textarea.removeAttribute('disabled');
                textarea.focus();
                break;

            case 'persist_messages':
                localStorage.setItem('msgHistory', JSON.stringify(message.content));
                break;
        }
    });

    restoreMessages();

    function getGptResponse(id, message) {
        vscode.postMessage({
            command: 'get_gpt_response',
            id: id,
            content: message
        });
    }

    function addMessage({ id, text, fromDuck }, restore = false) {

        const message =
            `<p class="ddbChat ${fromDuck ? 'ddbChat-Duck' : 'ddbChat-User'}">
                <span class="ddbChatBorder ${fromDuck ? 'ddbChatBorder-Duck' : 'ddbChatBorder-User'}"></span>
                <span class="ddbAuthorName"><b>${(fromDuck ? 'ddb' : 'you')}</b></span>
                <span id="id-${id}" class="ddbChatMessage">${fromDuck && !restore ? '...' : text}</span>
            </p>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(message, 'text/html');
        const chatText = document.querySelector('#ddbChatText');
        chatText.appendChild(doc.body.firstChild);
        chatText.scrollTop = chatText.scrollHeight;

        if (fromDuck && !restore) {
            getGptResponse(id, text);
        }
    }

    function reply(prevMsg) {
        addMessage({ id: uuidv4(), text: prevMsg, fromDuck: true });
    }

    function clearMessages() {
        vscode.postMessage({
            command: 'clear_messages'
        });
        localStorage.setItem('msgHistory', JSON.stringify([]));
        document.querySelector('#ddbChatText').innerHTML = '';
        textarea.removeAttribute('disabled');
        textarea.focus();
    }

    function restoreMessages() {
        textarea.setAttribute('disabled', 'disabled');
        const msgHistory = JSON.parse(localStorage.getItem('msgHistory'));
        if (msgHistory) {
            msgHistory.forEach(msg => {
                addMessage({ id: uuidv4(), text: msg.content, fromDuck: msg.role === 'assistant' ? true : false }, true);
            });
        }
        vscode.postMessage({
            command: 'restore_messages',
            content: msgHistory
        });
        textarea.removeAttribute('disabled');
        textarea.focus();
    }

    function uuidv4() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    textarea.addEventListener('keypress', (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.shiftKey)) {
            event.preventDefault();
            let textBox = event.target;
            textBox.value = textBox.value.slice(0, textBox.selectionStart) + "\n" + textBox.value.slice(textBox.selectionEnd);
        }
        else if (event.key === 'Enter' && event.target.value) {
            event.preventDefault();
            event.target.setAttribute('disabled', 'disabled');
            addMessage({ text: event.target.value });
            reply(event.target.value);
            event.target.value = '';
        }
    });
    textarea.focus();
});


