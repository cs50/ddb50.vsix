let firstMsg = true;

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.querySelector('#ddbInput textarea');
  textarea.focus();
  textarea.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && event.target.value) {
      addMessage({text: event.target.value});
      event.preventDefault();
      reply(event.target.value);
      event.target.value = '';
    }
  });
});

function addMessage({text, fromDuck}) {
  const chatElt = document.createElement('p');
  chatElt.className = 'ddbChat';

  const borderElt = document.createElement('span');
  borderElt.className = `ddbChatBorder ${fromDuck ? 'ddbChatBorder-Duck' : 'ddbChatBorder-User'}`;
  chatElt.appendChild(borderElt);

  const authorElt = document.createElement('span');
  authorElt.className = 'ddbAuthorName';
  authorElt.innerHTML = "<b>" + (fromDuck ? 'ddb' : 'you') + '</b>';
  chatElt.appendChild(authorElt);

  const messageElt = document.createElement('span');
  messageElt.className = 'ddbChatMessage';
  messageElt.innerHTML = formatMessageText(text);
  chatElt.appendChild(messageElt);

  const chatText = document.querySelector('#ddbChatText');
  chatText.appendChild(chatElt);
  chatText.scrollTop = chatText.scrollHeight;
}

function reply(prevMsg) {
  let reply = "quack ".repeat(1 + getRandomInt(3)).trim();
  if (prevMsg && prevMsg.endsWith("!")) {
    reply += "!";
  }
  if (firstMsg) {
    timeout = 250;
  } else {
    timeout = 500 * (1 + Math.random() * 2);
    firstMsg = false;
  }
  setTimeout(() => addMessage({text: reply, fromDuck: true}), timeout);
}

function formatMessageText(text) {
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#039;')
             .replace(/\n/g, '<br/>');
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}