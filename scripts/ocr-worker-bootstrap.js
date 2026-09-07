self.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.action === 'initialize' && Array.isArray(message.payload?.langs)) {
    message.payload.langs = message.payload.langs.map((language) => (
      typeof language === 'string' ? language : language.code
    )).join('+');
  }
});

importScripts('./worker.min.js');
