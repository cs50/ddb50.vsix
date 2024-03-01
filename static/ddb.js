document.addEventListener('DOMContentLoaded', () => {

    const vscode = acquireVsCodeApi();
    const textarea = document.querySelector('#ddbInput textarea');
    const chatText = document.querySelector('#ddbChatText');
    const disclaimer = "Quack. I am CS50's duck debugger (ddb), an experimental AI for [rubberducking](https://en.wikipedia.org/wiki/Rubber_duck_debugging). Quack quack. My replies might not always be accurate, so always think critically and let me know if you think that I've erred. Conversations are logged for debugging's sake. Quack quack quack.";

    // Set intial value for ddb's energy (1 energy point == 1 half heart)
    const INITIAL_DDB_ENERGY = 10;

    // Set rate at which ddb's energy increases
    // (in milliseconds - currently 3 minutes)
    const DDB_ENERGY_REGEN_TIME = 180000;

    // Set energy on page load, with regen enabled
    let ddbEnergy = getEnergy((regen = true));
    if (ddbEnergy === null) {
        ddbEnergy = INITIAL_DDB_ENERGY;
    }
    setEnergy(ddbEnergy);

    // Allow one additional question every X minutes
    setInterval(() => increaseEnergy(1), DDB_ENERGY_REGEN_TIME);

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
                setEnergy(getEnergy() - 1);
                break;

            case 'persist_messages':
                localStorage.setItem('gptMessagesHistory', JSON.stringify(message.gpt_messages_array));
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

    /**
     * Gets a random message when ddb is tired
     * @param {string} id
     */
    function getTiredMessage(id) {
        const tiredMessages = [
            "Quack. I'm a little tired right now... zzz...",
            "zzz... *snore*",
            "What a... wonderful... zzz... question...",
            "I will be back soon! Just taking a short nap, zzz...",
        ];
        const chosenMessageId = Math.floor(
            Math.random() * tiredMessages.length
        );
        document.querySelector(`#id-${id}`).innerHTML =
            tiredMessages[chosenMessageId];
        textarea.removeAttribute("disabled");
        textarea.focus();
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
            if (getEnergy() > 0) {
                getGptResponse(id, text);
            } else {
                getTiredMessage(id);
            }
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
        addMessage({ id: 'disclaimer', text: disclaimer, fromDuck: true }, askGpt = false);
        textarea.removeAttribute('disabled');
        textarea.focus();
    }

    function restoreMessages() {
        try {
            textarea.setAttribute('disabled', 'disabled');

            // add disclaimer
            addMessage({ id: 'disclaimer', text: disclaimer, fromDuck: true }, askGpt = false);

            // restore messages
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

    /**
         * Renders ddb's energy bar in the DOM
         * @param {number} ddbEnergy
         */
    function renderEnergy(ddbEnergy) {
        // Validate input type
        if (typeof ddbEnergy !== "number" || isNaN(ddbEnergy)) {
            console.error("Input to renderEnergy should be a number");
            return;
        }

        // Get energy bar
        const outterEnergyBar = document.getElementById("ddbOutterEnergyBar");
        const innerEnergyBar = document.getElementById("ddbInnerEnergyBar");
        const percentage = (ddbEnergy / INITIAL_DDB_ENERGY) * 100;

        // Set width of inner energy bar
        innerEnergyBar.style.width = `${percentage}%`;
        outterEnergyBar.setAttribute("aria-valuenow", percentage);

        // if percentage below 50% but above 20%, change color to warning
        if (percentage === 100) {
            innerEnergyBar.classList.remove("bg-warning");
            innerEnergyBar.classList.remove("bg-danger");
            innerEnergyBar.classList.add("bg-success");
        }
        else if (percentage >= 60) {
            innerEnergyBar.classList.remove("bg-success");
            innerEnergyBar.classList.remove("bg-warning");
            innerEnergyBar.classList.remove("bg-danger");
        }
        else if (percentage < 60 && percentage > 30) {
            innerEnergyBar.classList.add("bg-warning");
            innerEnergyBar.classList.remove("bg-danger");
        }
        else {
            innerEnergyBar.classList.add("bg-danger");
            innerEnergyBar.classList.remove("bg-warning");
        }

        if (percentage <= 0) {
            textarea.setAttribute("disabled", "disabled");
            innerEnergyBar.classList.add("progress-bar-striped");
            innerEnergyBar.classList.add("progress-bar-animated");
            innerEnergyBar.classList.remove("bg-danger");
            innerEnergyBar.classList.add("bg-warning");
            innerEnergyBar.style.width = `100%`;
            outterEnergyBar.setAttribute("aria-valuenow", 100);
            innerEnergyBar.innerHTML = "CS50 Duck is restoring stamina, please wait...";
        }
        else {
            innerEnergyBar.classList.remove("progress-bar-striped");
            innerEnergyBar.classList.remove("progress-bar-animated");
            textarea.removeAttribute("disabled");
            innerEnergyBar.innerHTML = "";
        }
    }

    /**
     * Increases ddbEnergy by specified amount, then renders changes
     * @param {number} increaseAmount
     */
    function increaseEnergy(increaseAmount) {
        // Validate input
        if (typeof increaseAmount !== "number" || isNaN(increaseAmount)) {
            console.error("Input to increaseEnergy should be a number");
            return;
        }

        let ddbEnergy = getEnergy();

        // Add to energy, capping at initial value
        ddbEnergy = Math.min(INITIAL_DDB_ENERGY, ddbEnergy + increaseAmount);

        // Set new value
        setEnergy(ddbEnergy);
    }

    /**
     * Gets ddbEnergy from local storage
     * (can regenerate based on elapsed time)
     * @param {tf} regen
     * @returns {number|null} ddbEnergy
     */
    function getEnergy(regen = false) {
        try {
            // Retrieve value from local storage
            let ddbEnergyObj = localStorage.getItem("ddbEnergyObj");
            if (ddbEnergyObj === null) {
                return null;
            }

            // Convert from string to JSON
            ddbEnergyObj = JSON.parse(ddbEnergyObj);
            let { ddbEnergy, time } = ddbEnergyObj;

            // Convert energy to a number
            ddbEnergy = Number(ddbEnergy);

            // Log invalid value, return null
            if (isNaN(ddbEnergy)) {
                console.error("Invalid value for ddbEnergy:", ddbEnergy);
                return null;
            }

            if (regen) {
                // Calculate amount of energy to regenerate,
                // based on elapsed time since last energy update
                const regenAmount = Math.floor(
                    (Date.now() - time) / DDB_ENERGY_REGEN_TIME
                );

                // Add back to energy, capping at initial value
                ddbEnergy = Math.min(
                    INITIAL_DDB_ENERGY,
                    ddbEnergy + regenAmount
                );
            }

            // Return energy
            return ddbEnergy;
        } catch (error) {
            console.error("Could not access localStorage:", error);
        }
    }

    /**
     * Sets ddbEnergy in local storage, renders changes
     * @param {number} ddbEnergy
     */
    function setEnergy(ddbEnergy) {
        // Save ddbEnergy and timestamp to local storage
        try {
            ddbEnergyObj = JSON.stringify({
                ddbEnergy: ddbEnergy,
                time: Date.now(),
            });
            localStorage.setItem("ddbEnergyObj", ddbEnergyObj);
        } catch (error) {
            console.error("Could not set localStorage:", error);
        }

        // Render changes via progress bar
        renderEnergy(ddbEnergy);
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


