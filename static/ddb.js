document.addEventListener('DOMContentLoaded', () => {

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
        }
    });

    const vscode = acquireVsCodeApi();

    function getGptResponse(id, message) {
        vscode.postMessage({
            command: 'get_gpt_response',
            id: id,
            content: message
        });
    }

    function addMessage({ id, text, fromDuck }, saveMsg = true) {

        const message =
            `<p class="ddbChat">
                <span class="ddbChatBorder ${fromDuck ? 'ddbChatBorder-Duck' : 'ddbChatBorder-User'}"></span>
                <span class="ddbAuthorName"><b>${(fromDuck ? 'ddb' : 'you')}</b></span>
                <span id="id-${id}" class="ddbChatMessage">${fromDuck ? '' : text}</span>
            </p>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(message, 'text/html');
        const chatText = document.querySelector('#ddbChatText');
        chatText.appendChild(doc.body.firstChild);
        chatText.scrollTop = chatText.scrollHeight;

        if (fromDuck) {
            getGptResponse(id, text);
        }
    }

    function clearMessages() {
        document.querySelector('#ddbChatText').innerHTML = '';
        localStorage.setItem('msgHistory', JSON.stringify([]));
    }

    function reply(prevMsg) {
        addMessage({ id: uuidv4(), text: prevMsg, fromDuck: true });
    }

    function uuidv4() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    const textarea = document.querySelector('#ddbInput textarea');
    textarea.focus();
    textarea.addEventListener('keypress', (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.shiftKey)) {
            event.preventDefault();
            let textBox = event.target;
            textBox.value = textBox.value.slice(0, textBox.selectionStart) + "\n" + textBox.value.slice(textBox.selectionEnd);
        }
        else if (event.key === 'Enter' && event.target.value) {
            addMessage({ text: event.target.value });
            event.preventDefault();
            reply(event.target.value);
            event.target.value = '';
        }
    });
});


