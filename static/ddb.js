document.addEventListener('DOMContentLoaded', () => {

    const vscode = acquireVsCodeApi();
    const textarea = document.querySelector('#ddbInput textarea');
    const chatText = document.querySelector('#ddbChatText');

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'addMessage':
                addMessage({ text: message.content.userMessage });
                break;

            case 'clearMessages':
                clearMessages();
                break;

            case 'delta_update':
                const ddbChatMessage = document.querySelector(`#id-${message.id}`);
                if (ddbChatMessage === null) {

                    // Recreate ddb chat message
                    textarea.setAttribute('disabled', 'disabled');
                    addMessage({ id: message.id, text: message.content, fromDuck: true }, restore = true);
                } else {
                    ddbChatMessage.innerHTML = message.content;
                    chatText.scrollTop = chatText.scrollHeight;
                }
                break;

            case 'enable_input':
                textarea.removeAttribute('disabled');
                textarea.focus();
                break;

            case 'persist_messages':
                localStorage.setItem('gptMessagesHistory', JSON.stringify(message.gpt_messages_array));
                break;
        }
    });

    restoreMessages();

    if (document.querySelector('#ddbChatText').children.length === 0) {
        const disclaimer = "Quack. I am CS50's duck debugger (ddb), an experimental AI for [rubberducking](https://en.wikipedia.org/wiki/Rubber_duck_debugging). Quack quack. My replies might not always be accurate, so always think critically and let me know if you think that I've erred. Conversations are logged for debugging's sake. Quack quack quack.";
        addMessage({ id: 'disclaimer', text: disclaimer, fromDuck: true }, restore = true);
    }

    function getGptResponse(id, message) {
        vscode.postMessage({
            command: 'get_gpt_response',
            id: id,
            content: message
        });
    }

    function addMessage({ id = uuidv4(), text, fromDuck }, restore = false) {
        const message =
            `<div class="ddbChat ${fromDuck ? 'ddbChat-Duck' : 'ddbChat-User'}">
                <span class="ddbChatBorder ${fromDuck ? 'ddbChatBorder-Duck' : 'ddbChatBorder-User'}"></span>
                <span class="ddbAuthorName"><b>${(fromDuck ? 'ddb' : 'you')}</b></span>
                <span id="id-${id}" class="ddbChatMessage">${fromDuck && !restore ? '...' : markdown.toHTML(text)}</span>
            </div>`;
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
        addMessage({ text: prevMsg, fromDuck: true });
    }

    function clearMessages() {
        vscode.postMessage({
            command: 'clear_messages'
        });
        localStorage.setItem('gptMessagesHistory', JSON.stringify([]));
        document.querySelector('#ddbChatText').innerHTML = '';
        textarea.removeAttribute('disabled');
        textarea.focus();
    }

    function restoreMessages() {
        try {
            textarea.setAttribute('disabled', 'disabled');
            const gptMessagesHistory = JSON.parse(localStorage.getItem('gptMessagesHistory'));
            if (gptMessagesHistory) {
                gptMessagesHistory.forEach(msg => {
                    addMessage({ id: msg.id || uuidv4(), text: msg.content, fromDuck: msg.role === 'assistant' ? true : false }, true);
                });
            }
            vscode.postMessage({
                command: 'restore_messages',
                content: gptMessagesHistory
            });
        } catch (error) {
            clearMessages();
        } finally {
            textarea.removeAttribute('disabled');
            textarea.focus();
        }
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
            userMessage = event.target.value;
            event.target.value = '';
            addMessage({ text: userMessage });
            setTimeout(() => {
                reply(userMessage);
            }, 500 * Math.random() + 500);
        }
    });
    textarea.focus();
});


