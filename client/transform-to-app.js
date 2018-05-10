onmessage = event => {
  for (let i = 0; i < event.data.length; i++) {
    postMessage({ label: event.data[i].t, value: event.data[i].v });
  }
};
