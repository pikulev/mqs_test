onmessage = event => {
  const len = event.data.length;
  
  event.data.forEach(item => {
    const result = { label: item.t, value: item.v };
    postMessage(result);
  });
};
