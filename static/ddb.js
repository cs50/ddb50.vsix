document.addEventListener('DOMContentLoaded', () => {

    const vscode = acquireVsCodeApi();
    const textarea = document.querySelector('#ddbInput textarea');
    const chatText = document.querySelector('#ddbChatText');

    const md = window.markdownit({
        highlight: function (str, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return '<pre class="hljs"><code>' +
                        hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                        '</code></pre>';
                } catch (__) {}
            }
            return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
        }
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {

            case 'ask':
                addMessage({ text: message.content.userMessage });
                reply(message.content.userMessage);
                break;

            case 'addMessage':
                addMessage({ text: message.content.userMessage });
                break;

            case 'say':
                addMessage({ text: message.content.userMessage, fromDuck: true }, askGpt = false);
                break;
            
            case 'resetHistory':
                resetMessages();
                break;

            case 'delta_update':
                const ddbChatMessage = document.querySelector(`#id-${message.id}`);
                if (ddbChatMessage === null) {

                    // Recreate ddb chat message
                    textarea.setAttribute('disabled', 'disabled');
                    addMessage({ id: message.id, text: "", fromDuck: true }, askGpt = false);

                    // Markdown render
                    document.querySelector(`#id-${message.id}`).innerHTML = message.content;
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
        addMessage({ id: 'disclaimer', text: disclaimer, fromDuck: true }, askGpt = false);
    }

    function getGptResponse(id, message) {
        vscode.postMessage({
            command: 'get_gpt_response',
            id: id,
            content: message
        });
    }

    function addMessage({ id = uuidv4(), text, fromDuck }, askGpt = true) {
        const message =
            `<div class="ddbChat ${fromDuck ? 'ddbChat-Duck' : 'ddbChat-User'}">
                <span class="ddbChatBorder ${fromDuck ? 'ddbChatBorder-Duck' : 'ddbChatBorder-User'}"></span>
                <span class="ddbAuthorName"><b>${(fromDuck ? 'ddb' : 'you')}</b></span>
                <span id="id-${id}" class="ddbChatMessage">${fromDuck && askGpt ? '...' : md.render(text.replace(/\n/g, "  \n"))}</span>
            </div>`;
        const parser = new DOMParser();
        const doc = parser.parseFromString(message, 'text/html');
        const chatText = document.querySelector('#ddbChatText');
        chatText.appendChild(doc.body.firstChild);
        chatText.scrollTop = chatText.scrollHeight;

        if (fromDuck && askGpt) {
            getGptResponse(id, text);
        }
    }

    function reply(prevMsg) {
        addMessage({ text: prevMsg, fromDuck: true });
    }

    function resetMessages() {
        vscode.postMessage({
            command: 'reset_history'
        });
        localStorage.setItem('gptMessagesHistory', JSON.stringify([]));
        document.querySelector('#ddbChatText').innerHTML = '';
        textarea.removeAttribute('disabled');
        textarea.focus();
    }

    function restoreMessages() {
        try {
            textarea.setAttribute('disabled', 'disabled');
            let gptMessagesHistory = JSON.parse(localStorage.getItem('gptMessagesHistory'));

            // filter out messages which its timestamp is older than 6 hours
            gptMessagesHistory = gptMessagesHistory.filter(msg => {
                if (!msg.timestamp) {
                    return false;
                }
                const msgTimestamp = new Date(msg.timestamp);
                const now = new Date();
                const diff = now - msgTimestamp;
                const diffHours = Math.floor(diff / 1000 / 60 / 60);
                return diffHours < 6;
            });

            if (gptMessagesHistory !== null) {
                gptMessagesHistory.forEach(msg => {
                    addMessage({ id: msg.id || uuidv4(), text: msg.content, fromDuck: msg.role === 'assistant' ? true : false }, askGpt = false);
                });
                vscode.postMessage({
                    command: 'restore_messages',
                    content: gptMessagesHistory
                });
            } else {
                resetMessages();
            }
        } catch (error) {
            console.log(error);
            resetMessages();
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
            userMessage = event.target.value.trim();
            
            // check if userMessage is empty after trimming
            if (userMessage === '') {
                event.target.value = '';
                event.target.removeAttribute('disabled');
                event.target.focus();
                return;
            }

            event.target.value = '';
            addMessage({ text: userMessage });
            setTimeout(() => {
                reply(userMessage);
            }, 500 * Math.random() + 500);
        }
    });
    textarea.focus();

    // resize
    let resizeHandle = document.getElementById('resizeHandle');
    let ddbChatText = document.getElementById('ddbChatText');
    let ddbInput = document.getElementById('ddbInput');

    let startPos;
    let startHeightChat;
    let startHeightInput;

    function resize(e){
        let y = startPos - e.clientY;
        let chatHeight = startHeightChat - y;
        let inputHeight = startHeightInput + y;

        // Limiting the size so that elements don't disappear completely
        if (chatHeight > 50 && inputHeight > 50) {
            ddbChatText.style.height = `${chatHeight}px`;
            ddbInput.style.height = `${inputHeight}px`;
        }
    }

    resizeHandle.addEventListener('mousedown', function(e) {
        startPos = e.clientY;
        startHeightChat = ddbChatText.offsetHeight;
        startHeightInput = ddbInput.offsetHeight;
        document.addEventListener('mousemove', resize, false);
    }, false);

    document.addEventListener('mouseup', function() {
        document.removeEventListener('mousemove', resize, false);
    }, false);
});


