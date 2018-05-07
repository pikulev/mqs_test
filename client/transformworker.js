onmessage = event => {
    console.log('Message received from main script', event);
    console.log('Posting message back to main script');
    postMessage([{key: "1900-10", value: {1: 1, 2: 2}}, {key: "1900-11", value: {1: 1, 2: 2}}]);
  }