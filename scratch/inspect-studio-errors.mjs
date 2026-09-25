import { ChromeBrowserSession } from './chrome-session.mjs';

async function main() {
  const browser = new ChromeBrowserSession(9342);
  try {
    await browser.launch();
    await browser.send('Console.enable');
    await browser.send('Runtime.enable');

    const logs = [];
    browser.ws.on('message', (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.method === 'Console.messageAdded') {
        logs.push({ type: 'console', ...data.params.message });
      }
      if (data.method === 'Runtime.exceptionThrown') {
        logs.push({ type: 'exception', ...data.params.exceptionDetails });
      }
    });

    await browser.navigate(`http://localhost:3000/studio?q=${encodeURIComponent('Why do ocean currents circulate?')}`);

    await new Promise((r) => setTimeout(r, 6000));

    console.log("Captured logs/errors:");
    console.log(JSON.stringify(logs, null, 2));

    const errDetails = await browser.eval(`(() => {
      const errorDivs = Array.from(document.querySelectorAll('*')).filter(el => el.textContent === 'Error' || el.innerText === 'Error');
      return errorDivs.map(el => ({
        tag: el.tagName,
        className: el.className,
        parentTag: el.parentElement?.tagName,
        parentClass: el.parentElement?.className,
        outerHTML: el.outerHTML
      }));
    })()`);
    console.log("Error divs details:", JSON.stringify(errDetails, null, 2));

  } finally {
    await browser.close();
  }
}

main();
